export interface XinshengHomeArticle {
  position: number;
  uuid?: string;
  title: string;
  summary: string;
  href: string;
}

export interface HomePageSnapshot {
  url: string;
  title: string;
  bodyText: string;
  articles: XinshengHomeArticle[];
}

export type HomePageState = 'login_required' | 'articles' | 'unknown';

export interface XinshengArticleDetail {
  url: string;
  uuid?: string;
  title: string;
  author?: string;
  publishedAt?: string;
  views?: number;
  comments?: number;
  breadcrumb: string[];
  content: string;
}

export interface ArticlePageSnapshot {
  url: string;
  title: string;
  bodyText: string;
  article?: XinshengArticleDetail;
}

export type ArticlePageState = 'login_required' | 'readable' | 'unknown';

const LOGIN_REQUIRED_PATTERNS = [/请使用员工账号登录后查阅/, /Please use an employee account to log in/i];

export function detectHomeState(snapshot: HomePageSnapshot): HomePageState {
  if (snapshot.articles.length > 0) {
    return 'articles';
  }
  if (LOGIN_REQUIRED_PATTERNS.some((pattern) => pattern.test(snapshot.bodyText))) {
    return 'login_required';
  }
  return 'unknown';
}

export function detectArticleState(snapshot: ArticlePageSnapshot): ArticlePageState {
  if (snapshot.article?.title && snapshot.article.content) {
    return 'readable';
  }
  if (LOGIN_REQUIRED_PATTERNS.some((pattern) => pattern.test(snapshot.bodyText))) {
    return 'login_required';
  }
  return 'unknown';
}

export function formatHomeArticles(articles: XinshengHomeArticle[], pageUrl: string): string {
  if (articles.length === 0) {
    return `首页公开文章列表为空。\n首页: ${pageUrl}`;
  }

  const lines = [`首页公开文章 (${articles.length} 条)`, `首页: ${pageUrl}`, ''];

  for (const article of articles) {
    lines.push(`${article.position}. ${article.title}`);
    if (article.summary) {
      lines.push(`   ${article.summary}`);
    }
    if (article.uuid) {
      lines.push(`   uuid: ${article.uuid}`);
    }
    lines.push(`   ${article.href}`);
  }

  return lines.join('\n');
}

export function formatArticleDetail(article: XinshengArticleDetail): string {
  const lines = ['文章详情', `标题: ${article.title}`, `页面: ${article.url}`];

  if (article.uuid) {
    lines.push(`uuid: ${article.uuid}`);
  }
  if (article.breadcrumb.length > 0) {
    lines.push(`栏目: ${article.breadcrumb.join(' > ')}`);
  }
  if (article.author) {
    lines.push(`作者: ${article.author}`);
  }
  if (article.publishedAt) {
    lines.push(`发布时间: ${article.publishedAt}`);
  }
  if (article.views !== undefined || article.comments !== undefined) {
    lines.push(`互动: ${article.views ?? '-'} 浏览 | ${article.comments ?? '-'} 评论`);
  }

  lines.push('', article.content);
  return lines.join('\n');
}
