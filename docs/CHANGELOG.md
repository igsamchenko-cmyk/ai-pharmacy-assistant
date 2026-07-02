# Журнал змін

Формат наближений до [Keep a Changelog](https://keepachangelog.com/uk/).
Проєкт поки без версійних релізів; зміни групуються у розділі «Не випущено».

## [Не випущено]

### Додано (v0.3 — Якість даних та база знань)

- **Провенанс** (`artifacts/api-server/src/knowledge/provenance`): єдиний реєстр
  джерел (`SOURCES`) і детермінований `provenanceForNameKind`; кожен запис
  словника тепер має провенанс (`sourceKey` + `evidenceLevel`).
- **Метадані правил взаємодій**: `origin` (`curated`/`generated`), `sourceKey`,
  `evidence` та за потреби `mechanism`; генератор класів проставляє їх автоматично.
- **Перевірка якості** (`knowledge/validation`): чиста `validateKnowledge` →
  `QualityReport` (лічильники, покриття провенансом, помилки/попередження) плюс
  інжектована `runQualityChecks`.
- **Пайплайн імпорту** (`knowledge/import/pipeline.ts`): детермінований
  `buildKnowledgeSnapshot` (дедуплікація речовин за МНН), `runImportPipeline`
  та DB-незалежні лоадери (`DryRunLoader`, `PostgresLoader`).
- **Нормалізована схема БЗ** (`lib/db/src/schema/knowledge.ts`): 5 таблиць
  (`sources`, `ingredients`, `ingredient_names`, `atc_codes`, `interaction_rules`)
  з натуральними ключами та drizzle-zod insert-схемами.
- **Ендпоінти**: `GET /api/knowledge/quality`, `GET /api/knowledge/sources`.
- **Скрипти**: `validate:knowledge` (CI-гейт, exit 1 на помилках) і
  `seed:knowledge` (ідемпотентний upsert у Postgres).
- **Фронтенд**: внутрішня панель «Якість даних» (`/data-quality`) з навігацією.
- **Документи**: `DATA_QUALITY.md`, `IMPORT_GUIDE.md`.
- Розширене покриття тестами (провенанс, валідація, пайплайн імпорту, метадані
  взаємодій) — 122 тести.

### Додано

- **Knowledge Engine** (`artifacts/api-server/src/knowledge`): словник МНН
  (UA/латина/англ., 130 діючих речовин, 700+ мапувань назв), ATC-класифікація,
  багатоетапний пошук (cache → dictionary → catalog → RxNorm → openFDA → AI) з
  TTL-кешем, порівняння препаратів поруч, а також абстракції `barcode`/`import`.
- Ендпоінти: `GET /api/knowledge/search`, `/knowledge/normalize`,
  `/knowledge/stats`, `GET /api/atc/{code}`, `POST /api/compare`.
- Клас-клас правила взаємодій (генератор `cross()`, `interactionRules.generated.ts`)
  поверх курованого базового набору; дедуплікація «базові — перші».
- Фронтенд: сторінки «Порівняння» (`/compare`) і «Швидкий режим» (`/hospital`),
  обране та нещодавно переглянуті (localStorage), badge-компоненти ризику/групи.
- Спільні модулі бекенду: `lib/openai.ts` (клієнт OpenAI, `hasAiKey`,
  `OPENAI_MODEL`) і `lib/text.ts` (`normalize`).
- `drugService.findDrugsInText` для виявлення препаратів у вільному тексті (OCR).
- Zod-валідація JSON-відповіді моделі в `aiService` (`aiResponseSchema`).
- Спільні компоненти фронтенду: `ErrorBoundary` та `DrugSearchSelect`.
- Індекси `createdAt` і `type` у таблиці `history`; тип `HistoryType`.
- Документи: `ROADMAP.md`, `TODO.md`, `CHANGELOG.md`.
- Розширене покриття тестами (`findDrugsInText`, варіанти пошуку, `normalize`).

### Змінено

- `drugService` перебудовано на індекс `byId` (Map) і відсортований за назвою
  каталог; `searchDrugs` приймає поле як рядок без небезпечного приведення типів.
- `ocrService` і `aiService` використовують спільний клієнт OpenAI.
- `app.ts`: узгоджений JSON-404 для `/api` та централізований обробник помилок.
- Покращено системний промпт AI та подвійне блокування лікувальних запитів.
- Покращено стани помилок/доступності (aria-мітки, `isError`) на сторінках.

### Вилучено

- Невикористані компоненти shadcn/ui (~43 файли) та повʼязані npm-залежності.

### Безпека

- Перевірено відсутність секретів у коді; ключ OpenAI лишається опційним, і
  застосунок коректно працює без нього (graceful fallback).
