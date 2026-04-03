"""OpenAI-compatible model adapter using LangChain."""

from __future__ import annotations

import json
import logging
import os
import time
from abc import ABC
from typing import TYPE_CHECKING, Any, Literal

from dare_framework.tool.types import CapabilityDescriptor
from dare_framework.model.kernel import IModelAdapter
from dare_framework.model.types import ModelInput, ModelResponse, GenerateOptions
from dare_framework.infra.component import ComponentType

if TYPE_CHECKING:
    from dare_framework.tool.types import ToolDefinition

# Optional LangChain imports
try:
    from langchain_openai import ChatOpenAI
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
except ImportError:  # pragma: no cover - handled at runtime
    ChatOpenAI = None  # type: ignore[assignment]
    AIMessage = None  # type: ignore[assignment]
    HumanMessage = None  # type: ignore[assignment]
    SystemMessage = None  # type: ignore[assignment]
    ToolMessage = None  # type: ignore[assignment]


class OpenAIModelAdapter(IModelAdapter):
    """Model adapter for OpenAI-compatible APIs using LangChain.

    Supports OpenAI, Azure OpenAI, and any OpenAI-compatible endpoint.
    Requires the `langchain-openai` package to be installed.

    Args:
        model: The model name (e.g., "gpt-4o", "gpt-4o-mini", "qwen-plus")
        api_key: The API key for authentication
        endpoint: Optional custom endpoint URL for self-hosted models
        http_client_options: Optional HTTP client configuration
    """


    _logger = logging.getLogger(__name__)
    _diag_env = "DARE_MODEL_ADAPTER_DIAG_LOG"

    def __init__(
        self,
        name: str | None = None,
        model: str | None = None,
        api_key: str | None = None,
        endpoint: str | None = None,
        http_client_options: dict[str, Any] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self._name = name or "openai"
        self._model = model
        self._api_key = api_key or os.getenv("OPENAI_API_KEY")
        self._endpoint = endpoint or os.getenv("OPENAI_BASE_URL")
        self._http_client_options = dict(http_client_options or {})
        self._extra: dict[str, Any] = dict(extra or {})
        self._client: Any = None



    @property
    def name(self) -> str:
        return self._name

    @property
    def model(self) -> str:
        return self._model or "gpt-4o-mini"

    @property
    def component_type(self) -> Literal[ComponentType.MODEL_ADAPTER]:
        return ComponentType.MODEL_ADAPTER

    async def generate(
        self,
        model_input: ModelInput,
        *,
        options: GenerateOptions | None = None,
    ) -> ModelResponse:
        """Generate a response from the OpenAI-compatible model."""
        self._emit_diag(
            "generate.start",
            {
                "adapter": self._name,
                "model": self.model,
                "endpoint": self._endpoint,
                "message_count": len(model_input.messages),
                "tool_count": len(model_input.tools or []),
                "tool_names": [str(getattr(tool, "name", "")) for tool in (model_input.tools or [])][:50],
                "options": _summarize_options(options),
            },
        )
        if self._endpoint:
            start = time.perf_counter()
            try:
                response = await self._generate_openai_compatible_response(model_input, options)
                self._emit_diag(
                    "generate.end",
                    {
                        "adapter": self._name,
                        "path": "openai_sdk_stream",
                        "latency_ms": round((time.perf_counter() - start) * 1000.0, 2),
                        **_summarize_model_response(response),
                    },
                )
                return response
            except Exception as exc:
                self._emit_diag(
                    "generate.fallback",
                    {
                        "adapter": self._name,
                        "path": "openai_sdk_stream",
                        "error_type": type(exc).__name__,
                        "error": str(exc),
                    },
                )

        client = self._ensure_client()
        client = self._apply_options(client, options)
        
        # Build tools directly from CapabilityDescriptor objects
        if model_input.tools:
            openai_tools = []
            for tool in model_input.tools:
                openai_tools.append({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema,
                    },
                })
            client = client.bind_tools(openai_tools)
        
        self._log_client_config(client)
        messages = self._to_langchain_messages(model_input.messages)

        stream_start = time.perf_counter()
        try:
            response = await self._generate_streaming_response(client, messages)
            self._emit_diag(
                "generate.end",
                {
                    "adapter": self._name,
                    "path": "langchain_stream",
                    "latency_ms": round((time.perf_counter() - stream_start) * 1000.0, 2),
                    **_summarize_model_response(response),
                },
            )
            return response
        except Exception as stream_exc:
            self._emit_diag(
                "generate.fallback",
                {
                    "adapter": self._name,
                    "path": "langchain_stream",
                    "error_type": type(stream_exc).__name__,
                    "error": str(stream_exc),
                },
            )
            response = await client.ainvoke(messages)

            tool_calls = self._extract_tool_calls(response)
            usage = self._extract_usage(response)
            thinking_content = self._extract_thinking_content(response)

            model_response = ModelResponse(
                content=_coerce_text(response.content) or "",
                tool_calls=tool_calls,
                usage=usage,
                thinking_content=thinking_content,
            )
            self._emit_diag(
                "generate.end",
                {
                    "adapter": self._name,
                    "path": "langchain_ainvoke",
                    **_summarize_model_response(model_response),
                },
            )
            return model_response

    def _ensure_client(self) -> Any:
        """Ensure the LangChain client is initialized."""
        if self._client is None:
            self._client = self._build_client()
        return self._client

    def _build_client(self) -> Any:
        """Build the LangChain ChatOpenAI client."""
        if ChatOpenAI is None:
            raise RuntimeError("langchain-openai is required for OpenAIModelAdapter")

        model = self._model or "gpt-4o-mini"
        kwargs: dict[str, Any] = {"model": model}
        default_headers = _load_default_headers_from_env()

        if self._api_key:
            kwargs["api_key"] = self._api_key
        elif self._endpoint:
            # Local/self-hosted endpoints still require a key; use placeholder
            kwargs["api_key"] = "dummy-key"

        if self._endpoint:
            kwargs["base_url"] = self._endpoint
            # Some OpenAI-compatible gateways only support streamed chat completions.
            kwargs.setdefault("streaming", True)
        if default_headers:
            kwargs["default_headers"] = default_headers

        kwargs.update(self._extra)

        sync_client, async_client = self._build_http_clients()
        if sync_client is not None:
            kwargs["http_client"] = sync_client
        if async_client is not None:
            kwargs["http_async_client"] = async_client

        return ChatOpenAI(**kwargs)

    def _to_langchain_messages(self, messages: list[Any]) -> list[Any]:
        """Convert framework messages to LangChain message format."""
        mapped = []
        for msg in messages:
            role = str(getattr(msg, "role", "user"))
            content = self._serialize_langchain_content(msg)
            if role == "system":
                mapped.append(SystemMessage(content=content))
            elif role == "user":
                mapped.append(HumanMessage(content=content))
            elif role == "assistant":
                tool_calls = self._extract_message_tool_calls(msg)
                tool_calls = self._normalize_tool_calls_for_langchain(tool_calls)
                mapped.append(AIMessage(content=content, tool_calls=tool_calls))
            elif role == "tool":
                tool_call_id = self._extract_message_tool_call_id(msg) or "tool_call"
                mapped.append(ToolMessage(content=content, tool_call_id=tool_call_id))
            else:
                mapped.append(HumanMessage(content=content))
        return mapped

    def _serialize_langchain_content(self, message: Any) -> Any:
        text = self._message_text(message)
        attachments = list(getattr(message, "attachments", []) or [])
        if not attachments:
            return text

        content: list[dict[str, Any]] = []
        if text:
            content.append({"type": "text", "text": text})
        for attachment in attachments:
            if str(getattr(attachment, "kind", "")).strip().lower() != "image":
                raise ValueError("unsupported attachment kind for OpenAI serialization")
            content.append({"type": "image_url", "image_url": {"url": attachment.uri}})
        return content

    def _message_text(self, message: Any) -> str:
        text = getattr(message, "text", None)
        if isinstance(text, str):
            return text
        return ""

    def _extract_message_tool_calls(self, message: Any) -> Any:
        data = getattr(message, "data", None)
        if isinstance(data, dict) and isinstance(data.get("tool_calls"), list):
            return data["tool_calls"]
        return []

    def _extract_message_tool_call_id(self, message: Any) -> str | None:
        data = getattr(message, "data", None)
        if isinstance(data, dict):
            tool_call_id = data.get("tool_call_id")
            if isinstance(tool_call_id, str) and tool_call_id.strip():
                return tool_call_id
        name = getattr(message, "name", None)
        if isinstance(name, str) and name.strip():
            return name
        return None

    def _apply_options(self, client: Any, options: GenerateOptions | None) -> Any:
        """Apply generation options to the client."""
        if options is None:
            return client
        bind_kwargs = {}
        if options.max_tokens is not None:
            bind_kwargs["max_tokens"] = options.max_tokens
        if options.temperature is not None:
            bind_kwargs["temperature"] = options.temperature
        if options.top_p is not None:
            bind_kwargs["top_p"] = options.top_p
        if options.stop is not None:
            bind_kwargs["stop"] = options.stop
        if not bind_kwargs:
            return client
        return client.bind(**bind_kwargs)

    async def _generate_openai_compatible_response(
        self,
        model_input: ModelInput,
        options: GenerateOptions | None = None,
    ) -> ModelResponse:
        try:
            from openai import AsyncOpenAI
        except ImportError as exc:
            raise RuntimeError("openai SDK is required for OpenAI-compatible streaming mode") from exc

        client_kwargs: dict[str, Any] = {
            "api_key": self._api_key or "dummy-key",
            "base_url": self._endpoint,
        }
        default_headers = _load_default_headers_from_env()
        if default_headers:
            client_kwargs["default_headers"] = default_headers
        _, async_client = self._build_http_clients()
        if async_client is not None:
            client_kwargs["http_client"] = async_client
        direct_client = AsyncOpenAI(**client_kwargs)

        api_params: dict[str, Any] = {
            "model": self.model,
            "messages": _serialize_openai_sdk_messages(model_input.messages),
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if model_input.tools:
            api_params["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema,
                    },
                }
                for tool in model_input.tools
            ]
        if self._extra:
            api_params.update(self._extra)
        if options is not None:
            if options.max_tokens is not None:
                api_params["max_tokens"] = options.max_tokens
            if options.temperature is not None:
                api_params["temperature"] = options.temperature
            if options.top_p is not None:
                api_params["top_p"] = options.top_p
            if options.stop is not None:
                api_params["stop"] = options.stop

        stream = await direct_client.chat.completions.create(**api_params)

        content_parts: list[str] = []
        thinking_parts: list[str] = []
        tool_call_chunks: dict[int, dict[str, Any]] = {}
        usage: dict[str, Any] | None = None

        async with stream as response:
            async for chunk in response:
                usage = _merge_usage(usage, _extract_openai_sdk_usage(getattr(chunk, "usage", None)))

                choices = getattr(chunk, "choices", None) or []
                if not choices:
                    continue
                choice = choices[0]
                delta = getattr(choice, "delta", None)
                if delta is None:
                    continue

                content_text = _coerce_text(getattr(delta, "content", None))
                if content_text:
                    content_parts.append(content_text)

                thinking_text = _extract_delta_thinking_text(delta)
                if thinking_text:
                    thinking_parts.append(thinking_text)

                _accumulate_openai_sdk_tool_calls(tool_call_chunks, getattr(delta, "tool_calls", None))

        return ModelResponse(
            content="".join(content_parts),
            tool_calls=_finalize_langchain_tool_calls(tool_call_chunks),
            usage=usage,
            thinking_content=_join_stream_text_parts(thinking_parts),
        )

    async def _generate_streaming_response(self, client: Any, messages: list[Any]) -> ModelResponse:
        content_parts: list[str] = []
        thinking_parts: list[str] = []
        tool_call_chunks: dict[int, dict[str, Any]] = {}
        usage: dict[str, Any] | None = None

        async for chunk in client.astream(messages):
            usage = _merge_usage(usage, _extract_chunk_usage(chunk))

            content_text = _coerce_text(getattr(chunk, "content", None))
            if content_text:
                content_parts.append(content_text)

            thinking_text = self._extract_thinking_content(chunk) or _extract_reasoning_from_content_blocks(chunk)
            if thinking_text:
                thinking_parts.append(thinking_text)

            _accumulate_langchain_tool_call_chunks(tool_call_chunks, getattr(chunk, "tool_call_chunks", None))

        return ModelResponse(
            content="".join(content_parts),
            tool_calls=_finalize_langchain_tool_calls(tool_call_chunks),
            usage=usage,
            thinking_content=_join_stream_text_parts(thinking_parts),
        )

    def _extract_tool_calls(self, response: Any) -> list[dict[str, Any]]:
        """Extract and normalize tool calls from the response."""
        raw_calls = getattr(response, "tool_calls", None)
        if not raw_calls:
            raw_calls = getattr(response, "additional_kwargs", {}).get("tool_calls", [])

        normalized = []
        for call in raw_calls or []:
            name, args, call_id = self._extract_tool_call_fields(call)
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {"raw": args}
            if args is None:
                args = {}
            normalized.append({"id": call_id, "name": name, "arguments": args})
        return normalized

    def _extract_tool_call_fields(self, call: Any) -> tuple[str | None, Any, str | None]:
        """Extract name, arguments, and ID from a tool call."""
        if isinstance(call, dict):
            name = call.get("name") or call.get("function", {}).get("name")
            args = call.get("args") or call.get("arguments") or call.get("function", {}).get("arguments")
            call_id = call.get("id") or call.get("tool_call_id")
        else:
            name = getattr(call, "name", None)
            args = getattr(call, "args", None) or getattr(call, "arguments", None)
            call_id = getattr(call, "id", None)
        return name, args, call_id

    def _normalize_tool_calls_for_langchain(
        self,
        tool_calls: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Normalize tool calls for LangChain's expected format."""
        normalized = []
        for call in tool_calls:
            if not isinstance(call, dict):
                continue
            normalized.append({
                "id": call.get("id"),
                "name": call.get("name"),
                "args": call.get("arguments") if "arguments" in call else call.get("args", {}),
            })
        return normalized

    def _extract_usage(self, response: Any) -> dict[str, Any] | None:
        """Extract usage information from the response."""
        usage = getattr(response, "response_metadata", {}).get("token_usage")
        if usage:
            normalized = {
                "prompt_tokens": usage.get("prompt_tokens", 0),
                "completion_tokens": usage.get("completion_tokens", 0),
                "total_tokens": usage.get("total_tokens", 0),
            }
            reasoning_tokens = self._extract_reasoning_tokens(usage)
            if reasoning_tokens is not None:
                normalized["reasoning_tokens"] = reasoning_tokens
            return normalized
        return None

    def _extract_reasoning_tokens(self, usage: dict[str, Any]) -> int | None:
        """Extract reasoning token count from provider-specific usage payloads."""
        candidates: list[Any] = [
            usage.get("reasoning_tokens"),
            usage.get("output_tokens_details", {}).get("reasoning_tokens")
            if isinstance(usage.get("output_tokens_details"), dict)
            else None,
            usage.get("output_tokens_details", {}).get("reasoning")
            if isinstance(usage.get("output_tokens_details"), dict)
            else None,
            usage.get("completion_tokens_details", {}).get("reasoning_tokens")
            if isinstance(usage.get("completion_tokens_details"), dict)
            else None,
        ]
        for candidate in candidates:
            try:
                if candidate is None:
                    continue
                return int(candidate)
            except (TypeError, ValueError):
                continue
        return None

    def _extract_thinking_content(self, response: Any) -> str | None:
        """Extract provider reasoning text into framework-level thinking content."""
        additional_kwargs = getattr(response, "additional_kwargs", {})
        if isinstance(additional_kwargs, dict):
            for key in ("reasoning_content", "reasoning", "thinking"):
                content = _coerce_text(additional_kwargs.get(key))
                if content:
                    return content

        response_metadata = getattr(response, "response_metadata", {})
        if isinstance(response_metadata, dict):
            for key in ("reasoning_content", "reasoning", "thinking"):
                content = _coerce_text(response_metadata.get(key))
                if content:
                    return content
        return None

    def _log_client_config(self, client: Any) -> None:
        """Log client configuration for debugging."""
        if not self._logger.isEnabledFor(logging.DEBUG):
            return
        base_url = (
            getattr(getattr(client, "client", None), "base_url", None)
            or getattr(client, "base_url", None)
            or getattr(getattr(client, "_client", None), "base_url", None)
        )
        model_name = getattr(client, "model_name", None) or getattr(client, "model", None)
        self._logger.debug(
            "OpenAIModelAdapter generate call",
            extra={
                "model": model_name or self._model,
                "base_url": str(base_url) if base_url else None,
                "has_api_key": bool(self._api_key),
                "has_default_headers": bool(_load_default_headers_from_env()),
                "extra": bool(self._extra),
            },
        )

    def _build_http_clients(self) -> tuple[Any | None, Any | None]:
        """Build custom HTTP clients if options are provided."""
        if not self._http_client_options:
            return None, None
        try:
            import httpx
        except Exception:
            return None, None
        try:
            opts = dict(self._http_client_options)
            sync_client = httpx.Client(**opts)
            async_client = httpx.AsyncClient(**opts)
            return sync_client, async_client
        except Exception:
            return None, None

    def _emit_diag(self, event: str, payload: dict[str, Any]) -> None:
        raw = os.getenv(self._diag_env, "0").strip().lower()
        if raw in {"0", "false", "off"}:
            return
        try:
            self._logger.debug("[model-adapter] %s", json.dumps({"event": event, **payload}, ensure_ascii=False))
        except Exception:
            # Diagnostics must never break model generation.
            pass



__all__ = ["OpenAIModelAdapter"]


def _load_default_headers_from_env() -> dict[str, str] | None:
    raw = os.getenv("OPENAI_DEFAULT_HEADERS") or os.getenv("default_headers")
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict):
        return None
    headers: dict[str, str] = {}
    for key, value in parsed.items():
        if isinstance(key, str) and isinstance(value, str):
            headers[key] = value
    return headers or None


