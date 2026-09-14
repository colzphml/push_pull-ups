// Регрессия бага 14.09.2026: iOS Safari увеличивает страницу при фокусе на поле ввода
// со шрифтом меньше 16px и не возвращает масштаб после закрытия шторки.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/tracker.js', import.meta.url), 'utf8');
const css = source
  .match(/const styles = `([\s\S]*?)`;/)[1]
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Правила стилей трекера, чей селектор задевает поля ввода: input, textarea, select. */
function fieldRules() {
  return [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim(), body }))
    .filter(({ selector }) => /(^|[\s,>+~])(input|textarea|select)\b/.test(selector));
}

test('шрифт полей ввода в шторках не меньше 16px — иначе iOS Safari зумит страницу', () => {
  const rules = fieldRules();
  assert.ok(rules.length > 0, 'в стилях трекера не нашлось правил для полей ввода');
  for (const { selector, body } of rules) {
    const sizes = [...body.matchAll(/font-size:\s*([\d.]+)px/g)].map(m => Number(m[1]));
    assert.ok(sizes.length > 0, `${selector}: font-size не задан явно`);
    assert.ok(sizes.at(-1) >= 16, `${selector}: font-size ${sizes.at(-1)}px меньше 16px`);
  }
});
