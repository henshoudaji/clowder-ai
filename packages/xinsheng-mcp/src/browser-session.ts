import type { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer';
import type { XinshengConfig } from './config.js';
import { buildDetailUrl, buildSearchUrl, normalizeQuery, normalizeUuid } from './config.js';
import {
  detectArticleState,
  detectHomeState,
  type ArticlePageSnapshot,
  type ArticlePageState,
  type HomePageSnapshot,
  type HomePageState,
  type XinshengArticleDetail,
  type XinshengHomeArticle,
} from './home.js';
import { detectSearchState, type SearchPageSnapshot, type SearchPageState, type XinshengSearchResult } from './search.js';

const POLL_INTERVAL_MS = 500;

export interface PrepareSessionOptions {
  query?: string;
  visible?: boolean;
  timeoutMs?: number;
}

export interface PrepareSessionResult {
  ready: boolean;
  state: SearchPageState;
  currentUrl: string;
  profileDir: string;
  browserExecutablePath: string;
  message: string;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  visible?: boolean;
  timeoutMs?: number;
}

export interface SearchResultPayload {
  state: SearchPageState;
  query: string;
  pageUrl: string;
  results: XinshengSearchResult[];
}

export interface ListHomeArticlesOptions {
  limit?: number;
  visible?: boolean;
  timeoutMs?: number;
}

export interface ListHomeArticlesResult {
  state: HomePageState;
  pageUrl: string;
  articles: XinshengHomeArticle[];
}

export interface ReadArticleOptions {
  url?: string;
  uuid?: string;
  visible?: boolean;
  timeoutMs?: number;
}

export interface ReadArticleResult {
  state: ArticlePageState;
  pageUrl: string;
  article?: XinshengArticleDetail;
}

export class XinshengBrowserSession {
  private browser: Browser | null = null;
  private visibleMode = false;

  constructor(private readonly config: XinshengConfig) {}

  async prepareSession(options: PrepareSessionOptions = {}): Promise<PrepareSessionResult> {
    const visible = options.visible ?? true;
    const query = normalizeQuery(options.query || '华为');
    const page = await this.openPage(visible);
    await this.navigate(page, buildSearchUrl(this.config.searchPageUrl, query));

    const snapshot = await this.waitForStableState(
      page,
      options.timeoutMs ?? this.config.searchTimeoutMs,
      () => this.readSearchSnapshot(page),
      detectSearchState,
    );
    const state = detectSearchState(snapshot);
    const ready = state !== 'login_required';
    const message = ready
      ? '当前浏览器 session 已可用于搜索，后续会复用同一份 profile。'
      : '浏览器已打开到心声搜索页。请在该窗口完成登录，登录成功后再次调用 xinsheng_search。';

    return {
      ready,
      state,
      currentUrl: snapshot.url,
      profileDir: this.config.profileDir,
      browserExecutablePath: this.config.browserExecutablePath,
      message,
    };
  }

  async search(options: SearchOptions): Promise<SearchResultPayload> {
    const query = normalizeQuery(options.query);
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);
    const visible = options.visible ?? this.config.defaultVisible;
    const page = await this.openPage(visible);

    try {
      await this.navigate(page, buildSearchUrl(this.config.searchPageUrl, query));
      const snapshot = await this.waitForStableState(
        page,
        options.timeoutMs ?? this.config.searchTimeoutMs,
        () => this.readSearchSnapshot(page),
        detectSearchState,
      );
      return {
        state: detectSearchState(snapshot),
        query,
        pageUrl: snapshot.url,
        results: snapshot.results.slice(0, limit),
      };
    } finally {
      if (!visible) {
        await page.close().catch(() => undefined);
      }
    }
  }

  async listHomeArticles(options: ListHomeArticlesOptions = {}): Promise<ListHomeArticlesResult> {
    const limit = Math.min(Math.max(options.limit ?? 10, 1), 20);
    const visible = options.visible ?? this.config.defaultVisible;
    const page = await this.openPage(visible);

    try {
      await this.navigate(page, this.config.homeUrl);
      const snapshot = await this.waitForStableState(
        page,
        options.timeoutMs ?? this.config.searchTimeoutMs,
        () => this.readHomeSnapshot(page),
        detectHomeState,
      );
      return {
        state: detectHomeState(snapshot),
        pageUrl: snapshot.url,
        articles: snapshot.articles.slice(0, limit),
      };
    } finally {
      if (!visible) {
        await page.close().catch(() => undefined);
      }
    }
  }

  async readArticle(options: ReadArticleOptions): Promise<ReadArticleResult> {
    const targetUrl = options.url?.trim() || buildDetailUrl(this.config.detailPageUrl, normalizeUuid(options.uuid || ''));
    const visible = options.visible ?? this.config.defaultVisible;
    const page = await this.openPage(visible);

    try {
      await this.navigate(page, targetUrl);
      const snapshot = await this.waitForStableState(
        page,
        options.timeoutMs ?? this.config.searchTimeoutMs,
        () => this.readArticleSnapshot(page),
        detectArticleState,
      );
      return {
        state: detectArticleState(snapshot),
        pageUrl: snapshot.url,
        article: snapshot.article,
      };
    } finally {
      if (!visible) {
        await page.close().catch(() => undefined);
      }
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  private async openPage(visible: boolean): Promise<Page> {
    const browser = await this.ensureBrowser(visible);
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1024 });
    return page;
  }

  private async ensureBrowser(visible: boolean): Promise<Browser> {
    if (this.browser && this.visibleMode === visible) {
      return this.browser;
    }

    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }

    this.browser = await puppeteer.launch({
      headless: !visible,
      executablePath: this.config.browserExecutablePath,
      userDataDir: this.config.profileDir,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: null,
    });
    this.visibleMode = visible;
    return this.browser;
  }

  private async navigate(page: Page, url: string): Promise<void> {
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: this.config.navigationTimeoutMs,
    });
  }

  private async waitForStableState<T, TState extends string>(
    page: Page,
    timeoutMs: number,
    readSnapshot: () => Promise<T>,
    detectState: (snapshot: T) => TState,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    let lastSnapshot = await readSnapshot();
    let lastState = detectState(lastSnapshot);

    while (Date.now() < deadline) {
      if (lastState !== 'unknown') {
        return lastSnapshot;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      lastSnapshot = await readSnapshot();
      lastState = detectState(lastSnapshot);
    }

    return lastSnapshot;
  }

  private async readSearchSnapshot(page: Page): Promise<SearchPageSnapshot> {
    return page.evaluate(() => {
      const normalizeText = (value: string | null | undefined): string =>
        (value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');

      const results = Array.from(document.querySelectorAll<HTMLElement>('.search-post-card'))
        .map((card, index) => {
          const title = normalizeText(card.querySelector('.title')?.textContent);
          const abstract = normalizeText(card.querySelector('p.abstract')?.textContent);
          const author = normalizeText(card.querySelector('.desc1')?.textContent);
          const meta = normalizeText(
            Array.from(card.querySelectorAll<HTMLElement>('p.desc span'))
              .map((node) => node.textContent)
              .join(' | '),
          );
          const href =
            Array.from(card.querySelectorAll<HTMLAnchorElement>('a'))
              .map((node) => node.href)
              .find((value) => value && value !== 'javascript:void(0);') || undefined;

          return {
            position: index + 1,
            postId: card.getAttribute('data-id') || undefined,
            title,
            abstract,
            href,
            author,
            meta,
          };
        })
        .filter((item) => item.title || item.abstract);

      return {
        url: window.location.href,
        title: document.title,
        bodyText: normalizeText(document.body?.innerText),
        results,
      };
    });
  }

  private async readHomeSnapshot(page: Page): Promise<HomePageSnapshot> {
    return page.evaluate(() => {
      const normalizeText = (value: string | null | undefined): string =>
        (value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
      const extractUuid = (href: string): string | undefined => {
        try {
          const url = new URL(href);
          const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
          const queryString = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : url.search.slice(1);
          return new URLSearchParams(queryString).get('uuid') || undefined;
        } catch {
          return undefined;
        }
      };

      const grouped = new Map<string, { href: string; uuid?: string; texts: string[] }>();
      for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/next/detail/#/index?uuid="]'))) {
        if (!anchor.href) {
          continue;
        }

        const existing: { href: string; uuid?: string; texts: string[] } = grouped.get(anchor.href) || {
          href: anchor.href,
          uuid: extractUuid(anchor.href),
          texts: [],
        };
        const text = normalizeText(anchor.textContent);
        if (text) {
          existing.texts.push(text);
        }
        grouped.set(anchor.href, existing);
      }

      const articles = Array.from(grouped.values())
        .map((entry, index) => {
          const uniqueTexts = Array.from(new Set(entry.texts));
          const titleCandidates = uniqueTexts.filter((text) => text.length >= 4).sort((left, right) => left.length - right.length);
          const title = titleCandidates[0] || uniqueTexts[0] || '';
          const summaryCandidates = uniqueTexts
            .filter((text) => text !== title)
            .sort((left, right) => right.length - left.length);

          return {
            position: index + 1,
            uuid: entry.uuid,
            title,
            summary: summaryCandidates[0] || '',
            href: entry.href,
          };
        })
        .filter((article) => article.title);

      return {
        url: window.location.href,
        title: document.title,
        bodyText: normalizeText(document.body?.innerText),
        articles,
      };
    });
  }

  private async readArticleSnapshot(page: Page): Promise<ArticlePageSnapshot> {
    return page.evaluate(() => {
      const normalizeText = (value: string | null | undefined): string =>
        (value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
      const parseInteger = (value: string | null | undefined): number | undefined => {
        const normalized = normalizeText(value).replace(/[^\d]/g, '');
        return normalized ? Number(normalized) : undefined;
      };
      const extractUuid = (href: string): string | undefined => {
        try {
          const url = new URL(href);
          const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
          const queryString = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : url.search.slice(1);
          return new URLSearchParams(queryString).get('uuid') || undefined;
        } catch {
          return undefined;
        }
      };

      const title = normalizeText(document.querySelector('.topic-title .title, .title')?.textContent);
      const contentCandidates = Array.from(
        document.querySelectorAll<HTMLElement>('.custom-user-components-container.custom-components-container.comment-content'),
      )
        .map((node) => normalizeText(node.innerText || node.textContent))
        .filter(Boolean);
      const content = contentCandidates[0] || '';
      const article =
        title || content
          ? {
              url: window.location.href,
              uuid: extractUuid(window.location.href),
              title,
              author: normalizeText(document.querySelector('.nickname .mask-name')?.textContent),
              publishedAt: normalizeText(document.querySelector('.topic-data')?.textContent),
              views: parseInteger(document.querySelector('.topic-browse .num')?.textContent),
              comments: parseInteger(document.querySelector('.topic-comment .num')?.textContent),
              breadcrumb: Array.from(document.querySelectorAll<HTMLElement>('.breadcrumb li a'))
                .map((node) => normalizeText(node.textContent))
                .filter(Boolean),
              content,
            }
          : undefined;

      return {
        url: window.location.href,
        title: document.title,
        bodyText: normalizeText(document.body?.innerText),
        article,
      };
    });
  }
}
