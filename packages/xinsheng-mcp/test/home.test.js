import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

describe('xinsheng home/article helpers', () => {
  test('detectHomeState recognizes article cards on home page', async () => {
    const { detectHomeState } = await import('../dist/home.js');
    const state = detectHomeState({
      url: 'https://xinsheng.huawei.com/next/index/#/home',
      title: '心声社区',
      bodyText: '首页 华为家事 公司文件',
      articles: [
        {
          position: 1,
          uuid: '1188993044722872320',
          title: '以开创的超节点互联技术，引领AI基础设施新范式',
          summary: '女士们、先生们，各位老朋友、新朋友，大家上午好！',
          href: 'https://xinsheng.huawei.com/next/detail/#/index?uuid=1188993044722872320',
        },
      ],
    });

    assert.equal(state, 'articles');
  });

  test('formatHomeArticles renders a readable list', async () => {
    const { formatHomeArticles } = await import('../dist/home.js');
    const text = formatHomeArticles(
      [
        {
          position: 1,
          uuid: '1188993044722872320',
          title: '以开创的超节点互联技术，引领AI基础设施新范式',
          summary: '女士们、先生们，各位老朋友、新朋友，大家上午好！',
          href: 'https://xinsheng.huawei.com/next/detail/#/index?uuid=1188993044722872320',
        },
      ],
      'https://xinsheng.huawei.com/next/index/#/home',
    );

    assert.match(text, /首页公开文章/);
    assert.match(text, /以开创的超节点互联技术/);
    assert.match(text, /1188993044722872320/);
  });

  test('detectArticleState recognizes readable article detail', async () => {
    const { detectArticleState } = await import('../dist/home.js');
    const state = detectArticleState({
      url: 'https://xinsheng.huawei.com/next/detail/#/index?uuid=1188993044722872320',
      title: '以开创的超节点互联技术，引领AI基础设施新范式',
      bodyText: '首页 华为家事 登录 女士们、先生们，各位老朋友、新朋友，大家上午好！',
      article: {
        url: 'https://xinsheng.huawei.com/next/detail/#/index?uuid=1188993044722872320',
        uuid: '1188993044722872320',
        title: '以开创的超节点互联技术，引领AI基础设施新范式',
        author: '华为家事',
        publishedAt: '2025-09-23 15:15',
        views: 30724,
        comments: 64,
        breadcrumb: ['首页', '华为家事', '公司文件'],
        content:
          '女士们、先生们，各位老朋友、新朋友，大家上午好！欢迎来参加2025年华为全联接大会。',
      },
    });

    assert.equal(state, 'readable');
  });

  test('formatArticleDetail renders metadata and content', async () => {
    const { formatArticleDetail } = await import('../dist/home.js');
    const text = formatArticleDetail({
      url: 'https://xinsheng.huawei.com/next/detail/#/index?uuid=1188993044722872320',
      uuid: '1188993044722872320',
      title: '以开创的超节点互联技术，引领AI基础设施新范式',
      author: '华为家事',
      publishedAt: '2025-09-23 15:15',
      views: 30724,
      comments: 64,
      breadcrumb: ['首页', '华为家事', '公司文件'],
      content: '女士们、先生们，各位老朋友、新朋友，大家上午好！',
    });

    assert.match(text, /文章详情/);
    assert.match(text, /华为家事/);
    assert.match(text, /女士们、先生们/);
  });
});
