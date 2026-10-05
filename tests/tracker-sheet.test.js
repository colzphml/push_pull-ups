// Регрессия бага 05.10.2026: в однострочном input шторки длинный текст на iPhone уезжал
// за край, и поле не прокручивалось за курсором. Такие поля — textarea с переносом.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../assets/tracker.js', import.meta.url), 'utf8');

test('в шторках нет однострочных input', () => {
  assert.doesNotMatch(source, /<input\b/i);
});

test('«Как вышло» и поля активности — textarea, растущие по тексту', () => {
  for (const id of ['tr-actual', 'tr-add-name', 'tr-add-amount']) {
    const tag = source.match(new RegExp(`<(\\w+)\\b[^>]*\\bid="${id}"[^>]*>`));
    assert.ok(tag, `поле #${id} не найдено`);
    assert.equal(tag[1], 'textarea', `#${id}: ${tag[1]} вместо textarea`);
    assert.match(tag[0], /\bclass="tr-line"/, `#${id}: без класса tr-line высота не растёт по тексту`);
  }
});
