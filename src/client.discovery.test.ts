import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./config.js', () => ({
  config: {
    baseUrl: 'https://wiki.example.com',
    authType: 'basic',
    username: 'user',
    password: 'pass',
    token: '',
    wikiName: undefined,
    wikiNamesFromEnv: null,
    restPath: '/rest',
    pageLimit: 50,
  },
}));

const { XWikiClient } = await import('./client.js');

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('wiki discovery', () => {
  it('discovers wikis via GET /rest/wikis when XWIKI_WIKI_NAMES unset', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        wikis: [
          { name: 'otherwiki', id: 'otherwiki:WebHome' },
          { name: 'mywiki', id: 'mywiki:WebHome' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetch);

    const client = new XWikiClient();
    await client.initialize();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/rest/wikis?'),
      expect.any(Object),
    );
    expect(await client.getWikiNames()).toEqual(['mywiki', 'otherwiki']);
    expect(client.getWikiNamesSource()).toBe('discovered');
    expect(client.getDefaultWiki()).toBe('mywiki');
  });

  it('prefers xwiki as default when discovered', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        wikis: [
          { name: 'otherwiki' },
          { name: 'xwiki' },
        ],
      }),
    }));

    const client = new XWikiClient();
    await client.initialize();

    expect(client.getDefaultWiki()).toBe('xwiki');
  });

  it('falls back to single wiki when discovery returns empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ wikis: [] }),
    }));

    const client = new XWikiClient();
    await client.initialize();

    expect(await client.getWikiNames()).toEqual(['xwiki']);
  });
});
