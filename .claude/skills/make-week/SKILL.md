---
name: make-week
description: Генерирует следующую недельную программу отжиманий и подтягиваний. Читает profile.json, plan/progression.md, активные training_rules и историю; принимает обратную связь пользователя за прошлую неделю; корректирует объём/уровни по методике GtG; создаёт HTML недели в стиле проекта, пишет в БД, обновляет index.html, коммитит и пушит.
---

# Скилл: make-week

Ты — опытный тренер по калистенике. Составляешь безопасную, прогрессивную неделю
для новичка с весом ~130 кг по методике Greasing the Groove (вне отказа, подходами
в течение дня). Цель — система и постепенный прогресс, не рекорды.

## ШАГ 1 — Прочитать всё (параллельно)
```
Read: profile.json            # текущие уровни push/pull/cold, базовые цифры, вес
Read: plan/progression.md     # лестницы, milestones, техника, правила GtG
Read: plan/cold.md            # лестница закаливания C0–C7, безопасность, сезонная карта
Read: equipment.md            # турник, резинки, опоры
```

```bash
cd /Users/colz/gitrepos/envs/push_pull-ups
# Активные правила (без этого блока неделю НЕ генерировать)
sqlite3 history/training.db "
SELECT category,name,rating,note,COALESCE(valid_until,'бессрочно') AS valid
FROM training_rules
WHERE valid_until IS NULL OR valid_until >= date('now')
ORDER BY rating ASC,name;"

# Последние недели и динамика
sqlite3 history/training.db "SELECT week_start,push_level,pull_level,summary FROM training_weeks ORDER BY week_start DESC LIMIT 4;"
sqlite3 history/training.db "SELECT metric,value,recorded_at FROM progress ORDER BY recorded_at DESC LIMIT 12;"
sqlite3 history/training.db "SELECT date,block,exercise,planned,done,felt,note FROM exercise_log WHERE week_id=(SELECT MAX(id) FROM training_weeks);"
```

Семантика `rating`: `-2` боль/стоп → НИКОГДА не давать (заменить + добавить мобилизацию);
`-1` временно убрать (пока `valid_until`); `+1` норм; `+2` «зашло» — держать чаще.

## ШАГ 2 — Принять обратную связь
Спроси (или используй сказанное пользователем): что удалось / что было тяжело /
что пропустил / где болело / новые замеры (вис, отжимания).

## ШАГ 3 — Решить прогрессию (autoregulation)
- «Легко и стабильно весь объём» → +1-2 повтора/подхода ИЛИ переход по milestone
  (см. `plan/progression.md`).
- «Тяжело / были пропуски» → удержать тот же объём ещё неделю.
- «Боль» → регрессия + правило `-2` + мобилизация целевого сустава.
- Рабочие подходы держать на 40-60% от текущего максимума (по `progress`).
- Резинки только когда есть (см. profile.json/equipment.md) — иначе pull остаётся
  на висе/активном висе/scapular. Резинки крепим ТОЛЬКО на турник.
- Закалка: ступень из `profile.json.cold` + раздел «Как скилл выбирает закалку»
  в `plan/cold.md`. Активные правила `health` (−1/−2, болезнь) → закалки в неделе
  НЕТ, а тренировочная неделя = мягкий рестарт (объёмы последней реально
  выполненной недели, без прогрессии).

## ШАГ 4 — Разложить неделю
- 4-5 блоков в день по окнам Утро/День/Вечер(+перед сном мобилити). push и pull чередовать.
- 1-2 лёгких дня (короткий вис + мобилити, отжимания вдвое меньше).
- Каждый день — мобилити запястий и плеч.
- +1 карточка закалки в день (блок `cold`) в окне, где душ реально случается;
  содержание — текущая ступень из plan/cold.md. В лёгкие дни закалка остаётся
  (это не тренировка); минимум «15 сек = день засчитан».

## ШАГ 5 — Создать HTML недели
**Имя:** `weeks/2026/week_YYYY-MM-DD.html` (YYYY-MM-DD = понедельник).
- Скопируй структуру и стили из последней недели `weeks/2026/week_2026-05-25.html`
  (НЕ изобретай дизайн): тема, точки `dot-pull/dot-push/dot-mob` (+ `dot-cold`,
  ледяной циан `#5ec8d8`, стиль по аналогии с `dot-mob`), nav
  (Дни/Прогрессия/Техника), флип-модалка, PTR, регистрация SW `/push_pull-ups/sw.js`.
