# Установка xwiki-mcp (корпоративный Nexus)

**[English](INSTALL.en.md) | [Русский](INSTALL.ru.md)**

MCP-сервер для XWiki в Cursor. Сборка не нужна — ставится готовый npm-пакет.

> **Без шага 1 (корпоративный Nexus в `~/.npmrc`) актуальная внутренняя сборка не установится.**
> Команда `npm install -g xwiki-mcp` подтянет **устаревший публичный пакет** с [registry.npmjs.org](https://www.npmjs.org/), а не последний релиз из корпоративного Nexus.
> **Шаг 1 обязателен** — не пропускайте.

## Требования

- [Node.js 18+](https://nodejs.org/) (LTS)
- Учётная запись Nexus с правом **чтения** npm-репозитория (роль `nx-anonymous` / `npm-read` или аналог у вашего админа)
- Доступ к XWiki (логин/пароль или токен)

## 1. Настройка npm (один раз) — обязательно

**Не пропускайте.** Без этого блока npm использует публичный registry и поставит старый `xwiki-mcp` без корпоративных доработок и свежих релизов.

Файл `%USERPROFILE%\.npmrc` (Windows) или `~/.npmrc` (macOS/Linux):

```ini
registry=https://nexus.example.com/repository/npm-group/
//nexus.example.com/repository/npm-group/:_auth=BASE64_логин:пароль
//nexus.example.com/repository/npm-group/:always-auth=true
```

`_auth` — Base64 от `логин:пароль` Nexus. Пример в PowerShell:

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("user:password"))
```

> Без прав на репозиторий `npm install` вернёт **401/403** — обратитесь к администратору Nexus.

После сохранения `.npmrc` проверьте:

```bash
npm config get registry
```

Ожидается: `https://nexus.example.com/repository/npm-group/` — **не** `https://registry.npmjs.org/`.

## 2. Установка пакета

```bash
npm install -g xwiki-mcp
```

Ставится **последняя** версия из настроенного registry (Nexus `npm-group` после шага 1).

Проверка registry и версии:

```bash
npm config get registry
npm view xwiki-mcp version
xwiki-mcp --version
# путь к бинарнику: where xwiki-mcp   (Windows) / which xwiki-mcp
```

Фиксировать версию — только при необходимости (например, откат):

```bash
npm install -g xwiki-mcp@0.4.1
```

## 3. Cursor

Файл `%USERPROFILE%\.cursor\mcp.json` или `.cursor/mcp.json` в проекте:

```json
{
  "mcpServers": {
    "xwiki": {
      "command": "xwiki-mcp",
      "env": {
        "XWIKI_BASE_URL": "https://wiki.example.com",
        "XWIKI_WIKI_NAME": "xwiki",
        "XWIKI_AUTH_TYPE": "basic",
        "XWIKI_USERNAME": "ваш-логин",
        "XWIKI_PASSWORD": "ваш-пароль"
      }
    }
  }
}
```

Перезапустите Cursor или перезагрузите MCP (Settings → MCP).

## Переменные XWiki

| Переменная | Обязательно | Описание |
|------------|-------------|----------|
| `XWIKI_BASE_URL` | да | URL вики без `/rest` |
| `XWIKI_USERNAME` / `XWIKI_PASSWORD` | для basic | Учётка XWiki |
| `XWIKI_WIKI_NAME` | нет | Имя виртуальной вики по умолчанию (подставьте своё; можно не задавать) |
| `XWIKI_WIKI_NAMES` | нет | Список вики для поиска через запятую |

## Обновление

```bash
npm install -g xwiki-mcp
```

Та же команда, что и при первой установке — npm подтянет последнюю версию из Nexus. Список изменений — в [CHANGELOG.md](../CHANGELOG.md).

## Публикация (для maintainer'а)

В корне репозитория файл `.env`:

```env
NPM_REPOSITORY_URL=
NEXUS_USER=deploy
NEXUS_PASSWORD=...
```