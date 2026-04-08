# SVG to PPTX 转换工具集

本目录包含 PPT 生成流程中 SVG 处理相关的工具脚本。

## 目录结构

```
svg_to_pptx/
├── svg_to_pptx.py          # 主入口：SVG -> PPTX 转换
├── svg_to_png_preview.py   # SVG -> PNG 预览图生成（视觉 QA 用）
├── svg_to_shapes.py        # SVG -> DrawingML 原生形状转换
├── svg_position_calculator.py  # 图表坐标计算工具
├── svg_quality_checker.py  # SVG 质量检查工具
├── svg_rect_to_path.py     # 圆角 rect -> path 转换
├── ensure_workdir.py       # 工作目录创建工具
├── constants.py            # 目录别名和格式常量
├── requirements.txt        # Python 依赖
└── README.md              # 本文件
```

## 核心功能

### 1. svg_to_pptx.py — SVG 转 PPTX 主转换器

将 SVG 文件批量转换为 PowerPoint 演示文稿。

```bash
# 基本用法
python svg_to_pptx.py <project_path>

# 指定输出文件
python svg_to_pptx.py <project_path> -o output.pptx

# 使用 final 目录的 SVG
python svg_to_pptx.py <project_path> --use-final
```

### 2. svg_to_png_preview.py — 预览图生成器

将 SVG 转换为 PNG 图片，用于视觉 QA 检查。

```bash
# 基本用法（默认 1280x720）
python svg_to_png_preview.py <project_path>

# 指定输出尺寸
python svg_to_png_preview.py <project_path> --width 1920 --height 1080

# 指定源目录
python svg_to_png_preview.py <project_path> --source pages
```

输出文件命名规则：`page_N_preview.png`

### 3. svg_to_shapes.py — SVG 转原生形状

将 SVG 元素转换为 PowerPoint 原生 DrawingML 形状（可编辑）。

### 4. svg_quality_checker.py — SVG 质量检查

检查 SVG 文件是否符合转换要求。

```bash
python svg_quality_checker.py <directory>
```

### 5. svg_position_calculator.py — 图表坐标计算

计算图表元素在 SVG 中的位置和尺寸。

### 6. svg_rect_to_path.py — 圆角矩形转换

将 `<rect rx/ry>` 转换为 `<path>`，确保 PowerPoint 中圆角不被丢失。

## 依赖安装

```bash
# 安装核心依赖
pip install -r requirements.txt

# 或单独安装
pip install python-pptx cairosvg
```

## SVG to PNG 渲染器

| 渲染器 | 质量 | 依赖 |
|--------|------|------|
| CairoSVG | 完整支持渐变、滤镜 | pycairo |
| svglib + reportlab | 部分渐变可能丢失 | 纯 Python |

CairoSVG 优先，自动检测可用方案。

## 工作流程

```
1. 生成 SVG
   └── svg_to_png_preview.py 生成预览图

2. 视觉 QA 检查
   └── 对比 SVG 和 PNG，检查布局/对齐/空白

3. 修复问题
   └── 直接修改 SVG 文件

4. 转换为 PPTX
   └── svg_to_pptx.py 生成最终 PPTX
```
