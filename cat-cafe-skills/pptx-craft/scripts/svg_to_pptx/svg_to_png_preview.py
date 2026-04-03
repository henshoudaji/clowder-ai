#!/usr/bin/env python3
"""
SVG to PNG Preview Generator

将 SVG 文件转换为 PNG 预览图，用于视觉 QA 检查。
支持字体 fallback，确保在系统字体缺失时自动替换为可用字体。

Usage:
    python svg_to_png_preview.py <project_path>
    python svg_to_png_preview.py <project_path> --width 1920 --height 1080

Dependencies:
    pip install cairosvg
    or
    pip install svglib reportlab
"""

import sys
import os
import re
import argparse
import tempfile
import platform
from pathlib import Path
from typing import Set, Optional
from xml.etree import ElementTree as ET

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from svg_to_pptx import convert_svg_to_png, find_svg_files, get_png_renderer_info


# 字体 Fallback 映射表
FONT_FALLBACK_CHAIN = {
    # 中文 - macOS
    'STHeiti': ['STHeiti Light', 'STHeiti Medium', 'Helvetica Neue', 'Arial', 'sans-serif'],
    'Heiti SC': ['STHeiti Light', 'STHeiti Medium', 'Helvetica Neue', 'Arial', 'sans-serif'],
    'Heiti TC': ['STHeiti Light', 'STHeiti Medium', 'Helvetica Neue', 'Arial', 'sans-serif'],
    'PingFang SC': ['STHeiti Light', 'STHeiti Medium', 'Helvetica Neue', 'Arial', 'sans-serif'],
    'PingFang TC': ['STHeiti Light', 'STHeiti Medium', 'Helvetica Neue', 'Arial', 'sans-serif'],
    # 中文 - Windows
    'Microsoft YaHei': ['Microsoft YaHei UI', 'Microsoft Sans Serif', 'SimHei', 'SimSun', 'Arial', 'sans-serif'],
    'Microsoft YaHei UI': ['Microsoft YaHei', 'Microsoft Sans Serif', 'SimHei', 'SimSun', 'Arial', 'sans-serif'],
    'SimHei': ['Microsoft YaHei', 'Microsoft YaHei UI', 'Microsoft Sans Serif', 'SimSun', 'Arial', 'sans-serif'],
    'SimSun': ['SimHei', 'Microsoft YaHei', 'Microsoft YaHei UI', 'Microsoft Sans Serif', 'Arial', 'sans-serif'],
    # 中文 - 通用
    'Noto Sans CJK SC': ['STHeiti Light', 'STHeiti Medium', 'Microsoft YaHei', 'Microsoft Sans Serif', 'Arial', 'sans-serif'],
    'Noto Sans CJK TC': ['STHeiti Light', 'STHeiti Medium', 'Microsoft YaHei', 'Microsoft Sans Serif', 'Arial', 'sans-serif'],
    'Noto Sans CJK JP': ['STHeiti Light', 'STHeiti Medium', 'Microsoft YaHei', 'Microsoft Sans Serif', 'Arial', 'sans-serif'],
    'Noto Sans CJK KR': ['STHeiti Light', 'STHeiti Medium', 'Microsoft YaHei', 'Microsoft Sans Serif', 'Arial', 'sans-serif'],
    'Noto Sans SC': ['STHeiti Light', 'STHeiti Medium', 'Microsoft YaHei', 'Microsoft Sans Serif', 'Arial', 'sans-serif'],
    'WenQuanYi Micro Hei': ['STHeiti Light', 'STHeiti Medium', 'Microsoft YaHei', 'Microsoft Sans Serif', 'Arial', 'sans-serif'],
    'WenQuanYi Zen Hei': ['STHeiti Light', 'STHeiti Medium', 'Microsoft YaHei', 'Microsoft Sans Serif', 'Arial', 'sans-serif'],
    # 英文
    'Arial': ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
    'Helvetica Neue': ['Helvetica', 'Arial', 'sans-serif'],
    'Helvetica': ['Arial', 'Helvetica Neue', 'sans-serif'],
    'Times New Roman': ['Times', 'Georgia', 'serif'],
    'Georgia': ['Times', 'Times New Roman', 'serif'],
    'Courier New': ['Courier', 'Monaco', 'monospace'],
    'Monaco': ['Courier New', 'Courier', 'monospace'],
    # 一般
    'sans-serif': ['Arial', 'Helvetica Neue', 'Helvetica', 'STHeiti Light', 'Microsoft Sans Serif'],
    'serif': ['Times New Roman', 'Georgia', 'Times'],
    'monospace': ['Courier New', 'Monaco', 'Courier'],
    'Fantasy': ['Impact', 'Arial Black', 'sans-serif'],
    'cursive': ['Brush Script', 'Comic Sans MS', 'sans-serif'],
}

# 通用中文字体（最可能存在的中文替代字体）
CJK_FALLBACK_FONTS = [
    'STHeiti Light', 'STHeiti Medium', 'STHeiti',
    'Microsoft YaHei', 'Microsoft YaHei UI', 'Microsoft Sans Serif',
    'SimHei', 'SimSun',
    'PingFang SC', 'PingFang TC',
    'Noto Sans SC', 'Noto Sans TC',
    'WenQuanYi Micro Hei', 'WenQuanYi Zen Hei',
]