def _coerce_text(value: Any) -> str | None:
    """Coerce heterogenous provider reasoning payloads into a non-empty string."""
    if isinstance(value, str):
        text = value.strip()
        return text or None
    if isinstance(value, dict):
        for key in ("text", "content", "reasoning", "thinking"):
            text = _coerce_text(value.get(key))
            if text:
                return text
        return None
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            text = _coerce_text(item)
            if text:
                parts.append(text)
        if parts:
            return "\n".join(parts)
    return None


def _summarize_options(options: GenerateOptions | None) -> dict[str, Any] | None:
    if options is None:
        return None
    return {
        "max_tokens": options.max_tokens,
        "temperature": options.temperature,
        "top_p": options.top_p,
        "stop_count": len(options.stop or []),
    }


def _summarize_tool_call(call: dict[str, Any]) -> dict[str, Any]:
    arguments = call.get("arguments")
    arg_keys: list[str] = []
    arg_type = type(arguments).__name__
    if isinstance(arguments, dict):
        arg_keys = sorted(str(k) for k in arguments.keys())[:20]
    return {
        "id": call.get("id"),
        "name": call.get("name"),
        "arg_type": arg_type,
        "arg_keys": arg_keys,
    }


def _summarize_model_response(response: ModelResponse) -> dict[str, Any]:
    tool_calls = response.tool_calls or []
    return {
        "content_len": len(response.content or ""),
        "tool_call_count": len(tool_calls),
        "tool_calls": [_summarize_tool_call(call) for call in tool_calls[:20] if isinstance(call, dict)],
        "usage": response.usage or {},
        "has_thinking": bool((response.thinking_content or "").strip()),
    }


