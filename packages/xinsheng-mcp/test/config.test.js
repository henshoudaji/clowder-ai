import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

describe('xinsheng config helpers', () => {
  test('buildDetailUrl targets detail route with encoded uuid', async () => {
    const { buildDetailUrl } = await import('../dist/config.js');
    const url = buildDetailUrl('https://xinsheng.huawei.com/next/detail/#/index', 'abc 123');

    assert.equal(url, 'https://xinsheng.huawei.com/next/detail/#/index?uuid=abc+123');
  });

  test('buildSearchUrl targets plus search route with encoded keyword', async () => {
    const { buildSearchUrl } = await import('../dist/config.js');
    const url = buildSearchUrl('https://xinsheng.huawei.com/next/plus/#/search', 'DeepSeek R1');

    assert.equal(
      url,
      'https://xinsheng.huawei.com/next/plus/#/search?keyword=DeepSeek+R1&type=all',
    );
  });

  test('normalizeQuery trims spaces and rejects too-short input', async () => {
    const { normalizeQuery } = await import('../dist/config.js');
    assert.equal(normalizeQuery('  华为  '), '华为');
    assert.throws(() => normalizeQuery('a'), /至少需要 2 个字符/);
  });

  test('resolveChromeExecutablePath prefers explicit env path', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'xinsheng-mcp-'));
    const fakeChrome = path.join(tempDir, 'chrome');
    writeFileSync(fakeChrome, '');

    const { resolveChromeExecutablePath } = await import('../dist/config.js');
    assert.equal(
      resolveChromeExecutablePath({ XINSHENG_BROWSER_EXECUTABLE_PATH: fakeChrome }),
      fakeChrome,
    );

    rmSync(tempDir, { recursive: true, force: true });
  });
});
