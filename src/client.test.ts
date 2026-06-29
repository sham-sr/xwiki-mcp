import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XWikiClient, XWikiError } from './client.js';

// Mock config so tests don't need real env vars
vi.mock('./config.js', () => ({
  config: {
    baseUrl: 'https://wiki.example.com',
    authType: 'basic',
    username: 'user',
    password: 'pass',
    token: '',
    wikiName: 'xwiki',
    wikiNamesFromEnv: ['xwiki', 'otherwiki'],
    restPath: '/rest',
    pageLimit: 50,
  },
}));

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// listSpaces
// ---------------------------------------------------------------------------

describe('listSpaces', () => {
  it('maps spaces to compact format with wiki field', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          spaces: [
            { id: 'xwiki:Main', name: 'Main', xwikiAbsoluteUrl: 'https://wiki.example.com/Main' },
            { id: 'xwiki:Sandbox', name: 'Sandbox', xwikiAbsoluteUrl: 'https://wiki.example.com/Sandbox' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ spaces: [] }),
      });
    vi.stubGlobal('fetch', fetch);

    const spaces = await new XWikiClient().listSpaces();

    expect(spaces).toEqual([
      { id: 'xwiki:Main', name: 'Main', wiki: 'xwiki', home_url: 'https://wiki.example.com/Main' },
      { id: 'xwiki:Sandbox', name: 'Sandbox', wiki: 'xwiki', home_url: 'https://wiki.example.com/Sandbox' },
    ]);
  });

  it('aggregates spaces from all configured wikis', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          spaces: [{ id: 'xwiki:Main', name: 'Main', xwikiAbsoluteUrl: 'https://wiki.example.com/Main' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          spaces: [{ id: 'otherwiki:Docs', name: 'Docs', xwikiAbsoluteUrl: 'https://wiki.example.com/Docs' }],
        }),
      });
    vi.stubGlobal('fetch', fetch);

    const spaces = await new XWikiClient().listSpaces();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(spaces.map(s => s.id)).toEqual(['otherwiki:Docs', 'xwiki:Main']);
  });

  it('returns empty array when spaces is missing', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetch);

    const client = new XWikiClient();
    expect(await client.listSpaces()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// spacePath — tested indirectly via URL fetch is called with
// ---------------------------------------------------------------------------

describe('spacePath (nested spaces)', () => {
  it('builds simple space URL', async () => {
    const fetch = mockFetch({ pageSummaries: [], totalResults: 0 });
    vi.stubGlobal('fetch', fetch);

    await new XWikiClient().listPages('MySpace', 0, 10);

    const url: string = fetch.mock.calls[0][0];
    expect(url).toContain('/spaces/MySpace/pages');
  });

  it('builds nested space URL with dot notation', async () => {
    const fetch = mockFetch({ pageSummaries: [], totalResults: 0 });
    vi.stubGlobal('fetch', fetch);

    await new XWikiClient().listPages('Space1.SubSpace', 0, 10);

    const url: string = fetch.mock.calls[0][0];
    expect(url).toContain('/spaces/Space1/spaces/SubSpace/pages');
  });

  it('encodes special characters in space name', async () => {
    const fetch = mockFetch({ pageSummaries: [], totalResults: 0 });
    vi.stubGlobal('fetch', fetch);

    await new XWikiClient().listPages('Тест', 0, 10);

    const url: string = fetch.mock.calls[0][0];
    expect(url).toContain(encodeURIComponent('Тест'));
  });

  it('builds REST path for space names with escaped dots', async () => {
    const fetch = mockFetch({ pageSummaries: [], totalResults: 0 });
    vi.stubGlobal('fetch', fetch);

    await new XWikiClient().listPages('2\\._segment.2\\.1\\._Sample', 0, 10);

    const url: string = fetch.mock.calls[0][0];
    expect(url).toContain('/spaces/2._segment/spaces/2.1._Sample/pages');
  });
});

// ---------------------------------------------------------------------------
// listPages — pagination
// ---------------------------------------------------------------------------

describe('listPages pagination', () => {
  it('has_more=true when more results exist', async () => {
    vi.stubGlobal('fetch', mockFetch({
      pageSummaries: [{ id: 'p1', title: 'Page 1', xwikiAbsoluteUrl: '' }],
      totalResults: 5,
    }));

    const { pagination } = await new XWikiClient().listPages('Space', 0, 1);
    expect(pagination.has_more).toBe(true);
    expect(pagination.total).toBe(5);
  });

  it('has_more=false when all results fetched', async () => {
    vi.stubGlobal('fetch', mockFetch({
      pageSummaries: [{ id: 'p1', title: 'Page 1', xwikiAbsoluteUrl: '' }],
      totalResults: 1,
    }));

    const { pagination } = await new XWikiClient().listPages('Space', 0, 10);
    expect(pagination.has_more).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getPage
// ---------------------------------------------------------------------------

describe('getPage', () => {
  it('maps page fields to compact format', async () => {
    vi.stubGlobal('fetch', mockFetch({
      title: 'My Page',
      content: '= Hello =',
      syntax: 'xwiki/2.1',
      contentAuthor: 'XWiki.Admin',
      modified: 1700000000000,
      version: '3.1',
      parent: 'Main.WebHome',
      xwikiAbsoluteUrl: 'https://wiki.example.com/MyPage',
    }));

    const page = await new XWikiClient().getPage('Main', 'MyPage');

    expect(page.title).toBe('My Page');
    expect(page.content).toBe('= Hello =');
    expect(page.author).toBe('XWiki.Admin');
    expect(page.url).toBe('https://wiki.example.com/MyPage');
  });

  it('getPageById resolves wiki from id prefix', async () => {
    const fetch = mockFetch({
      title: 'Architecture',
      content: 'content',
      syntax: 'xwiki/2.1',
      xwikiAbsoluteUrl: 'https://wiki.example.com/view',
    });
    vi.stubGlobal('fetch', fetch);

    await new XWikiClient().getPageById('otherwiki:2\\._segment.2\\.1\\._Sample.WebHome');

    const url: string = fetch.mock.calls[0][0];
    expect(url).toContain('/wikis/otherwiki/');
    expect(url).toContain('/spaces/2._segment/spaces/2.1._Sample/pages/WebHome');
  });
});

// ---------------------------------------------------------------------------
// search — scope prefix
// ---------------------------------------------------------------------------

describe('search engines & scope', () => {
  const emptyResponse = { searchResults: [], totalResults: 0 };

  it('solr engine hits /rest/wikis/query?type=solr with tuned q', async () => {
    const fetch = mockFetch(emptyResponse);
    vi.stubGlobal('fetch', fetch);

    await new XWikiClient().search('foo bar', { engine: 'solr', start: 0, limit: 10 });

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/rest/wikis/query');
    expect(url.searchParams.get('type')).toBe('solr');
    expect(url.searchParams.get('q')).toBe('text:(*foo* OR *bar*)');
    expect(url.searchParams.get('wikis')).toBe('xwiki,otherwiki');
  });

  it('solr title scope wraps query with wildcards', async () => {
    const fetch = mockFetch(emptyResponse);
    vi.stubGlobal('fetch', fetch);

    await new XWikiClient().search('foo bar', { engine: 'solr', scope: 'title', start: 0, limit: 10 });

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toBe('title:(*foo* OR *bar*)');
  });

  it('solr appends space:"..." filter when space is given', async () => {
    const fetch = mockFetch(emptyResponse);
    vi.stubGlobal('fetch', fetch);

    await new XWikiClient().search('foo', { engine: 'solr', space: 'MySpace', start: 0, limit: 10 });

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('q')).toContain('space:"MySpace"');
    expect(url.searchParams.get('q')).toContain('text:(*foo*)');
  });

  it('solr fan-out queries each wiki when combined search is empty', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(emptyResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          searchResults: [{ id: 'xwiki:Main.WebHome', title: 'Main', score: 1 }],
          totalResults: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          searchResults: [{ id: 'otherwiki:Docs.WebHome', title: 'Docs', score: 2 }],
          totalResults: 1,
        }),
      });
    vi.stubGlobal('fetch', fetch);

    const { results, engine, meta } = await new XWikiClient().search('foo', { engine: 'solr', limit: 10 });

    expect(engine).toBe('solr');
    expect(meta.solr_fan_out).toBe(true);
    expect(results).toHaveLength(2);
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get('wikis')).toBe('xwiki');
    expect(new URL(fetch.mock.calls[2][0]).searchParams.get('wikis')).toBe('otherwiki');
  });

  it('auto-falls back to legacy when all solr attempts are empty', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(emptyResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(emptyResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(emptyResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          searchResults: [{ id: 'xwiki:Main.WebHome', title: 'Main' }],
          totalResults: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(emptyResponse),
      });
    vi.stubGlobal('fetch', fetch);

    const { engine, meta, results } = await new XWikiClient().search('Main');

    expect(engine).toBe('legacy');
    expect(meta.solr_attempted).toBe(true);
    expect(meta.fallback_reason).toBe('solr returned no results');
    expect(results).toHaveLength(1);
    expect(fetch.mock.calls[3][0]).toContain('/wikis/xwiki/search');
  });

  it('explicit solr does not fall back to legacy when empty', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(emptyResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(emptyResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(emptyResponse),
      });
    vi.stubGlobal('fetch', fetch);

    const { engine, meta, results } = await new XWikiClient().search('Main', { engine: 'solr' });

    expect(engine).toBe('solr');
    expect(meta.solr_attempted).toBe(true);
    expect(meta.fallback_reason).toBeUndefined();
    expect(results).toHaveLength(0);
    expect(fetch.mock.calls).toHaveLength(3);
  });

  it('legacy engine hits /search with scope param', async () => {
    const fetch = mockFetch(emptyResponse);
    vi.stubGlobal('fetch', fetch);

    await new XWikiClient().search('foo', { engine: 'legacy', scope: 'title', start: 0, limit: 10 });

    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/rest/wikis/xwiki/search');
    expect(url.searchParams.get('scope')).toBe('title');
    expect(url.searchParams.get('q')).toBe('foo');
  });

  it('wiki param limits solr search to one virtual wiki', async () => {
    const fetch = mockFetch(emptyResponse);
    vi.stubGlobal('fetch', fetch);

    await new XWikiClient().search('foo', { engine: 'solr', wiki: 'otherwiki' });

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get('wikis')).toBe('otherwiki');
  });

  it('maps excerpt from solr search results', async () => {
    vi.stubGlobal('fetch', mockFetch({
      searchResults: [{
        id: 'xwiki:Main.WebHome',
        title: 'Main',
        excerpt: '... architecture overview ...',
      }],
      totalResults: 1,
    }));

    const { results } = await new XWikiClient().search('architecture', { engine: 'solr' });
    expect(results[0].excerpt).toBe('... architecture overview ...');
  });

  it('maps search results with wiki, page and page_full_name', async () => {
    vi.stubGlobal('fetch', mockFetch({
      searchResults: [{
        id: 'otherwiki:2\\._segment.2\\.1\\._Sample.WebHome',
        title: 'SamplePage',
        space: '2\\._segment.2\\.1\\._Sample',
        pageFullName: '2\\._segment.2\\.1\\._Sample.WebHome',
        score: 1.5,
      }],
      totalResults: 1,
    }));

    const { results } = await new XWikiClient().search('SamplePage', { engine: 'solr' });

    expect(results[0]).toMatchObject({
      id: 'otherwiki:2\\._segment.2\\.1\\._Sample.WebHome',
      wiki: 'otherwiki',
      space: '2\\._segment.2\\.1\\._Sample',
      page: 'WebHome',
      page_full_name: '2\\._segment.2\\.1\\._Sample.WebHome',
      title: 'SamplePage',
    });
    expect(results[0].url).toContain('2._segment');
  });
});

