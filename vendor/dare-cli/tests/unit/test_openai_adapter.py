from __future__ import annotations

import asyncio
from types import SimpleNamespace

from dare_framework.model.adapters import openai_adapter as openai_adapter_module
from dare_framework.config.types import LLMConfig
from dare_framework.model import default_model_adapter_manager as default_model_adapter_manager_module
from dare_framework.model.adapters.openai_adapter import OpenAIModelAdapter, _join_stream_text_parts


class DummyChatOpenAI:
    last_kwargs: dict | None = None

    def __init__(self, **kwargs):
        DummyChatOpenAI.last_kwargs = dict(kwargs)


def test_build_client_reads_openai_env_defaults(monkeypatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "env-openai-key")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://endpoint.example/v1")
    monkeypatch.setattr(openai_adapter_module, "ChatOpenAI", DummyChatOpenAI)

    adapter = OpenAIModelAdapter(model="gpt-5.4")
    adapter._build_client()

    assert DummyChatOpenAI.last_kwargs is not None
    assert DummyChatOpenAI.last_kwargs["api_key"] == "env-openai-key"
    assert DummyChatOpenAI.last_kwargs["base_url"] == "https://endpoint.example/v1"


def test_build_client_enables_streaming_for_custom_endpoint(monkeypatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    monkeypatch.setattr(openai_adapter_module, "ChatOpenAI", DummyChatOpenAI)

    adapter = OpenAIModelAdapter(
        model="gpt-5.4",
        api_key="test-key",
        endpoint="https://endpoint.example/v1",
    )
    adapter._build_client()

    assert DummyChatOpenAI.last_kwargs is not None
    assert DummyChatOpenAI.last_kwargs["streaming"] is True
    assert DummyChatOpenAI.last_kwargs["base_url"] == "https://endpoint.example/v1"


def test_dare_ssl_verify_defaults_to_false(monkeypatch) -> None:
    monkeypatch.delenv("DARE_SSL_VERIFY", raising=False)

    options = default_model_adapter_manager_module._http_client_options_from_proxy(LLMConfig())

    assert options["verify"] is False


def test_dare_ssl_verify_env_can_reenable_validation(monkeypatch) -> None:
    monkeypatch.setenv("DARE_SSL_VERIFY", "1")

    options = default_model_adapter_manager_module._http_client_options_from_proxy(LLMConfig())

    assert options["verify"] is True


def test_join_stream_text_parts_preserves_continuous_reasoning_text() -> None:
    assert _join_stream_text_parts(["先", "分析", "一下"]) == "先分析一下"
    assert _join_stream_text_parts([]) is None


# ---------------------------------------------------------------------------
# Regression tests for streaming content assembly (newline preservation)
# ---------------------------------------------------------------------------

class _FakeAStream:
    """Async iterator that yields pre-built LangChain-style chunks."""

    def __init__(self, chunks: list):
        self._chunks = chunks

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._chunks:
            raise StopAsyncIteration
        return self._chunks.pop(0)


def _make_chunk(content=None):
    return SimpleNamespace(content=content, tool_call_chunks=None)


class _FakeLangChainClient:
    def __init__(self, chunks: list):
        self._chunks = chunks

    def astream(self, messages):
        return _FakeAStream(self._chunks)


def test_streaming_preserves_internal_newlines(monkeypatch) -> None:
    """Newlines between chunks must survive — this is the A2A mention fix."""
    chunks = [
        _make_chunk("收到。\n"),
        _make_chunk("@jiuwenclaw请回应"),
    ]
    adapter = OpenAIModelAdapter(model="glm-5", api_key="k", endpoint="http://x")
    monkeypatch.setattr(adapter, "_build_client", lambda: _FakeLangChainClient(chunks))
    resp = asyncio.run(
        adapter._generate_streaming_response(_FakeLangChainClient(chunks), [])
    )
    assert "\n@jiuwenclaw" in resp.content, (
        f"Internal newline lost; got: {resp.content!r}"
    )


def test_streaming_handles_list_content_blocks(monkeypatch) -> None:
    """Non-str content (list/dict) must still be extracted via _coerce_text."""
    chunks = [
        _make_chunk([{"type": "text", "text": "Hello"}]),
        _make_chunk(" world"),
    ]
    adapter = OpenAIModelAdapter(model="glm-5", api_key="k", endpoint="http://x")
    resp = asyncio.run(
        adapter._generate_streaming_response(_FakeLangChainClient(chunks), [])
    )
    assert "Hello" in resp.content, (
        f"List content block lost; got: {resp.content!r}"
    )