def _extract_delta_thinking_text(delta: Any) -> str | None:
    return (
        _coerce_text(getattr(delta, "reasoning_content", None))
        or _coerce_text(getattr(delta, "reasoning", None))
        or _coerce_text(getattr(delta, "thinking", None))
    )


def _extract_chunk_usage(chunk: Any) -> dict[str, Any] | None:
    usage_metadata = getattr(chunk, "usage_metadata", None)
    if usage_metadata is None:
        return None
    return {
        "prompt_tokens": getattr(usage_metadata, "input_tokens", 0) or 0,
        "completion_tokens": getattr(usage_metadata, "output_tokens", 0) or 0,
        "total_tokens": getattr(usage_metadata, "total_tokens", 0) or 0,
    }


def _extract_openai_sdk_usage(usage: Any) -> dict[str, Any] | None:
    if usage is None:
        return None
    normalized = {
        "prompt_tokens": getattr(usage, "prompt_tokens", 0) or 0,
        "completion_tokens": getattr(usage, "completion_tokens", 0) or 0,
        "total_tokens": getattr(usage, "total_tokens", 0) or 0,
    }
    reasoning_tokens = getattr(usage, "reasoning_tokens", None)
    if reasoning_tokens is not None:
        normalized["reasoning_tokens"] = reasoning_tokens
    return normalized


