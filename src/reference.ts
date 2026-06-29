/** Split reference string into raw segments (escapes preserved). */
function splitEntityReferenceRaw(ref: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < ref.length; i++) {
    if (ref[i] === '.' && ref[i - 1] !== '\\') {
      if (current) parts.push(current);
      current = '';
    } else {
      current += ref[i];
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Split an XWiki entity reference on unescaped dots.
 * Returns real segment names for REST/view URLs (e.g. "2._segment").
 */
export function splitEntityReference(ref: string): string[] {
  return splitEntityReferenceRaw(ref).map(unescapeEntitySegment);
}

/** "2\._segment" → "2._segment" — REST/view URLs use real names, not reference escapes. */
export function unescapeEntitySegment(segment: string): string {
  return segment.replace(/\\(.)/g, '$1');
}

/** "2._segment" → "2\._segment" for entity-reference ids. */
export function escapeEntitySegment(segment: string): string {
  let out = '';
  for (let i = 0; i < segment.length; i++) {
    if (segment[i] === '.' && (i === 0 || segment[i - 1] !== '\\')) {
      out += '\\.';
    } else {
      out += segment[i];
    }
  }
  return out;
}

/** Build page id: "wiki:space.page" with escaped dots in reference form. */
export function pageIdFromParts(wiki: string, space: string, page: string): string {
  const spaceRef = space
    ? space.split('.').map(escapeEntitySegment).join('.')
    : '';
  const pageRef = escapeEntitySegment(page);
  const prefix = wiki ? `${wiki}:` : '';
  return spaceRef ? `${prefix}${spaceRef}.${pageRef}` : `${prefix}${pageRef}`;
}

/**
 * Parse XWiki view URL into page coordinates.
 * Supports /wiki/{wiki}/view/... and /bin/view/... (default wiki).
 */
export function parseViewUrl(
  input: string,
  defaultWiki: string,
): { wiki: string; space: string; page: string; id: string; url: string } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }

  const path = decodeURIComponent(url.pathname);

  const wikiView = path.match(/\/wiki\/([^/]+)\/view\/(.+)/);
  if (wikiView) {
    const wiki = wikiView[1];
    const segments = wikiView[2].split('/').filter(Boolean);
    if (segments.length === 0) return null;
    const page = segments[segments.length - 1];
    const space = segments.slice(0, -1).join('.');
    return {
      wiki,
      space,
      page,
      id: pageIdFromParts(wiki, space, page),
      url: url.toString(),
    };
  }

  const binView = path.match(/(?:\/xwiki)?\/bin\/view\/(.+)/);
  if (binView) {
    const segments = binView[1].split('/').filter(Boolean);
    if (segments.length === 0) return null;
    const page = segments[segments.length - 1];
    const space = segments.slice(0, -1).join('.');
    const wiki = defaultWiki;
    return {
      wiki,
      space,
      page,
      id: pageIdFromParts(wiki, space, page),
      url: url.toString(),
    };
  }

  return null;
}

/** "wiki:Space.Sub.WebHome" → { wiki, space, page } */
export function parsePageId(id: string): { wiki: string; space: string; page: string } {
  const colon = id.indexOf(':');
  const wiki = colon >= 0 ? id.slice(0, colon) : '';
  const rest = colon >= 0 ? id.slice(colon + 1) : id;
  const raw = splitEntityReferenceRaw(rest);
  const page = unescapeEntitySegment(raw.pop() ?? 'WebHome');
  const space = raw.join('.');
  return { wiki, space, page };
}

/** Build REST space path: "A.B" → "/spaces/A/spaces/B" */
export function spacePathFromReference(space: string): string {
  return '/' + splitEntityReference(space)
    .map(s => `spaces/${encodeURIComponent(s)}`)
    .join('/');
}

/** Build web view URL path segments from a page full name (no wiki prefix). */
export function viewUrlFromPageFullName(baseUrl: string, pageFullName: string): string {
  const segments = splitEntityReference(pageFullName);
  const parts = segments.map(p => encodeURIComponent(p));
  return `${baseUrl}/bin/view/${parts.join('/')}`;
}
