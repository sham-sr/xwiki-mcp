import { config } from './config.js';
import type {
  XWikiSpacesResponse,
  XWikiPagesResponse,
  XWikiPageRaw,
  XWikiSearchResponse,
  XWikiAttachmentsResponse,
  Space,
  PageSummary,
  Page,
  SearchResult,
  Attachment,
  Pagination,
} from './types.js';

export class XWikiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'XWikiError';
  }
}

export type SearchEngine = 'solr' | 'legacy';
export type SearchScope = 'content' | 'title' | 'name';

export class XWikiClient {
  private readonly wikiBase: string;
  private readonly restBase: string;

  constructor() {
    this.restBase = `${config.baseUrl}${config.restPath}`;
    this.wikiBase = `${this.restBase}/wikis/${config.wikiName}`;
  }

  private authHeaders(): Record<string, string> {
    if (config.authType === 'basic') {
      const b64 = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      return { Authorization: `Basic ${b64}` };
    }
    if (config.authType === 'token') {
      return { Authorization: `Bearer ${config.token}` };
    }
    return {};
  }

  private async request<T>(
    url: URL,
    init: RequestInit = {},
    parse: 'json' | 'text' = 'json',
  ): Promise<T> {
    const urlStr = url.toString();
    let response: Response;
    try {
      response = await fetch(urlStr, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...this.authHeaders(),
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new XWikiError(`Cannot connect to XWiki at ${config.baseUrl}. Check XWIKI_BASE_URL.`);
    }

    if (response.status === 404) {
      throw new XWikiError(`Not found: ${url.pathname}`, 404);
    }
    if (response.status === 401 || response.status === 403) {
      throw new XWikiError('Authentication failed. Check XWIKI_AUTH_TYPE and credentials.', response.status);
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new XWikiError(
        `XWiki server error: ${response.status}. URL: ${urlStr}${body ? `. Body: ${body.slice(0, 200)}` : ''}`,
        response.status,
      );
    }

    if (parse === 'text') return (await response.text()) as unknown as T;
    return response.json() as Promise<T>;
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(`${this.wikiBase}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    url.searchParams.set('media', 'json');
    return this.request<T>(url);
  }

  /** Convert "Space1.SubSpace.Child" → "/spaces/Space1/spaces/SubSpace/spaces/Child" */
  private spacePath(space: string): string {
    return '/' + space.split('.').map(s => `spaces/${encodeURIComponent(s)}`).join('/');
  }

  // ---------------------------------------------------------------------------
  // Public API methods — READ
  // ---------------------------------------------------------------------------

  async listSpaces(): Promise<Space[]> {
    const data = await this.get<XWikiSpacesResponse>('/spaces');
    return (data.spaces ?? []).map(s => ({
      id: s.id,
      name: s.name,
      home_url: s.xwikiAbsoluteUrl ?? '',
    }));
  }

  async listPages(
    space: string,
    start: number,
    limit: number,
  ): Promise<{ pages: PageSummary[]; pagination: Pagination }> {
    const path = `${this.spacePath(space)}/pages`;
    const data = await this.get<XWikiPagesResponse>(path, { start, number: limit });
    const pages = (data.pageSummaries ?? []).map(p => ({
      id: p.id,
      title: p.title,
      parent: p.parent,
      url: p.xwikiAbsoluteUrl ?? '',
    }));
    const total = data.totalResults;
    return {
      pages,
      pagination: {
        total,
        start,
        limit,
        has_more: total != null ? start + pages.length < total : pages.length === limit,
      },
    };
  }

  async getPage(space: string, page: string): Promise<Page> {
    const path = `${this.spacePath(space)}/pages/${encodeURIComponent(page)}`;
    const data = await this.get<XWikiPageRaw>(path);
    return {
      title: data.title,
      content: data.content,
      syntax: data.syntax,
      author: data.contentAuthor ?? data.author,
      modified_date: data.modified,
      version: data.version,
      parent: data.parent,
      url: data.xwikiAbsoluteUrl ?? '',
    };
  }

  /**
   * Full-text search.
   *
   * - `solr` (default): uses /rest/wikis/query?type=solr — true full-text over content,
   *   with proper ranking and excerpt support. This is what you want 95% of the time.
   * - `legacy`: uses /rest/wikis/{wiki}/search — HQL search over page name/title/content.
   *   Kept as a fallback for instances where Solr isn't indexed.
   */
  async search(
    query: string,
    opts: {
      engine?: SearchEngine;
      scope?: SearchScope;
      space?: string;
      start?: number;
      limit?: number;
    } = {},
  ): Promise<{ results: SearchResult[]; pagination: Pagination; engine: SearchEngine }> {
    const engine = opts.engine ?? 'solr';
    const start = opts.start ?? 0;
    const limit = opts.limit ?? 20;

    if (engine === 'solr') {
      return this.searchSolr(query, opts.scope, opts.space, start, limit);
    }
    return this.searchLegacy(query, opts.scope, opts.space, start, limit);
  }

  private async searchSolr(
    query: string,
    scope: SearchScope | undefined,
    space: string | undefined,
    start: number,
    limit: number,
  ): Promise<{ results: SearchResult[]; pagination: Pagination; engine: SearchEngine }> {
    // Solr query syntax: title:foo, name:foo, or bare for content.
    // Scope title/name search the indexed field; default scope hits everything (title^10 + content).
    let q = query;
    if (scope === 'title') q = `title:(${query})`;
    else if (scope === 'name') q = `name:(${query})`;
    if (space) {
      // space_facet stores the local reference; Solr supports filter via fq, but the REST
      // search endpoint surfaces it as part of q. Quoting handles spaces/dots inside names.
      q = `${q} AND space:"${space.replace(/"/g, '\\"')}"`;
    }

