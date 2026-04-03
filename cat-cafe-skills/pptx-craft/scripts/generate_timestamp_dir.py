#!/usr/bin/env python3
"""
生成带序号的时间戳目录
"""

import sys
import os
from pathlib import Path
from datetime import datetime


def generate_timestamp_dir(base_dir: str = "output") -> Path:
    """
    生成带序号的时间戳目录

    Args:
        base_dir: 基础目录（默认 output）

    Returns:
        创建的时间戳目录路径
    """
    base_path = Path(base_dir)
    now = datetime.now()

    # 生成时间戳前缀
    timestamp_prefix = (
        f"{now.year}"
        f"{str(now.month).zfill(2)}"
        f"{str(now.day).zfill(2)}"
        f"_{str(now.hour).zfill(2)}"
        f"{str(now.minute).zfill(2)}"
        f"{str(now.second).zfill(2)}"
    )

    # 确保基础目录存在
    base_path.mkdir(parents=True, exist_ok=True)

    # 查找同前缀的目录序号
    seq = 0
    while True:
        timestamp_dir = base_path / f"{timestamp_prefix}_{str(seq).zfill(3)}"
        if not timestamp_dir.exists():
            break
        seq += 1

    # 创建目录
    timestamp_dir.mkdir(parents=True, exist_ok=True)
    return timestamp_dir.resolve()


def main():
    base_dir = sys.argv[2] if len(sys.argv) > 2 else "output"
    timestamp_dir = generate_timestamp_dir(base_dir)
    print(timestamp_dir)


if __name__ == "__main__":
    main()
