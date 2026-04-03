"""MCP runtime command handlers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from client.runtime.bootstrap import ClientRuntime, apply_runtime_overrides


def _tool_name(tool_def: Any) -> str:
    if isinstance(tool_def, dict):
        function = tool_def.get("function")
        if isinstance(function, dict) and isinstance(function.get("name"), str):
            return function["name"]
        metadata = tool_def.get("metadata")
        if isinstance(metadata, dict) and isinstance(metadata.get("display_name"), str):
            return metadata["display_name"]
    return str(tool_def)


def summarize_tools(agent: Any) -> dict[str, Any]:
    """Return split tool snapshots for local and MCP tools."""
    list_tool_defs = getattr(agent, "list_tool_defs", None)
    if not callable(list_tool_defs):
        return {"mcp_tools": [], "local_tools": []}
    tool_defs = list_tool_defs()
    names = [_tool_name(item) for item in tool_defs]
    inspect_fn = getattr(agent, "inspect_mcp_tools", None)
    if callable(inspect_fn):
        try:
            mcp_def_names = {_tool_name(item) for item in inspect_fn(tool_name=None)}
            mcp_tools = [name for name in names if name in mcp_def_names]
            local_tools = [name for name in names if name not in mcp_def_names]
            return {"mcp_tools": mcp_tools, "local_tools": local_tools}
        except Exception:
            # Fall back to heuristic if MCP inspection is unavailable.
            pass

    # Compatibility heuristic for environments without inspect_mcp_tools().
    mcp_tools = [name for name in names if ":" in name or "-" in name or name.count("_") >= 2]
    local_tools = [name for name in names if name not in set(mcp_tools)]
    return {"mcp_tools": mcp_tools, "local_tools": local_tools}


async def handle_mcp_tokens(tokens: list[str], *, runtime: ClientRuntime) -> dict[str, Any]:
    """Handle slash-style MCP tokens."""
    if not tokens:
        return {"usage": ["/mcp list|inspect [tool_name]|reload [paths...]|unload"]}
    subcommand = tokens[0].lower()
    agent = runtime.agent
    if subcommand == "list":
        summary = summarize_tools(agent)
        summary["mcp_paths"] = list(runtime.config.mcp_paths)
        return summary
    if subcommand == "inspect":
        tool_name = tokens[1] if len(tokens) > 1 else None
        inspect_fn = getattr(agent, "inspect_mcp_tools", None)
        if not callable(inspect_fn):
            raise RuntimeError("current agent does not support MCP inspection")
        tool_defs = inspect_fn(tool_name=tool_name)
        return {"tools": tool_defs}
    if subcommand == "reload":
        reload_fn = getattr(agent, "reload_mcp", None)
        if not callable(reload_fn):
            raise RuntimeError("current agent does not support dynamic MCP reload")
        if len(tokens) > 1:
            raw_paths = [str(Path(item).expanduser()) for item in tokens[1:]]
            paths = []
            for raw in raw_paths:
                path = Path(raw)
                if not path.is_absolute():
                    path = (runtime.options.workspace_dir / path).resolve()
                paths.append(path)
            await reload_fn(config=runtime.config, paths=paths)
            return {
                "reloaded": True,
                "paths": [str(path) for path in paths],
                **summarize_tools(agent),
            }
        runtime.config = apply_runtime_overrides(runtime.config_provider.reload(), runtime.options)
        await reload_fn(config=runtime.config, paths=None)
        return {
            "reloaded": True,
            "paths": list(runtime.config.mcp_paths),
            **summarize_tools(agent),
        }
    if subcommand == "unload":
        unload_fn = getattr(agent, "unload_mcp", None)
        if not callable(unload_fn):
            raise RuntimeError("current agent does not support dynamic MCP unload")
        removed = await unload_fn()
        return {"removed": bool(removed), **summarize_tools(agent)}
    raise ValueError(f"unknown mcp command: {subcommand}")


def format_mcp_inspection(tools: list[dict[str, Any]]) -> str:
    """Render MCP tool schema payload in readable multi-line text."""
    if not tools:
        return "(no MCP tools)"
    chunks: list[str] = []
    for tool in tools:
        function = tool.get("function", {})
        name = function.get("name", "?")
        description = function.get("description", "")
        parameters = function.get("parameters", {})
        block = [f"tool: {name}"]
        if description:
            block.append(f"description: {description}")
        block.append("parameters:")
        block.append(json.dumps(parameters, ensure_ascii=False, indent=2))
        output_schema = tool.get("output_schema")
        if isinstance(output_schema, dict) and output_schema:
            block.append("output_schema:")
            block.append(json.dumps(output_schema, ensure_ascii=False, indent=2))
        chunks.append("\n".join(block))
    return "\n\n".join(chunks)
