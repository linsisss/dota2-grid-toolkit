<p align="center">
  <a href="https://gridstudio.me/editor">
    <img src="assets/design/editor-landing-reference.png" alt="GridStudio — редактор героев и ASCII-арта на одном холсте" width="1200" />
  </a>
</p>

<h1 align="center">GridStudio</h1>

<p align="center">Своя сетка героев Dota 2: герои, рисунки и ASCII на одном холсте.</p>

<p align="center">
  <a href="https://gridstudio.me/editor?new=1"><strong>Создать сетку</strong></a> ·
  <a href="https://gridstudio.me/catalog">Каталог сеток</a> ·
  <a href="#самостоятельный-запуск">Self-hosting</a>
</p>

## Для пользователей

**[GridStudio](https://gridstudio.me)** — сайт, на котором можно создать свою сетку героев, используя встроенные инструменты и своё воображение. Устанавливать редактор и регистрироваться не нужно.

- **Расставляй героев.** Создавай группы, меняй размер портретов и их порядок перетаскиванием. Поиск и фильтры по атрибутам помогают собрать свой пул.
- **Рисуй символами.** Кисти, фигуры, рамки, текст, слои и подложка для обводки. Можно превратить картинку в ASCII и настроить результат перед добавлением.
- **Продолжай старые сетки.** Импортируй один или несколько JSON, объединяй их и переключай сетки внутри файла. Один файл — отдельное рабочее пространство.
- **Возвращайся к работе.** Изменения сохраняются в браузере; по нажатию на «Изменения сохранены» открываются резервные версии. Вход через Telegram добавляет синхронизацию файлов с аккаунтом.
- **Делись работами.** Публикуй выбранную сетку в каталоге после проверки, скачивай чужие или открывай их в редакторе. Публикация доступна без входа; для лайков и изменения опубликованных работ нужен Telegram.

### Из редактора в Dota 2

Создай сетку или импортируй свой файл. Когда закончишь, нажми **«Экспортировать» → «Скачать файл для DOTA»**.

| Что скачать | Для чего |
| --- | --- |
| `hero_grid_config.json` | Готовый файл для игры со всеми сетками текущего рабочего пространства. |
| `*.gridstudio.json` | Проект для дальнейшего редактирования: объекты, слои, подложки и сетки. Кнопка «Сохранить JSON проекта». |

<details>
<summary><strong>Куда положить файл в игре</strong></summary>

1. Закрой Dota 2 и сохрани копию своего прежнего `hero_grid_config.json`.
2. Открой папку:

   ```text
   C:\Program Files (x86)\Steam\userdata\ID АККАУНТА\570\remote\cfg
   ```

   **ID АККАУНТА** — ID из Dota 2 или код друга в Steam. В окне экспорта можно вставить ссылку на Steam-профиль и получить готовый путь. Если Steam установлен в другом месте, замени начало пути.
3. Помести скачанный `hero_grid_config.json` в эту папку, запусти игру и выбери сетку в разделе героев.

Чтобы не потерять другие игровые сетки, сначала импортируй существующий файл и добавь новую сетку к нему.

</details>

> Сохраняй JSON проекта перед очисткой данных браузера или сменой устройства. Игровой шрифт может отображать некоторые символы иначе; большое число категорий влияет на производительность Dota 2.

## Самостоятельный запуск

**Node.js 22.19+**, npm и Git. Интерфейс — React + Vite; каталог и аккаунты — Node.js + SQLite; вход и модерация — Telegram-бот на puregram. ALTCHA работает на своём сервере, без ключей сторонней CAPTCHA.

### Локально

```sh
git clone https://github.com/linsisss/dota2-grid-toolkit.git
cd dota2-grid-toolkit
npm ci
npm run catalog:setup
npm run dev
```

Открой **[127.0.0.1:4173](http://127.0.0.1:4173)**. Команда запускает интерфейс и API. `catalog:setup` создаёт `.env.catalog.local` с локальными настройками и случайным секретом; существующий файл не перезаписывается. Telegram-бот запускается отдельно, когда он настроен.

### На своём сервере

1. Установи зависимости через `npm ci`. Настрой `.env.catalog.local` по примеру ниже. Замени домен, бота, чат и топик своими значениями:

   ```dotenv
   CATALOG_ORIGIN=https://grid.example.com
   CATALOG_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
   CATALOG_DB=/var/lib/gridstudio/catalog.sqlite
   CATALOG_TRUST_PROXY=loopback
   CATALOG_WEB_MODERATION=0
   CATALOG_TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
   CATALOG_TELEGRAM_BOT_USERNAME=your_grid_bot
   CATALOG_TELEGRAM_CHAT_ID=-1001234567890
   CATALOG_TELEGRAM_TOPIC_ID=2
   ```

   Секрет можно создать командой `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Убери `CATALOG_DEV=1`, если файл был создан для локальной разработки. API и бот должны использовать одну базу и одинаковые настройки.

2. Выполни `npm run build`. Настрой HTTPS и веб-сервер: каталог `dist/` — корень сайта, `/editor` отдаёт `editor.html`, `/catalog` — `catalog.html`, `/api/catalog/` проксируется на `http://127.0.0.1:4174` с сохранением полного пути.

3. Запусти **два постоянных процесса** из корня проекта через systemd или другой менеджер:

   ```sh
   npm run catalog:serve
   npm run catalog:bot
   ```

   Это отдельные процессы: первый обслуживает API, второй — вход и очередь модерации. Боту нужны права администратора в Telegram-форуме. Решение о публикации может принять любой участник этого чата. Один токен — один polling-процесс.

4. Храни SQLite вне `dist/` и сменяемых папок релизов, предоставь процессам право записи в её каталог. Сохрани на сервере исходники `server/`, `scripts/`, `assets/`, зависимости и `package.json`: одного `dist/` для API и бота недостаточно. Настрой резервное копирование базы и сохраняй `CATALOG_SECRET` при обновлениях.

<details>
<summary><strong>Маршруты для Nginx</strong></summary>

Добавь в HTTPS-блок `server` своего домена. Пути и TLS-сертификат зависят от твоей установки.

```nginx
root /srv/gridstudio/dist;
index index.html;

# JSON сеток сжимается в 15–20 раз, сборка JS/CSS — в 3–5.
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_min_length 1024;
gzip_types application/json application/javascript text/css image/svg+xml;

location = /editor { try_files /editor.html =404; }
location = /catalog { try_files /catalog.html =404; }
location = /editor/ { return 308 /editor$is_args$args; }
location = /catalog/ { return 308 /catalog$is_args$args; }

location /api/catalog/ {
    client_max_body_size 9m;
    proxy_pass http://127.0.0.1:4174;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    try_files $uri $uri/ =404;
    add_header Cache-Control "no-cache";
}
```

Лимит 9 МБ нужен для личных файлов; API отдельно ограничивает размер публичных заявок. Не добавляй `Cache-Control` в `location /api/catalog/`: API сам запрещает кэш, кроме неизменяемых сеток каталога. `CATALOG_TRUST_PROXY=loopback` используй только с локальным proxy, который перезаписывает `X-Forwarded-For`, как в примере.

</details>

Секреты и базу не помещай в web root или Git. Подробности: [каталог и модерация](docs/catalog.md), [аккаунты и файлы](docs/accounts-workspaces.md), [сохранения и восстановление](docs/project-storage.md).

**Только редактор:** `dist/` можно разместить на статическом хостинге; без API не будут работать каталог, вход и синхронизация. В этом репозитории GitHub Pages отведён под [страницу перехода на gridstudio.me](github-pages/index.html). Workflow `Deploy GitHub Pages` публикует только её, по ручному запуску.

### Работа с кодом

```sh
npm run check
npm test
```

[Архитектура](docs/architecture.md) · [Импорт и экспорт](docs/import-and-export.md) · [История изменений](CHANGELOG.md) · [Порядок выпуска](docs/releases.md)

---

Авторы: **[@linsissya](https://t.me/linsissya)** & **[@dissonance](https://t.me/dissonance)**. Проект вырос из [Dota 2 Grid Toolkit](https://github.com/linsisss/dota2-grid-toolkit); прежние инструменты сохранены в [`tools/`](tools/).

Код — [MIT](LICENSE). Ресурсы и шрифты Dota 2 принадлежат своим правообладателям и не входят в эту лицензию: [источники ресурсов](assets/ATTRIBUTION.md). GridStudio — проект сообщества, не официальный продукт Valve.
