#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from './config.js';
import { XWikiClient } from './client.js';
import { register as registerListSpaces } from './tools/list-spaces.js';
import { register as registerListPages } from './tools/list-pages.js';
import { register as registerGetPage } from './tools/get-page.js';
import { register as registerSearch } from './tools/search.js';
import { register as registerGetAttachments } from './tools/get-attachments.js';
import { register as registerGetPageChildren } from './tools/get-page-children.js';
import { register as registerCreatePage } from './tools/create-page.js';
import { register as registerDeletePage } from './tools/delete-page.js';
import { register as registerAddComment } from './tools/add-comment.js';
import { register as registerListWikis } from './tools/list-wikis.js';
import { register as registerResolveUrl } from './tools/resolve-url.js';
import { register as registerWikiStatus } from './tools/wiki-status.js';
import { register as registerGetAttachment } from './tools/get-attachment.js';
import { registerPromptsAndResources } from './prompts.js';

const SERVER_VERSION = '0.4.1';

async function main() {
  const server = new McpServer({
    name: 'xwiki-mcp',
    version: SERVER_VERSION,
  });

  const client = new XWikiClient();
  await client.initialize();

  // Read
  registerListWikis(server, client);
  registerSearch(server, client);
  registerResolveUrl(server, client);
  registerWikiStatus(server, client);
  registerListSpaces(server, client);
  registerListPages(server, client);
  registerGetPage(server, client);
  registerGetAttachments(server, client);
  registerGetAttachment(server, client);
  registerGetPageChildren(server, client);
  registerPromptsAndResources(server, client);
  // Write
  registerCreatePage(server, client);
  registerDeletePage(server, client);
  registerAddComment(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const wikis = await client.getWikiNames();
  const source = client.getWikiNamesSource();
  process.stderr.write(
    `xwiki-mcp v${SERVER_VERSION} started. Wiki: ${config.baseUrl} ` +
      `(default: ${client.getDefaultWiki()}, search: ${wikis.join(',')} [${source}])\n`,
  );
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
