// Чистая логика лога тренировок: ключи, слияние, статистика.
// Никакого DOM, никакой сети, никакого localStorage — только данные.

/** Блоки, попадание в которые засчитывается как «день состоялся». */
const HIT_BLOCKS = new Set(['push', 'pull', 'mob']);

/**
 * Ключ записи: дата + окно + блок + упражнение. Окно обязательно: в истории есть дни,
 * где один блок идёт дважды с одинаковым названием и различается только окном
 * (например «отжимания от стены» днём и вечером) — без окна такие отметки затирают друг друга.
 * Тексты нормализуем: они приходят из разметки.
 */
export function entryKey(entry) {
  const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${entry.date}|${norm(entry.window)}|${entry.block}|${norm(entry.exercise)}`;
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

/**
 * Что показывать в панели синхронизации. Отдельная функция, потому что путаница
 * здесь стоила отдельного разбора: кнопка с подписью «Токен» в состоянии «всё
 * отправлено» читалась как требование ввести токен. Состояние называем словами,
 * а кнопку показываем только когда от человека действительно что-то нужно.
 */
export function syncState({ hasToken, pendingCount, syncing, error }) {
  if (!hasToken) {
    return {
      tone: 'error',
      label: error || 'Нужен токен',
      button: { kind: 'token', label: 'Ввести' },
      settings: false,
    };
  }
  if (syncing) {
    return { tone: 'pending', label: 'Отправляю…', button: null, settings: true };
  }
  if (error) {
    return { tone: 'error', label: error, button: { kind: 'retry', label: 'Повторить' }, settings: true };
  }
  if (pendingCount > 0) {
    return {
      tone: 'pending',
      label: `Не отправлено: ${pendingCount}`,
      button: { kind: 'sync', label: 'Отправить' },
      settings: true,
    };
  }
  return { tone: 'ok', label: 'Всё отправлено', button: null, settings: true };
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
