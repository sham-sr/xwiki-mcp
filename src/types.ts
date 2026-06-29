// XWiki REST API response shapes (raw, before transformation)

export interface XWikiSpaceRaw {
  id: string;
  name: string;
  home?: string;
  xwikiRelativeUrl?: string;
  xwikiAbsoluteUrl?: string;
}

export interface XWikiSpacesResponse {
  spaces: XWikiSpaceRaw[];
}

export interface XWikiWikiRaw {
  name: string;
  id?: string;
}

export interface XWikiWikisResponse {
  wikis: XWikiWikiRaw[];
}

export interface XWikiPageSummaryRaw {
  id: string;
  fullName: string;
  title: string;
  parent?: string;
  wiki?: string;
  space?: string;
  name?: string;
  version?: string;
  author?: string;
  xwikiRelativeUrl?: string;
  xwikiAbsoluteUrl?: string;
}

export interface XWikiPagesResponse {
  pageSummaries: XWikiPageSummaryRaw[];
  totalResults?: number;
}

export interface XWikiPageRaw {
  id: string;
  fullName: string;
  title: string;
  content: string;
  syntax: string;
  author?: string;
  contentAuthor?: string;
  modified?: string;
  created?: string;
  version?: string;
  parent?: string;
  xwikiAbsoluteUrl?: string;
}

export interface XWikiSearchResultRaw {
  id: string;
  type: string;
  score?: number;
  title?: string;
  space?: string;
  modified?: string | number;
  pageFullName?: string;
  excerpt?: string;
  highlight?: string;
  object?: null | Record<string, unknown>;
  hierarchy?: {
    items: Array<{
      label: string;
      name: string;
      type: string;
      url: string;
    }>;
  };
}

export interface XWikiSearchResponse {
  searchResults: XWikiSearchResultRaw[];
  totalResults?: number;
}

export interface XWikiAttachmentRaw {
  id?: string;
  name: string;
  size?: number;
  longSize?: number;
  mimeType?: string;
  author?: string;
  date?: string | number;
  xwikiRelativeUrl?: string;
  xwikiAbsoluteUrl?: string;
}

export interface XWikiAttachmentsResponse {
  attachments: XWikiAttachmentRaw[];
}

// Transformed output types (what tools return)

export type SearchEngine = 'solr' | 'legacy';
export type SearchScope = 'content' | 'title' | 'name';

export interface Space {
  id: string;
  name: string;
  wiki: string;
  home_url: string;
}

export interface SearchMeta {
  wikis_searched: string[];
  wiki_names_source?: 'env' | 'discovered';
  solr_attempted?: boolean;
  solr_fan_out?: boolean;
  solr_q?: string;
  fallback_reason?: string;
  suggestions?: string[];
}

export interface WikiInfo {
  name: string;
  default: boolean;
  in_scope: boolean;
}

export interface WikiIndexRow {
  wiki: string;
  indexed: number | null;
  status: 'ok' | 'empty' | 'error';
  note?: string;
}

export interface WikiStatusSummary {
  wikis_in_scope: number;
  wikis_with_docs: number;
  total_indexed: number;
  rows: WikiIndexRow[];
}

export interface ContentSlice {
  offset: number;
  length: number;
  total_chars: number;
  truncated: boolean;
}

export interface PageSummary {
  id: string;
  title: string;
  parent?: string;
  url: string;
}

export interface Page {
  title: string;
  content: string;
  syntax: string;
  author?: string;
  modified_date?: string;
  version?: string;
  parent?: string;
  url: string;
  _content?: ContentSlice;
}

export interface SearchResult {
  id: string;
  title: string;
  wiki: string;
  space: string;
  page: string;
  page_full_name: string;
  url: string;
  score?: number;
  modified_date?: string;
  excerpt?: string;
}

export interface Attachment {
  name: string;
  size_bytes?: number;
  mime_type?: string;
  author?: string;
  date?: string;
  download_url: string;
}

export interface AttachmentContent {
  name: string;
  mime_type?: string;
  size_bytes?: number;
  content: string;
  truncated: boolean;
  download_url: string;
}

export interface Pagination {
  total?: number;
  start: number;
  limit: number;
  has_more: boolean;
}
