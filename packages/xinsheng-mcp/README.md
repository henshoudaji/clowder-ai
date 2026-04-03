# Xinsheng Search MCP

一个本地 `stdio` MCP server，用持久化 Chrome profile 访问华为心声社区搜索页：

- 搜索页：`https://xinsheng.huawei.com/next/plus/#/search`
- 登录态：通过浏览器 profile 目录持久化，后续搜索复用同一份 cookie/session
- 适用场景：当前外网先完成开发，后续搬到公司内网后在同一 profile 下登录即可继续使用

## 工具

- `xinsheng_list_home_articles`
  - 读取首页当前公开可见的文章列表
  - 不依赖登录，适合先确认匿名可读内容
- `xinsheng_prepare_session`
  - 打开一个可见浏览器窗口，进入搜索页并保留 profile
  - 适合首次登录、补登录、验证当前 session 是否可用
- `xinsheng_read_article`
  - 按 `uuid` 或详情页 URL 读取单篇文章正文
  - 优先用于首页公开文章，也可在登录后读取更多详情页
- `xinsheng_search`
  - 直接打开搜索路由并抽取结果卡片
  - 如果尚未登录，会返回明确提示并建议先调用 `xinsheng_prepare_session`

## 环境变量

- `XINSHENG_BROWSER_EXECUTABLE_PATH`
  - 可选。Chrome / Edge 可执行文件路径
- `XINSHENG_PROFILE_DIR`
  - 可选。持久化浏览器 profile 目录
- `XINSHENG_HOME_URL`
  - 默认：`https://xinsheng.huawei.com/next/index/#/home`
- `XINSHENG_DETAIL_PAGE_URL`
  - 默认：`https://xinsheng.huawei.com/next/detail/#/index`
- `XINSHENG_SEARCH_PAGE_URL`
  - 默认：`https://xinsheng.huawei.com/next/plus/#/search`
- `XINSHENG_DEFAULT_VISIBLE`
  - 默认：`false`
- `XINSHENG_NAVIGATION_TIMEOUT_MS`
  - 默认：`60000`

## 本地运行

```bash
pnpm --filter @cat-cafe/xinsheng-mcp build
cd packages/xinsheng-mcp
node dist/index.js
```

> 注意：把这个 server 接到 `stdio` MCP client（例如 Codex）时，不要用 `pnpm ... start` 当启动命令。
> `pnpm` 会往标准输出打印脚本 banner，破坏 MCP 的 JSON-RPC 握手。请直接运行 `node dist/index.js`。

## Codex 配置示例

```toml
[mcp_servers.xinsheng-search]
command = "node"
args = ["/ABS/PATH/TO/clowder-ai/packages/xinsheng-mcp/dist/index.js"]
startup_timeout_sec = 30

[mcp_servers.xinsheng-search.env]
XINSHENG_BROWSER_EXECUTABLE_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
XINSHENG_DEFAULT_VISIBLE = "false"
```

也可以临时用 CLI 注入，不改现有 `~/.codex/config.toml`：

```bash
codex exec \
  -c 'mcp_servers.xinsheng-search.command="node"' \
  -c 'mcp_servers.xinsheng-search.args=["/ABS/PATH/TO/clowder-ai/packages/xinsheng-mcp/dist/index.js"]' \
  -c 'mcp_servers.xinsheng-search.env.XINSHENG_BROWSER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"' \
  -c 'mcp_servers.xinsheng-search.env.XINSHENG_DEFAULT_VISIBLE="false"' \
  "Use the MCP tool named xinsheng_list_home_articles with limit 2."
```