describe('getPage content slice', () => {
  it('truncates content with max_chars and offset', async () => {
    vi.stubGlobal('fetch', mockFetch({
      id: 'xwiki:Main.WebHome',
      title: 'Main',
      content: 'abcdefghijklmnopqrstuvwxyz',
      syntax: 'xwiki/2.1',
    }));

    const page = await new XWikiClient().getPage('Main', 'WebHome', 'xwiki', {
      offset: 2,
      max_chars: 5,
    });

    expect(page.content).toBe('cdefg');
    expect(page._content).toEqual({
      offset: 2,
      length: 5,
      total_chars: 26,
      truncated: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('throws XWikiError with status 404 on not found', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 404));

    await expect(new XWikiClient().getPage('Main', 'Missing')).rejects.toMatchObject({
      name: 'XWikiError',
      status: 404,
    });
  });

  it('throws XWikiError on 401', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 401));

    await expect(new XWikiClient().listSpaces()).rejects.toMatchObject({
      name: 'XWikiError',
      status: 401,
      message: 'Authentication failed. Check XWIKI_AUTH_TYPE and credentials.',
    });
  });

  it('throws XWikiError on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(new XWikiClient().listSpaces()).rejects.toMatchObject({
      name: 'XWikiError',
      message: expect.stringContaining('Cannot connect to XWiki'),
    });
  });
});
