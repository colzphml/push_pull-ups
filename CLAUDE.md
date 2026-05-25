# CLAUDE.md — проект push_pull-ups

## Контекст
Персональная программа отжиманий и подтягиваний с нуля для colz (~130 кг,
снижает вес — см. проект health_food). Методика — Greasing the Groove: лёгкие
подходы вне отказа, разнесённые по дню. Цель — система/привычка и постепенный
прогресс. Старт: отжимания от стены (P0), вис (H0, ~20 сек).

## Файлы контекста — читать перед генерацией недели
| Файл | Что |
|---|---|
| `profile.json` | 🔒 текущие уровни push/pull, базовые цифры, вес (в .gitignore) |
| `plan/progression.md` | мастер-план: лестницы, milestones, техника, GtG |
| `equipment.md` | турник, резинки (только на турник!), опоры |
| `history/training.db` | SQLite: weeks, exercise_log, progress, training_rules |

## Главный скилл
`/make-week` — генерирует следующую неделю. Запускать через Skill tool.
Перед генерацией ОБЯЗАТЕЛЬНО вычитать активные `training_rules`.

## training_rules (rating)
- `-2` боль/стоп → НИКОГДА не давать (заменить + мобилизация)
- `-1` временно убрать (пока `valid_until >= today`)
- `+1` норм · `+2` «зашло» — держать чаще

## Безопасность (важно при ~130 кг)
- Резинки — ТОЛЬКО петлёй через турник (нога/колено в петле). Двери/мебель как
  якорь НЕ использовать.
- Турник должен держать ≥150 кг.
- Никогда до отказа. Боль = стоп.

## Структура HTML
Эталон: `weeks/2026/week_2026-05-25.html`. Тема — холодная (`--accent:#4f9dd9`,
push `#e0a04e`, mob `#a07fc4`). Карточка: лицо + оборот-модалка (техника). Вкладки
Дни/Прогрессия/Техника. Один человек — без person-switch. SW: `/push_pull-ups/sw.js`.

## Деплой
Репо: `https://github.com/colzphml/push_pull-ups.git`
Pages: `https://colzphml.github.io/push_pull-ups/`
```bash
git add weeks/ index.html history/training.db
git commit -m "Неделя ..." && git push origin main
```
`profile.json` — в .gitignore, не пушить.
