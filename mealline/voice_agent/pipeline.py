"""Streaming speech delegates every authoritative turn to MealLine."""
from __future__ import annotations

import asyncio
import math
import os
import re
from uuid import uuid4

import aiohttp
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    EndFrame, Frame, InputDTMFFrame, LLMContextFrame, StartFrame,
    STTUpdateSettingsFrame, TTSSpeakFrame, TTSUpdateSettingsFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker, ProcessorUnusablePolicy
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import LLMContextAggregatorPair, LLMUserAggregatorParams
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.serializers.twilio import TwilioFrameSerializer
from pipecat.services.cartesia.tts import CartesiaTTSService, GenerationConfig
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.transcriptions.language import Language
from pipecat.transports.websocket.fastapi import FastAPIWebsocketParams, FastAPIWebsocketTransport
from pipecat.workers.runner import WorkerRunner


def phone_voice_number(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
        return min(maximum, max(minimum, value)) if math.isfinite(value) else default
    except ValueError:
        return default


def paced_text(text: str, client_phone: bool) -> str:
    if not client_phone:
        return text
    # Caller-supplied names/addresses must not inject voice-control markup.
    safe = re.sub(r"<[^>]*>", "", text)
    parts = re.split(r"(?<=[.!?])\s+", safe)
    # Reserve explicit breaks for the first few critical readback details;
    # punctuation handles the rest without many short generation contexts.
    pause = phone_voice_number("CLIENT_PHONE_SENTENCE_PAUSE_SECONDS", 0.6, 0.3, 1.5)
    return "".join((CartesiaTTSService.PAUSE_TAG(pause) if i and i <= 3 else " " if i else "") + part
                   for i, part in enumerate(parts))


class MealLineClient:
    def __init__(self, http: aiohttp.ClientSession, base: str, ticket: str):
        self.http, self.base, self.ticket = http, base, ticket

    async def request(self, method: str, path: str, body: dict | None = None) -> dict:
        async with self.http.request(method, self.base + path, json=body,
                                     headers={"Authorization": f"Bearer {self.ticket}"},
                                     auto_decompress=True,
                                     timeout=aiohttp.ClientTimeout(total=12)) as response:
            payload = await response.json()
            if response.status != 200:
                raise RuntimeError(f"MealLine unavailable ({response.status})")
            return payload

    async def turn(self, state: dict, text: str | None) -> dict:
        body = {"requestId": str(uuid4()), "expectedStep": state["step"], "input": text}
        if state.get('phonePhase'):
            body['expectedPhase'] = state['phonePhase']
        # A retry keeps exactly the same id and input. MealLine's durable
        # receipt prevents a second mutation or a duplicate submitted case.
        for attempt in range(3):
            try:
                return await self.request("POST", "/api/voice/agent/turn", body)
            except (aiohttp.ClientError, asyncio.TimeoutError, RuntimeError):
                if attempt == 2:
                    raise
                await asyncio.sleep(0.2 * (attempt + 1))
        raise RuntimeError("unreachable")


class ControllerProcessor(FrameProcessor):
    def __init__(self, client: MealLineClient, state: dict):
        super().__init__()
        self.client, self.state = client, state
        self.pending: asyncio.Queue[str | None] = asyncio.Queue(maxsize=8)
        self.consumer: asyncio.Task | None = None
        self.last_context_size = 0
        self.worker: PipelineWorker | None = None
        self.finished = False
        self.digits = ""

    def keypad(self, digit: str) -> None:
        count = self.state.get("digitCount", 1)
        if digit in {"*", "#"} or count == 1:
            self.digits = ""
            self.enqueue(digit)
        else:
            self.digits += digit
            if len(self.digits) >= count:
                value, self.digits = self.digits, ""
                self.enqueue(value)

    def enqueue(self, text: str | None) -> None:
        if not self.finished:
            try:
                self.pending.put_nowait(text)
            except asyncio.QueueFull:
                self.finished = True
                if self.worker:
                    asyncio.create_task(self.worker.queue_frames([EndFrame()]))

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, StartFrame) and self.consumer is None:
            self.consumer = self.create_task(self.consume(), "mealline-turns")
        if isinstance(frame, InputDTMFFrame) and direction == FrameDirection.DOWNSTREAM:
            await self.broadcast_interruption()
            self.keypad(frame.button.value)
            return
        if isinstance(frame, LLMContextFrame) and direction == FrameDirection.DOWNSTREAM:
            if frame.speculation:
                return
            messages = frame.context.get_messages()
            if len(messages) > self.last_context_size:
                self.last_context_size = len(messages)
                for message in reversed(messages):
                    if message.get("role") == "user" and isinstance(message.get("content"), str):
                        content = message["content"]
                        if self.state.get("protectedInput"):
                            message["content"] = "[verification entry redacted]"
                        self.enqueue(content)
                        break
            return
        await self.push_frame(frame, direction)

    async def consume(self):
        while not self.finished:
            text = await self.pending.get()
            try:
                previous_language = self.state["language"]
                self.state = await self.client.turn(self.state, text)
                if self.state.get("done") or self.state.get("fallback"):
                    # Close only the stream. The following MealLine TwiML
                    # executes its original receipt, transfer, or Gather path.
                    self.finished = True
                    await self.worker.queue_frames([EndFrame()])
                    return
                if self.state["language"] != previous_language:
                    language = Language.ES if self.state["language"] == "es" else Language.EN
                    await self.push_frame(STTUpdateSettingsFrame(settings=DeepgramSTTService.Settings(language=language)), FrameDirection.UPSTREAM)
                    await self.push_frame(TTSUpdateSettingsFrame(settings=CartesiaTTSService.Settings(language=language)))
                # If another utterance arrived during the request, don't speak
                # a stale prompt over it. Never cancel a mutating backend turn.
                if self.pending.empty():
                    await self.push_frame(TTSSpeakFrame(paced_text(self.state["reply"], self.state.get("clientPhone", False))))
            except asyncio.CancelledError:
                raise
            except Exception:
                self.finished = True
                await self.worker.queue_frames([EndFrame()])
                return
            finally:
                self.pending.task_done()

    async def cleanup(self):
        if self.consumer:
            await self.cancel_task(self.consumer)
        await super().cleanup()


