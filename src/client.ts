import { config } from './config.js';
import { parsePageId, parseViewUrl, spacePathFromReference, viewUrlFromPageFullName } from './reference.js';
import { buildSolrQuery } from './solr-query.js';
import type {
  XWikiSpacesResponse,
  XWikiPagesResponse,
  XWikiPageRaw,
  XWikiSearchResponse,
  XWikiWikisResponse,
  XWikiAttachmentsResponse,
  Space,
  PageSummary,
  Page,
  SearchResult,
  Attachment,
  AttachmentContent,
  Pagination,
  SearchMeta,
  WikiInfo,
  WikiStatusSummary,
  WikiIndexRow,
  ContentSlice,
  SearchEngine,
  SearchScope,
} from './types.js';

export class XWikiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'XWikiError';
  }
}

export type { SearchEngine, SearchScope } from './types.js';

export class XWikiClient {
  private readonly restBase: string;
  private resolvedWikiNames: string[] | null = null;
  private wikiNamesSource: 'env' | 'discovered' = 'env';
  private defaultWiki: string;

  constructor() {
    this.restBase = `${config.baseUrl}${config.restPath}`;
    this.defaultWiki = config.wikiName ?? 'xwiki';
  }

  /**
   * Resolve wiki list (from env or GET /rest/wikis) and default wiki. Call once at startup.
   */
  async initialize(): Promise<void> {
    const names = await this.getWikiNames();
    if (config.wikiName) {
      this.defaultWiki = config.wikiName;
    } else if (names.includes('xwiki')) {
      this.defaultWiki = 'xwiki';
    } else if (names.length > 0) {
      this.defaultWiki = names[0];
    }
  }

  /** Wikis used for search and list_spaces. */
  async getWikiNames(): Promise<string[]> {
    if (this.resolvedWikiNames) return this.resolvedWikiNames;

    if (config.wikiNamesFromEnv) {
      this.resolvedWikiNames = [...config.wikiNamesFromEnv];
      this.wikiNamesSource = 'env';
    } else {
      this.resolvedWikiNames = await this.discoverWikis();
      this.wikiNamesSource = 'discovered';
    }
    return this.resolvedWikiNames;
  }

  getWikiNamesSource(): 'env' | 'discovered' {
    return this.wikiNamesSource;
  }

  /** Default wiki for write ops and get_page(space, page) without id prefix. */
  getDefaultWiki(): string {
    return this.defaultWiki;
  }

  async listWikis(): Promise<WikiInfo[]> {
    const names = await this.getWikiNames();
    return names.map(name => ({
      name,
      default: name === this.defaultWiki,
      in_scope: true,
    }));
  }

  resolveViewUrl(input: string) {
    const resolved = parseViewUrl(input, this.defaultWiki);
    if (!resolved) {
      throw new XWikiError(
        'Unrecognized XWiki URL. Expected /wiki/{wiki}/view/... or /bin/view/...',
      );
    }
    return resolved;
  }

  private resolvePageRef(input: {
    id?: string;
    wiki?: string;
    space?: string;
    page?: string;
  }): { wiki: string; space: string; page: string } {
    if (input.id) return parsePageId(input.id);
    if (input.space && input.page) {
      return {
        wiki: input.wiki ?? this.defaultWiki,
        space: input.space,
        page: input.page,
      };
    }
    throw new XWikiError('Provide either `id` (from search) or both `space` and `page`.');
  }

  private async resolveSearchWikis(wiki?: string): Promise<string[]> {
    const all = await this.getWikiNames();
    if (!wiki) return all;
    if (!all.includes(wiki)) {
      throw new XWikiError(`Wiki "${wiki}" is not in search scope. Available: ${all.join(', ')}`);
    }
    return [wiki];
  }

