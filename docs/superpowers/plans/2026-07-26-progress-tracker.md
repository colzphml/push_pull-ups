# Трекер выполнения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать возможность отмечать выполнение упражнений прямо на странице недели, с автоматической доставкой факта в репозиторий и далее в `exercise_log`.

**Architecture:** Чистые функции логики (ключи, слияние, статистика, парсинг разметки) вынесены в модули без зависимостей от DOM и сети — они покрыты тестами через встроенный `node --test`. Поверх них DOM-слой инжектит контролы в существующую разметку и синхронизирует изменения с GitHub Contents API. Разметка недель не меняется: всё нужное (дата, блок, упражнение, план) извлекается из уже существующих классов.

**Tech Stack:** Ванильный ES-модуль в браузере, без сборки и без npm-зависимостей. Тесты — встроенный `node --test` (Node v26.5.0). Хранилище — GitHub Contents API + `localStorage` как буфер.

**Спека:** `docs/superpowers/specs/2026-07-26-progress-tracker-design.md`

## Global Constraints

- **Никаких npm-зависимостей.** Проект — статика на GitHub Pages без сборки. Единственный допустимый `package.json` — с `{"type": "module"}` для запуска тестов.
- **Репозиторий:** `colzphml/push_pull-ups`, ветка `main`.
- **Базовый путь на Pages:** `/push_pull-ups/` — все абсолютные пути в `sw.js` начинаются с него.
- **Кириллица в данных обязательна.** `btoa()` на кириллице бросает исключение — везде использовать конверсию через `TextEncoder`/`TextDecoder`.
- **Разметку существующих недель не менять**, кроме добавления одной строки `<script>`.
- **Токен никогда не попадает в git** и не логируется в консоль.
- **Заметки пользователя рендерить через `textContent`**, никогда через `innerHTML`.
- **Колонка `window` в SQLite — зарезервированное слово**, в запросах экранировать двойными кавычками: `"window"`.
- Все пользовательские строки в интерфейсе — на русском языке.

---

### Task 1: Ядро логики — ключи, слияние, статистика

**Files:**
- Create: `package.json`
- Create: `assets/tracker-core.js`
- Test: `tests/tracker-core.test.js`

**Interfaces:**
- Consumes: ничего (первая задача)
- Produces:
  - `entryKey(entry) -> string` — `"2026-07-27|pull|вис на перекладине"`
  - `mergeEntries(remote: Entry[], local: Entry[]) -> Entry[]` — слияние по ключу, побеждает больший `updated_at`
  - `pendingEntries(entries: Entry[], syncedAt: string|null) -> Entry[]` — записи новее последней синхронизации
  - `sameEntries(a: Entry[], b: Entry[]) -> boolean` — совпадают ли наборы по содержимому, порядок не важен
  - `weekStats(entries: Entry[], dates: string[]) -> {hitDays: number, totalDays: number, coldFinishes: number}`
  - Тип `Entry` — объект с полями `date, window, block, exercise, planned, done, actual, felt, note, updated_at, device`

- [ ] **Step 1: Создать `package.json`**

Нужен только для того, чтобы Node считал файлы `.js` ES-модулями. Никаких зависимостей.

```json
{
  "name": "push-pull-ups",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

- [ ] **Step 2: Написать падающие тесты**

Создать `tests/tracker-core.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryKey, mergeEntries, pendingEntries, sameEntries, weekStats } from '../assets/tracker-core.js';

const base = {
  date: '2026-07-27', window: 'утро', block: 'pull',
  exercise: 'вис на перекладине', planned: '3 × 20-25 сек',
  done: 1, actual: '3 × 20 сек', felt: 'норм', note: '',
  updated_at: '2026-07-27T08:00:00.000Z', device: 'phone',
};

test('entryKey собирает ключ из даты, блока и упражнения', () => {
  assert.equal(entryKey(base), '2026-07-27|pull|вис на перекладине');
});

test('entryKey нечувствителен к регистру и лишним пробелам в названии', () => {
  assert.equal(entryKey({ ...base, exercise: '  Вис На Перекладине ' }), '2026-07-27|pull|вис на перекладине');
});

test('mergeEntries добавляет записи, которых нет на той стороне', () => {
  const remote = [base];
  const local = [{ ...base, date: '2026-07-28' }];
  const merged = mergeEntries(remote, local);
  assert.equal(merged.length, 2);
});

test('mergeEntries при конфликте оставляет запись с более поздним updated_at', () => {
  const older = { ...base, note: 'старое', updated_at: '2026-07-27T08:00:00.000Z' };
  const newer = { ...base, note: 'новое', updated_at: '2026-07-27T09:00:00.000Z' };
  assert.equal(mergeEntries([older], [newer])[0].note, 'новое');
  assert.equal(mergeEntries([newer], [older])[0].note, 'новое');
});

test('mergeEntries не мутирует входные массивы', () => {
  const remote = [base];
  const local = [{ ...base, updated_at: '2026-07-27T09:00:00.000Z' }];
  mergeEntries(remote, local);
  assert.equal(remote.length, 1);
  assert.equal(remote[0].updated_at, '2026-07-27T08:00:00.000Z');
});

test('mergeEntries сортирует результат по дате', () => {
  const merged = mergeEntries([{ ...base, date: '2026-07-30' }], [{ ...base, date: '2026-07-28' }]);
  assert.deepEqual(merged.map(e => e.date), ['2026-07-28', '2026-07-30']);
});

test('pendingEntries возвращает всё, если синхронизации ещё не было', () => {
  assert.equal(pendingEntries([base], null).length, 1);
});

test('pendingEntries отбрасывает записи старее последней синхронизации', () => {
  const synced = '2026-07-27T08:30:00.000Z';
  const fresh = { ...base, date: '2026-07-28', updated_at: '2026-07-27T09:00:00.000Z' };
  const result = pendingEntries([base, fresh], synced);
  assert.deepEqual(result.map(e => e.date), ['2026-07-28']);
});

test('sameEntries видит одинаковые наборы независимо от порядка', () => {
  const other = { ...base, date: '2026-07-28' };
  assert.equal(sameEntries([base, other], [other, base]), true);
});

test('sameEntries различает наборы разной длины', () => {
  assert.equal(sameEntries([base], [base, { ...base, date: '2026-07-28' }]), false);
});

test('sameEntries замечает правку записи по updated_at', () => {
  const edited = { ...base, note: 'правка', updated_at: '2026-07-27T09:00:00.000Z' };
  assert.equal(sameEntries([base], [edited]), false);
});

test('sameEntries считает два пустых набора одинаковыми', () => {
  assert.equal(sameEntries([], []), true);
});

test('weekStats считает день попаданием при любом done=1 в push/pull/mob', () => {
  const dates = ['2026-07-27', '2026-07-28'];
  const entries = [
    { ...base, date: '2026-07-27', block: 'mob', done: 1 },
    { ...base, date: '2026-07-28', block: 'pull', done: 0 },
  ];
  const stats = weekStats(entries, dates);
  assert.equal(stats.hitDays, 1);
  assert.equal(stats.totalDays, 2);
});

test('weekStats не считает попаданием день, где сделана только закалка', () => {
  const entries = [{ ...base, block: 'cold', done: 1 }];
  assert.equal(weekStats(entries, ['2026-07-27']).hitDays, 0);
});

