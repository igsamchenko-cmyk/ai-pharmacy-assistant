# Архітектура

## Огляд

AI Pharmacy Assistant — це монорепозиторій pnpm з двома застосунками (artifacts) і
кількома бібліотеками (lib), що поєднані контрактом OpenAPI.

```
Браузер (React + Vite, UA)
        │  HTTP (через спільний проксі /  та /api)
        ▼
Express API (artifacts/api-server)
        │
        ├── knowledge/ ── словник МНН + ATC + багатоетапний пошук + порівняння
        ├── services/ ── data/  (каталог препаратів + правила взаємодій)
        ├── services/aiService ── OpenAI (ключ користувача) | fallback
        ├── services/ocrService ── OpenAI Vision (ключ користувача) | ручне введення
        └── services/historyService ── Drizzle ── PostgreSQL (таблиця history)
```

## Контракт-перший підхід

Джерело істини — `lib/api-spec/openapi.yaml`. Із нього через Orval генеруються:

- `lib/api-zod` — Zod-схеми для валідації запитів і відповідей на сервері.
- `lib/api-client-react` — типобезпечні React Query хуки для фронтенду.

Перегенерація: `pnpm --filter @workspace/api-spec run codegen`. Назву `info.title`
змінювати не можна — від неї залежать шляхи згенерованих файлів.

## Фронтенд (`artifacts/pharmacy`)

- Маршрутизація — `wouter`, базовий шлях береться з `import.meta.env.BASE_URL`.
- Дані — лише через згенеровані хуки (`useSearchDrugs`, `useGetDrug`,
  `useGetDrugAnalogs`, `useCheckInteractions`, `useCreateAiSummary`,
  `useScanPackage`, `useListHistory`, тощо). Сирих `fetch` немає.
- UI — shadcn/ui + Tailwind, тема clinical teal зі світлим/темним режимом.
- Компонент `Disclaimer` несе обовʼязковий текст застереження і використовується
  на головній, сторінках взаємодій, AI-довідки та інших.

Сторінки: `home`, `search`, `drug-detail`, `analogs`, `interactions`,
`ai-reference`, `scan`, `history`, `about`.

## Бекенд (`artifacts/api-server`)

Тонкі роутери (`src/routes`) валідують вхід/вихід Zod-схемами і делегують логіку
сервісам (`src/services`):

| Сервіс               | Відповідальність                                                     |
| -------------------- | -------------------------------------------------------------------- |
| `drugService`        | пошук, отримання за id, статистика над демо-каталогом                |
| `analogService`      | повні / часткові / терапевтичні аналоги                              |
| `interactionService` | попарна перевірка взаємодій, сортування за ризиком                   |
| `aiService`          | AI-довідка (OpenAI) з fallback і блокуванням лікувальних запитів     |
| `ocrService`         | розпізнавання тексту з фото (Vision) з ручним fallback               |
| `historyService`     | CRUD історії у PostgreSQL                                            |
| `safety`             | спільні константи безпеки та евристика виявлення лікувальних запитів |

Спільні утиліти бекенду винесено в `src/lib`: `openai.ts` (єдиний клієнт OpenAI,
`hasAiKey`, `OPENAI_MODEL`) і `text.ts` (`normalize`) — їх повторно використовують
`aiService`, `ocrService` та пошук/аналоги/взаємодії.

## Knowledge Engine (`artifacts/api-server/src/knowledge`)

Довідкове ядро, що надбудовується над каталогом і не змінює наявних сервісів.
Єдина точка входу — `knowledge/index.ts` (фасад + `getKnowledgeEngineStats`).
Складається з незалежних модулів:

| Модуль        | Відповідальність                                                            |
| ------------- | -------------------------------------------------------------------------- |
| `dictionary`  | нормалізація назв → канонічна діюча речовина (UA/латина/англ.), 130 МНН     |
| `atc`         | ATC-код → анатомічна / терапевтична класифікація (найдовший префікс)        |
| `search`      | багатоетапний пошук: cache → dictionary → catalog → RxNorm → openFDA → AI   |
| `compare`     | порівняння препаратів поруч + попарна перевірка взаємодій                   |
| `barcode`     | абстракція резолвера GTIN (підключається; за замовч. «unconfigured»)        |
| `import`      | абстракція імпортера каталогу (підключається; за замовч. «unconfigured»)    |

Кожен етап деградує безпечно: відсутній ключ OpenAI чи збій зовнішнього
провайдера ніколи не кидає виняток — результат просто повідомляє, що вдалося
розвʼязати (`resolvedStage`, `suggestAi`). `search` кешує відповіді у памʼяті
(`TtlCache`, 5 хв) з окремими ключами для режиму `skipExternal`.

Ендпоінти: `GET /api/knowledge/search`, `GET /api/knowledge/normalize`,
`GET /api/knowledge/stats`, `GET /api/atc/{code}`, `POST /api/compare`.

### Дані

- **Каталог препаратів** і **правила взаємодій** — статичні TypeScript-модулі у
  `src/data`. Вони є джерелом для сервісів і роблять бізнес-логіку чистою та легко
  тестованою без БД.
- **Правила взаємодій** поєднують курований базовий набір (`baseInteractionRules`)
  та згенеровані клас-клас правила (`interactionRules.generated.ts`, генератор
  `cross()`). Експортований `interactionRules` дедуплікує їх «базові — перші», тож
  курований запис завжди має пріоритет над згенерованим для тієї ж пари.
- **Історія** зберігається у PostgreSQL через Drizzle (`lib/db`, таблиця
  `history`). Дати серіалізуються у ISO-рядок, щоб відповідати контракту.

## AI та режим без ключа

`aiService` і `ocrService` створюють клієнт OpenAI на основі `OPENAI_API_KEY`
користувача. Якщо ключ відсутній або виклик не вдався, сервіси повертають
коректну резервну відповідь (`isFallback` / `ocrAvailable: false`) — застосунок
ніколи не падає через відсутність ключа.

## Маршрутизація сервісів

Глобальний проксі маршрутизує за шляхами з `.replit-artifact/artifact.toml`:
фронтенд на `/`, API на `/api`. Шляхи не переписуються — сервер сам обробляє повний
шлях `/api/...`.

## Тестування

Vitest (`src/services/__tests__`, `src/lib/__tests__`, `src/knowledge/__tests__`)
перевіряє пошук, виявлення препаратів у тексті, аналоги, взаємодії, шар безпеки,
утиліти, а також Knowledge Engine: словник МНН, ATC-класифікацію, TTL-кеш,
багатоетапний пошук (у режимі `skipExternal`) і порівняння препаратів. Тести
працюють над статичними даними, тож не потребують БД чи мережі.
