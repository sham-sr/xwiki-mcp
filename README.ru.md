# xwiki-mcp

**[English](README.md) | [Русский](README.ru.md)**

[![npm version](https://img.shields.io/npm/v/xwiki-mcp)](https://www.npmjs.com/package/xwiki-mcp)
[![npm downloads](https://img.shields.io/npm/dm/xwiki-mcp)](https://www.npmjs.com/package/xwiki-mcp)
[![license](https://img.shields.io/npm/l/xwiki-mcp)](LICENSE)
[![node](https://img.shields.io/node/v/xwiki-mcp)](package.json)

MCP-сервер для [XWiki](https://www.xwiki.org/) REST API. Позволяет AI-агентам (Claude Code, Claude Desktop и др.) **искать, читать и записывать** вики — с полнотекстовым поиском Solr, а не с устаревшим endpoint'ом, который по умолчанию используют большинство клиентов.

## Почему этот сервер

Большинство XWiki MCP-серверов (включая сгенерированные AI-инструментами) подключаются к `/rest/wikis/{wiki}/search`. Этот endpoint основан на HQL и по сути ищет **только по именам страниц** — запрос вроде `"visibility metric"` ничего не вернёт, если ни одна страница буквально так не называется, даже когда десятки страниц обсуждают тему. `xwiki-mcp` по умолчанию использует `/rest/wikis/query?type=solr` — Solr индексирует реальное содержимое с ранжированием по релевантности.

## Инструменты

### Чтение / исследование (v0.4+)

| Инструмент | Описание |
|------------|----------|
| `search` | Полнотекстовый Solr (авто-fallback на legacy). Фильтр `wiki`, `excerpt` в результатах, `suggestions` при пустом ответе |
| `list_wikis` | Виртуальные вики в области поиска + вики по умолчанию |
| `resolve_url` | URL браузера → `{id, wiki, space, page}` |
| `wiki_status` | Число документов Solr по вики (альтернатива MCP для `npm run check-solr`) |
| `list_spaces` | Пространства верхнего уровня по всем вики в области |
| `list_pages` | Страницы в пространстве (параметр `wiki` опционален) |
| `get_page` | Содержимое страницы по `id` (предпочтительно) или `space`+`page`; `max_chars` / `content_offset` для длинных страниц |
| `get_page_children` | Дочерние страницы (`id` поддерживается) |
| `get_attachments` | Список вложений (`id` поддерживается) |
| `get_attachment` | Скачать текстовое вложение (.md, .txt, .csv, …) |

**MCP prompt:** `wiki_research` — пошаговый сценарий исследования вики для агентов.

**Agent playbook:** [AGENTS.ru.md](AGENTS.ru.md) ([English](AGENTS.md)) — конфигурация, стратегия поиска, пример для вики `mywiki`.

**MCP resource:** `xwiki://wikis` — JSON-список вики в области поиска.

### Запись (v0.2+)

| Инструмент | Описание |
|------------|----------|
| `create_page` | Создать или обновить страницу (upsert через PUT). Безопасное экранирование XML. |
| `delete_page` | Удалить страницу |
| `add_comment` | Добавить комментарий к странице |

## Установка

Корпоративная установка из Nexus: [English](docs/INSTALL.en.md) · [Русский](docs/INSTALL.ru.md).

```bash
npm install -g xwiki-mcp
# или
npx xwiki-mcp
```

Из исходников:

```bash
git clone https://github.com/vitos73/xwiki-mcp
cd xwiki-mcp
npm install
npm run build
```

## Конфигурация

Переменные окружения:

```
XWIKI_BASE_URL      # Обязательно. Базовый URL без /rest (напр. https://wiki.example.com)
XWIKI_AUTH_TYPE     # basic | token | none  (по умолчанию: basic)
XWIKI_USERNAME      # Для basic auth
XWIKI_PASSWORD      # Для basic auth
XWIKI_TOKEN         # Для token auth (Bearer)
XWIKI_WIKI_NAME     # Вики по умолчанию для get_page(space,page) и записи (опционально; см. ниже)
XWIKI_WIKI_NAMES    # Список вики через запятую для search/list_spaces (опционально; авто-обнаружение если не задано)
XWIKI_REST_PATH     # Путь REST (по умолчанию: /rest)
XWIKI_PAGE_LIMIT    # Размер страницы по умолчанию (по умолчанию: 50)
```

### Несколько вики

**Две разные настройки — не дублирование:**

| Переменная | Роль |
|------------|------|
| `XWIKI_WIKI_NAMES` | **Область** — в каких вики искать и перечислять пространства |
| `XWIKI_WIKI_NAME` | **По умолчанию** — какая вики используется, когда в вызове нет `wiki` в `id` (`get_page({ space, page })`, `create_page` и т.д.) |

Если `XWIKI_WIKI_NAMES` **не задан**, сервер при старте вызывает `GET /rest/wikis` и использует **все** виртуальные вики на инстансе.

Если `XWIKI_WIKI_NAME` **не задан**, вики по умолчанию — `xwiki`, если она есть в списке, иначе первая по алфавиту.

**Минимальная конфигурация** (авто-обнаружение всех вики, `mywiki` по умолчанию для записи):

```env
XWIKI_BASE_URL=https://wiki.example.com
XWIKI_WIKI_NAME=mywiki
```

**Явная область** (поиск только в выбранных вики):

```env
XWIKI_WIKI_NAMES=wiki1,wiki2
XWIKI_WIKI_NAME=mywiki
```

После `search` открывайте страницы через `get_page({ id: "<id из результата>" })` — `id` включает префикс вики (`mywiki:...`).

`get_page({ space, page })` без `id` всегда использует вики по умолчанию (`XWIKI_WIKI_NAME` или вычисленную по умолчанию).

## Использование с Claude Code / Claude Desktop

Добавьте в `.mcp.json` (Claude Code, на уровне проекта) или `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "xwiki": {
      "command": "npx",
      "args": ["xwiki-mcp"],
      "env": {
        "XWIKI_BASE_URL": "https://wiki.example.com",
        "XWIKI_WIKI_NAMES": "wiki1,wiki2",
        "XWIKI_WIKI_NAME": "mywiki",
        "XWIKI_AUTH_TYPE": "basic",
        "XWIKI_USERNAME": "your-username",
        "XWIKI_PASSWORD": "your-password"
      }
    }
  }
}
```

## Сценарий поиск → чтение

Рекомендуемый поток для агента (подробнее: [AGENTS.ru.md](AGENTS.ru.md), MCP prompt `wiki_research`):

1. **`search`** — не угадывайте пути. Из вопроса пользователя возьмите **2–4 ключевых слова**, не весь абзац.
   - `wiki:"mywiki"` — одна виртуальная вики.
   - `scope:"title"` — поиск раздела по заголовку («Скрипт разговора»).
   - Точная фраза из текста — в **двойных кавычках**: `"Назовите, пожалуйста, станцию..."`.
   - Длинные вопросы (5+ слов) сервер автоматически отправляет в Solr как фразу; короткие — как OR по словам.
2. **`get_page({ id })`** — передавайте `id` без изменений из search (или из `resolve_url`).
3. **`get_page_children({ id })`** — обход дерева разделов.
4. Если пусто: `_search.suggestions`, `_search.solr_q`, затем **`wiki_status`**, **`list_wikis`**, **`list_spaces`**.
5. Длинная страница: **`get_page({ id, max_chars: 8000, content_offset: 0 })`** — следуйте `_content.truncated` для следующего фрагмента.

### Режимы `engine` в поиске

| `engine` | Поведение |
|----------|-----------|
| не указан | Solr, затем fallback на legacy, если Solr пуст |
| `"solr"` | Только Solr (без fallback) — для проверки индексации |
| `"legacy"` | Поиск только по имени/заголовку страницы |

## Синтаксис поиска

Движок Solr (по умолчанию) поддерживает:

- отдельные термины — полнотекстовый поиск по заголовку (с бустом) + содержимому
- `"точная фраза"` — поиск фразы
- `title:foo` / `name:bar` — ограничение по полю
- `AND`, `OR`, `NOT` — булевы операторы
- `wiki` в вызове — одна виртуальная вики (напр. `mywiki`)
- `space` в вызове — одно дерево разделов

Если Solr не проиндексирован на вашем инстансе, не указывайте `engine` — поиск автоматически переключится на legacy (заголовок/имя). Передайте `engine: "legacy"`, чтобы пропустить Solr, или `engine: "solr"` для Solr без fallback.

## Проверка индекса Solr

**Через MCP:** вызовите `wiki_status` (быстрые счётчики по вики) или `wiki_status({ wiki: "mywiki", quick: false })` для точного числа.

**Через CLI:** Python-скрипт (только stdlib):

```bash
# те же env vars, что и у xwiki-mcp
export XWIKI_BASE_URL=https://wiki.example.com
export XWIKI_USERNAME=...
export XWIKI_PASSWORD=...

npm run check-solr
# или
python scripts/check_solr_index.py
```

Загрузка учётных данных из Cursor `mcp.json` вместо env:

```bash
python scripts/check_solr_index.py --mcp-json ~/.cursor/mcp.json --server xwiki
```

Опции:

| Флаг | Описание |
|------|----------|
| `--probes` | Дополнительно smoke-test `title:*` и `text:*` по каждой вики (медленнее) |
| `--insecure` | Не проверять TLS-сертификат |

Пример вывода:

```
wiki              indexed   status    note
----------------- --------- --------- -----------------------------
wiki1             806       ok
wiki2             113       ok
xwiki             340       ok

Summary: 20/20 wikis have Solr documents
Sum of per-wiki indexed docs: 5195
```

`indexed=0` означает, что у вики нет документов в Solr (не проиндексирована или вне области Solr). Сравните счётчики с **Администрирование → Поиск → Solr** в XWiki.

## Разработка

```bash
npm run dev    # tsx, без сборки
npm run build  # компиляция в dist/
npm test       # vitest
npm run check-solr  # число документов Solr по вики (Python 3)
```

## Лицензия

MIT