test('weekStats считает финиши закалки отдельным счётчиком', () => {
  const entries = [
    { ...base, date: '2026-07-27', block: 'cold', done: 1 },
    { ...base, date: '2026-07-28', block: 'cold', done: 1 },
    { ...base, date: '2026-07-29', block: 'cold', done: 0 },
  ];
  assert.equal(weekStats(entries, ['2026-07-27', '2026-07-28', '2026-07-29']).coldFinishes, 2);
});

test('weekStats на пустом логе возвращает нули', () => {
  const stats = weekStats([], ['2026-07-27']);
  assert.deepEqual(stats, { hitDays: 0, totalDays: 1, coldFinishes: 0 });
});

test('weekStats игнорирует записи с датами вне запрошенной недели', () => {
  const entries = [
    { ...base, date: '2099-01-01', block: 'pull', done: 1 },
    { ...base, date: '2099-01-01', block: 'cold', done: 1 },
  ];
  assert.deepEqual(weekStats(entries, ['2026-07-27']), { hitDays: 0, totalDays: 1, coldFinishes: 0 });
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `node --test tests/*.test.js`
Expected: FAIL — `Cannot find module '.../assets/tracker-core.js'`

- [ ] **Step 4: Реализовать `assets/tracker-core.js`**

```js
// Чистая логика лога тренировок: ключи, слияние, статистика.
// Никакого DOM, никакой сети, никакого localStorage — только данные.

/** Блоки, попадание в которые засчитывается как «день состоялся». */
const HIT_BLOCKS = new Set(['push', 'pull', 'mob']);

/** Ключ записи: дата + блок + упражнение. Название нормализуем — оно приходит из разметки. */
export function entryKey(entry) {
  const exercise = String(entry.exercise || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${entry.date}|${entry.block}|${exercise}`;
}

/** Слияние двух наборов записей. При совпадении ключа побеждает больший updated_at. */
export function mergeEntries(remote, local) {
  const byKey = new Map();
  for (const entry of [...remote, ...local]) {
    const key = entryKey(entry);
    const existing = byKey.get(key);
    if (!existing || String(entry.updated_at) > String(existing.updated_at)) {
      byKey.set(key, { ...entry });
    }
  }
  return [...byKey.values()].sort(
    (a, b) => (a.date === b.date ? entryKey(a).localeCompare(entryKey(b)) : a.date.localeCompare(b.date))
  );
}

/** Записи, изменённые после последней успешной синхронизации. */
export function pendingEntries(entries, syncedAt) {
  if (!syncedAt) return [...entries];
  return entries.filter(e => String(e.updated_at) > String(syncedAt));
}

/**
 * Совпадают ли два набора записей по содержимому. Порядок не важен.
 * Достаточно ключа и updated_at: любая правка записи двигает updated_at.
 */
export function sameEntries(a, b) {
  if (a.length !== b.length) return false;
  const stamps = list => list.map(e => `${entryKey(e)}@${e.updated_at}`).sort();
  const left = stamps(a);
  const right = stamps(b);
  return left.every((value, index) => value === right[index]);
}

/** Статистика недели: попадаемость по дням и отдельный счётчик финишей закалки. */
export function weekStats(entries, dates) {
  const weekDates = new Set(dates);
  const hitDates = new Set();
  let coldFinishes = 0;
  for (const entry of entries) {
    // Обе метрики считаем строго по запрошенной неделе, иначе они разъезжаются.
    if (entry.done !== 1 || !weekDates.has(entry.date)) continue;
    if (entry.block === 'cold') coldFinishes += 1;
    else if (HIT_BLOCKS.has(entry.block)) hitDates.add(entry.date);
  }
  return {
    hitDays: hitDates.size,
    totalDays: dates.length,
    coldFinishes,
  };
}
```

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `node --test tests/*.test.js`
Expected: PASS, 17 тестов

- [ ] **Step 6: Коммит**

```bash
git add package.json assets/tracker-core.js tests/tracker-core.test.js
git commit -m "Трекер: ядро логики лога (ключи, слияние, статистика) + тесты"
```

---

### Task 2: Разбор разметки недели

**Files:**
- Create: `assets/tracker-parse.js`
- Test: `tests/tracker-parse.test.js`

**Interfaces:**
- Consumes: ничего из Task 1
- Produces:
  - `blockFromDotClass(className: string) -> string|null` — `"meal-type-dot dot-pull"` → `"pull"`
  - `windowFromMealType(text: string) -> string` — `"Утро · Йога"` → `"утро"`
  - `isTrackable(block: string) -> boolean` — `rest` и неизвестные блоки не отмечаются

**Почему отдельный модуль:** это единственное место, которое знает про соглашения разметки недель. Если эталон изменится, чинить надо здесь и только здесь.

- [ ] **Step 1: Написать падающие тесты**

Создать `tests/tracker-parse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockFromDotClass, windowFromMealType, isTrackable } from '../assets/tracker-parse.js';

test('blockFromDotClass достаёт блок из класса точки', () => {
  assert.equal(blockFromDotClass('meal-type-dot dot-pull'), 'pull');
  assert.equal(blockFromDotClass('meal-type-dot dot-push'), 'push');
  assert.equal(blockFromDotClass('meal-type-dot dot-mob'), 'mob');
  assert.equal(blockFromDotClass('meal-type-dot dot-cold'), 'cold');
  assert.equal(blockFromDotClass('meal-type-dot dot-rest'), 'rest');
});

test('blockFromDotClass возвращает null, когда точки нет', () => {
  assert.equal(blockFromDotClass('meal-type-dot'), null);
  assert.equal(blockFromDotClass(''), null);
});

test('windowFromMealType берёт часть до разделителя и приводит к нижнему регистру', () => {
  assert.equal(windowFromMealType('Утро · Йога'), 'утро');
  assert.equal(windowFromMealType('День · Отжимания'), 'день');
});

test('windowFromMealType нормализует «Душ дня» в «душ» — так пишется в базе', () => {
  assert.equal(windowFromMealType('Душ дня · Закалка'), 'душ');
  assert.equal(windowFromMealType('Душ · Закалка'), 'душ');
});

test('windowFromMealType сохраняет описательные окна как есть', () => {
  assert.equal(windowFromMealType('Сразу после йоги · Подтягивания'), 'сразу после йоги');
});

test('windowFromMealType переживает отсутствие разделителя', () => {
  assert.equal(windowFromMealType('Вечер'), 'вечер');
  assert.equal(windowFromMealType(''), '');
});

test('windowFromMealType отбрасывает текст бейджей, приклеенный без пробела', () => {
  assert.equal(windowFromMealType('Утро · Йогаякорь'), 'утро');
});

test('isTrackable отсеивает отдых и неизвестные блоки', () => {
  assert.equal(isTrackable('pull'), true);
  assert.equal(isTrackable('cold'), true);
  assert.equal(isTrackable('rest'), false);
  assert.equal(isTrackable(null), false);
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `node --test tests/tracker-parse.test.js`
Expected: FAIL — `Cannot find module '.../assets/tracker-parse.js'`

- [ ] **Step 3: Реализовать `assets/tracker-parse.js`**

```js
// Разбор соглашений разметки недели. Единственное место, знающее про её классы.

const TRACKABLE = new Set(['push', 'pull', 'mob', 'cold']);

/** Нормализация окна к тем значениям, что лежат в exercise_log. */
const WINDOW_ALIASES = new Map([
  ['душ дня', 'душ'],
  ['душ вечера', 'душ'],
]);

/** "meal-type-dot dot-pull" -> "pull" */
export function blockFromDotClass(className) {
  const match = /\bdot-([a-z]+)\b/.exec(String(className || ''));
  return match ? match[1] : null;
}

/** "Утро · Йога" -> "утро". Бейджи склеиваются с текстом без пробела — отрезаем по разделителю. */
export function windowFromMealType(text) {
  const raw = String(text || '').split('·')[0].trim().toLowerCase();
  return WINDOW_ALIASES.get(raw) || raw;
}

export function isTrackable(block) {
  return TRACKABLE.has(block);
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `node --test tests/*.test.js`
Expected: PASS, 25 тестов суммарно

- [ ] **Step 5: Коммит**

```bash
git add assets/tracker-parse.js tests/tracker-parse.test.js
git commit -m "Трекер: разбор разметки недели (блок, окно, отслеживаемость)"
```

---

### Task 3: Клиент GitHub Contents API

**Files:**
- Create: `assets/tracker-github.js`
- Test: `tests/tracker-github.test.js`

**Interfaces:**
- Consumes: `mergeEntries` из `assets/tracker-core.js`
- Produces:
  - `toBase64(str: string) -> string` / `fromBase64(b64: string) -> string` — с поддержкой кириллицы
  - `readFile(fetchFn, token, path) -> {text: string, sha: string} | null` — `null` при 404
  - `writeFile(fetchFn, token, path, text, sha, message) -> {sha: string}` — бросает `ConflictError` при 409/422
  - `pullWeek({fetchFn, token, path}) -> Entry[]` — только чтение удалённого лога, без записи
  - `syncWeek({fetchFn, token, path, weekStart, localEntries, message}) -> Entry[]` — read-modify-write с тремя попытками
  - Класс `ConflictError extends Error` со `name === 'ConflictError'`
  - Класс `AuthError extends Error` со `name === 'AuthError'` — при 401/403

**Критично:** `btoa('вис')` бросает `InvalidCharacterError`. Кириллица обязана проходить через `TextEncoder`. Это главная ловушка задачи.

- [ ] **Step 1: Написать падающие тесты**

Создать `tests/tracker-github.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toBase64, fromBase64, readFile, writeFile, pullWeek, syncWeek, ConflictError, AuthError,
} from '../assets/tracker-github.js';

/** Фейковый fetch: отдаёт ответы из очереди и записывает полученные запросы. */
function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, options = {}) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (!next) throw new Error('лишний запрос к fetch');
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    };
  };
  fn.calls = calls;
  return fn;
}

const entry = {
  date: '2026-07-27', window: 'утро', block: 'pull', exercise: 'вис на перекладине',
  planned: '3 × 20-25 сек', done: 1, actual: '', felt: 'норм', note: '',
  updated_at: '2026-07-27T08:00:00.000Z', device: 'phone',
};

test('base64 переживает кириллицу в обе стороны', () => {
  const text = 'вис на перекладине — 3 × 20 сек';
  assert.equal(fromBase64(toBase64(text)), text);
});

test('fromBase64 терпит переносы строк, которые вставляет GitHub', () => {
  const encoded = toBase64('вис');
  assert.equal(fromBase64(encoded.slice(0, 2) + '\n' + encoded.slice(2)), 'вис');
});

test('readFile возвращает текст и sha', async () => {
  const fetchFn = fakeFetch([{ status: 200, body: { content: toBase64('{"a":1}'), sha: 'abc' } }]);
  const result = await readFile(fetchFn, 'tok', 'history/log/2026-07-27.json');
  assert.deepEqual(result, { text: '{"a":1}', sha: 'abc' });
});

test('readFile шлёт токен и версию API в заголовках', async () => {
  const fetchFn = fakeFetch([{ status: 200, body: { content: toBase64('{}'), sha: 's' } }]);
  await readFile(fetchFn, 'tok', 'history/log/x.json');
  const headers = fetchFn.calls[0].options.headers;
  assert.equal(headers.Authorization, 'Bearer tok');
  assert.equal(headers['X-GitHub-Api-Version'], '2022-11-28');
});

test('readFile возвращает null, когда файла ещё нет', async () => {
  const fetchFn = fakeFetch([{ status: 404, body: {} }]);
  assert.equal(await readFile(fetchFn, 'tok', 'history/log/нет.json'), null);
});

test('readFile бросает AuthError при протухшем токене', async () => {
  const fetchFn = fakeFetch([{ status: 401, body: {} }]);
  await assert.rejects(() => readFile(fetchFn, 'tok', 'x.json'), { name: 'AuthError' });
});

test('writeFile передаёт sha при обновлении и не передаёт при создании', async () => {
  const fetchFn = fakeFetch([
    { status: 200, body: { content: { sha: 'new1' } } },
    { status: 201, body: { content: { sha: 'new2' } } },
  ]);
  await writeFile(fetchFn, 'tok', 'p.json', '{}', 'old', 'msg');
  await writeFile(fetchFn, 'tok', 'p.json', '{}', null, 'msg');
  assert.equal(JSON.parse(fetchFn.calls[0].options.body).sha, 'old');
  assert.equal('sha' in JSON.parse(fetchFn.calls[1].options.body), false);
});

test('writeFile кодирует тело в base64 и указывает ветку main', async () => {
  const fetchFn = fakeFetch([{ status: 200, body: { content: { sha: 'new' } } }]);
  await writeFile(fetchFn, 'tok', 'p.json', '{"био":"вис"}', null, 'msg');
  const body = JSON.parse(fetchFn.calls[0].options.body);
  assert.equal(fromBase64(body.content), '{"био":"вис"}');
  assert.equal(body.branch, 'main');
  assert.equal(body.message, 'msg');
});

test('writeFile бросает ConflictError при устаревшем sha', async () => {
  const fetchFn = fakeFetch([{ status: 409, body: {} }]);
  await assert.rejects(() => writeFile(fetchFn, 'tok', 'p.json', '{}', 'old', 'm'), { name: 'ConflictError' });
});

test('syncWeek сливает удалённые и локальные записи и отправляет результат', async () => {
  const remote = { week_start: '2026-07-27', entries: [{ ...entry, date: '2026-07-28' }] };
  const fetchFn = fakeFetch([
    { status: 200, body: { content: toBase64(JSON.stringify(remote)), sha: 'a' } },
    { status: 200, body: { content: { sha: 'b' } } },
  ]);
  const merged = await syncWeek({
    fetchFn, token: 'tok', path: 'history/log/2026-07-27.json',
    weekStart: '2026-07-27', localEntries: [entry], message: 'log',
  });
  assert.equal(merged.length, 2);
  const sent = JSON.parse(fromBase64(JSON.parse(fetchFn.calls[1].options.body).content));
  assert.equal(sent.week_start, '2026-07-27');
  assert.equal(sent.entries.length, 2);
});

test('syncWeek создаёт файл с нуля, если его ещё нет', async () => {
  const fetchFn = fakeFetch([
    { status: 404, body: {} },
    { status: 201, body: { content: { sha: 'b' } } },
  ]);
  const merged = await syncWeek({
    fetchFn, token: 'tok', path: 'p.json', weekStart: '2026-07-27',
    localEntries: [entry], message: 'log',
  });
  assert.equal(merged.length, 1);
});

test('syncWeek повторяет попытку после конфликта', async () => {
  const remote = { week_start: '2026-07-27', entries: [] };
  const fetchFn = fakeFetch([
    { status: 200, body: { content: toBase64(JSON.stringify(remote)), sha: 'a' } },
    { status: 409, body: {} },
    { status: 200, body: { content: toBase64(JSON.stringify(remote)), sha: 'b' } },
    { status: 200, body: { content: { sha: 'c' } } },
  ]);
  const merged = await syncWeek({
    fetchFn, token: 'tok', path: 'p.json', weekStart: '2026-07-27',
    localEntries: [entry], message: 'log',
  });
  assert.equal(merged.length, 1);
  assert.equal(fetchFn.calls.length, 4);
});

test('syncWeek сдаётся после трёх конфликтов подряд', async () => {
  const remote = { week_start: '2026-07-27', entries: [] };
  const ok = { status: 200, body: { content: toBase64(JSON.stringify(remote)), sha: 'a' } };
  const fetchFn = fakeFetch([ok, { status: 409, body: {} }, ok, { status: 409, body: {} }, ok, { status: 409, body: {} }]);
  await assert.rejects(() => syncWeek({
    fetchFn, token: 'tok', path: 'p.json', weekStart: '2026-07-27',
    localEntries: [entry], message: 'log',
  }), { name: 'ConflictError' });
});

test('pullWeek возвращает удалённые записи, ничего не записывая', async () => {
  const remote = { week_start: '2026-07-27', entries: [entry] };
  const fetchFn = fakeFetch([{ status: 200, body: { content: toBase64(JSON.stringify(remote)), sha: 'a' } }]);
  const result = await pullWeek({ fetchFn, token: 'tok', path: 'p.json' });
  assert.equal(result.length, 1);
  assert.equal(fetchFn.calls.length, 1);
  assert.equal(fetchFn.calls[0].options.method, 'GET');
});

test('pullWeek на отсутствующем файле возвращает пустой список', async () => {
  const fetchFn = fakeFetch([{ status: 404, body: {} }]);
  assert.deepEqual(await pullWeek({ fetchFn, token: 'tok', path: 'p.json' }), []);
});

test('pullWeek не падает на непригодном содержимом', async () => {
  const fetchFn = fakeFetch([{ status: 200, body: { content: toBase64('[]'), sha: 'a' } }]);
  assert.deepEqual(await pullWeek({ fetchFn, token: 'tok', path: 'p.json' }), []);
});

test('syncWeek переживает валидный JSON неправильной формы', async () => {
  // У голого массива поле .entries — метод прототипа: truthy, но не список записей.
  const fetchFn = fakeFetch([
    { status: 200, body: { content: toBase64('[]'), sha: 'a' } },
    { status: 200, body: { content: { sha: 'b' } } },
  ]);
  const merged = await syncWeek({
    fetchFn, token: 'tok', path: 'p.json', weekStart: '2026-07-27',
    localEntries: [entry], message: 'log',
  });
  assert.equal(merged.length, 1);
});

test('syncWeek переживает битый JSON в репозитории, не теряя локальные записи', async () => {
  const fetchFn = fakeFetch([
    { status: 200, body: { content: toBase64('{ это не json'), sha: 'a' } },
    { status: 200, body: { content: { sha: 'b' } } },
  ]);
  const merged = await syncWeek({
    fetchFn, token: 'tok', path: 'p.json', weekStart: '2026-07-27',
    localEntries: [entry], message: 'log',
  });
  assert.equal(merged.length, 1);
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `node --test tests/tracker-github.test.js`
Expected: FAIL — `Cannot find module '.../assets/tracker-github.js'`

- [ ] **Step 3: Реализовать `assets/tracker-github.js`**

```js
// Клиент GitHub Contents API. Знает про сеть и про кодирование, но не про DOM.
import { mergeEntries } from './tracker-core.js';

const REPO = 'colzphml/push_pull-ups';
const BRANCH = 'main';
const MAX_ATTEMPTS = 3;

export class ConflictError extends Error {
  constructor(message) { super(message); this.name = 'ConflictError'; }
}

export class AuthError extends Error {
  constructor(message) { super(message); this.name = 'AuthError'; }
}

/** btoa() падает на кириллице — кодируем через UTF-8 байты. */
export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** GitHub возвращает base64 с переносами строк — их надо убрать до декодирования. */
export function fromBase64(b64) {
  const binary = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function url(path) {
  return `https://api.github.com/repos/${REPO}/contents/${path}`;
}

export async function readFile(fetchFn, token, path) {
  const response = await fetchFn(`${url(path)}?ref=${BRANCH}`, {
    method: 'GET',
    headers: headers(token),
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw new AuthError('Токен не принят GitHub');
  }
  if (!response.ok) throw new Error(`GitHub ответил ${response.status} на чтение`);
  const data = await response.json();
  return { text: fromBase64(data.content), sha: data.sha };
}

export async function writeFile(fetchFn, token, path, text, sha, message) {
  const payload = { message, content: toBase64(text), branch: BRANCH };
  if (sha) payload.sha = sha;
  const response = await fetchFn(url(path), {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (response.status === 409 || response.status === 422) {
    throw new ConflictError('Файл изменился с другого устройства');
  }
  if (response.status === 401 || response.status === 403) {
    throw new AuthError('Токен не принят GitHub');
  }
  if (!response.ok) throw new Error(`GitHub ответил ${response.status} на запись`);
  const data = await response.json();
  return { sha: data.content.sha };
}

/** Разбор содержимого файла лога. Непригодное содержимое трактуем как пустой список. */
function parseEntries(text) {
  try {
    const parsed = JSON.parse(text);
    // Проверяем именно массив: у голого `[]` поле .entries — это метод прототипа,
    // он truthy и проскочил бы проверку на существование, уронив слияние.
    return Array.isArray(parsed?.entries) ? parsed.entries : [];
  } catch {
    // Битый файл в репозитории не должен съесть локальные отметки — перезаписываем его.
    return [];
  }
}

/** Только чтение: подтянуть отметки, сделанные с другого устройства. Ничего не пишет. */
export async function pullWeek({ fetchFn, token, path }) {
  const remote = await readFile(fetchFn, token, path);
  return remote ? parseEntries(remote.text) : [];
}

/** Читаем актуальный файл, вливаем локальные изменения, пишем обратно. При конфликте — заново. */
export async function syncWeek({ fetchFn, token, path, weekStart, localEntries, message }) {
  let lastError = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const remote = await readFile(fetchFn, token, path);
    const remoteEntries = remote ? parseEntries(remote.text) : [];
    const merged = mergeEntries(remoteEntries, localEntries);
    const body = `${JSON.stringify({ week_start: weekStart, entries: merged }, null, 2)}\n`;
    try {
      await writeFile(fetchFn, token, path, body, remote ? remote.sha : null, message);
      return merged;
    } catch (error) {
      if (error.name !== 'ConflictError') throw error;
      lastError = error;
    }
  }
  throw lastError;
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `node --test tests/*.test.js`
Expected: PASS, 43 теста суммарно

- [ ] **Step 5: Коммит**

```bash
git add assets/tracker-github.js tests/tracker-github.test.js
git commit -m "Трекер: клиент GitHub Contents API со слиянием и повтором при конфликте"
```

---

### Task 4: Хранилище на устройстве

**Files:**
- Create: `assets/tracker-store.js`
- Test: `tests/tracker-store.test.js`

**Interfaces:**
- Consumes: `entryKey`, `mergeEntries` из `assets/tracker-core.js`
- Produces: класс `Store`, конструируемый как `new Store(storage)` — где `storage` совместим с `localStorage` (`getItem`/`setItem`/`removeItem`). Методы:
  - `getToken() -> string|null` / `setToken(token: string) -> void` / `clearToken() -> void`
  - `loadWeek(weekStart) -> Entry[]`
  - `upsertEntry(weekStart, entry) -> Entry[]` — добавляет или заменяет по ключу, возвращает новый список
  - `replaceWeek(weekStart, entries) -> void` — после успешной синхронизации
  - `getSyncedAt(weekStart) -> string|null` / `setSyncedAt(weekStart, iso) -> void`
  - `deviceName() -> string` — `"phone"` или `"desktop"`, выставляется один раз и запоминается

**Инъекция хранилища** нужна, чтобы тесты шли в Node без браузера.

- [ ] **Step 1: Написать падающие тесты**

Создать `tests/tracker-store.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../assets/tracker-store.js';

/** Минимальная подделка localStorage. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    _map: map,
  };
}

const entry = {
  date: '2026-07-27', window: 'утро', block: 'pull', exercise: 'вис на перекладине',
  planned: '3 × 20-25 сек', done: 1, actual: '', felt: '', note: '',
  updated_at: '2026-07-27T08:00:00.000Z', device: 'phone',
};

test('токен сохраняется, читается и стирается', () => {
  const store = new Store(fakeStorage());
  assert.equal(store.getToken(), null);
  store.setToken('github_pat_x');
  assert.equal(store.getToken(), 'github_pat_x');
  store.clearToken();
  assert.equal(store.getToken(), null);
});

test('setToken обрезает пробелы, налипшие при вставке', () => {
  const store = new Store(fakeStorage());
  store.setToken('  github_pat_x \n');
  assert.equal(store.getToken(), 'github_pat_x');
});

test('loadWeek на пустом хранилище возвращает пустой массив', () => {
  assert.deepEqual(new Store(fakeStorage()).loadWeek('2026-07-27'), []);
});

test('upsertEntry добавляет запись и она читается обратно', () => {
  const store = new Store(fakeStorage());
  store.upsertEntry('2026-07-27', entry);
  assert.equal(store.loadWeek('2026-07-27').length, 1);
});

test('upsertEntry заменяет запись с тем же ключом, а не дублирует', () => {
  const store = new Store(fakeStorage());
  store.upsertEntry('2026-07-27', entry);
  const result = store.upsertEntry('2026-07-27', { ...entry, done: 0, updated_at: '2026-07-27T09:00:00.000Z' });
  assert.equal(result.length, 1);
  assert.equal(result[0].done, 0);
});

test('недели изолированы друг от друга', () => {
  const store = new Store(fakeStorage());
  store.upsertEntry('2026-07-27', entry);
  assert.deepEqual(store.loadWeek('2026-08-03'), []);
});

test('loadWeek переживает испорченный JSON в хранилище', () => {
  const storage = fakeStorage({ 'ppu:log:2026-07-27': '{сломано' });
  assert.deepEqual(new Store(storage).loadWeek('2026-07-27'), []);
});

test('replaceWeek полностью заменяет содержимое недели', () => {
  const store = new Store(fakeStorage());
  store.upsertEntry('2026-07-27', entry);
  store.replaceWeek('2026-07-27', []);
  assert.deepEqual(store.loadWeek('2026-07-27'), []);
});

test('метка синхронизации хранится по неделям', () => {
  const store = new Store(fakeStorage());
  assert.equal(store.getSyncedAt('2026-07-27'), null);
  store.setSyncedAt('2026-07-27', '2026-07-27T10:00:00.000Z');
  assert.equal(store.getSyncedAt('2026-07-27'), '2026-07-27T10:00:00.000Z');
  assert.equal(store.getSyncedAt('2026-08-03'), null);
});

test('имя устройства выставляется один раз и не меняется', () => {
  const storage = fakeStorage();
  const first = new Store(storage).deviceName();
  const second = new Store(storage).deviceName();
  assert.equal(first, second);
  assert.ok(first.length > 0);
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `node --test tests/tracker-store.test.js`
Expected: FAIL — `Cannot find module '.../assets/tracker-store.js'`

- [ ] **Step 3: Реализовать `assets/tracker-store.js`**

```js
// Хранилище на устройстве. Хранилище инжектится, чтобы тесты шли без браузера.
import { entryKey } from './tracker-core.js';

const TOKEN_KEY = 'ppu:token';
const DEVICE_KEY = 'ppu:device';
const logKey = weekStart => `ppu:log:${weekStart}`;
const syncKey = weekStart => `ppu:synced:${weekStart}`;

export class Store {
  constructor(storage) {
    this.storage = storage;
  }

  #readJson(key, fallback) {
    const raw = this.storage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  getToken() {
    return this.storage.getItem(TOKEN_KEY);
  }

  setToken(token) {
    this.storage.setItem(TOKEN_KEY, String(token).trim());
  }

  clearToken() {
    this.storage.removeItem(TOKEN_KEY);
  }

  loadWeek(weekStart) {
    const data = this.#readJson(logKey(weekStart), []);
    return Array.isArray(data) ? data : [];
  }

  upsertEntry(weekStart, entry) {
    const key = entryKey(entry);
    const entries = this.loadWeek(weekStart).filter(e => entryKey(e) !== key);
    entries.push(entry);
    this.replaceWeek(weekStart, entries);
    return entries;
  }

  replaceWeek(weekStart, entries) {
    this.storage.setItem(logKey(weekStart), JSON.stringify(entries));
  }

  getSyncedAt(weekStart) {
    return this.storage.getItem(syncKey(weekStart));
  }

  setSyncedAt(weekStart, iso) {
    this.storage.setItem(syncKey(weekStart), iso);
  }

  /** Нужно только для разбора конфликтов: кто поставил отметку. */
  deviceName() {
    const existing = this.storage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const isPhone = typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent || '');
    const name = isPhone ? 'phone' : 'desktop';
    this.storage.setItem(DEVICE_KEY, name);
    return name;
  }
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `node --test tests/*.test.js`
Expected: PASS, 53 теста суммарно

- [ ] **Step 5: Коммит**

```bash
git add assets/tracker-store.js tests/tracker-store.test.js
git commit -m "Трекер: хранилище на устройстве (токен, лог недели, метка синхронизации)"
```

---

### Task 5: Интерфейс на странице недели

**Files:**
- Create: `assets/tracker.js`
- Modify: `sw.js:1-6` (версия кэша и список ресурсов), `sw.js:17-25` (не кэшировать чужие домены)
- Modify: `weeks/2026/week_2026-07-27.html` — одна строка подключения перед `</body>`

**Interfaces:**
- Consumes: `weekStats` из `tracker-core.js`; `blockFromDotClass`, `windowFromMealType`, `isTrackable` из `tracker-parse.js`; `Store` из `tracker-store.js`; `syncWeek`, `AuthError` из `tracker-github.js`
- Produces: самозапускающийся модуль, глобального API не экспортирует

**Проверяется вручную в браузере** — в проекте нет DOM-окружения, а добавлять jsdom значило бы завести первую npm-зависимость ради одного слоя. Чистая логика уже покрыта тестами в задачах 1–4.

- [ ] **Step 1: Реализовать `assets/tracker.js`**

```js
// DOM-слой трекера: контролы на карточках, шторка уточнения, шапка, синхронизация.
import { weekStats, pendingEntries, mergeEntries, sameEntries } from './tracker-core.js';
import { blockFromDotClass, windowFromMealType, isTrackable } from './tracker-parse.js';
import { Store } from './tracker-store.js';
import { pullWeek, syncWeek, AuthError } from './tracker-github.js';

const SYNC_DELAY_MS = 120000;

const store = new Store(window.localStorage);
const device = store.deviceName();
let weekStart = '';
let dates = [];
let entries = [];
let syncTimer = null;
let syncing = false;

const styles = `
.tr-mark{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;
  border:1.5px solid var(--border);background:transparent;color:var(--text-dim);
  font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;
  z-index:3;padding:0;transition:.15s}
.tr-mark:hover{border-color:var(--accent)}
.tr-mark.done{border-color:var(--accent);background:var(--accent);color:#0d1117;font-weight:600}
.tr-mark.miss{border-color:#7a4a4a;color:#c98080}
.tr-detail{position:absolute;bottom:10px;left:14px;font-size:11px;color:var(--text-dim);
  background:none;border:none;cursor:pointer;padding:2px 0;z-index:3}
.tr-detail:hover{color:var(--accent)}
.tr-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0 0;
  font-size:12.5px;color:var(--text-dim)}
.tr-bar b{color:var(--accent);font-weight:600}
.tr-dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:#4caf50}
.tr-dot.pending{background:#d9a441}
.tr-dot.error{background:#d95f5f}
.tr-bar button{background:none;border:1px solid var(--border);border-radius:8px;
  color:var(--text-dim);font-size:11.5px;padding:3px 9px;cursor:pointer}
.tr-sheet{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;
  align-items:flex-end;justify-content:center;z-index:1000}
.tr-sheet.open{display:flex}
.tr-sheet-inner{background:var(--surface);border:1px solid var(--border);
  border-radius:16px 16px 0 0;padding:20px;width:100%;max-width:520px;max-height:85vh;overflow:auto}
.tr-sheet h3{margin:0 0 4px;font-size:15px}
.tr-sheet .tr-plan{font-size:12px;color:var(--text-dim);margin:0 0 16px}
.tr-sheet label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.6px;
  color:var(--text-dim);margin:14px 0 6px}
.tr-sheet input,.tr-sheet textarea{width:100%;box-sizing:border-box;background:#0f151c;
  border:1px solid var(--border);border-radius:9px;color:inherit;padding:9px 11px;
  font:inherit;font-size:14px}
.tr-chips{display:flex;gap:7px;flex-wrap:wrap}
.tr-chips button{flex:1;min-width:70px;background:#0f151c;border:1px solid var(--border);
  border-radius:9px;color:var(--text-dim);padding:8px 4px;font-size:12.5px;cursor:pointer}
.tr-chips button.on{border-color:var(--accent);color:var(--accent)}
.tr-chips button[data-felt="больно"].on{border-color:#d95f5f;color:#d95f5f}
.tr-actions{display:flex;gap:9px;margin-top:20px}
.tr-actions button{flex:1;padding:11px;border-radius:9px;font-size:13.5px;cursor:pointer;
  border:1px solid var(--border);background:none;color:var(--text-dim)}
.tr-actions .tr-save{background:var(--accent);border-color:var(--accent);color:#0d1117;font-weight:600}
`;

function injectStyles() {
  const tag = document.createElement('style');
  tag.textContent = styles;
  document.head.appendChild(tag);
}

function nowIso() {
  return new Date().toISOString();
}

/** Собирает описание карточки из существующей разметки недели. */
function describeCard(wrap) {
  const dayCol = wrap.closest('.day-col');
  const dot = wrap.querySelector('.meal-type-dot');
  const title = wrap.querySelector('.meal-title');
  if (!dayCol || !dot || !title) return null;
  const block = blockFromDotClass(dot.className);
  if (!isTrackable(block)) return null;
  const mealType = wrap.querySelector('.meal-type');
  const kcal = wrap.querySelector('.meal-kcal');
  return {
    date: dayCol.dataset.date,
    window: windowFromMealType(mealType ? mealType.textContent : ''),
    block,
    exercise: title.textContent.trim(),
    planned: kcal ? kcal.textContent.trim() : '',
  };
}

function findEntry(card) {
  return entries.find(
    e => e.date === card.date && e.block === card.block
      && e.exercise.trim().toLowerCase() === card.exercise.toLowerCase()
  );
}

function saveEntry(card, changes) {
  const existing = findEntry(card) || {};
  const entry = {
    date: card.date,
    window: card.window,
    block: card.block,
    exercise: card.exercise,
    planned: card.planned,
    done: existing.done ?? null,
    actual: existing.actual || '',
    felt: existing.felt || '',
    note: existing.note || '',
    ...changes,
    updated_at: nowIso(),
    device,
  };
  entries = store.upsertEntry(weekStart, entry);
  render();
  scheduleSync();
  return entry;
}

/** Циклический статус: нет отметки → сделал → не вышло → нет отметки. */
function nextDone(current) {
  if (current === 1) return 0;
  if (current === 0) return null;
  return 1;
}

function render() {
  document.querySelectorAll('.flip-wrap[data-tr]').forEach(wrap => {
    const card = describeCard(wrap);
    if (!card) return;
    const entry = findEntry(card);
    const mark = wrap.querySelector('.tr-mark');
    const detail = wrap.querySelector('.tr-detail');
    mark.classList.toggle('done', entry?.done === 1);
    mark.classList.toggle('miss', entry?.done === 0);
    mark.textContent = entry?.done === 1 ? '✓' : entry?.done === 0 ? '✕' : '';
    mark.setAttribute('aria-label',
      entry?.done === 1 ? 'Сделано' : entry?.done === 0 ? 'Не вышло' : 'Отметить выполнение');
    detail.hidden = entry?.done === undefined || entry?.done === null;
  });
  renderBar();
}

function renderBar() {
  const bar = document.getElementById('tr-bar');
  if (!bar) return;
  const stats = weekStats(entries, dates);
  const hasToken = Boolean(store.getToken());
  const dirty = isDirty();
  let state = 'synced';
  if (!hasToken) state = 'error';
  else if (dirty || syncing) state = 'pending';

  bar.innerHTML = '';
  const dot = document.createElement('span');
  dot.className = `tr-dot${state === 'synced' ? '' : ` ${state === 'error' ? 'error' : 'pending'}`}`;
  dot.title = state === 'error' ? 'Нужен токен GitHub'
    : state === 'pending' ? 'Есть неотправленные отметки' : 'Всё сохранено в репозитории';
  bar.appendChild(dot);

  const hits = document.createElement('span');
  hits.append('Попал: ');
  const hitsValue = document.createElement('b');
  hitsValue.textContent = `${stats.hitDays} из ${stats.totalDays}`;
  hits.append(hitsValue, ' дней');
  bar.appendChild(hits);

  const cold = document.createElement('span');
  cold.textContent = `❄️ финишей: ${stats.coldFinishes}`;
  bar.appendChild(cold);

  const button = document.createElement('button');
  button.textContent = hasToken ? (state === 'pending' ? 'Отправить сейчас' : 'Токен') : 'Ввести токен';
  button.onclick = () => (hasToken && state === 'pending' ? runSync() : askToken());
  bar.appendChild(button);
}

function askToken() {
  const current = store.getToken();
  const value = window.prompt(
    'Токен GitHub (fine-grained, права Contents: Read and write).\nПустая строка — удалить сохранённый токен.',
    current || ''
  );
  if (value === null) return;
  if (value.trim() === '') store.clearToken();
  else store.setToken(value);
  renderBar();
  if (store.getToken()) runPull().then(runSync);
}

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, SYNC_DELAY_MS);
}

function logPath() {
  return `history/log/${weekStart}.json`;
}

function isDirty() {
  return pendingEntries(entries, store.getSyncedAt(weekStart)).length > 0;
}

function handleSyncError(error) {
  if (error instanceof AuthError) store.clearToken();
  // Отметки уже в localStorage — повторим при следующем открытии страницы.
  console.warn('Синхронизация не удалась:', error.name);
}

/**
 * Подтягивание без записи — вызывается при открытии страницы.
 * Только так отметки, поставленные на другом устройстве, попадают сюда:
 * запись при каждом открытии плодила бы пустые коммиты.
 */
async function runPull() {
  const token = store.getToken();
  if (!token || syncing) { renderBar(); return; }
  syncing = true;
  renderBar();
  try {
    const remoteEntries = await pullWeek({
      fetchFn: window.fetch.bind(window),
      token,
      path: logPath(),
    });
    entries = mergeEntries(remoteEntries, entries);
    store.replaceWeek(weekStart, entries);
    // Сравниваем с тем, что реально лежит в репозитории, а не со снимком «было ли грязно»
    // до запроса: отметку, поставленную пока летел ответ, слияние сохранит, и она обязана
    // остаться неотправленной. Между сравнением и записью метки нет await — вклиниться некуда.
    if (sameEntries(entries, remoteEntries)) store.setSyncedAt(weekStart, nowIso());
    render();
  } catch (error) {
    handleSyncError(error);
  } finally {
    syncing = false;
    renderBar();
  }
}

/** Отправка: срабатывает по дебаунсу после отметки и по кнопке. */
async function runSync() {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  const token = store.getToken();
  if (!token || syncing || !isDirty()) { renderBar(); return; }
  syncing = true;
  renderBar();
  const startedAt = nowIso();
  try {
    const merged = await syncWeek({
      fetchFn: window.fetch.bind(window),
      token,
      path: logPath(),
      weekStart,
      localEntries: entries,
      message: `log: ${weekStart} · отметок: ${entries.length}`,
    });
    entries = merged;
    store.replaceWeek(weekStart, merged);
    store.setSyncedAt(weekStart, startedAt);
    render();
  } catch (error) {
    handleSyncError(error);
  } finally {
    syncing = false;
    renderBar();
  }
}

/* --- шторка уточнения --- */

let sheet = null;

function buildSheet() {
  sheet = document.createElement('div');
  sheet.className = 'tr-sheet';
  sheet.innerHTML = `
    <div class="tr-sheet-inner">
      <h3 id="tr-sheet-title"></h3>
      <p class="tr-plan" id="tr-sheet-plan"></p>
      <label for="tr-actual">Как вышло</label>
      <input id="tr-actual" type="text" autocomplete="off">
      <label>Ощущения</label>
      <div class="tr-chips" id="tr-chips">
        <button type="button" data-felt="легко">легко</button>
        <button type="button" data-felt="норм">норм</button>
        <button type="button" data-felt="тяжело">тяжело</button>
        <button type="button" data-felt="больно">больно</button>
      </div>
      <label for="tr-note">Заметка</label>
      <textarea id="tr-note" rows="2"></textarea>
      <div class="tr-actions">
        <button type="button" id="tr-cancel">Отмена</button>
        <button type="button" class="tr-save" id="tr-save">Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', event => { if (event.target === sheet) closeSheet(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSheet(); });
}

function closeSheet() {
  sheet.classList.remove('open');
  document.body.style.overflow = '';
}

function openSheet(card) {
  const entry = findEntry(card) || {};
  document.getElementById('tr-sheet-title').textContent = card.exercise;
  document.getElementById('tr-sheet-plan').textContent = `План: ${card.planned}`;
  document.getElementById('tr-actual').value = entry.actual || card.planned;
  document.getElementById('tr-note').value = entry.note || '';
  const chips = [...document.querySelectorAll('#tr-chips button')];
  chips.forEach(chip => {
    chip.classList.toggle('on', chip.dataset.felt === entry.felt);
    chip.onclick = () => chips.forEach(c => c.classList.toggle('on', c === chip));
  });
  document.getElementById('tr-cancel').onclick = closeSheet;
  document.getElementById('tr-save').onclick = () => {
    const selected = document.querySelector('#tr-chips button.on');
    saveEntry(card, {
      done: entry.done ?? 1,
      actual: document.getElementById('tr-actual').value.trim(),
      felt: selected ? selected.dataset.felt : '',
      note: document.getElementById('tr-note').value.trim(),
    });
    closeSheet();
  };
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/* --- запуск --- */

function mount() {
  const dayCols = [...document.querySelectorAll('.day-col[data-date]')];
  if (dayCols.length === 0) return;
  dates = dayCols.map(col => col.dataset.date).sort();
  weekStart = dates[0];
  entries = store.loadWeek(weekStart);

  injectStyles();
  buildSheet();

  document.querySelectorAll('.day-col[data-date] .flip-wrap').forEach(wrap => {
    const card = describeCard(wrap);
    if (!card) return;
    wrap.dataset.tr = '1';
    wrap.style.position = 'relative';

    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'tr-mark';
    mark.onclick = event => {
      event.stopPropagation();
      const entry = findEntry(card);
      saveEntry(card, { done: nextDone(entry ? entry.done : null) });
    };
    wrap.appendChild(mark);

    const detail = document.createElement('button');
    detail.type = 'button';
    detail.className = 'tr-detail';
    detail.textContent = '✎ уточнить';
    detail.hidden = true;
    detail.onclick = event => { event.stopPropagation(); openSheet(card); };
    wrap.appendChild(detail);
  });

  const bar = document.createElement('div');
  bar.className = 'tr-bar';
  bar.id = 'tr-bar';
  const header = document.querySelector('header');
  if (header) header.appendChild(bar);

  render();
  runPull();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
```

- [ ] **Step 2: Обновить `sw.js`**

Заменить весь файл:

```js
const CACHE = 'pushpull-v2';
const ASSETS = [
  '/push_pull-ups/',
  '/push_pull-ups/index.html',
  '/push_pull-ups/manifest.json',
  '/push_pull-ups/icons/icon.svg',
  '/push_pull-ups/assets/tracker.js',
  '/push_pull-ups/assets/tracker-core.js',
  '/push_pull-ups/assets/tracker-parse.js',
  '/push_pull-ups/assets/tracker-store.js',
  '/push_pull-ups/assets/tracker-github.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Чужие домены (в первую очередь api.github.com) не кэшируем никогда:
  // закэшированный ответ вернул бы устаревший sha и синхронизация ушла бы в вечный конфликт.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
```

- [ ] **Step 3: Подключить трекер к текущей неделе**

В `weeks/2026/week_2026-07-27.html` найти закрывающий `</body>` и вставить перед ним:

```html
<script type="module" src="../../assets/tracker.js"></script>
```

- [ ] **Step 4: Проверить, что модульные тесты не сломались**

Run: `node --test tests/*.test.js`
Expected: PASS, 53 теста

- [ ] **Step 5: Поднять локальный сервер и проверить вручную**

Run: `python3 -m http.server 8765`
Открыть `http://localhost:8765/weeks/2026/week_2026-07-27.html`

Проверить по списку:
- [ ] На каждой карточке push/pull/mob/cold есть пустой кружок; на карточке отдыха его нет
- [ ] Тап по кружку ставит `✓` и **не открывает** модалку с техникой
- [ ] Повторные тапы дают `✕`, затем пусто
- [ ] Тап по самой карточке (не по кружку) по-прежнему открывает модалку с техникой
- [ ] После отметки появляется «✎ уточнить»; до отметки её нет
- [ ] Шторка открывается, поле «Как вышло» предзаполнено планом
- [ ] Чипы ощущений переключаются, «больно» краснеет
- [ ] Сохранение закрывает шторку, повторное открытие показывает сохранённое
- [ ] В шапке видно «Попал: N из 7 дней» и «❄️ финишей: N», цифры меняются при отметках
- [ ] Точка красная без токена; кнопка «Ввести токен» открывает запрос
- [ ] Перезагрузка страницы сохраняет все отметки
- [ ] В консоли нет ошибок
- [ ] Заметка с текстом `<b>тест</b>` отображается как текст, а не как разметка
- [ ] Прошедшие дни по-прежнему собираются под заголовком «Прошедшие дни» и приглушены — существующая функция `organizeDays()` не сломалась

- [ ] **Step 6: Проверить в режиме офлайн**

1. DevTools → Network → Offline
2. Поставить отметку

Ожидается: отметка сохраняется, точка жёлтая, страница не падает.

3. Вернуть Network → Online, нажать «Отправить сейчас»

Ожидается (при введённом токене): точка зеленеет. Без токена — остаётся красной, это нормально: живая проверка цикла идёт в задаче 6.

- [ ] **Step 7: Коммит**

```bash
git add assets/tracker.js sw.js weeks/2026/week_2026-07-27.html
git commit -m "Трекер: интерфейс отметок на карточках, шторка уточнения, счётчики в шапке"
```

---

### Task 6: Живая проверка полного цикла

**Files:** изменений в коде нет — это проверка на реальном GitHub Pages.

**Interfaces:**
- Consumes: всё из задач 1–5
- Produces: файл `history/log/2026-07-27.json` в репозитории, созданный самим сайтом

- [ ] **Step 1: Выложить изменения**

```bash
git push origin main
```

- [ ] **Step 2: Дождаться публикации**

Run: `gh run list --limit 3`
Ожидается: сборка Pages завершилась успешно (обычно 1–2 минуты).

- [ ] **Step 3: Выпустить токен**

Действия colz (вручную, в браузере):
1. Открыть https://github.com/settings/personal-access-tokens/new
2. Token name: `push_pull-ups tracker`
3. Expiration: максимальный доступный срок
4. Repository access: `Only select repositories` → `colzphml/push_pull-ups`
5. Permissions → Repository permissions → `Contents` → `Read and write`
6. Больше ничего не включать
7. `Generate token`, скопировать строку `github_pat_...`

- [ ] **Step 4: Проверить цикл с телефона**

1. Открыть https://colzphml.github.io/push_pull-ups/weeks/2026/week_2026-07-27.html
2. Нажать «Ввести токен», вставить токен
3. Отметить одну карточку
4. Нажать «Отправить сейчас»
5. Убедиться, что точка позеленела

- [ ] **Step 5: Убедиться, что файл появился в репозитории**

```bash
git pull origin main
cat history/log/2026-07-27.json
```

Ожидается: корректный JSON с полем `week_start` и отмеченной записью, кириллица читается без искажений.

- [ ] **Step 6: Проверить слияние с двух устройств**

1. На компьютере открыть ту же страницу, ввести токен, отметить **другую** карточку, отправить
2. На телефоне перезагрузить страницу

Ожидается: видны обе отметки, ни одна не потерялась.

---

### Task 7: Приём факта в базу и в генератор недели

**Files:**
- Modify: `history/schema.sql` — добавить колонку `actual`
- Modify: `.claude/skills/make-week/SKILL.md` — чтение факта перед генерацией
- Modify: `CLAUDE.md` — раздел про файлы контекста и трекер

**Interfaces:**
- Consumes: формат `history/log/YYYY-MM-DD.json` из задач 1–6
- Produces: заполненные поля `done`, `actual`, `felt`, `note` в `exercise_log`

- [ ] **Step 1: Мигрировать базу**

```bash
sqlite3 history/training.db "ALTER TABLE exercise_log ADD COLUMN actual TEXT;"
sqlite3 history/training.db "PRAGMA table_info(exercise_log);" | grep actual
```

Expected: строка вида `10|actual|TEXT|0||0`

- [ ] **Step 2: Отразить миграцию в `history/schema.sql`**

В определении `exercise_log` после строки с `planned` добавить:

```sql
  actual   TEXT,   -- "3×20 сек" — что реально вышло, из трекера
```

- [ ] **Step 3: Проверить заливку факта на реальных данных**

```bash
sqlite3 history/training.db "
UPDATE exercise_log SET done = 1, actual = '3 × 20 сек', felt = 'норм'
WHERE date = '2026-07-27' AND block = 'pull' AND exercise LIKE 'Вис%';
SELECT date, \"window\", block, exercise, planned, actual, done, felt
FROM exercise_log WHERE date = '2026-07-27';"
```

Expected: у строки виса заполнены `done`, `actual`, `felt`. Обратить внимание: `window` экранирован двойными кавычками — это зарезервированное слово SQLite.

- [ ] **Step 4: Добавить в скилл `make-week` чтение факта**

В файл скилла, в раздел о чтении контекста перед генерацией, добавить:

```markdown
### Факт прошлой недели (перед генерацией — обязательно)

1. Прочитать `history/log/<дата_начала_прошлой_недели>.json`, если файл есть.
2. Залить факт в `exercise_log` — по каждой записи:
   ```sql
   UPDATE exercise_log
   SET done = :done, actual = :actual, felt = :felt, note = :note
   WHERE date = :date AND block = :block AND lower(exercise) = lower(:exercise);
   ```
   Колонка `window` — зарезервированное слово SQLite, в запросах экранировать: `"window"`.
3. Записи с `felt = 'больно'` — **предложить** colz внести в `training_rules` с рейтингом `-2`.
   Предложить, не проставлять молча: решение за ним.
4. Если файла лога нет или он пустой — спросить у colz про прошлую неделю словами, как раньше.
   Отсутствие отметок означает «нет данных», а не «ничего не сделано».
5. При генерации новой недели вставить перед `</body>`:
   `<script type="module" src="../../assets/tracker.js"></script>`
```

- [ ] **Step 5: Обновить `CLAUDE.md`**

В таблицу «Файлы контекста» добавить строку:

```markdown
| `history/log/*.json` | факт выполнения с сайта (трекер) — заливать в `exercise_log` перед генерацией |
```

И в конец раздела «Структура HTML» добавить:

```markdown
Каждая неделя подключает трекер отметок: `<script type="module" src="../../assets/tracker.js"></script>`
перед `</body>`. Трекер читает разметку сам (дата из `.day-col[data-date]`, блок из класса
`dot-*`, упражнение из `.meal-title`, план из `.meal-kcal`) — дополнительных атрибутов не нужно.
```

- [ ] **Step 6: Проверить, что база не сломалась**

```bash
sqlite3 history/training.db "PRAGMA integrity_check; SELECT COUNT(*) FROM exercise_log;"
```

Expected: `ok` и `267`

- [ ] **Step 7: Коммит**

```bash
git add history/schema.sql history/training.db CLAUDE.md .claude/
git commit -m "Трекер: приём факта в exercise_log, колонка actual, обновление make-week"
git push origin main
```

---

## Порядок и зависимости

```
Task 1 (ядро) ──┬─→ Task 3 (GitHub) ──┐
                └─→ Task 4 (хранилище) ┼─→ Task 5 (интерфейс) → Task 6 (живая проверка) → Task 7 (база и скилл)
Task 2 (разбор) ───────────────────────┘
```

Задачи 1, 2 независимы. Задачи 3 и 4 зависят только от 1. Задача 5 требует всех предыдущих.
