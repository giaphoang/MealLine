"""Offline tests: no real providers, calls, or application records."""
import asyncio
import base64
import copy
import hmac
import json
import os
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from pipecat.frames.frames import EndFrame, TTSSpeakFrame
from pipecat.services.cartesia.tts import CartesiaTTSService, GenerationConfig
from pipecat.transcriptions.language import Language

from .extraction import Interpretation, Proposal, interpret
from .pipeline import ControllerProcessor, MealLineClient, paced_text, phone_voice_number
from .security import valid_twilio_handshake, validate_start, verify_ticket
from .server import app

KEY = "offline-only-mealline-key-" + "a" * 48
AUTH = "offline-only-twilio-secret"
ACCOUNT = "AC" + "a" * 32
CLAIMS = {"v": 1, "sessionId": "sess_" + "b" * 24, "callSid": "CA" + "c" * 32,
          "publicBaseUrl": "https://phone-test.example", "exp": int(time.time()) + 3600, "nonce": "d" * 24}
STATE = {"step": "address", "language": "en", "status": "active", "reply": "What is your address?", "fallback": False}
START = {"event": "start", "start": {"accountSid": ACCOUNT, "callSid": CLAIMS["callSid"],
         "streamSid": "MZ" + "e" * 32, "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1}}}


def encode(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def ticket(claims=None):
    body = encode(json.dumps(claims or CLAIMS, separators=(",", ":")).encode())
    return body + "." + encode(hmac.digest(KEY.encode(), body.encode(), "sha256"))


def signature(token, scheme="https"):
    url = CLAIMS["publicBaseUrl"].replace("https", scheme, 1) + "/api/voice/stream/" + token
    return base64.b64encode(hmac.digest(AUTH.encode(), url.encode(), "sha1")).decode()


class SecurityTests(unittest.TestCase):
    def test_node_compatible_ticket_and_tampering(self):
        token = ticket()
        self.assertEqual(verify_ticket(token, KEY), CLAIMS)
        with self.assertRaises(ValueError):
            verify_ticket(token + "x", KEY)
        with self.assertRaises(ValueError):
            verify_ticket(token, "short")

    def test_expiry_and_unsafe_origin(self):
        for fields in ({"exp": 1}, {"publicBaseUrl": "http://external.example"},
                       {"publicBaseUrl": "https://user:pass@example.com"}, {"publicBaseUrl": "https:"}):
            with self.assertRaises(ValueError):
                verify_ticket(ticket({**CLAIMS, **fields}), KEY)

    def test_twilio_signature_is_bound_to_ticket(self):
        token = ticket()
        for scheme in ("https", "wss"):
            self.assertTrue(valid_twilio_handshake(token, CLAIMS, signature(token, scheme), AUTH))
        self.assertFalse(valid_twilio_handshake(token, CLAIMS, "invalid", AUTH))
        self.assertFalse(valid_twilio_handshake(token + "x", CLAIMS, signature(token), AUTH))

    def test_start_requires_correct_call_account_and_audio(self):
        self.assertEqual(validate_start(START, CLAIMS, ACCOUNT), START["start"]["streamSid"])
        for field, value in (("callSid", "CA" + "f" * 32), ("accountSid", "AC" + "f" * 32),
                             ("mediaFormat", {"encoding": "linear16", "sampleRate": 16000, "channels": 1})):
            changed = copy.deepcopy(START)
            changed["start"][field] = value
            with self.assertRaises(ValueError):
                validate_start(changed, CLAIMS, ACCOUNT)

    def test_cartesia_language_settings_supported_by_installed_version(self):
        self.assertEqual(CartesiaTTSService.Settings(language=Language.ES).language, Language.ES)
        self.assertEqual(CartesiaTTSService.Settings(generation_config=GenerationConfig(speed=0.8)).generation_config.speed, 0.8)

    def test_new_flow_pacing_does_not_allow_caller_markup(self):
        self.assertEqual(paced_text('Original. Prompt.', False), 'Original. Prompt.')
        paced = paced_text('Name: Example. Address: Test. Household: four.', True)
        self.assertEqual(paced.count('<break'), 2)
        self.assertNotIn('<speed', paced_text('Name: <speed ratio="1.5"/>Example.', True))

    def test_phone_voice_settings_are_bounded_and_invalid_values_fall_back(self):
        for value, expected in (("0.75", 0.75), ("9", 1.0), ("0", 0.6), ("NaN", 0.8), ("invalid", 0.8)):
            with patch.dict(os.environ, {"CLIENT_PHONE_VOICE_SPEED": value}):
                self.assertEqual(phone_voice_number("CLIENT_PHONE_VOICE_SPEED", 0.8, 0.6, 1.0), expected)


class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"MEALLINE_AGENT_KEY": KEY, "TWILIO_AUTH_TOKEN": AUTH,
            "TWILIO_ACCOUNT_SID": ACCOUNT, "MEALLINE_BASE_URL": "http://127.0.0.1:3000",
            "OPENAI_API_KEY": "offline", "DEEPGRAM_API_KEY": "offline", "CARTESIA_API_KEY": "offline"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_internal_model_requires_shared_secret(self):
        with TestClient(app) as client:
            self.assertEqual(client.post("/internal/interpret", json={}).status_code, 401)
            self.assertEqual(client.post("/internal/interpret", json={}, headers={"Authorization": "Bearer " + KEY}).status_code, 400)
            self.assertEqual(client.get("/internal/interpret").status_code, 404)
            self.assertEqual(client.get("/agent/health").json()["service"], "mealline-pipecat")

    def test_demo_admin_never_reaches_upstream(self):
        with TestClient(app) as client:
            app.state.http.request = Mock(side_effect=AssertionError("Admin must not reach upstream"))
            for path in ("/api/admin", "/api/admin/worker-tick", "/api/%61dmin/worker-tick",
                         "/api/%2561dmin/worker-tick", "/api%2fadmin/worker-tick",'/api/internal/nourish/jobs','/api/%2569nternal/nourish/jobs'):
                self.assertEqual(client.get(path).status_code, 404)
                self.assertEqual(client.post(path + "?action=migrate").status_code, 404)
            app.state.http.request.assert_not_called()

    def test_unsigned_stream_is_rejected_before_providers(self):
        with TestClient(app) as client, patch("voice_agent.pipeline.run_call", new_callable=AsyncMock) as run:
            with self.assertRaises(WebSocketDisconnect) as refused:
                with client.websocket_connect("/api/voice/stream/" + ticket()):
                    pass
            self.assertEqual(refused.exception.code, 1008)
            run.assert_not_awaited()

    def test_valid_twilio_start_enters_authorized_pipeline(self):
        token = ticket()
        with TestClient(app) as client, patch.object(MealLineClient, "request", new_callable=AsyncMock, return_value=STATE), \
             patch("voice_agent.pipeline.run_call", new_callable=AsyncMock) as run:
            with client.websocket_connect("/api/voice/stream/" + token, headers={"x-twilio-signature": signature(token)}) as ws:
                ws.send_json({"event": "connected"})
                ws.send_json(START)
            run.assert_awaited_once()
            self.assertEqual(run.await_args.args[1], START["start"]["streamSid"])

    def test_wrong_start_cannot_enter_pipeline(self):
        token = ticket()
        changed = copy.deepcopy(START)
        changed["start"]["callSid"] = "CA" + "f" * 32
        with TestClient(app) as client, patch.object(MealLineClient, "request", new_callable=AsyncMock, return_value=STATE), \
             patch("voice_agent.pipeline.run_call", new_callable=AsyncMock) as run:
            with client.websocket_connect("/api/voice/stream/" + token, headers={"x-twilio-signature": signature(token)}) as ws:
                ws.send_json(changed)
                with self.assertRaises(WebSocketDisconnect):
                    ws.receive_json()
            run.assert_not_awaited()

    def test_duplicate_connection_keeps_original_call_registered(self):
        token = ticket()
        with TestClient(app) as client:
            app.state.active_calls.add(CLAIMS["callSid"])
            with self.assertRaises(WebSocketDisconnect) as refused:
                with client.websocket_connect("/api/voice/stream/" + token, headers={"x-twilio-signature": signature(token)}):
                    pass
            self.assertEqual(refused.exception.code, 1013)
            self.assertIn(CLAIMS["callSid"], app.state.active_calls)


class ControllerTests(unittest.IsolatedAsyncioTestCase):
    async def test_codes_and_phone_numbers_buffer_keypad_digits(self):
        controller = ControllerProcessor(None, {**STATE, 'digitCount': 6, 'protectedInput': True})
        for digit in '01234':
            controller.keypad(digit)
        self.assertTrue(controller.pending.empty())
        controller.keypad('5')
        self.assertEqual(controller.pending.get_nowait(), '012345')
        controller.state['digitCount'] = 10
        for digit in '5155550142':
            controller.keypad(digit)
        self.assertEqual(controller.pending.get_nowait(), '5155550142')
        controller.keypad('1')
        controller.keypad('*')
        self.assertEqual(controller.digits, '')
        self.assertEqual(controller.pending.get_nowait(), '*')
    async def test_http_retry_keeps_request_id_input_and_phase(self):
        client = MealLineClient(None, "http://127.0.0.1:3000", "offline-ticket")
        client.request = AsyncMock(side_effect=[RuntimeError("offline"), STATE])
        result = await client.turn(STATE, "123 Example Street")
        self.assertEqual(result, STATE)
        first, second = client.request.await_args_list
        self.assertEqual(first.args[2], second.args[2])
        self.assertEqual(first.args[2]["expectedStep"], "address")

    async def test_queued_barge_in_does_not_cancel_mutating_turn_or_speak_stale_prompt(self):
        responses = [{**STATE, "step": "household", "reply": "Stale prompt"}, {**STATE, "done": True}]
        client = SimpleNamespace(turn=AsyncMock(side_effect=responses))
        controller = ControllerProcessor(client, STATE)
        controller.worker = SimpleNamespace(queue_frames=AsyncMock())
        controller.push_frame = AsyncMock()
        controller.enqueue("address")
        controller.enqueue("person")
        await asyncio.wait_for(controller.consume(), timeout=1)
        self.assertEqual(client.turn.await_count, 2)
        self.assertEqual(client.turn.await_args_list[1].args[0]["step"], "household")
        controller.push_frame.assert_not_awaited()
        self.assertIsInstance(controller.worker.queue_frames.await_args.args[0][0], EndFrame)

    async def test_backend_failure_returns_to_mealline(self):
        controller = ControllerProcessor(SimpleNamespace(turn=AsyncMock(side_effect=RuntimeError("offline"))), STATE)
        controller.worker = SimpleNamespace(queue_frames=AsyncMock())
        controller.enqueue(None)
        await asyncio.wait_for(controller.consume(), timeout=1)
        self.assertTrue(controller.finished)
        self.assertIsInstance(controller.worker.queue_frames.await_args.args[0][0], EndFrame)


class ExtractionTests(unittest.IsolatedAsyncioTestCase):
    async def interpretation_request(self, model):
        expected = {"intent": "answer", "fields": {"household": {"size": 4}}, "confidence": 1}
        parsed = SimpleNamespace(model_dump=Mock(return_value=expected))
        completion = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(refusal=None, parsed=parsed))])
        parse = AsyncMock(return_value=completion)
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(parse=parse)))
        with patch.dict(os.environ, {"OPENAI_API_KEY": "offline-only-openai-key", "OPENAI_MODEL": model}), \
             patch("voice_agent.extraction.AsyncOpenAI") as factory:
            factory.return_value.__aenter__.return_value = client
            result = await interpret(Interpretation(step="household", input="There are four people in my household.", locale="en"))
            self.assertEqual(result, expected)
            factory.assert_called_once_with(api_key="offline-only-openai-key", timeout=6.0, max_retries=0)
            parse.assert_awaited_once()
            options = parse.await_args.kwargs
            self.assertEqual(options["model"], model)
            self.assertIs(options["response_format"], Proposal)
            self.assertEqual(options["max_completion_tokens"], 900)
            return options

    async def test_gpt_56_uses_supported_low_latency_options_without_changing_model(self):
        for model in ("gpt-5.6-luna", "gpt-5.6-luna-2026-09-29"):
            with self.subTest(model=model):
                options = await self.interpretation_request(model)
                self.assertEqual(options["reasoning_effort"], "none")
                self.assertNotIn("temperature", options)

    async def test_legacy_model_keeps_existing_sampling_options(self):
        options = await self.interpretation_request("gpt-4o-mini")
        self.assertEqual(options["temperature"], 0)
        self.assertNotIn("reasoning_effort", options)

    async def test_provider_failure_still_returns_sanitized_gateway_error(self):
        with patch.dict(os.environ, {"MEALLINE_AGENT_KEY": KEY, "MEALLINE_BASE_URL": "http://127.0.0.1:3000"}), \
             patch("voice_agent.server.interpret", new_callable=AsyncMock, side_effect=RuntimeError("offline-sensitive-provider-details")), \
             TestClient(app) as client:
            response = client.post("/internal/interpret", headers={"Authorization": "Bearer " + KEY},
                json={"step": "household", "input": "Four people", "locale": "en"})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json(), {"error": "model_unavailable"})


if __name__ == "__main__":
    unittest.main()