    const url = new URL(`${this.restBase}/wikis/query`);
    url.searchParams.set('q', q);
    url.searchParams.set('type', 'solr');
    url.searchParams.set('wikis', config.wikiName);
    url.searchParams.set('start', String(start));
    url.searchParams.set('number', String(limit));
    url.searchParams.set('media', 'json');

    const data = await this.request<XWikiSearchResponse>(url);
    return this.mapSearchResponse(data, start, limit, 'solr');
  }

  private async searchLegacy(
    query: string,
    scope: SearchScope | undefined,
    space: string | undefined,
    start: number,
    limit: number,
  ): Promise<{ results: SearchResult[]; pagination: Pagination; engine: SearchEngine }> {
    const params: Record<string, string | number> = { q: query, start, number: limit };
    // Legacy endpoint accepts &scope=content|name|title|spaces|objects
    if (scope) params.scope = scope;

    const path = space ? `${this.spacePath(space)}/search` : '/search';
    const data = await this.get<XWikiSearchResponse>(path, params);
    return this.mapSearchResponse(data, start, limit, 'legacy');
  }

  private mapSearchResponse(
    data: XWikiSearchResponse,
    start: number,
    limit: number,
    engine: SearchEngine,
  ): { results: SearchResult[]; pagination: Pagination; engine: SearchEngine } {
    const results = (data.searchResults ?? []).map(r => {
      const docItem = r.hierarchy?.items?.findLast(i => i.type === 'document');
      // Solr returns pageFullName in xwiki format; build a view URL when hierarchy is missing.
      const viewUrl = docItem?.url ?? this.buildViewUrl(r.pageFullName ?? r.id);
      return {
        id: r.id,
        title: r.title ?? r.id,
        space: r.space,
        url: viewUrl,
        score: r.score,
        modified_date: r.modified != null ? String(r.modified) : undefined,
      };
    });
    const total = data.totalResults;
    return {
      results,
      pagination: {
        total,
        start,
        limit,
        has_more: total != null ? start + results.length < total : results.length === limit,
      },
      engine,
    };
  }

  private buildViewUrl(pageFullName: string): string {
    if (!pageFullName) return '';
    // pageFullName like "Space1.SubSpace.WebHome" → /bin/view/Space1/SubSpace/WebHome
    const parts = pageFullName.split('.').map(p => encodeURIComponent(p));
    return `${config.baseUrl}/bin/view/${parts.join('/')}`;
  }

  async getAttachments(space: string, page: string): Promise<Attachment[]> {
    const path = `${this.spacePath(space)}/pages/${encodeURIComponent(page)}/attachments`;
    const data = await this.get<XWikiAttachmentsResponse>(path);
    return (data.attachments ?? []).map(a => ({
      name: a.name,
      size_bytes: a.longSize ?? a.size,
      mime_type: a.mimeType,
      author: a.author,
      date: a.date != null ? String(a.date) : undefined,
      download_url: a.xwikiAbsoluteUrl ?? '',
    }));
  }

  async getPageChildren(space: string, page: string): Promise<PageSummary[]> {
    const path = `${this.spacePath(space)}/pages/${encodeURIComponent(page)}/children`;
    const data = await this.get<XWikiPagesResponse>(path);
    return (data.pageSummaries ?? []).map(p => ({
      id: p.id,
      title: p.title,
      parent: p.parent,
      url: p.xwikiAbsoluteUrl ?? '',
    }));
  }

  // ---------------------------------------------------------------------------
  // Public API methods — WRITE (Phase 2)
  // ---------------------------------------------------------------------------

  /**
   * Create or update a page. XWiki's PUT is upsert — same call for both.
   * Returns the resulting page (title, version, url).
   */
  async createPage(
    space: string,
    page: string,
    title: string,
    content: string,
    syntax: string = 'xwiki/2.1',
  ): Promise<Page> {
    const url = new URL(`${this.wikiBase}${this.spacePath(space)}/pages/${encodeURIComponent(page)}`);
    url.searchParams.set('media', 'json');

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<page xmlns="http://www.xwiki.org">` +
      `<title>${escapeXml(title)}</title>` +
      `<syntax>${escapeXml(syntax)}</syntax>` +
      `<content>${escapeXml(content)}</content>` +
      `</page>`;

    const data = await this.request<XWikiPageRaw>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/xml' },
      body: xml,
    });

    return {
      title: data.title,
      content: data.content,
      syntax: data.syntax,
      author: data.contentAuthor ?? data.author,
      modified_date: data.modified,
      version: data.version,
      parent: data.parent,
      url: data.xwikiAbsoluteUrl ?? this.buildViewUrl(`${space}.${page}`),
    };
  }

  async deletePage(space: string, page: string): Promise<void> {
    const url = new URL(`${this.wikiBase}${this.spacePath(space)}/pages/${encodeURIComponent(page)}`);
    await this.request<string>(url, { method: 'DELETE' }, 'text');
  }

  async addComment(space: string, page: string, text: string, author?: string): Promise<void> {
    const url = new URL(`${this.wikiBase}${this.spacePath(space)}/pages/${encodeURIComponent(page)}/comments`);
    url.searchParams.set('media', 'json');
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<comment xmlns="http://www.xwiki.org">` +
      (author ? `<author>${escapeXml(author)}</author>` : '') +
      `<text>${escapeXml(text)}</text>` +
      `</comment>`;
    await this.request<string>(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml },
      'text',
    );
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
