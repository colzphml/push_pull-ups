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
    key: index => [...map.keys()][index] ?? null,
    get length() { return map.size; },
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

test('weekStarts перечисляет недели с сохранённым логом', () => {
  const store = new Store(fakeStorage());
  store.upsertEntry('2026-08-03', { ...entry, date: '2026-08-03' });
  store.upsertEntry('2026-07-27', entry);
  store.setToken('github_pat_x');
  assert.deepEqual(store.weekStarts(), ['2026-07-27', '2026-08-03']);
});

test('weekStarts на пустом хранилище возвращает пустой список', () => {
  assert.deepEqual(new Store(fakeStorage()).weekStarts(), []);
});

test('имя устройства выставляется один раз и не меняется', () => {
  const storage = fakeStorage();
  const first = new Store(storage).deviceName();
  const second = new Store(storage).deviceName();
  assert.equal(first, second);
  assert.ok(first.length > 0);
});
