import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('xinsheng mcp server', () => {
  test('registers homepage, article, session, and search tools', async () => {
    process.env.XINSHENG_BROWSER_EXECUTABLE_PATH =
      process.env.XINSHENG_BROWSER_EXECUTABLE_PATH ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

    const { createServer } = await import('../dist/index.js');
    const server = createServer();
    const toolNames = Object.keys(server._registeredTools).sort();

    assert.deepEqual(toolNames, [
      'xinsheng_list_home_articles',
      'xinsheng_prepare_session',
      'xinsheng_read_article',
      'xinsheng_search',
    ]);
  });
});
