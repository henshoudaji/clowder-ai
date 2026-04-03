#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { XinshengBrowserSession } from './browser-session.js';
import { resolveConfig } from './config.js';
import { formatArticleDetail, formatHomeArticles } from './home.js';
import { formatSearchResults } from './search.js';

function createBaseServer(name: string): McpServer {
  return new McpServer({
    name,
    version: '0.1.0',
  });
}

const config = resolveConfig();
const session = new XinshengBrowserSession(config);

function textResponse(text: string, extra?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(extra || {}),
  };
}

export function createServer(): McpServer {
  const server = createBaseServer('xinsheng-search-mcp');

  server.tool(
    'xinsheng_list_home_articles',
    '读取心声首页当前不需要登录即可看到的文章列表。',
    {
      limit: z.number().int().positive().max(20).optional().describe('返回条数，默认 10，最大 20。'),
      visible: z.boolean().optional().describe('是否使用可见浏览器。默认读取环境变量 XINSHENG_DEFAULT_VISIBLE。'),
      timeoutMs: z.number().int().positive().max(300000).optional().describe('等待首页稳定的超时毫秒数。'),
    },
    async ({ limit, visible, timeoutMs }) => {
      const result = await session.listHomeArticles({ limit, visible, timeoutMs });
      if (result.state !== 'articles') {
        return {
          ...textResponse(`当前无法从首页提取公开文章。\n页面: ${result.pageUrl}`, {
            structuredContent: result,
          }),
          isError: true,
        };
      }

      return textResponse(formatHomeArticles(result.articles, result.pageUrl), {
        structuredContent: result,
      });
    },
  );

  server.tool(
    'xinsheng_prepare_session',
    '打开华为心声搜索页并复用持久化浏览器 profile。首次登录或登录过期时先调用这个工具。',
    {
      query: z.string().optional().describe('可选。用于打开搜索页时的测试搜索词，默认“华为”。'),
      visible: z.boolean().optional().describe('是否用可见浏览器打开。默认 true。'),
      timeoutMs: z.number().int().positive().max(300000).optional().describe('等待页面稳定的超时毫秒数。'),
    },
    async ({ query, visible, timeoutMs }) => {
      const result = await session.prepareSession({ query, visible, timeoutMs });
      return textResponse(
        [
          result.message,
          `状态: ${result.state}`,
          `当前页面: ${result.currentUrl}`,
          `Profile: ${result.profileDir}`,
          `浏览器: ${result.browserExecutablePath}`,
        ].join('\n'),
        {
          structuredContent: result,
        },
      );
    },
  );

  server.tool(
    'xinsheng_read_article',
    '读取一篇心声文章详情。优先用于首页匿名可访问的文章，可传 uuid 或完整详情页 URL。',
    {
      uuid: z.string().optional().describe('文章 uuid。与 url 二选一；若都传，优先使用 url。'),
      url: z.string().url().optional().describe('文章详情页完整 URL。与 uuid 二选一。'),
      visible: z.boolean().optional().describe('是否使用可见浏览器。默认读取环境变量 XINSHENG_DEFAULT_VISIBLE。'),
      timeoutMs: z.number().int().positive().max(300000).optional().describe('等待详情页稳定的超时毫秒数。'),
    },
    async ({ uuid, url, visible, timeoutMs }) => {
      const result = await session.readArticle({ uuid, url, visible, timeoutMs });
      if (result.state !== 'readable' || !result.article) {
        return {
          ...textResponse(`当前无法读取该文章详情。\n页面: ${result.pageUrl}`, {
            structuredContent: result,
          }),
          isError: true,
        };
      }

      return textResponse(formatArticleDetail(result.article), {
        structuredContent: result,
      });
    },
  );

  server.tool(
    'xinsheng_search',
    '搜索华为心声社区。该工具会直接访问搜索路由，并复用之前登录过的持久化浏览器 profile。',
    {
      query: z.string().describe('搜索关键词，至少 2 个字符。'),
      limit: z.number().int().positive().max(20).optional().describe('返回条数，默认 10，最大 20。'),
      visible: z.boolean().optional().describe('是否使用可见浏览器。默认读取环境变量 XINSHENG_DEFAULT_VISIBLE。'),
      timeoutMs: z.number().int().positive().max(300000).optional().describe('等待搜索页稳定的超时毫秒数。'),
    },
    async ({ query, limit, visible, timeoutMs }) => {
      const result = await session.search({ query, limit, visible, timeoutMs });
      if (result.state === 'login_required') {
        return {
          ...textResponse(
            [
              '当前搜索页要求员工账号登录。',
              '请先调用 xinsheng_prepare_session 打开可见浏览器完成登录，然后再重新搜索。',
              `页面: ${result.pageUrl}`,
            ].join('\n'),
            {
              structuredContent: result,
            },
          ),
          isError: true,
        };
      }

      if (result.state === 'no_results') {
        return textResponse(`未找到与“${result.query}”相关的结果。\n页面: ${result.pageUrl}`, {
          structuredContent: result,
        });
      }

      return textResponse(formatSearchResults(result.query, result.results, result.pageUrl), {
        structuredContent: result,
      });
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  console.error('[xinsheng-mcp] starting...');
  await server.connect(transport);
  console.error('[xinsheng-mcp] running on stdio');
}

const shutdown = async () => {
  await session.close();
};

process.on('SIGINT', () => {
  shutdown()
    .catch(() => undefined)
    .finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  shutdown()
    .catch(() => undefined)
    .finally(() => process.exit(0));
});

const isEntryPoint = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isEntryPoint) {
  main().catch((error) => {
    console.error('[xinsheng-mcp] fatal error:', error);
    process.exit(1);
  });
}