def _join_stream_text_parts(parts: list[str]) -> str | None:
    if not parts:
        return None
    return "".join(parts)


def _merge_usage(existing: dict[str, Any] | None, incoming: dict[str, Any] | None) -> dict[str, Any] | None:
    if incoming is None:
        return existing
    if existing is None:
        return dict(incoming)
    merged = dict(existing)
    for key, value in incoming.items():
        if value:
            merged[key] = value
    return merged


def _extract_reasoning_from_content_blocks(chunk: Any) -> str | None:
    content_blocks = getattr(chunk, "content_blocks", None)
    if not isinstance(content_blocks, list):
        return None
    parts: list[str] = []
    for block in content_blocks:
        if not isinstance(block, dict):
            continue
        if block.get("type") != "reasoning":
            continue
        text = _coerce_text(block.get("reasoning")) or _coerce_text(block.get("text")) or _coerce_text(block)
        if text:
            parts.append(text)
    if parts:
        return "\n".join(parts)
    return None


def _accumulate_langchain_tool_call_chunks(target: dict[int, dict[str, Any]], raw_chunks: Any) -> None:
    if not isinstance(raw_chunks, list):
        return
    for position, call in enumerate(raw_chunks):
        if not isinstance(call, dict):
            continue
        index = call.get("index", position)
        if not isinstance(index, int):
            index = position
        current = target.setdefault(index, {"id": None, "name": "", "arguments_parts": []})
        call_id = call.get("id")
        if isinstance(call_id, str) and call_id.strip():
            current["id"] = call_id
        name = call.get("name")
        if isinstance(name, str) and name.strip():
            current["name"] = name
        arguments = call.get("args")
        if isinstance(arguments, str) and arguments:
            current["arguments_parts"].append(arguments)