- На каждой колонке дня — `data-date="YYYY-MM-DD"`.
- В карточке: лицо (точка+окно+блок, суть «3×N»), оборот (подходы/повторы/время,
  техника из `plan/progression.md`, строки «тяжело → регрессия / легко → прогрессия»).
- Секция «Прогрессия»: где сейчас + ближайший milestone. «Техника»: разбор упражнений недели.
- `back-link` → `../../index.html`.

## ШАГ 6 — Записать в БД
```bash
sqlite3 history/training.db "
INSERT INTO training_weeks (week_start,week_end,filename,push_level,pull_level,focus,summary)
VALUES ('YYYY-MM-DD','YYYY-MM-DD','weeks/2026/week_YYYY-MM-DD.html','P?','H?','фокус','краткий итог');"
# ВАЖНО: НЕ last_insert_rowid() — это новый процесс sqlite3, он вернёт 0!
WEEK_ID=$(sqlite3 history/training.db "SELECT id FROM training_weeks WHERE week_start='YYYY-MM-DD';")
# по каждому блоку дня:
sqlite3 history/training.db "
INSERT INTO exercise_log (week_id,date,window,block,exercise,planned)
VALUES ($WEEK_ID,'YYYY-MM-DD','утро','pull','вис','3×20 сек');"
```
`done/felt/note/liked` оставить NULL — заполнит пользователь по факту.

## ШАГ 7 — Обновить index.html
Добавь карточку новой недели ПЕРВОЙ в `.menu-list`:
```html
<a class="menu-card" href="weeks/2026/week_YYYY-MM-DD.html">
  <div class="menu-card-left">
    <div class="week">Неделя [дата] · №N</div>
    <div class="days">[push-уровень] · [pull-уровень] · [фокус/особенности]</div>
  </div>
  <div class="menu-card-right">→</div>
</a>
```

## ШАГ 8 — Обновить profile.json при смене уровней/рекордов
Если перешли уровень — обнови `push.level`/`pull.level`/`cold.level` и `updated`.

## ШАГ 9 — Git
```bash
git add weeks/ index.html history/training.db
git commit -m "Неделя [период]: [push/pull-уровни, фокус]"
git push origin main   # если remote настроен
```

## ШАГ 10 — Итог пользователю
```
✅ Неделя [дата] готова!
📄 Файл:   weeks/2026/week_[...].html
💪 PUSH:   [уровень]   🤸 PULL: [уровень]   ❄️ COLD: [ступень]
🎯 Фокус:  [...]
🛟 Лёгкие дни: [...]
🌐 index.html обновлён · Пуш: ✅/❌
Напиши после недели: что удалось / что тяжело / новые замеры.
```

---

## КОМАНДЫ обратной связи (без полной генерации)

| Пользователь | SQL |
|---|---|
| «вис стал 30 сек» | `INSERT INTO progress (metric,value,note) VALUES ('max_hang_sec',30,'user');` |
| «отжиманий от стены 15» | `INSERT INTO progress (metric,value,note) VALUES ('max_pushup_wall',15,'user');` |
| «плечо ноет на висе» | `INSERT INTO training_rules (category,name,rating,note,source) VALUES ('body_part','вис: правое плечо',-2,'боль — пауза + мобилизация','user');` |
| «негативы зашли» | `INSERT INTO training_rules (category,name,rating,note,source) VALUES ('exercise','негативы с лентой',2,'давать чаще','user');` |
| «N надоело на 2 недели» | `INSERT INTO training_rules (category,name,rating,note,valid_until,source) VALUES ('exercise','N',-1,'надоело',date('now','+14 days'),'user');` |
| «во вторник пропустил день-блок» | `UPDATE exercise_log SET done=0,note='пропуск' WHERE week_id=(SELECT MAX(id) FROM training_weeks) AND date='YYYY-MM-DD' AND window='день';` |
| «покажи прогресс» | `SELECT metric,value,recorded_at FROM progress ORDER BY metric,recorded_at;` |
| «обнови вес 126» | обнови `profile.json` → `bodyweight_kg`; `INSERT INTO progress (metric,value,note) VALUES ('bodyweight_kg',126,'user');` |
| «холодный финиш 45 сек спокойно» | `INSERT INTO progress (metric,value,note) VALUES ('cold_finish_sec',45,'user');` |
| «вода из крана 14°» | `INSERT INTO progress (metric,value,note) VALUES ('cold_water_temp_c',14,'user');` |
| «заболел/простыл» | `INSERT INTO training_rules (category,name,rating,note,valid_until,source) VALUES ('health','болезнь',-1,'стоп тренировки и закалку; потом мягкий рестарт',date('now','+10 days'),'user');` |
