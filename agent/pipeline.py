"""Pipecat Twilio voice pipeline for the MealLine intake flow.

Run with ``python -m agent.pipeline -t twilio`` from the repository root.
Pipecat's FastAPI WebSocket transport handles
Twilio Media Streams and its Twilio serializer performs the 8 kHz μ-law ↔ PCM
conversion.  The application itself never changes MealLine.
"""

from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

from .matcher import build_generated_data, match_inventory
from .prompts import build_system_prompt
from .tools import (
    JsonObject,
    NourishClient,
    ToolValidationError,
    create_shopping_list,
    get_inventory,
    get_shopping_list_instance,
    get_shopping_list_templates,
    validate_generated_data,
)

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).with_name(".env"), override=False)
except ImportError:  # pragma: no cover - dependency is declared in pyproject.toml
    pass

try:  # Pipecat is an optional import so matcher/tools can be tested offline.
    from pipecat.adapters.schemas.direct_function import tool_options
    from pipecat.audio.vad.silero import SileroVADAnalyzer
    from pipecat.frames.frames import LLMRunFrame, TTSSpeakFrame
    from pipecat.pipeline.pipeline import Pipeline
    from pipecat.pipeline.worker import PipelineParams, PipelineWorker, ProcessorUnusablePolicy
    from pipecat.processors.aggregators.llm_context import LLMContext
    from pipecat.processors.aggregators.llm_response_universal import (
        LLMContextAggregatorPair,
        LLMUserAggregatorParams,
    )
    from pipecat.runner.utils import create_transport
    from pipecat.services.cartesia.tts import CartesiaTTSService
    from pipecat.services.deepgram.stt import DeepgramSTTService
    from pipecat.services.llm_service import FunctionCallParams
    from pipecat.services.openai.llm import OpenAILLMService
    from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams
    from pipecat.workers.runner import WorkerRunner

    PIPECAT_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised only in dependency-free installs
    PIPECAT_AVAILABLE = False

    def tool_options(**_options: object):  # type: ignore[no-untyped-def]
        def decorate(function: Any) -> Any:
            return function

        return decorate

    class FunctionCallParams:  # type: ignore[no-redef]
        async def result_callback(self, _value: object) -> None:
            raise RuntimeError("Pipecat is not installed")


@dataclass(slots=True)
class IntakeState:
    """Facts for one phone call; values are never inferred from item names."""

    case_number: str = field(default_factory=lambda: f"NOURISH-{uuid4().hex[:12].upper()}")
    language: str = "en"
    household_size: int | None = None
    dietary_avoid: list[str] = field(default_factory=list)
    has_stove: bool | None = None
    has_fridge: bool | None = None
    address_raw: str | None = None
    contact_preference: str | None = None
    staff_routing: str | None = None
    first_visit: bool | None = None

    def update_from_metadata(self, metadata: Mapping[str, object]) -> None:
        """Copy validated intake facts from a tool request, not from free text."""

        language = metadata.get("language")
        if language in {"en", "vi", "es"}:
            self.language = language
        case_number = metadata.get("caseNumber")
        if isinstance(case_number, str) and case_number.strip():
            self.case_number = case_number.strip()
        household = metadata.get("householdSize")
        if household is None or isinstance(household, int) and not isinstance(household, bool):
            self.household_size = household
        avoids = metadata.get("dietaryAvoid")
        if isinstance(avoids, list) and all(isinstance(item, str) for item in avoids):
            self.dietary_avoid = list(avoids)
        for source, target in (("hasStove", "has_stove"), ("hasFridge", "has_fridge"), ("firstVisit", "first_visit")):
            value = metadata.get(source)
            if isinstance(value, bool):
                setattr(self, target, value)
        for source, target in (
            ("addressRaw", "address_raw"),
            ("contactPreference", "contact_preference"),
            ("staffRouting", "staff_routing"),
        ):
            value = metadata.get(source)
            if value is None or isinstance(value, str):
                setattr(self, target, value)

    def metadata(self) -> dict[str, object]:
        """Return the required persist-only metadata shape."""

        if self.household_size is None or self.has_stove is None or self.has_fridge is None or self.first_visit is None:
            raise ToolValidationError("The complete intake must be collected before matching")
        if self.contact_preference not in {"callback", "status_link"}:
            raise ToolValidationError("contactPreference must be callback or status_link")
        return {
            "source": "pipecat_voice",
            "caseNumber": self.case_number,
            "language": self.language,
            "householdSize": self.household_size,
            "dietaryAvoid": list(self.dietary_avoid),
            "hasStove": self.has_stove,
            "hasFridge": self.has_fridge,
            "addressRaw": self.address_raw,
            "contactPreference": self.contact_preference,
            "staffRouting": self.staff_routing,
            "firstVisit": self.first_visit,
        }


