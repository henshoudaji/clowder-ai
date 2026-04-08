# Windows Python Wheelhouse Notes

本文记录 Windows 安装包里 Python 依赖的离线分发方案，重点是 `relay-teams` 这类会在安装时生成 `Scripts/*.exe` launcher 的包。

## Why

- 如果在打包机上直接 `pip install relay-teams`，生成出来的 `relay-teams.exe` 可能固化打包机路径
- 更稳的做法是：打包阶段先准备 `.whl`，用户安装 exe 后，再用安装目录里的 `python.exe` 离线安装这些 wheel
- 这样 `relay-teams.exe` 会在最终安装目录重新生成，指向用户本地的 `tools/python/python.exe`

## Current Scripts

- 构建 wheelhouse：`scripts/prepare-python-wheelhouse.mjs`
- 安装 wheelhouse：`scripts/install-python-wheelhouse.ps1`
- 默认配置：`packaging/windows/python-runtime-wheelhouse.json`

## Build Wheelhouse With Script

默认配置会下载整个 Windows Python runtime 依赖组，不只包含 `relay-teams`。

如果你是在 Windows 打包机上准备给安装包做离线依赖，优先用这条命令：

```bash
pnpm package:windows:python-wheelhouse:win
```

它会：

- 检查当前机器必须是 Windows
- 生成 `dist/windows-python-wheelhouse/`
- 下载 `packaging/windows/python-runtime-wheelhouse.json` 里定义的 wheel
- 产出 `python-wheelhouse-manifest.json`

输出目录固定为：

- `dist/windows-python-wheelhouse/wheelhouse/shared-runtime/`
- `dist/windows-python-wheelhouse/python-wheelhouse-manifest.json`

```bash
pnpm package:windows:python-wheelhouse -- --output-dir ./dist/relay-teams-wheelhouse
```

等价命令：

```bash
node scripts/prepare-python-wheelhouse.mjs \
  --config ./packaging/windows/python-runtime-wheelhouse.json \
  --output-dir ./dist/relay-teams-wheelhouse
```

成功后默认产物：

- wheel 目录：`dist/relay-teams-wheelhouse/wheelhouse/shared-runtime/`
- manifest：`dist/relay-teams-wheelhouse/python-wheelhouse-manifest.json`

## Build Relay-Teams Only

如果只想验证 `relay-teams` 及其传递依赖，建议先用一个最小配置，例如：

```json
{
  "version": 1,
  "pythonTarget": {
    "platform": "win_amd64",
    "pythonVersion": "3.13",
    "implementation": "cp",
    "abi": "cp313"
  },
  "groups": [
    {
      "id": "relay-teams",
      "description": "relay-teams only",
      "packages": [
        "relay-teams"
      ]
    }
  ]
}
```

然后执行：

```bash
node scripts/prepare-python-wheelhouse.mjs \
  --config ./packaging/windows/relay-teams-wheelhouse.json \
  --output-dir ./dist/relay-teams-wheelhouse
```

成功后：

- wheel 目录：`dist/relay-teams-wheelhouse/wheelhouse/relay-teams/`
- manifest：`dist/relay-teams-wheelhouse/python-wheelhouse-manifest.json`

## Minimal Direct pip Download

如果想先绕过仓库脚本，直接验证 `relay-teams` 是否能完整下载 Windows wheel，可以执行：

```bash
python3 -m pip download \
  --dest ./dist/relay-teams-wheelhouse \
  --only-binary=:all: \
  --platform win_amd64 \
  --python-version 3.13 \
  --implementation cp \
  --abi cp313 \
  relay-teams
```

如果本机没有 `python3`，可改成：

```bash
python -m pip download \
  --dest ./dist/relay-teams-wheelhouse \
  --only-binary=:all: \
  --platform win_amd64 \
  --python-version 3.13 \
  --implementation cp \
  --abi cp313 \
  relay-teams
```

更推荐指定精确版本，减少 resolver 回溯：

```bash
python3 -m pip download \
  --dest ./dist/relay-teams-wheelhouse \
  --only-binary=:all: \
  --platform win_amd64 \
  --python-version 3.13 \
  --implementation cp \
  --abi cp313 \
  relay-teams==<version>
```

## Why It Looks Strange On macOS

在 macOS 上执行针对 Windows 的 `pip download`，常见会看到两个现象：

- 看起来像在尝试下载很多版本
- 中断后目标目录没有留下 wheel

这通常不是脚本错误，而是 `pip` 的解析行为：

- `pip` 会为了满足 `win_amd64 + cp313` 约束，回溯尝试多个候选版本
- 日志会显得像“在试所有版本”，但本质上是在解析兼容依赖组合
- `pip` 往往先把内容放到 cache / temp，再在成功后移动到 `--dest`
- 如果在解析或下载中途手动中断，`--dest` 目录可能还是空的

所以在 macOS 上，看到“日志很多 + dist 目录为空”并不奇怪。

## pip Cache Location

如果中途中断，临时下载内容更可能在 `pip cache` 里，而不是目标目录。

可查看 cache 目录：

```bash
python3 -m pip cache dir
```

或：

```bash
python -m pip cache dir
```

常见位置：

- macOS：`~/Library/Caches/pip`
- Windows：`%LocalAppData%\pip\Cache`

## Install From Local Wheelhouse On Windows

用户安装 exe 后，可在最终安装目录执行离线安装：

推荐先把打包机生成的 `dist/windows-python-wheelhouse/` 整个目录复制到安装机，例如放到：

- `C:\clowder-wheelhouse\windows-python-wheelhouse`

然后在安装目录执行手动安装脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\manual-install-windows-runtime-wheelhouse.ps1 `
  -InstallRoot "C:\Program Files\OfficeClaw" `
  -WheelhouseRoot "C:\clowder-wheelhouse\windows-python-wheelhouse"
```

这个脚本会自动：

- 找到安装目录里的 `tools\python\python.exe`
- 找到 wheelhouse 里的 `python-wheelhouse-manifest.json`
- 调用 `scripts/install-python-wheelhouse.ps1`
- 以 `--no-index --find-links ...` 的方式离线安装 `shared-runtime`
- 因为默认带 `-ForceReinstall`，所以像 `relay-teams.exe` 这类 launcher 会在最终安装目录重建

如果你只想先看它会执行什么，不真正安装：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\manual-install-windows-runtime-wheelhouse.ps1 `
  -InstallRoot "C:\Program Files\OfficeClaw" `
  -WheelhouseRoot "C:\clowder-wheelhouse\windows-python-wheelhouse" `
  -DryRun
```

底层等价于：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-python-wheelhouse.ps1 `
  -ProjectRoot "C:\YourInstallDir" `
  -ManifestPath "C:\YourInstallDir\installer-seed\python-wheelhouse-manifest.json" `
  -PythonExe "C:\YourInstallDir\tools\python\python.exe" `
  -ForceReinstall
```

这一步会：

- 使用安装目录里的 `python.exe`
- 以 `--no-index --find-links ...` 的方式离线安装本地 wheel
- 重新生成 `Scripts\relay-teams.exe`
- 避免 `relay-teams.exe` 绑定打包机路径

## Notes

- 当前默认配置 `packaging/windows/python-runtime-wheelhouse.json` 是“整组 shared-runtime”，不是“只下载 relay-teams”
- 如果某个依赖在 `win_amd64 + cp313` 下没有 wheel，`--only-binary=:all:` 会直接失败；这是预期行为，能提前暴露兼容性问题
- 后续接 installer 时，推荐流程是：打包阶段准备 wheelhouse，安装阶段离线 `pip install --force-reinstall`
