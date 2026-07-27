import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toBase64, fromBase64, readFile, writeFile, pullWeek, syncWeek,
  ConflictError, AuthError, RateLimitError, PermissionError, describeSyncError,
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
      headers: { get: name => (next.headers || {})[name.toLowerCase()] ?? null },
      json: async () => {
        if (next.throwsOnJson) throw new SyntaxError('не JSON');
        return next.body;
      },
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

/* --- разбор отказов GitHub: не всякий 403 значит «токен плохой» --- */

test('readFile при 403 из-за лимита запросов не выдаёт себя за отказ в токене', async () => {
  const fetchFn = fakeFetch([{
    status: 403,
    body: { message: 'You have exceeded a secondary rate limit. Please wait a few minutes.' },
  }]);
  await assert.rejects(() => readFile(fetchFn, 'tok', 'x.json'), { name: 'RateLimitError' });
});

test('readFile признаёт лимит по заголовку x-ratelimit-remaining', async () => {
  const fetchFn = fakeFetch([{
    status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0' },
  }]);
  await assert.rejects(() => readFile(fetchFn, 'tok', 'x.json'), { name: 'RateLimitError' });
});

test('readFile при 429 сообщает о лимите, а не о токене', async () => {
  const fetchFn = fakeFetch([{ status: 429, body: { message: 'Too Many Requests' } }]);
  await assert.rejects(() => readFile(fetchFn, 'tok', 'x.json'), { name: 'RateLimitError' });
});

test('readFile при 403 из-за нехватки прав отличает права от протухшего токена', async () => {
  const fetchFn = fakeFetch([{
    status: 403, body: { message: 'Resource not accessible by personal access token' },
  }]);
  await assert.rejects(() => readFile(fetchFn, 'tok', 'x.json'), { name: 'PermissionError' });
});

test('writeFile при 403 из-за лимита тоже не обвиняет токен', async () => {
  const fetchFn = fakeFetch([{
    status: 403,
    body: { message: 'You have exceeded a secondary rate limit and have been temporarily blocked' },
  }]);
  await assert.rejects(
    () => writeFile(fetchFn, 'tok', 'p.json', '{}', 'sha', 'msg'),
    { name: 'RateLimitError' },
  );
});

test('writeFile при 401 по-прежнему бракует токен', async () => {
  const fetchFn = fakeFetch([{ status: 401, body: { message: 'Bad credentials' } }]);
  await assert.rejects(
    () => writeFile(fetchFn, 'tok', 'p.json', '{}', 'sha', 'msg'),
    { name: 'AuthError' },
  );
});

test('отказ без разбираемого тела не роняет разбор', async () => {
  const fetchFn = fakeFetch([{ status: 403, body: null, throwsOnJson: true }]);
  await assert.rejects(() => readFile(fetchFn, 'tok', 'x.json'), { name: 'PermissionError' });
});

test('describeSyncError переводит отказы на человеческий язык', () => {
  assert.equal(describeSyncError(new AuthError('Токен не принят GitHub')), 'Токен не принят GitHub');
  assert.equal(describeSyncError(new RateLimitError('x')), 'GitHub: лимит запросов, позже повторю сам');
  assert.equal(describeSyncError(new PermissionError('x')), 'Токену не хватает прав на запись');
  assert.equal(describeSyncError(new ConflictError('x')), 'Файл занят другим устройством');
});

test('describeSyncError не молчит о незнакомой поломке', () => {
  assert.equal(describeSyncError(new TypeError('Failed to fetch')), 'Нет связи с GitHub');
});
