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
