# Copyright (c) Huawei Technologies Co., Ltd. 2025. All rights reserved.

"""MCP toolkit aggregator for openjiuwen tools."""

from __future__ import annotations
import json
from pathlib import Path

from openjiuwen.core.foundation.tool import Tool, McpServerConfig

from jiuwenclaw.agentserver.tools.command_tools import mcp_exec_command
from jiuwenclaw.agentserver.tools.search_tools import mcp_free_search, mcp_paid_search
from jiuwenclaw.agentserver.tools.web_fetch_tools import mcp_fetch_webpage


def _normalize_stdio_command_kind(command: str) -> str:
    raw = str(command or "").strip()
    if not raw:
        raise ValueError("工具配置缺少 'command' 字段")

    normalized = Path(raw).name.lower()
    if normalized in ("node", "node.exe"):
        return "node"
    if normalized.startswith("python"):
        return "python"
    raise ValueError(f"不支持的 command 类型: '{command}'，目前仅支持 node/python 及其绝对路径")


def create_mcp_tool(config_str: str) -> McpServerConfig:
    """从 JSON 字符串解析并构造 ``McpServerConfig``（stdio MCP）。

    Args:
        config_str: JSON 格式配置字符串，格式为：
            {
                "name": "tool_name",
                "command": "node" | "python",
                "args": ["xxx.js"] | ["xxx.py"]
            }

    Returns:
        ``McpServerConfig``，由调用方通过 ``Runner.resource_mgr.add_mcp_server(..., tag=...)`` 注册。

    Raises:
        ValueError: JSON 解析失败或配置不合法时
    """
    try:
        config = json.loads(config_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"无效的 JSON 配置: {e}")

    # 处理数组格式或单个字典格式
    if isinstance(config, list):
        if len(config) == 0:
            raise ValueError("工具配置数组不能为空")
        # 使用第一个工具配置
        tool_config = config[0]
    elif isinstance(config, dict):
        tool_config = config
    else:
        raise ValueError("配置必须是字典或数组类型")

    if not isinstance(tool_config, dict):
        raise ValueError("工具配置必须是字典类型")

    tool_name = tool_config.get("name")
    server_id = str(tool_config.get("server_id") or tool_name or "").strip()
    command = tool_config.get("command")
    args = tool_config.get("args", [])
    env = tool_config.get("env")
    cwd = tool_config.get("cwd")

    if not tool_name:
        raise ValueError("工具配置缺少 'name' 字段")

    normalized_command = str(command or "").strip()
    _normalize_stdio_command_kind(normalized_command)

    if not isinstance(args, list):
        raise ValueError(f"工具 '{tool_name}' 的 args 必须是列表类型")

    params = {
        "command": normalized_command,
        "args": args,
    }
    if isinstance(env, dict) and env:
        params["env"] = {str(k): str(v) for k, v in env.items() if k is not None and v is not None}
    if isinstance(cwd, str) and cwd.strip():
        params["cwd"] = cwd.strip()

    return McpServerConfig(
        server_id=server_id or tool_name,
        server_name=tool_name,
        server_path=f"stdio://{tool_name}",
        client_type="stdio",
        params=params,
    )


def _has_paid_search_api_key() -> bool:
    """Check if any paid search API key is configured."""
    return any([
        os.environ.get("PERPLEXITY_API_KEY"),
        os.environ.get("SERPER_API_KEY"),
        os.environ.get("JINA_API_KEY"),
    ])


def get_mcp_tools() -> list[Tool]:
    """Return all MCP toolkit tools for registration in Runner."""
    return [mcp_free_search, mcp_paid_search, mcp_fetch_webpage, mcp_exec_command]


__all__ = [
    "mcp_free_search",
    "mcp_paid_search",
    "mcp_fetch_webpage",
    "mcp_exec_command",
    "get_mcp_tools",
    "create_mcp_tool",
]
