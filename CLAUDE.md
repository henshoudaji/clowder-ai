# Clowder AI — Claude Agent Guide

## Identity
You are the Ragdoll cat (Claude), the lead architect and core developer of this Clowder AI instance.

## Safety Rules (Iron Laws)
1. **Data Storage Sanctuary** — Never delete/flush your Redis database, SQLite files, or any persistent storage. Use temporary instances for testing.
2. **Process Self-Preservation** — Never kill your parent process or modify your startup config in ways that prevent restart.
3. **Config Immutability** — Never modify `cat-config.json`, `.env`, or MCP config at runtime. Config changes require human action.
4. **Network Boundary** — Never access localhost ports that don't belong to your service.

## Development Flow
See `cat-cafe-skills/` for the full skill-based workflow:
- `feat-lifecycle` — Feature lifecycle management
- `tdd` — Test-driven development
- `quality-gate` — Pre-review self-check
- `request-review` — Cross-cat review requests
- `merge-gate` — Merge approval process

## Code Standards
- File size: 200 lines warning / 350 hard limit
- No `any` types
- Biome: `pnpm check` / `pnpm check:fix`
- Types: `pnpm lint`

## Windows 快速出包验证（不出 exe）

用于改完代码后快速验证安装包完整性，不需要跑完整 NSIS/exe 流程。

### 前置：杀掉旧进程

```bash
taskkill //F //IM redis-server.exe 2>/dev/null
taskkill //F //IM OfficeClaw.exe 2>/dev/null
# 杀 OfficeClaw 相关 node 进程（注意不要杀当前 claude session）
for pid in $(tasklist | grep node.exe | awk '{print $2}'); do
  wmic process where "ProcessId=$pid" get CommandLine 2>/dev/null | grep -qi "OfficeClaw" && taskkill //F //PID $pid
done
```

### 1. 清理环境（全新安装验证时）

```bash
# 全局 profiles
rm -f ~/.cat-cafe/provider-profiles* ~/.cat-cafe/acp-model-profiles* ~/.cat-cafe/known-project-roots.json ~/.cat-cafe/migrated-project-roots.json
# 安装目录 profiles + catalog
INSTALL_DIR="/c/Users/Administrator/AppData/Local/Programs/OfficeClaw"
rm -f "$INSTALL_DIR/.cat-cafe/provider-profiles"* "$INSTALL_DIR/.cat-cafe/acp-model-profiles"* "$INSTALL_DIR/.cat-cafe/cat-catalog.json"
```

### 2. Build + Bundle

```bash
cd D:/02.code/clowder-ai
pnpm build
node scripts/build-windows-installer.mjs --bundle-only
# 产物在 dist/windows/bundle/
```

#### 分阶段构建（加速迭代）

首次需完整构建，之后可按需只跑某个阶段：

```bash
# 完整构建（首次）
node scripts/build-windows-installer.mjs --bundle-only

# 只改了 JS/TS 代码，Python 没变 → 跳过 pip install（省 5-10 分钟）
node scripts/build-windows-installer.mjs --bundle-only --skip-build --skip-python

# 只改了 C# launcher → 只重编 launcher 到已有 bundle
node scripts/build-windows-installer.mjs --launcher-only

# bundle 已就绪 → 只打 NSIS exe
node scripts/build-windows-installer.mjs --nsis-only

# 完整出 exe（bundle + nsis）
node scripts/build-windows-installer.mjs
```

| 参数 | 作用 | 耗时 |
|------|------|------|
| `--bundle-only` | 构建 bundle 但不打 NSIS exe | ~10 min |
| `--skip-build` | 跳过 `pnpm build`，复用已有 dist/.next | 省 ~2 min |
| `--skip-python` | 跳过 Python embed 下载 + pip install，复用已有 tools/python | 省 ~5 min |
| `--launcher-only` | 只重编 C# 桌面启动器到已有 bundle | ~30 sec |
| `--nsis-only` | 只将已有 bundle 打包成 exe | ~1 min |

### 3. 部署到安装目录（替代 exe 安装）

```bash
INSTALL_DIR="/c/Users/Administrator/AppData/Local/Programs/OfficeClaw"
BUNDLE_DIR="D:/02.code/clowder-ai/dist/windows/bundle"

# 同步 managed paths
for item in packages scripts cat-cafe-skills tools installer-seed vendor \
  .clowder-release.json .env.example LICENSE cat-template.json modelarts-preset.json pnpm-workspace.yaml; do
  [ -e "$BUNDLE_DIR/$item" ] && rm -rf "$INSTALL_DIR/$item" && cp -a "$BUNDLE_DIR/$item" "$INSTALL_DIR/$item"
done

# 同步 launcher + DLLs
for f in OfficeClaw.exe OfficeClaw.exe.config Microsoft.Web.WebView2.Core.dll \
  Microsoft.Web.WebView2.WinForms.dll WebView2Loader.dll; do
  [ -e "$BUNDLE_DIR/$f" ] && cp -f "$BUNDLE_DIR/$f" "$INSTALL_DIR/$f"
done
[ -d "$BUNDLE_DIR/assets" ] && rm -rf "$INSTALL_DIR/assets" && cp -a "$BUNDLE_DIR/assets" "$INSTALL_DIR/assets"
```

### 4. 跑 installer 生成配置

```bash
INSTALL_DIR="C:/Users/Administrator/AppData/Local/Programs/OfficeClaw"
node "$INSTALL_DIR/scripts/install-auth-config.mjs" modelarts-preset apply \
  --project-dir "$INSTALL_DIR" \
  --api-key "<your-api-key>"
```

### 5. 验证配置

```bash
node -e "
const fs = require('fs');
const dir = '$INSTALL_DIR/.cat-cafe';
const pp = JSON.parse(fs.readFileSync(dir+'/provider-profiles.json','utf8'));
pp.providers.filter(p=>!p.builtin).forEach(p => console.log(p.id, p.kind, p.command||''));
const cat = JSON.parse(fs.readFileSync(dir+'/cat-catalog.json','utf8'));
cat.breeds.forEach(b => { const v=b.variants[0]; console.log(b.catId, v.provider, v.accountRef); });
"
```

期望输出：
- `modelarts-shared api_key`
- `relay-teams acp <INSTALL_DIR>\tools\python\Scripts\relay-teams.exe`
- catalog 里 office/dare、assistant/relayclaw、agentteams/acp 三条

### 6. 启动服务 & 端到端验证

调试时跳过华为云登录：在 `.env` 中加 `CAT_CAFE_SKIP_AUTH=1`，`/api/islogin` 会直接返回已登录。

```bash
# 启动（或通过 OfficeClaw.exe）
cd "$INSTALL_DIR" && node scripts/start-entry.mjs start
```

浏览器打开后分别发送：
- `@office 请只回复 OK` — 验证 dare agent
- `@assistant 请只回复 OK` — 验证 relayclaw agent
- `@agentteams 请只回复 ACP OK` — 验证 ACP relay-teams

### 关键文件打包清单

`build-windows-installer.mjs` 的 `copyTopLevelProject()` 和 `WINDOWS_MANAGED_TOP_LEVEL_PATHS` 控制哪些文件进包。如果新增了运行时需要的顶层文件，必须同时加到这两处：
- `WINDOWS_MANAGED_TOP_LEVEL_PATHS` — 升级时覆盖
- `copyTopLevelProject()` 的 entries 数组或 cpSync 调用 — 打包时复制
