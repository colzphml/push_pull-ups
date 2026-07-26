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