def get_system_fonts() -> Set[str]:
    """
    扫描系统字体目录，返回可用字体名称集合

    Returns:
        可用字体名称集合
    """
    fonts = set()
    system = platform.system()

    font_dirs = []
    home = Path.home()

    if system == 'Windows':
        font_dirs = [
            Path('C:/Windows/Fonts'),
            Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts',
        ]
    elif system == 'Darwin':
        font_dirs = [
            Path('/System/Library/Fonts'),
            Path('/Library/Fonts'),
            home / 'Library' / 'Fonts',
            Path('/System/Library/AssetsV2'),
        ]
    else:  # Linux
        font_dirs = [
            Path('/usr/share/fonts'),
            Path('/usr/local/share/fonts'),
            home / '.fonts',
            home / '.local' / 'share' / 'fonts',
        ]

    for font_dir in font_dirs:
        if font_dir.exists():
            for font_file in font_dir.rglob('*'):
                if font_file.suffix.lower() in ('.ttf', '.otf', '.ttc', '.woff', '.woff2'):
                    # 提取字体名称（去除扩展名）
                    font_name = font_file.stem
                    # 去除常见后缀
                    for suffix in ['-Regular', '-Bold', '-Italic', '-Light', '-Medium', '-Black']:
                        if font_name.endswith(suffix):
                            font_name = font_name[:-len(suffix)]
                    fonts.add(font_name)

    return fonts


def find_font_fallback(original_font: str, available_fonts: Set[str]) -> Optional[str]:
    """
    为指定字体找到可用的 fallback 字体

    Args:
        original_font: 原始字体名称
        available_fonts: 系统可用字体集合

    Returns:
        可用的 fallback 字体名称，如果找不到则返回 None
    """
    # 直接检查原始字体是否可用
    if original_font in available_fonts:
        return original_font

    # 清理字体名称（去除引号、空格等）
    clean_font = original_font.strip().strip('"\'')

    # 检查清理后的名称
    if clean_font in available_fonts:
        return clean_font

    # 尝试从 fallback 链中查找
    if clean_font in FONT_FALLBACK_CHAIN:
        for fallback in FONT_FALLBACK_CHAIN[clean_font]:
            if fallback in available_fonts:
                return fallback

    # 尝试反向查找（fallback 链中的字体作为 key）
    for key, fallbacks in FONT_FALLBACK_CHAIN.items():
        if clean_font in fallbacks:
            for fallback in fallbacks:
                if fallback in available_fonts:
                    return fallback

    # 尝试通用中文 fallback
    if any('\u4e00' <= c <= '\u9fff' for c in clean_font):  # 如果包含中文
        for fallback in CJK_FALLBACK_FONTS:
            if fallback in available_fonts:
                return fallback

    return None


def replace_font_in_css(css_content: str, available_fonts: Set[str]) -> tuple[str, bool]:
    """
    替换 CSS 内容中的字体

    Args:
        css_content: CSS 内容
        available_fonts: 系统可用字体集合

    Returns:
        (修改后的 CSS 内容, 是否进行了替换)
    """
    modified = False

    # 匹配 font-family 属性
    def replace_font_match(match):
        nonlocal modified
        full_match = match.group(0)
        # 获取现有的字体列表
        font_value = match.group(1)
        fonts = [f.strip().strip('"\'') for f in font_value.split(',')]
        new_fonts = []

        for font in fonts:
            fallback = find_font_fallback(font, available_fonts)
            if fallback:
                new_fonts.append(fallback)
                if fallback != font:
                    modified = True
            else:
                new_fonts.append('sans-serif')
                modified = True

        # 重建 font-family 属性
        new_font_value = ', '.join(f"\"{f}\"" if ' ' in f else f for f in new_fonts)
        return f'font-family: {new_font_value}'

    # 处理 font-family: ... ;
    css_content = re.sub(r'font-family:\s*([^;]+);', replace_font_match, css_content)

    return css_content, modified


def apply_font_fallback(svg_content: str, available_fonts: Set[str]) -> tuple[str, bool]:
    """
    应用字体 fallback 到 SVG 内容

    Args:
        svg_content: SVG 文件内容
        available_fonts: 系统可用字体集合

    Returns:
        (修改后的 SVG 内容, 是否进行了替换)
    """
    modified = False

    # 处理 <style> 标签内的 CSS
    def replace_style_content(match):
        nonlocal modified
        style_content = match.group(1)
        new_content, was_modified = replace_font_in_css(style_content, available_fonts)
        if was_modified:
            modified = True
        return match.group(0).replace(style_content, new_content)

    # 处理 <style>...</style> 和 <style><![CDATA[...]]></style>
    svg_content = re.sub(
        r'<style[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</style>',
        replace_style_content,
        svg_content,
        flags=re.DOTALL
    )

    # 解析 SVG 处理元素属性
    try:
        root = ET.fromstring(svg_content)
    except ET.ParseError:
        return svg_content, modified

    # 替换元素的 font-family 属性
    for elem in root.iter():
        font_family = elem.get('font-family')
        if font_family:
            fonts = [f.strip().strip('"\'') for f in font_family.split(',')]
            new_fonts = []

            for font in fonts:
                fallback = find_font_fallback(font, available_fonts)
                if fallback:
                    new_fonts.append(fallback)
                    if fallback != font:
                        modified = True
                else:
                    new_fonts.append('sans-serif')
                    modified = True

            if new_fonts:
                elem.set('font-family', ', '.join(f"'{f}'" for f in new_fonts))

    # 同时处理 style 属性中的 font-family
    for elem in root.iter():
        style = elem.get('style')
        if style and 'font-family' in style:
            new_style, was_modified = replace_font_in_css(style, available_fonts)
            if was_modified:
                elem.set('style', new_style)
                modified = True

    return ET.tostring(root, encoding='unicode'), modified