  private async discoverWikis(): Promise<string[]> {
    const url = new URL(`${this.restBase}/wikis`);
    url.searchParams.set('media', 'json');
    const data = await this.request<XWikiWikisResponse>(url);
    const names = (data.wikis ?? [])
      .map(w => w.name || (w.id?.includes(':') ? w.id.slice(0, w.id.indexOf(':')) : w.id))
      .filter((n): n is string => Boolean(n));
    const unique = [...new Set(names)].sort();
    if (unique.length === 0) {
      return [config.wikiName ?? 'xwiki'];
    }
    return unique;
  }

  private searchMeta(wikis: string[]): SearchMeta {
    return {
      wikis_searched: [...wikis],
      wiki_names_source: this.wikiNamesSource,
    };
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

  private wikiBaseFor(wiki: string): string {
    const name = wiki || this.defaultWiki;
    return `${this.restBase}/wikis/${encodeURIComponent(name)}`;
  }

  private async getOnWiki<T>(
    wiki: string,
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const url = new URL(`${this.wikiBaseFor(wiki)}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    url.searchParams.set('media', 'json');
    return this.request<T>(url);
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    return this.getOnWiki('', path, params);
  }

  // ---------------------------------------------------------------------------
  // Public API methods — READ
  // ---------------------------------------------------------------------------

  async listSpaces(): Promise<Space[]> {
    const seen = new Set<string>();
    const spaces: Space[] = [];
    const wikis = await this.getWikiNames();

    for (const wiki of wikis) {
      try {
        const data = await this.getOnWiki<XWikiSpacesResponse>(wiki, '/spaces');
        for (const s of data.spaces ?? []) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          const wikiFromId = s.id.includes(':') ? s.id.slice(0, s.id.indexOf(':')) : wiki;
          spaces.push({
            id: s.id,
            name: s.name,
            wiki: wikiFromId,
            home_url: s.xwikiAbsoluteUrl ?? '',
          });
        }
      } catch (e) {
        if (e instanceof XWikiError && (e.status === 404 || e.status === 403)) continue;
        throw e;
      }
    }

    return spaces.sort((a, b) => a.wiki.localeCompare(b.wiki) || a.name.localeCompare(b.name));
  }

  async listPages(
    space: string,
    start: number,
    limit: number,
    wiki?: string,
  ): Promise<{ pages: PageSummary[]; pagination: Pagination }> {
    const w = wiki ?? this.defaultWiki;
    const path = `${spacePathFromReference(space)}/pages`;
    const data = await this.getOnWiki<XWikiPagesResponse>(w, path, { start, number: limit });
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

  async getPage(
    space: string,
    page: string,
    wiki?: string,
    contentSlice?: { offset?: number; max_chars?: number },
  ): Promise<Page> {
    const path = `${spacePathFromReference(space)}/pages/${encodeURIComponent(page)}`;
    const data = await this.getOnWiki<XWikiPageRaw>(wiki ?? '', path);
    return this.applyContentSlice(this.mapPage(data), contentSlice);
  }

  async getPageById(
    pageId: string,
    contentSlice?: { offset?: number; max_chars?: number },
  ): Promise<Page> {
    const { wiki, space, page } = parsePageId(pageId);
    return this.getPage(space, page, wiki, contentSlice);
  }

  private applyContentSlice(
    page: Page,
    slice?: { offset?: number; max_chars?: number },
  ): Page {
    if (slice?.max_chars == null && slice?.offset == null) return page;
    const offset = slice?.offset ?? 0;
    const total = page.content.length;
    const maxChars = slice?.max_chars ?? total;
    const content = page.content.slice(offset, offset + maxChars);
    const sliceMeta: ContentSlice = {
      offset,
      length: content.length,
      total_chars: total,
      truncated: offset + content.length < total,
    };
    return { ...page, content, _content: sliceMeta };
  }

  private mapPage(data: XWikiPageRaw): Page {
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
   * - omit `engine` (auto): Solr first, legacy fallback when Solr is empty
   * - `solr`: Solr only — no fallback (use to verify indexing)
   * - `legacy`: HQL search over page name/title only
   */
  async search(
    query: string,
    opts: {
      engine?: SearchEngine;
      scope?: SearchScope;
      space?: string;
      wiki?: string;
      start?: number;
      limit?: number;
    } = {},
  ): Promise<{
    results: SearchResult[];
    pagination: Pagination;
    engine: SearchEngine;
    meta: SearchMeta;
  }> {
    const start = opts.start ?? 0;
    const limit = opts.limit ?? 20;
    const wikis = await this.resolveSearchWikis(opts.wiki);

    if (opts.engine === 'legacy') {
      const legacy = await this.searchLegacyFanOut(query, opts.scope, opts.space, start, limit, wikis);
      return {
        ...legacy,
        engine: 'legacy',
        meta: this.searchMeta(wikis),
      };
    }

    const solr = await this.searchSolrWithFanOut(query, opts.scope, opts.space, start, limit, wikis);
    if (solr.results.length > 0) {
      return { ...solr, engine: 'solr' };
    }

    if (opts.engine === 'solr') {
      return {
        ...solr,
        engine: 'solr',
        meta: { ...solr.meta, solr_attempted: true },
      };
    }

    const legacy = await this.searchLegacyFanOut(query, opts.scope, opts.space, start, limit, wikis);
    return {
      ...legacy,
      engine: 'legacy',
      meta: {
        ...this.searchMeta(wikis),
        solr_attempted: true,
        solr_fan_out: solr.meta.solr_fan_out,
        solr_q: solr.meta.solr_q,
        fallback_reason: 'solr returned no results',
      },
    };
  }

  private async searchSolrWithFanOut(
    query: string,
    scope: SearchScope | undefined,
    space: string | undefined,
    start: number,
    limit: number,
    wikis: string[],
  ): Promise<{ results: SearchResult[]; pagination: Pagination; meta: SearchMeta }> {
    const q = buildSolrQuery(query, scope, space);
    const wikisList = wikis;

    const combined = await this.fetchSolr(q, wikisList.join(','), start, limit);
    const combinedResults = this.mapSearchResults(combined);
    if (combinedResults.length > 0 || wikisList.length === 1) {
      return {
        results: combinedResults,
        pagination: this.buildPagination(combinedResults, start, limit, combined.totalResults),
        meta: { ...this.searchMeta(wikisList), solr_fan_out: false, solr_q: q },
      };
    }

    const merged = await this.fetchSolrPerWiki(q, wikisList, start + limit);
    const results = this.paginateResults(merged, start, limit);
    return {
      results,
      pagination: this.buildPagination(results, start, limit, merged.length > start + limit ? undefined : merged.length),
      meta: { ...this.searchMeta(wikisList), solr_fan_out: true, solr_q: q },
    };
  }

  private async fetchSolr(
    q: string,
    wikis: string,
    start: number,
    number: number,
  ): Promise<XWikiSearchResponse> {
    const url = new URL(`${this.restBase}/wikis/query`);
    url.searchParams.set('q', q);
    url.searchParams.set('type', 'solr');
    url.searchParams.set('wikis', wikis);
    url.searchParams.set('start', String(start));
    url.searchParams.set('number', String(number));
    url.searchParams.set('media', 'json');
    return this.request<XWikiSearchResponse>(url);
  }

  private async fetchSolrPerWiki(q: string, wikis: string[], fetchLimit: number): Promise<SearchResult[]> {
    const merged: SearchResult[] = [];
    const seen = new Set<string>();

    for (const wiki of wikis) {
      try {
        const data = await this.fetchSolr(q, wiki, 0, fetchLimit);
        for (const r of this.mapSearchResults(data)) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          merged.push(r);
        }
      } catch (e) {
        if (e instanceof XWikiError && (e.status === 404 || e.status === 403)) continue;
        throw e;
      }
    }

    return merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  private async searchLegacyFanOut(
    query: string,
    scope: SearchScope | undefined,
    space: string | undefined,
    start: number,
    limit: number,
    wikis: string[],
  ): Promise<{ results: SearchResult[]; pagination: Pagination }> {
    const params: Record<string, string | number> = { q: query, start: 0, number: start + limit };
    if (scope) params.scope = scope;

    const path = space ? `${spacePathFromReference(space)}/search` : '/search';
    const merged: SearchResult[] = [];
    const seen = new Set<string>();

    for (const wiki of wikis) {
      try {
        const data = await this.getOnWiki<XWikiSearchResponse>(wiki, path, params);
        for (const r of this.mapSearchResults(data)) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          merged.push(r);
        }
      } catch (e) {
        if (e instanceof XWikiError && (e.status === 404 || e.status === 403)) continue;
        throw e;
      }
    }

    const results = this.paginateResults(merged, start, limit);
    return {
      results,
      pagination: this.buildPagination(results, start, limit),
    };
  }

  private mapSearchResults(data: XWikiSearchResponse): SearchResult[] {
    return (data.searchResults ?? []).map(r => {
      const docItem = r.hierarchy?.items?.findLast(i => i.type === 'document');
      const parsed = parsePageId(r.id);
      const pageFullName = r.pageFullName ?? (parsed.space ? `${parsed.space}.${parsed.page}` : parsed.page);
      const viewUrl = docItem?.url ?? viewUrlFromPageFullName(config.baseUrl, pageFullName);
      return {
        id: r.id,
        title: r.title ?? r.id,
        wiki: parsed.wiki,
        space: r.space ?? parsed.space,
        page: parsed.page,
        page_full_name: pageFullName,
        url: viewUrl,
        score: r.score,
        modified_date: r.modified != null ? String(r.modified) : undefined,
        excerpt: r.excerpt ?? r.highlight ?? undefined,
      };
    });
  }

  private paginateResults(results: SearchResult[], start: number, limit: number): SearchResult[] {
    return results.slice(start, start + limit);
  }

  private buildPagination(
    results: SearchResult[],
    start: number,
    limit: number,
    total?: number,
  ): Pagination {
    return {
      total,
      start,
      limit,
      has_more: total != null
        ? start + results.length < total
        : results.length === limit,
    };
  }

  async getAttachments(space: string, page: string, wiki?: string): Promise<Attachment[]> {
    const path = `${spacePathFromReference(space)}/pages/${encodeURIComponent(page)}/attachments`;
    const data = await this.getOnWiki<XWikiAttachmentsResponse>(wiki ?? '', path);
    return (data.attachments ?? []).map(a => ({
      name: a.name,
      size_bytes: a.longSize ?? a.size,
      mime_type: a.mimeType,
      author: a.author,
      date: a.date != null ? String(a.date) : undefined,
      download_url: a.xwikiAbsoluteUrl ?? '',
    }));
  }

  async getPageChildren(space: string, page: string, wiki?: string): Promise<PageSummary[]> {
    const path = `${spacePathFromReference(space)}/pages/${encodeURIComponent(page)}/children`;
    const data = await this.getOnWiki<XWikiPagesResponse>(wiki ?? '', path);
    return (data.pageSummaries ?? []).map(p => ({
      id: p.id,
      title: p.title,
      parent: p.parent,
      url: p.xwikiAbsoluteUrl ?? '',
    }));
  }

  private async solrDocCount(wiki: string, quick: boolean): Promise<{ count: number | null; note?: string }> {
    const q = `wiki:${wiki} AND *:*`;
    const pageSize = 1000;
    let total = 0;
    let start = 0;

    try {
      while (true) {
        const data = await this.fetchSolr(q, wiki, start, pageSize);
        if (start === 0 && data.totalResults != null) {
          return { count: data.totalResults };
        }
        const batch = data.searchResults ?? [];
        total += batch.length;
        if (batch.length < pageSize) {
          return { count: total };
        }
        if (quick) {
          return { count: total, note: `${pageSize}+ (pass quick:false for exact count)` };
        }
        start += pageSize;
      }
    } catch (e) {
      return { count: null, note: e instanceof Error ? e.message : String(e) };
    }
  }

  async getWikiStatus(opts: { wiki?: string; quick?: boolean } = {}): Promise<WikiStatusSummary> {
    const quick = opts.quick !== false;
    const wikis = opts.wiki ? await this.resolveSearchWikis(opts.wiki) : await this.getWikiNames();
    const rows: WikiIndexRow[] = [];
    let totalIndexed = 0;
    let wikisWithDocs = 0;

    for (const wiki of wikis) {
      const { count, note } = await this.solrDocCount(wiki, quick);
      const status: WikiIndexRow['status'] =
        count == null ? 'error' : count === 0 ? 'empty' : 'ok';
      rows.push({ wiki, indexed: count, status, note });
      if (count != null && count > 0) {
        totalIndexed += count;
        wikisWithDocs += 1;
      }
    }

    return {
      wikis_in_scope: wikis.length,
      wikis_with_docs: wikisWithDocs,
      total_indexed: totalIndexed,
      rows,
    };
  }

  async getAttachmentContent(input: {
    id?: string;
    wiki?: string;
    space?: string;
    page?: string;
    name: string;
    max_bytes?: number;
  }): Promise<AttachmentContent> {
    const { wiki, space, page } = this.resolvePageRef(input);
    const attachments = await this.getAttachments(space, page, wiki);
    const att = attachments.find(a => a.name === input.name);
    if (!att) {
      throw new XWikiError(`Attachment not found: ${input.name}`, 404);
    }
    if (!isTextAttachment(att.mime_type, att.name)) {
      throw new XWikiError(
        `Attachment "${input.name}" is not a text file (${att.mime_type ?? 'unknown type'}). ` +
        'Use download_url from get_attachments.',
      );
    }

    const maxBytes = input.max_bytes ?? 512_000;
    const path =
      `${spacePathFromReference(space)}/pages/${encodeURIComponent(page)}` +
      `/attachments/${encodeURIComponent(input.name)}`;
    const url = new URL(`${this.wikiBaseFor(wiki)}${path}`);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: this.authHeaders(),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new XWikiError(`Cannot connect to XWiki at ${config.baseUrl}. Check XWIKI_BASE_URL.`);
    }

    if (!response.ok) {
      throw new XWikiError(`Failed to download attachment: HTTP ${response.status}`, response.status);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const truncated = buffer.length > maxBytes;
    const slice = truncated ? buffer.subarray(0, maxBytes) : buffer;
    const content = slice.toString('utf-8');

    return {
      name: att.name,
      mime_type: att.mime_type,
      size_bytes: att.size_bytes,
      content,
      truncated,
      download_url: att.download_url,
    };
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
    const url = new URL(`${this.wikiBaseFor('')}${spacePathFromReference(space)}/pages/${encodeURIComponent(page)}`);
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
      url: data.xwikiAbsoluteUrl ?? viewUrlFromPageFullName(config.baseUrl, `${space}.${page}`),
    };
  }

  async deletePage(space: string, page: string): Promise<void> {
    const url = new URL(`${this.wikiBaseFor('')}${spacePathFromReference(space)}/pages/${encodeURIComponent(page)}`);
    await this.request<string>(url, { method: 'DELETE' }, 'text');
  }

  async addComment(space: string, page: string, text: string, author?: string): Promise<void> {
    const url = new URL(`${this.wikiBaseFor('')}${spacePathFromReference(space)}/pages/${encodeURIComponent(page)}/comments`);
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

function isTextAttachment(mime?: string, name?: string): boolean {
  if (mime?.startsWith('text/')) return true;
  if (mime === 'application/json' || mime === 'application/xml') return true;
  const ext = name?.split('.').pop()?.toLowerCase();
  return ['md', 'txt', 'csv', 'json', 'xml', 'yml', 'yaml', 'log', 'properties'].includes(ext ?? '');
}
