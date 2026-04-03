import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('xinsheng search helpers', () => {
  test('detectSearchState recognizes login gate', async () => {
    const { detectSearchState } = await import('../dist/search.js');
    const state = detectSearchState({
      url: 'https://xinsheng.huawei.com/next/plus/#/search?keyword=test&type=all',
      title: '搜索',
      bodyText: '您好，请使用员工账号登录后查阅',
      results: [],
    });

    assert.equal(state, 'login_required');
  });

  test('detectSearchState recognizes result cards before body text heuristics', async () => {
    const { detectSearchState } = await import('../dist/search.js');
    const state = detectSearchState({
      url: 'https://xinsheng.huawei.com/next/plus/#/search?keyword=test&type=all',
      title: '搜索',
      bodyText: '共 1 条结果',
      results: [
        {
          position: 1,
          title: '测试标题',
          abstract: '测试摘要',
          href: 'https://xinsheng.huawei.com/example',
        },
      ],
    });

    assert.equal(state, 'results');
  });

  test('formatSearchResults renders readable text block', async () => {
    const { formatSearchResults } = await import('../dist/search.js');
    const text = formatSearchResults(
      'DeepSeek',
      [
        {
          position: 1,
          title: '驻扎智算中心100天，我们把万卡集群排障效率提升1000倍',
          abstract: '我们与华为联合发布智算故障诊断大模型 LogAnalyzer。',
          author: '华为人',
          meta: '2025-09-01',
          href: 'https://xinsheng.huawei.com/example',
        },
      ],
      'https://xinsheng.huawei.com/next/plus/#/search?keyword=DeepSeek&type=all',
    );

    assert.match(text, /心声搜索结果/);
    assert.match(text, /DeepSeek/);
    assert.match(text, /LogAnalyzer/);
  });
});
