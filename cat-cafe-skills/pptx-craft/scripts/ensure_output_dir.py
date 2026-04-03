#!/usr/bin/env python3
"""
确保输出目录存在并返回绝对路径
"""

import sys
import os
from pathlib import Path


def ensure_output_dir(output_dir: str) -> Path:
    """
    确保输出目录存在并返回 pages 子目录的绝对路径

    Args:
        output_dir: 输出目录路径

    Returns:
        pages 子目录的绝对路径

    Raises:
        SystemExit: 如果传入 pages 目录或创建失败
    """
    resolved_path = Path(output_dir).resolve()

    # 防护检查：拒绝已包含 pages 的路径
    if resolved_path.name == "pages":
        print("Error: Do not pass a path ending in 'pages' to this script", file=sys.stderr)
        sys.exit(1)

    # 始终在传入目录下创建 "pages" 子目录
    pages_dir = resolved_path / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)

    # 验证目录存在
    if not pages_dir.is_dir():
        print(f"Error: Failed to create directory {pages_dir}", file=sys.stderr)
        sys.exit(1)

    return pages_dir.resolve()


def main():
    if len(sys.argv) < 2:
        print("Usage: python ensure_output_dir.py <output_dir>", file=sys.stderr)
        sys.exit(1)

    output_dir = sys.argv[1]
    pages_dir = ensure_output_dir(output_dir)
    print(pages_dir)


if __name__ == "__main__":
    main()