async def run_call(websocket, stream_sid: str, http: aiohttp.ClientSession, base: str, ticket: str, state: dict):
    language = Language.ES if state["language"] == "es" else Language.EN
    serializer = TwilioFrameSerializer(stream_sid=stream_sid,
        params=TwilioFrameSerializer.InputParams(auto_hang_up=False))
    transport = FastAPIWebsocketTransport(websocket=websocket, params=FastAPIWebsocketParams(
        audio_in_enabled=True, audio_out_enabled=True, add_wav_header=False, serializer=serializer))
    stt = DeepgramSTTService(api_key=os.environ["DEEPGRAM_API_KEY"], settings=DeepgramSTTService.Settings(
        model=os.getenv("DEEPGRAM_MODEL", "nova-3"), language=language, interim_results=True, punctuate=True))
    tts = CartesiaTTSService(api_key=os.environ["CARTESIA_API_KEY"], settings=CartesiaTTSService.Settings(
        model=os.getenv("CARTESIA_MODEL", "sonic-3"), language=language,
        voice=os.getenv("CARTESIA_VOICE_ID", "71a7ad14-091c-4e8e-a314-022ece01c121"),
        generation_config=GenerationConfig(speed=phone_voice_number("CLIENT_PHONE_VOICE_SPEED", 0.8, 0.6, 1.0)) if state.get("clientPhone") else None))
    context = LLMContext()
    user, assistant = LLMContextAggregatorPair(context, user_params=LLMUserAggregatorParams(
        vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=1.0 if state.get("clientPhone") else 0.7)),
        user_idle_timeout=30 if state.get("clientPhone") else 8))
    controller = ControllerProcessor(MealLineClient(http, base, ticket), state)
    pipeline = Pipeline([transport.input(), stt, user, controller, tts, transport.output(), assistant])
    worker = PipelineWorker(pipeline, params=PipelineParams(audio_in_sample_rate=8000, audio_out_sample_rate=8000),
                            processor_unusable_policy=ProcessorUnusablePolicy.END, idle_timeout_secs=300)
    controller.worker = worker
    runner = WorkerRunner(handle_sigint=False, force_gc=False)

    @user.event_handler("on_user_turn_idle")
    async def idle(_aggregator):
        if controller.pending.empty():
            value, controller.digits = controller.digits or None, ""
            controller.enqueue(value)

    @transport.event_handler("on_client_connected")
    async def connected(_transport, _client):
        await worker.queue_frames([TTSSpeakFrame(paced_text(state["reply"], state.get("clientPhone", False)))])

    @transport.event_handler("on_client_disconnected")
    async def disconnected(_transport, _client):
        await runner.cancel()

    await runner.add_workers(worker)
    await runner.run()