@dataclass(slots=True)
class CallSession:
    """Deterministic MealLine state shared by this call's tool callbacks."""

    client: NourishClient
    intake: IntakeState = field(default_factory=IntakeState)
    inventory_response: JsonObject | None = None

    async def inventory(self) -> JsonObject:
        if self.inventory_response is None:
            self.inventory_response = await get_inventory({}, client=self.client)
        return self.inventory_response

    async def deterministic_generated_data(self, proposed: object) -> JsonObject:
        """Discard model-proposed item rows and rebuild them from inventory."""

        validated = validate_generated_data(proposed)
        metadata = validated.get("metadata")
        if not isinstance(metadata, Mapping):  # validate_generated_data guarantees this
            raise ToolValidationError("generatedData.metadata must be an object")
        self.intake.update_from_metadata(metadata)
        intake_metadata = self.intake.metadata()
        response = await self.inventory()
        raw_items = response.get("foodItems")
        if not isinstance(raw_items, list) or not all(isinstance(item, Mapping) for item in raw_items):
            raise ToolValidationError("MealLine returned no usable food inventory")
        matched = match_inventory(
            raw_items,
            dietary_avoid=self.intake.dietary_avoid,
            household_size=self.intake.household_size,
            has_stove=self.intake.has_stove,
            has_fridge=self.intake.has_fridge,
            max_items=20,
        )
        return build_generated_data(
            matched,
            household_size=self.intake.household_size,
            dietary_avoid=self.intake.dietary_avoid,
            metadata=intake_metadata,
        )


def deterministic_list_for_intake(
    raw_items: Sequence[Mapping[str, object]], metadata: Mapping[str, object]
) -> JsonObject:
    """Offline helper used by tests and the end-to-end simulation."""

    proposed = {"metadata": dict(metadata), "items": []}
    validated = validate_generated_data(proposed)
    intake = IntakeState()
    intake.update_from_metadata(validated["metadata"] if isinstance(validated["metadata"], Mapping) else {})
    return build_generated_data(
        match_inventory(
            raw_items,
            dietary_avoid=intake.dietary_avoid,
            household_size=intake.household_size,
            has_stove=intake.has_stove,
            has_fridge=intake.has_fridge,
            max_items=20,
        ),
        household_size=intake.household_size,
        dietary_avoid=intake.dietary_avoid,
        metadata=intake.metadata(),
    )


