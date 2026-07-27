import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entryKey, mergeEntries, pendingEntries, sameEntries, weekStats, syncState } from '../assets/tracker-core.js';

const base = {
  date: '2026-07-27', window: 'утро', block: 'pull',
  exercise: 'вис на перекладине', planned: '3 × 20-25 сек',
  done: 1, actual: '3 × 20 сек', felt: 'норм', note: '',
  updated_at: '2026-07-27T08:00:00.000Z', device: 'phone',
};

test('entryKey собирает ключ из даты, окна, блока и упражнения', () => {
  assert.equal(entryKey(base), '2026-07-27|утро|pull|вис на перекладине');
});

test('entryKey нечувствителен к регистру и лишним пробелам в названии', () => {
  assert.equal(entryKey({ ...base, exercise: '  Вис На Перекладине ' }), '2026-07-27|утро|pull|вис на перекладине');
});

test('entryKey различает один блок в разных окнах дня', () => {
  const day = { ...base, block: 'push', exercise: 'отжимания от стены', window: 'день' };
  const evening = { ...day, window: 'вечер' };
  assert.notEqual(entryKey(day), entryKey(evening));
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

/* --- состояние панели синхронизации --- */

test('syncState: всё отправлено — панель молчит и не зовёт трогать токен', () => {
  const state = syncState({ hasToken: true, pendingCount: 0, syncing: false, error: null });
  assert.equal(state.tone, 'ok');
  assert.equal(state.label, 'Всё отправлено');
  assert.equal(state.button, null);
  assert.equal(state.settings, true);
});

test('syncState: есть неотправленные — зовёт отправить и называет число', () => {
  const state = syncState({ hasToken: true, pendingCount: 2, syncing: false, error: null });
  assert.equal(state.tone, 'pending');
  assert.equal(state.label, 'Не отправлено: 2');
  assert.deepEqual(state.button, { kind: 'sync', label: 'Отправить' });
});

test('syncState: во время отправки говорит об этом и прячет кнопку', () => {
  const state = syncState({ hasToken: true, pendingCount: 2, syncing: true, error: null });
  assert.equal(state.tone, 'pending');
  assert.equal(state.label, 'Отправляю…');
  assert.equal(state.button, null);
});

test('syncState: без токена зовёт его ввести и не показывает шестерёнку', () => {
  const state = syncState({ hasToken: false, pendingCount: 1, syncing: false, error: null });
  assert.equal(state.tone, 'error');
  assert.equal(state.label, 'Нужен токен');
  assert.deepEqual(state.button, { kind: 'token', label: 'Ввести' });
  assert.equal(state.settings, false);
});

test('syncState: без токена после отказа показывает причину, а не общее «нужен токен»', () => {
  const state = syncState({
    hasToken: false, pendingCount: 1, syncing: false, error: 'Токен не принят GitHub',
  });
  assert.equal(state.label, 'Токен не принят GitHub');
  assert.deepEqual(state.button, { kind: 'token', label: 'Ввести' });
});

test('syncState: ошибка при живом токене видна в панели и предлагает повтор', () => {
  const state = syncState({
    hasToken: true, pendingCount: 1, syncing: false, error: 'GitHub: лимит запросов',
  });
  assert.equal(state.tone, 'error');
  assert.equal(state.label, 'GitHub: лимит запросов');
  assert.deepEqual(state.button, { kind: 'retry', label: 'Повторить' });
  assert.equal(state.settings, true);
});

test('syncState: идущая отправка важнее ошибки прошлой попытки', () => {
  const state = syncState({
    hasToken: true, pendingCount: 1, syncing: true, error: 'GitHub: лимит запросов',
  });
  assert.equal(state.label, 'Отправляю…');
});
