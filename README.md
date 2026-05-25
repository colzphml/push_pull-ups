# 💪 Push·Pull — отжимания и подтягивания с нуля

Персональная программа по методике Greasing the Groove: лёгкие подходы вне отказа,
разнесённые по дню. Недели карточками, прогресс в SQLite, генерация через скилл.

## Как пользоваться
- Сгенерировать неделю: `/make-week`
- Дать обратную связь: «вис стал 30 сек», «плечо ноет», «во вторник пропустил»
- Посмотреть прогресс: «покажи прогресс»

## Структура
```
push_pull-ups/
├── index.html              # витрина: список недель
├── weeks/2026/week_*.html  # недели (Дни/Прогрессия/Техника)
├── plan/progression.md     # мастер-план прогрессии
├── equipment.md            # турник, резинки
├── profile.json            # 🔒 состояние (в .gitignore)
├── history/training.db     # SQLite
└── .claude/skills/make-week/SKILL.md
```

## GitHub Pages
https://colzphml.github.io/push_pull-ups/ — Settings → Pages → Source: `main / (root)`.
