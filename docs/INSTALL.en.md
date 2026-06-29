# Installing xwiki-mcp (corporate Nexus)

**[English](INSTALL.en.md) | [Русский](INSTALL.ru.md)**

MCP server for XWiki in Cursor. No build step — install the published npm package.

> **Without step 1 (corporate Nexus in `~/.npmrc`) you will NOT get the current in-house build.**
> `npm install -g xwiki-mcp` will pull the **outdated public package** from [registry.npmjs.org](https://www.npmjs.org/) instead of the latest release from corporate Nexus.
> **Step 1 is mandatory** — not optional.

## Requirements

- [Node.js 18+](https://nodejs.org/) (LTS)
- Nexus account with **read** access to the npm repository (`nx-anonymous` / `npm-read` or equivalent — ask your admin)
- XWiki access (username/password or token)

## 1. npm setup (one-time) — required

**Do not skip.** Without this block, npm uses the public registry and installs an old `xwiki-mcp` that lacks corporate wiki fixes and recent releases.

File `%USERPROFILE%\.npmrc` (Windows) or `~/.npmrc` (macOS/Linux):

```ini
registry=https://nexus.example.com/repository/npm-group/
//nexus.example.com/repository/npm-group/:_auth=BASE64_username:password
//nexus.example.com/repository/npm-group/:always-auth=true
```

`_auth` is Base64 of `username:password` for Nexus. PowerShell example:

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("user:password"))
```

> Without repository access, `npm install` returns **401/403** — contact your Nexus administrator.

After saving `.npmrc`, confirm:

```bash
npm config get registry
```

Expected: `https://nexus.example.com/repository/npm-group/` — **not** `https://registry.npmjs.org/`.

## 2. Install the package

```bash
npm install -g xwiki-mcp
```

This installs the **latest** version from your configured registry (Nexus `npm-group` after step 1).

Verify registry and version:

```bash
npm config get registry
npm view xwiki-mcp version
xwiki-mcp --version
# binary path: where xwiki-mcp   (Windows) / which xwiki-mcp
```

Pin a specific version only when required (e.g. rollback):

```bash
npm install -g xwiki-mcp@0.4.1
```

## 3. Cursor

File `%USERPROFILE%\.cursor\mcp.json` or `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "xwiki": {
      "command": "xwiki-mcp",
      "env": {
        "XWIKI_BASE_URL": "https://wiki.example.com",
        "XWIKI_WIKI_NAME": "xwiki",
        "XWIKI_AUTH_TYPE": "basic",
        "XWIKI_USERNAME": "your-username",
        "XWIKI_PASSWORD": "your-password"
      }
    }
  }
}
```

Restart Cursor or reload MCP (Settings → MCP).

## XWiki variables

| Variable | Required | Description |
|----------|----------|-------------|
| `XWIKI_BASE_URL` | yes | Wiki URL without `/rest` |
| `XWIKI_USERNAME` / `XWIKI_PASSWORD` | for basic | XWiki credentials |
| `XWIKI_WIKI_NAME` | no | Default virtual wiki name (use yours; optional) |
| `XWIKI_WIKI_NAMES` | no | Comma-separated wikis for search scope |

## Updating

```bash
npm install -g xwiki-mcp
```

Same as initial install — npm picks up the latest version from Nexus. See [CHANGELOG.md](../CHANGELOG.md) for release notes.

## Publishing (for maintainers)

`.env` file in the repository root:

```env
NPM_REPOSITORY_URL=
NEXUS_USER=deploy
NEXUS_PASSWORD=...
```
