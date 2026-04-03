"""Default model adapter manager implementation."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from dare_framework.config.types import Config, LLMConfig
from dare_framework.model.interfaces import IModelAdapterManager
from dare_framework.model.kernel import IModelAdapter
from dare_framework.model.adapters.anthropic_adapter import AnthropicModelAdapter
from dare_framework.model.adapters.huawei_modelarts_adapter import HuaweiModelArtsModelAdapter
from dare_framework.model.adapters.openai_adapter import OpenAIModelAdapter
from dare_framework.model.adapters.openrouter_adapter import OpenRouterModelAdapter

_logger = logging.getLogger(__name__)
_DIAG_ENV = "DARE_MODEL_ADAPTER_DIAG_LOG"


class DefaultModelAdapterManager(IModelAdapterManager):
    """Resolve model adapters using Config.llm with a default OpenAI fallback."""

    def __init__(self, *, config: Config | None = None) -> None:
        self._config = config

    def load_model_adapter(self, *, config: Config | None = None) -> IModelAdapter | None:
        effective = config or self._config
        if effective is None:
            raise ValueError("DefaultModelAdapterManager requires a Config (in constructor or load_model_adapter).")
        llm = effective.llm
        adapter_name = _normalize_adapter_name(llm.adapter)
        adapter: IModelAdapter | None = None
        if adapter_name == "openai":
            adapter = _build_openai_adapter(llm)
        elif adapter_name == "openrouter":
            adapter = _build_openrouter_adapter(llm)
        elif adapter_name == "anthropic":
            adapter = _build_anthropic_adapter(llm)
        elif adapter_name == "huawei-modelarts":
            adapter = _build_huawei_modelarts_adapter(llm)
        else:
            raise ValueError(
                f"Unsupported model adapter '{adapter_name}'. Supported adapters: openai, openrouter, anthropic, huawei-modelarts."
            )

        _emit_model_adapter_diag(
            {
                "event": "adapter.loaded",
                "requested_adapter": adapter_name,
                "adapter_class": type(adapter).__name__,
                "adapter_name": getattr(adapter, "name", None),
                "model": llm.model,
                "endpoint": llm.endpoint,
                "has_api_key": bool(llm.api_key),
            }
        )
        return adapter



def _normalize_adapter_name(name: str | None) -> str:
    if not name:
        return "openai"
    return str(name).strip().lower()


def _build_openai_adapter(llm: LLMConfig) -> OpenAIModelAdapter:
    return OpenAIModelAdapter(
        name="openai",
        model=llm.model,
        api_key=llm.api_key,
        endpoint=llm.endpoint,
        http_client_options=_http_client_options_from_proxy(llm),
        extra=dict(llm.extra),
    )


def _build_openrouter_adapter(llm: LLMConfig) -> OpenRouterModelAdapter:
    return OpenRouterModelAdapter(
        name="openrouter",
        api_key=llm.api_key,
        model=llm.model,
        base_url=llm.endpoint,
        http_client_options=_http_client_options_from_proxy(llm),
        extra=dict(llm.extra),
    )


def _build_anthropic_adapter(llm: LLMConfig) -> AnthropicModelAdapter:
    return AnthropicModelAdapter(
        name="anthropic",
        api_key=llm.api_key,
        model=llm.model,
        base_url=llm.endpoint,
        http_client_options=_http_client_options_from_proxy(llm),
        extra=dict(llm.extra),
    )


def _build_huawei_modelarts_adapter(llm: LLMConfig) -> HuaweiModelArtsModelAdapter:
    return HuaweiModelArtsModelAdapter(
        name="huawei-modelarts",
        api_key=llm.api_key,
        model=llm.model,
        base_url=llm.endpoint,
        http_client_options=_http_client_options_from_proxy(llm),
        extra=dict(llm.extra),
    )


def _http_client_options_from_proxy(llm: LLMConfig) -> dict[str, Any]:
    proxy = llm.proxy
    options: dict[str, Any] = {}
    if proxy.disabled:
        options["trust_env"] = False
        options["proxy"] = None
    else:
        if proxy.use_system_proxy:
            options["trust_env"] = True
        if proxy.http or proxy.https:
            options["proxy"] = proxy.https or proxy.http
            options.setdefault("trust_env", False)
    ssl_verify = _resolve_ssl_verify_option(llm)
    if ssl_verify is not None:
        options["verify"] = ssl_verify
    return options


def _resolve_ssl_verify_option(llm: LLMConfig) -> bool | None:
    env_value = _parse_bool(os.getenv("DARE_SSL_VERIFY"))
    if env_value is not None:
        return env_value
    for key in ("ssl_verify", "sslVerify"):
        value = _parse_bool(llm.extra.get(key))
        if value is not None:
            return value
    return False


def _parse_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return None


def _emit_model_adapter_diag(payload: dict[str, Any]) -> None:
    raw = os.getenv(_DIAG_ENV, "0").strip().lower()
    if raw in {"0", "false", "off"}:
        return
    try:
        _logger.debug("[model-adapter-manager] %s", json.dumps(payload, ensure_ascii=False))
    except Exception:
        pass


__all__ = ["DefaultModelAdapterManager"]