def _accumulate_openai_sdk_tool_calls(target: dict[int, dict[str, Any]], raw_chunks: Any) -> None:
    if not raw_chunks:
        return
    for position, call in enumerate(raw_chunks):
        index = getattr(call, "index", position)
        if not isinstance(index, int):
            index = position
        current = target.setdefault(index, {"id": None, "name": "", "arguments_parts": []})
        call_id = getattr(call, "id", None)
        if isinstance(call_id, str) and call_id.strip():
            current["id"] = call_id
        function = getattr(call, "function", None)
        if function is None:
            continue
        name = getattr(function, "name", None)
        if isinstance(name, str) and name.strip():
            current["name"] = name
        arguments = getattr(function, "arguments", None)
        if isinstance(arguments, str) and arguments:
            current["arguments_parts"].append(arguments)


def _serialize_openai_sdk_messages(messages: list[Any]) -> list[dict[str, Any]]:
    serialized: list[dict[str, Any]] = []
    for msg in messages:
        role = str(getattr(msg, "role", "user"))
        payload: dict[str, Any] = {
            "role": role,
            "content": _serialize_openai_sdk_content(msg),
        }
        if role == "assistant":
            tool_calls = _normalize_tool_calls_for_openai_sdk(_extract_message_tool_calls_for_sdk(msg))
            if tool_calls:
                payload["tool_calls"] = tool_calls
        tool_call_id = _extract_message_tool_call_id_for_sdk(msg)
        name = getattr(msg, "name", None)
        if role == "tool" and tool_call_id:
            payload["tool_call_id"] = tool_call_id
        elif name:
            payload["name"] = name
        serialized.append(payload)
    return serialized


