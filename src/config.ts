export interface Config {
  baseUrl: string;
  authType: 'basic' | 'token' | 'none';
  username: string;
  password: string;
  token: string;
  /**
   * Default wiki for write ops and get_page(space, page) without wiki in id.
   * Set via XWIKI_WIKI_NAME. If unset, resolved after wiki discovery (prefers "xwiki").
   */
  wikiName?: string;
  /**
   * Explicit search/browse scope from XWIKI_WIKI_NAMES.
   * When null, wikis are discovered via GET /rest/wikis at startup.
   */
  wikiNamesFromEnv: string[] | null;
  restPath: string;
  pageLimit: number;
}

function load(): Config {
  const baseUrl = process.env.XWIKI_BASE_URL;
  if (!baseUrl) {
    throw new Error('XWIKI_BASE_URL environment variable is required');
  }

  const rawAuthType = process.env.XWIKI_AUTH_TYPE ?? 'basic';
  if (!['basic', 'token', 'none'].includes(rawAuthType)) {
    throw new Error(`XWIKI_AUTH_TYPE must be basic|token|none, got: ${rawAuthType}`);
  }

  const pageLimit = parseInt(process.env.XWIKI_PAGE_LIMIT ?? '50', 10);
  if (isNaN(pageLimit) || pageLimit < 1) {
    throw new Error(`XWIKI_PAGE_LIMIT must be a positive integer, got: ${process.env.XWIKI_PAGE_LIMIT}`);
  }

  const wikiNamesRaw = process.env.XWIKI_WIKI_NAMES?.trim();
  const wikiNamesFromEnv = wikiNamesRaw
    ? wikiNamesRaw.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  const wikiName = process.env.XWIKI_WIKI_NAME?.trim() || undefined;

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    authType: rawAuthType as Config['authType'],
    username: process.env.XWIKI_USERNAME ?? '',
    password: process.env.XWIKI_PASSWORD ?? '',
    token: process.env.XWIKI_TOKEN ?? '',
    wikiName,
    wikiNamesFromEnv: wikiNamesFromEnv?.length ? wikiNamesFromEnv : null,
    restPath: process.env.XWIKI_REST_PATH ?? '/rest',
    pageLimit,
  };
}

export const config = load();
