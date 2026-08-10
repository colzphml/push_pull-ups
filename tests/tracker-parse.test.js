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

test('windowFromMealType нормализует «За день» в «день» — окно карточки шагов', () => {
  assert.equal(windowFromMealType('За день · Шаги'), 'день');
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
  assert.equal(isTrackable('steps'), true);
  assert.equal(isTrackable('rest'), false);
  assert.equal(isTrackable(null), false);
});