def generate_preview(
    svg_path: Path,
    output_path: Path,
    width: int,
    height: int,
    available_fonts: Set[str] = None
) -> bool:
    """
    生成单个 SVG 的预览图

    Args:
        svg_path: SVG 文件路径
        output_path: 输出 PNG 路径
        width: 输出宽度
        height: 输出高度
        available_fonts: 系统可用字体集合

    Returns:
        是否成功
    """
    print(f"  Converting: {svg_path.name} -> {output_path.name}")

    # 读取 SVG
    try:
        with open(svg_path, 'r', encoding='utf-8') as f:
            svg_content = f.read()
    except Exception as e:
        print(f"    ERROR: Cannot read SVG file: {e}")
        return False

    # 应用字体 fallback
    modified = False
    if available_fonts:
        svg_content, modified = apply_font_fallback(svg_content, available_fonts)
        if modified:
            print(f"    Font fallback applied")

    # 如果有修改，使用临时文件
    if modified:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.svg', encoding='utf-8', delete=False) as tmp:
            tmp.write(svg_content)
            tmp_path = Path(tmp.name)
        try:
            success = convert_svg_to_png(tmp_path, output_path, width, height)
        finally:
            tmp_path.unlink(missing_ok=True)
    else:
        success = convert_svg_to_png(svg_path, output_path, width, height)

    if success:
        print(f"    OK: {output_path}")
    else:
        print(f"    FAILED: {svg_path.name}")
    return success


def main():
    parser = argparse.ArgumentParser(
        description="将 SVG 文件转换为 PNG 预览图，用于视觉 QA 检查"
    )
    parser.add_argument(
        "project_path",
        type=Path,
        help="项目目录路径（包含 pages/ 子目录）"
    )
    parser.add_argument(
        "--width", "-w",
        type=int,
        default=1280,
        help="输出图片宽度（默认 1280）"
    )
    parser.add_argument(
        "--height", "-H",
        type=int,
        default=720,
        help="输出图片高度（默认 720）"
    )
    parser.add_argument(
        "--source", "-s",
        type=str,
        default="pages",
        choices=["pages", "output", "final"],
        help="SVG 源目录（默认 pages）"
    )
    parser.add_argument(
        "--suffix", "-S",
        type=str,
        default="_preview",
        help="输出文件后缀（默认 _preview）"
    )
    parser.add_argument(
        "--no-font-fallback",
        action="store_true",
        help="禁用字体 fallback"
    )

    args = parser.parse_args()

    # Check if project path exists
    if not args.project_path.exists():
        print(f"Error: Project path does not exist: {args.project_path}")
        sys.exit(1)

    # Check PNG renderer
    renderer, quality_note, install_hint = get_png_renderer_info()
    if renderer is None:
        print("Error: No SVG to PNG converter installed.")
        print(f"  {install_hint}")
        sys.exit(1)

    print(f"Using: {renderer} {quality_note}")
    print(f"Output size: {args.width} x {args.height}")

    # 获取系统字体
    available_fonts = None
    if not args.no_font_fallback:
        print()
        print("Scanning system fonts...")
        available_fonts = get_system_fonts()
        print(f"Found {len(available_fonts)} system fonts")

    print()

    # Find SVG files
    svg_files, source_dir = find_svg_files(args.project_path, args.source)
    if not svg_files:
        print(f"No SVG files found in {args.project_path / source_dir}")
        sys.exit(1)

    print(f"Found {len(svg_files)} SVG file(s) in {source_dir}")
    print()

    # Create output directory
    preview_dir = args.project_path / source_dir
    preview_dir.mkdir(parents=True, exist_ok=True)

    # Convert each SVG to PNG
    success_count = 0
    fail_count = 0

    for svg_file in sorted(svg_files):
        # Generate output filename
        output_name = svg_file.stem + args.suffix + ".png"
        output_path = preview_dir / output_name

        if generate_preview(svg_file, output_path, args.width, args.height, available_fonts):
            success_count += 1
        else:
            fail_count += 1

    # Summary
    print()
    print("=" * 50)
    print(f"Summary: {success_count} succeeded, {fail_count} failed")
    print(f"Preview files: {preview_dir}")

    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
