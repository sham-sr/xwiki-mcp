import { z } from 'zod';

export const pageRefBaseSchema = z.object({
  id: z
    .string()
    .optional()
    .describe('Page id from `search` — pass unchanged (preferred).'),
  wiki: z
    .string()
    .optional()
    .describe('Virtual wiki name when using space+page (default: XWIKI_WIKI_NAME).'),
  space: z
    .string()
    .optional()
    .describe('Space path with dots for nesting. Example: "Docs.01._specification".'),
  page: z
    .string()
    .optional()
    .describe('Page name (leaf). Usually "WebHome" for section roots.'),
});

/** Page locator: prefer `id` from search; otherwise space + page (+ optional wiki). */
export const pageRefSchema = pageRefBaseSchema.refine(
  data => data.id || (data.space && data.page),
  { message: 'Provide either `id` (from search) or both `space` and `page`.' },
);

export type PageRefInput = z.infer<typeof pageRefBaseSchema>;