def build_tool_functions(session: CallSession, tts: Any = None) -> list[Any]:
    """Create Pipecat direct functions bound to one call's MealLine client."""

    @tool_options(cancel_on_interruption=False, timeout_secs=30)
    async def get_inventory_tool(params: FunctionCallParams) -> None:
        """Read current MealLine inventory after the caller's intake is collected."""

        await params.result_callback(await session.inventory())

    get_inventory_tool.__name__ = "get_inventory"

    @tool_options(cancel_on_interruption=False, timeout_secs=30)
    async def get_shopping_list_templates_tool(params: FunctionCallParams) -> None:
        """Read existing MealLine shopping-list templates."""

        await params.result_callback(await get_shopping_list_templates({}, client=session.client))

    get_shopping_list_templates_tool.__name__ = "get_shopping_list_templates"

    @tool_options(cancel_on_interruption=False, timeout_secs=30)
    async def create_shopping_list_tool(
        params: FunctionCallParams,
        templateId: int,
        title: str,
        generatedData: dict[str, Any],
        generatedBy: str,
    ) -> None:
        """Persist a list; item rows are always rebuilt by deterministic Python."""

        generated = await session.deterministic_generated_data(generatedData)
        result = await create_shopping_list(
            {
                "templateId": templateId,
                "title": title,
                "generatedData": generated,
                "generatedBy": generatedBy,
            },
            client=session.client,
        )
        await params.result_callback(result)

    create_shopping_list_tool.__name__ = "create_shopping_list"

    @tool_options(cancel_on_interruption=False, timeout_secs=30)
    async def get_shopping_list_instance_tool(params: FunctionCallParams, id: int) -> None:
        """Read back one persisted list after create_shopping_list succeeds."""

        await params.result_callback(await get_shopping_list_instance({"id": id}, client=session.client))

    get_shopping_list_instance_tool.__name__ = "get_shopping_list_instance"
    return [
        get_inventory_tool,
        get_shopping_list_templates_tool,
        create_shopping_list_tool,
        get_shopping_list_instance_tool,
    ]


async def run_bot(transport: Any, runner_args: Any, client: NourishClient | None = None) -> None:
    """Build one Pipecat pipeline for an already-created Twilio transport."""

    if not PIPECAT_AVAILABLE:
        raise RuntimeError("Install agent dependencies first: python -m pip install -e agent")
    nourish = client or NourishClient()
    session = CallSession(nourish)

    stt = DeepgramSTTService(
        api_key=os.environ["DEEPGRAM_API_KEY"],
        settings=DeepgramSTTService.Settings(
            model=os.getenv("DEEPGRAM_MODEL", "nova-3"),
            language="multi",  # Deepgram's multilingual mode covers en/vi/es.
            interim_results=True,
            punctuate=True,
        ),
    )
    tts = CartesiaTTSService(
        api_key=os.environ["CARTESIA_API_KEY"],
        settings=CartesiaTTSService.Settings(
            model=os.getenv("CARTESIA_MODEL", "sonic-3"),
            voice=os.getenv("CARTESIA_VOICE_ID", "71a7ad14-091c-4e8e-a314-022ece01c121"),
        ),
    )
    llm = OpenAILLMService(
        api_key=os.environ["OPENAI_API_KEY"],
        settings=OpenAILLMService.Settings(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            temperature=0.1,
            system_instruction=build_system_prompt(session.intake.case_number),
        ),
    )
    context = LLMContext(tools=build_tool_functions(session, tts))
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=8000,
            audio_out_sample_rate=8000,
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        processor_unusable_policy=ProcessorUnusablePolicy.END,
        idle_timeout_secs=getattr(runner_args, "pipeline_idle_timeout_secs", 300),
    )
    runner = WorkerRunner(handle_sigint=getattr(runner_args, "handle_sigint", True), force_gc=True)

    @llm.event_handler("on_function_calls_started")
    async def on_function_calls_started(_service: Any, _calls: Any) -> None:
        if tts is not None:
            await tts.queue_frame(TTSSpeakFrame("Let me check that for you."))

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_transport: Any, _client: Any) -> None:
        context.add_message({"role": "developer", "content": "Please greet the caller and begin the intake."})
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_transport: Any, _client: Any) -> None:
        await runner.cancel()

    await runner.add_workers(worker)
    await runner.run()


async def bot(runner_args: Any) -> None:
    """Pipecat runner entry point; ``-t twilio`` selects Media Streams."""

    if not PIPECAT_AVAILABLE:
        raise RuntimeError("Pipecat is not installed; run `python -m pip install -e agent`")
    transport_params = {
        "twilio": lambda: FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
        ),
    }
    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args)


def main() -> None:
    if not PIPECAT_AVAILABLE:
        raise SystemExit("Install agent dependencies first: python -m pip install -e agent")
    from pipecat.runner.run import main as pipecat_main

    pipecat_main()


if __name__ == "__main__":
    main()