def _serialize_openai_sdk_content(message: Any) -> Any:
    text = getattr(message, "text", None)
    text = text if isinstance(text, str) else ""
    attachments = list(getattr(message, "attachments", []) or [])
    if not attachments:
        return text
    content: list[dict[str, Any]] = []
    if text:
        content.append({"type": "text", "text": text})
    for attachment in attachments:
        if str(getattr(attachment, "kind", "")).strip().lower() != "image":
            raise ValueError("unsupported attachment kind for OpenAI serialization")
        content.append({"type": "image_url", "image_url": {"url": attachment.uri}})
    return content


def _extract_message_tool_calls_for_sdk(message: Any) -> Any:
    data = getattr(message, "data", None)
    if isinstance(data, dict) and isinstance(data.get("tool_calls"), list):
        return data["tool_calls"]
    return []


def _extract_message_tool_call_id_for_sdk(message: Any) -> str | None:
    data = getattr(message, "data", None)
    if isinstance(data, dict):
        tool_call_id = data.get("tool_call_id")
        if isinstance(tool_call_id, str) and tool_call_id.strip():
            return tool_call_id
    name = getattr(message, "name", None)
    if isinstance(name, str) and name.strip():
        return name
    return None


def _normalize_tool_calls_for_openai_sdk(tool_calls: Any) -> list[dict[str, Any]]:
    if not isinstance(tool_calls, list):
        return []
    normalized: list[dict[str, Any]] = []
    for call in tool_calls:
        if not isinstance(call, dict):
            continue
        name = call.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        raw_args = call.get("arguments", call.get("args", {}))
        if isinstance(raw_args, str):
            args_json = raw_args
        else:
            safe_args = raw_args if isinstance(raw_args, dict) else {}
            args_json = json.dumps(safe_args, ensure_ascii=False)
        normalized_call: dict[str, Any] = {
            "type": "function",
            "function": {
                "name": name,
                "arguments": args_json,
            },
        }
        call_id = call.get("id") or call.get("tool_call_id")
        if isinstance(call_id, str) and call_id.strip():
            normalized_call["id"] = call_id
        normalized.append(normalized_call)
    return normalized


def _finalize_langchain_tool_calls(tool_call_chunks: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index in sorted(tool_call_chunks):
        chunk = tool_call_chunks[index]
        name = chunk.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        arguments_raw = "".join(chunk.get("arguments_parts", []))
        try:
            arguments = json.loads(arguments_raw) if arguments_raw else {}
        except json.JSONDecodeError:
            arguments = {"raw": arguments_raw}
        normalized.append(
            {
                "id": chunk.get("id"),
                "name": name,
                "arguments": arguments,
            }
        )
    return normalized
