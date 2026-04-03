export interface XinshengSearchResult {
  position: number;
  postId?: string;
  title: string;
  abstract: string;
  href?: string;
  author?: string;
  meta?: string;
}

export interface SearchPageSnapshot {
  url: string;
  title: string;
  bodyText: string;
  results: XinshengSearchResult[];
}

export type SearchPageState = 'login_required' | 'results' | 'no_results' | 'unknown';

const LOGIN_REQUIRED_PATTERNS = [/请使用员工账号登录后查阅/, /Please use an employee account to log in/i];
const NO_RESULTS_PATTERNS = [/暂无数据/, /共0条结果/, /共找到0条/, /no data available/i];

export function detectSearchState(snapshot: SearchPageSnapshot): SearchPageState {
  if (snapshot.results.length > 0) {
    return 'results';
  }
  if (LOGIN_REQUIRED_PATTERNS.some((pattern) => pattern.test(snapshot.bodyText))) {
    return 'login_required';
  }
  if (NO_RESULTS_PATTERNS.some((pattern) => pattern.test(snapshot.bodyText))) {
    return 'no_results';
  }
  return 'unknown';
}

export function formatSearchResults(query: string, results: XinshengSearchResult[], pageUrl: string): string {
  if (results.length === 0) {
    return `心声搜索未返回结果。\n查询词: ${query}\n搜索页: ${pageUrl}`;
  }

  const lines = [
    `心声搜索结果 (${results.length} 条)`,
    `查询词: ${query}`,
    `搜索页: ${pageUrl}`,
    '',
  ];

  for (const result of results) {
    lines.push(`${result.position}. ${result.title}`);
    if (result.author || result.meta) {
      lines.push(`   ${[result.author, result.meta].filter(Boolean).join(' | ')}`);
    }
    if (result.abstract) {
      lines.push(`   ${result.abstract}`);
    }
    if (result.href) {
      lines.push(`   ${result.href}`);
    }
  }

  return lines.join('\n');
}
