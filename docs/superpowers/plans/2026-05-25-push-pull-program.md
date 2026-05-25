# Программа отжиманий и подтягиваний — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать с нуля персональный PWA-сайт (GitHub Pages) с недельными планами отжиманий/подтягиваний по методике Greasing the Groove, SQLite-историей и скиллом `/make-week` для генерации недель с учётом обратной связи.

**Architecture:** Статический сайт-калька проекта `health_food`: витрина `index.html` со списком недель → недельные файлы `weeks/2026/week_*.html` (вкладки Дни/Прогрессия/Техника, флип-карточки с модалкой). «Мозг» — `plan/progression.md` (лестницы уровней) + `history/training.db` (SQLite) + `profile.json` (состояние). Скилл `/make-week` читает их, принимает фидбэк и генерирует следующую неделю.

**Tech Stack:** HTML/CSS/JS (без сборки), PWA (manifest + service worker), SQLite (`sqlite3` CLI), GitHub Pages. Дизайн-система и проверенный JS (флип-модалка, organizeDays, pull-to-refresh) переиспользуются из `health_food`.

**Источники для копирования (открой перед работой):**
- `/Users/colz/gitrepos/envs/health_food/index.html` — эталон витрины
- `/Users/colz/gitrepos/envs/health_food/menus/2026/week_2026-05-25_pn-vs.html` — эталон недели (структура, JS, PTR)
- `/Users/colz/gitrepos/envs/health_food/.claude/skills/make-menu/SKILL.md` — эталон скилла
- Спецификация: `docs/superpowers/specs/2026-05-25-push-pull-program-design.md`

**Базовый путь GitHub Pages:** `/push_pull-ups/` — используется во ВСЕХ абсолютных ссылках (manifest, SW, иконки).

**Тема (cold/strength), используется во всех HTML:**
```css
:root{
  --bg:#0e1217; --surface:#161d26; --card:#1b232e; --card-back:#1f2a37;
  --border:#2c3a48; --accent:#4f9dd9; --accent-push:#e0a04e; --accent-mob:#a07fc4;
  --text:#e6edf3; --text-muted:#8b9bab; --text-dim:#51606e;
  --tag-bg:#202b38; --shadow:0 8px 32px rgba(0,0,0,0.55);
}
```

---

## Task 1: Каркас репозитория и .gitignore

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Создать `.gitignore`**

```
profile.json
.DS_Store
*.db-journal
```

- [ ] **Step 2: Проверить, что git-репозиторий уже инициализирован**

Run: `git rev-parse --is-inside-work-tree && git branch --show-current`
Expected: `true` и `main`

- [ ] **Step 3: Коммит**

```bash
git add .gitignore
git commit -m "Каркас: .gitignore (profile.json не пушим)"
```

---

## Task 2: PWA — manifest, service worker, иконка

**Files:**
- Create: `manifest.json`
- Create: `sw.js`
- Create: `icons/icon.svg`

- [ ] **Step 1: Создать `manifest.json`**

```json
{
  "name": "Отжимания и подтягивания",
  "short_name": "Push·Pull",
  "start_url": "/push_pull-ups/",
  "scope": "/push_pull-ups/",
  "display": "standalone",
  "background_color": "#0e1217",
  "theme_color": "#0e1217",
  "icons": [
    { "src": "/push_pull-ups/icons/icon.svg", "type": "image/svg+xml", "sizes": "any", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 2: Создать `sw.js` (network-first, чтобы новые недели появлялись; офлайн — из кэша)**

```js
const CACHE = 'pushpull-v1';
const ASSETS = [
  '/push_pull-ups/',
  '/push_pull-ups/index.html',
  '/push_pull-ups/manifest.json',
  '/push_pull-ups/icons/icon.svg'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
```

- [ ] **Step 3: Создать `icons/icon.svg` (турник + фигура, холодная тема)**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0e1217"/>
  <rect x="96" y="120" width="320" height="22" rx="11" fill="#4f9dd9"/>
  <rect x="120" y="120" width="20" height="60" rx="8" fill="#8b9bab"/>
  <rect x="372" y="120" width="20" height="60" rx="8" fill="#8b9bab"/>
  <line x1="212" y1="142" x2="212" y2="210" stroke="#e6edf3" stroke-width="14" stroke-linecap="round"/>
  <line x1="300" y1="142" x2="300" y2="210" stroke="#e6edf3" stroke-width="14" stroke-linecap="round"/>
  <circle cx="256" cy="240" r="34" fill="#e0a04e"/>
  <line x1="256" y1="274" x2="256" y2="356" stroke="#e0a04e" stroke-width="20" stroke-linecap="round"/>
  <line x1="212" y1="210" x2="256" y2="300" stroke="#e6edf3" stroke-width="14" stroke-linecap="round"/>
  <line x1="300" y1="210" x2="256" y2="300" stroke="#e6edf3" stroke-width="14" stroke-linecap="round"/>
  <line x1="256" y1="356" x2="224" y2="420" stroke="#e0a04e" stroke-width="20" stroke-linecap="round"/>
  <line x1="256" y1="356" x2="288" y2="420" stroke="#e0a04e" stroke-width="20" stroke-linecap="round"/>
</svg>
```

- [ ] **Step 4: Проверить валидность JSON и наличие файлов**

Run: `python3 -c "import json;json.load(open('manifest.json'));print('manifest OK')" && test -f sw.js && test -f icons/icon.svg && echo "files OK"`
Expected: `manifest OK` и `files OK`

- [ ] **Step 5: Коммит**

```bash
git add manifest.json sw.js icons/icon.svg
git commit -m "PWA: manifest, service worker, иконка"
```

---

## Task 3: Мастер-план прогрессии `plan/progression.md`

**Files:**
- Create: `plan/progression.md`

- [ ] **Step 1: Создать `plan/progression.md` с полным содержимым**

````markdown
# Мастер-план прогрессии (push/pull, с нуля)

«Мозг» проекта. Скилл `/make-week` читает этот файл вместе с `profile.json`,
активными `training_rules` и историей (`progress`, `exercise_log`).

## Режим: Greasing the Groove (GtG)
- Рабочий подход = ~40-60% от текущего максимума. Всегда запас 3-4 повтора.
- Часто и коротко, разнесено по дню (утро / день / вечер).
- Техника важнее количества. Каждое повторение чистое и подконтрольное.
- Прогресс линейный: +1 повтор или +секунды, когда текущее даётся легко.
  Уровень упражнения меняем только по milestone.
- Боль ≠ мышечная усталость. Боль = стоп + замена (правило `-2` в training_rules).
- Заниматься можно каждый день. 1-2 лёгких/восстановительных дня в неделю:
  короткий вис + мобилити, объём отжиманий вдвое меньше.

## Лестница PUSH (отжимания) + техника
| Ур. | Упражнение | Ключевые cues |
|---|---|---|
| **P0** | От стены | Тело прямое (планка), руки на ширине плеч, локти ~45°, грудь к стене, полный диапазон |
| P1 | От высокой опоры (стол/подоконник) | То же; чем ниже опора — тем тяжелее |
| P2 | От низкой опоры (диван/устойчивый стул) | Корпус прямой, не проваливать поясницу |
| P3 | С колен | Колени-таз-плечи на одной линии, не задирать таз |
| P4 | Негативы в полный рост + с колен | Опускание 3-5 сек подконтрольно, вверх — с колен |
| P5 | Полные отжимания | Лопатки сводим внизу, тело-планка |
| P6+ | Объём полных → узкие, с паузой, archer | Позже |

## Лестница PULL (подтягивания) + техника
| Ур. | Упражнение | Ключевые cues |
|---|---|---|
| **H0** | Вис пассивный | Хват на ширине плеч, плечи опустить от ушей, дышать, расслабить |
| H1 | Вис активный | Из виса свести и опустить лопатки вниз-назад, удержать |
| H2 | Подтягивание лопатками (scapular pulls) | Руки прямые, тянем тело вверх только лопатками, маленькая амплитуда |
| H3 | Негативы с резинкой | Петля через турник, нога/колено в петле; встать/прыгнуть наверх, опускаться 3-5 сек |
| H4 | Подтягивания с резинкой (band-assisted) | Та же петля; полный диапазон, подбородок к перекладине |
| H5 | Полные подтягивания | Без рывка, грудь к перекладине, контроль вниз |

**Резинки крепим ТОЛЬКО на турник** (нога/колено в петле). Двери/мебель как
якорь не используем — при ~130 кг риск вырвать. Горизонтальные band rows — НЕ
обязательная часть; опция только под железобетонным столом или на кольцах,
повешенных на турник (нагрузка тоже на турник).

## Milestones перехода (скилл уточняет по факту)
- PUSH: 3×8-10 чисто и легко на свежесть → следующий уровень лестницы.
- HANG: вис 3×30 сек уверенно → активный вис + scapular + (с лентой) негативы.
- NEGATIVE: контролируемый негатив 3-5 сек с лентой → подтягивания с лентой.
- BAND PULL-UP: уверенно с лентой → более тонкая лента → первое полное.

## Суставы — мобилизация ежедневно (особенно лёгкие дни)
- Запястья: растяжка сгибателей и разгибателей (ладонь от себя/к себе) 2×20 сек.
- Плечи: вращения, растяжка в дверном проёме, «доставание лопаток» 2×20 сек.
- Грудной отдел: раскрытие, кошка-корова 30-40 сек.

## Ожидания (вес ~130 кг)
Первые недели — фундамент: вис, активный вис, scapular, объём отжиманий с малых
уровней. Полное подтягивание придёт позже; каждый сброшенный кг (см. health_food)
прямо облегчает push и pull. Цель сейчас — система/привычка, не рекорды.

## Как скилл выбирает следующую неделю
1. Берёт текущие уровни push/pull из `profile.json`.
2. Смотрит фидбэк и последние `progress`/`exercise_log`.
3. «Легко и стабильно» → +объём или переход по milestone. «Тяжело/пропуски/боль»
   → удержать или регрессировать; боль → правило `-2` и замена + мобилизация.
4. Раскладывает 4-5 блоков по окнам (push и pull чередуются), 1-2 лёгких дня.
````

- [ ] **Step 2: Проверить наличие и ключевые секции**

Run: `test -f plan/progression.md && grep -c "Greasing the Groove\|Лестница PUSH\|Лестница PULL\|Milestones" plan/progression.md`
Expected: файл есть, число ≥ 4

- [ ] **Step 3: Коммит**

```bash
git add plan/progression.md
git commit -m "Мастер-план прогрессии: лестницы push/pull, GtG, milestones"
```

---

## Task 4: Экипировка `equipment.md`

**Files:**
- Create: `equipment.md`

- [ ] **Step 1: Создать `equipment.md`**

```markdown
# Экипировка

## Турник
Есть, высокий, фиксированный. **Проверить нагрузку ≥150 кг** (при ~130 кг тела
+ рывок нужен запас прочности).

## Резинки — купить (петлевые / loop)
| Лента | Ширина | Помощь (прибл.) | Назначение |
|---|---|---|---|
| Супер-тяжёлая (обязательно) | ~65 мм | ~30-70 кг | Подтягивания/негативы с большой помощью на старте |
| Экстра-тяжёлая (обязательно) | ~45 мм | ~23-54 кг | В связке с первой; одна — когда окрепнешь |
| Средняя (опц., позже) | ~22-32 мм | ~10-40 кг | Меньше помощи; мобилити плеч |

Помощь ленты максимальна внизу (где слабее всего) — это удобно.
**Крепим ТОЛЬКО на турник:** петля через перекладину, нога/колено в петле —
band-assisted подтягивания и негативы. Двери/мебель как якорь НЕ используем
(риск вырвать при ~130 кг).

## Опоры без покупок
- Отжимания P0-P2: стена → подоконник/стол → диван/устойчивый стул.
- Горизонтальные тяги — НЕ обязательная часть. Опции: под железобетонным столом
  либо позже на кольцах/петлях, повешенных на турник (нагрузка на турник).

## Опционально позже
- Гимнастические кольца/петли на турник — для чистых горизонтальных тяг.
```

- [ ] **Step 2: Проверить**

Run: `test -f equipment.md && grep -q "ТОЛЬКО на турник" equipment.md && echo OK`
Expected: `OK`

- [ ] **Step 3: Коммит**

```bash
git add equipment.md
git commit -m "Экипировка: турник, резинки под 130 кг, опоры"
```

---

## Task 5: База данных и профиль

**Files:**
- Create: `history/schema.sql`
- Create: `history/training.db` (генерируется из schema.sql)
- Create: `profile.json`

- [ ] **Step 1: Создать `history/schema.sql`**

```sql
CREATE TABLE training_weeks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  week_end   TEXT NOT NULL,
  filename   TEXT NOT NULL,
  push_level TEXT,
  pull_level TEXT,
  focus      TEXT,
  summary    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE exercise_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id  INTEGER REFERENCES training_weeks(id),
  date     TEXT,
  window   TEXT,   -- утро / день / вечер / перед сном
  block    TEXT,   -- push / pull / mob
  exercise TEXT,
  planned  TEXT,   -- "3×6 от стены"
  done     INTEGER,-- 1 / 0 / NULL
  felt     TEXT,   -- rpe или словом
  note     TEXT,
  liked    INTEGER -- 1 / 0 / NULL
);

CREATE TABLE progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at TEXT DEFAULT (datetime('now')),
  metric TEXT NOT NULL,  -- max_pushup_wall, max_pushup_knee, max_hang_sec, max_active_hang_sec, max_negative_sec, max_band_pullup
  value  REAL NOT NULL,
  note   TEXT
);

CREATE TABLE training_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT,            -- exercise / cue / body_part
  name     TEXT NOT NULL,
  rating   INTEGER NOT NULL,-- -2 стоп/боль, -1 временно убрать, +1 норм, +2 чаще
  note     TEXT,
  valid_until TEXT,
  source   TEXT,            -- user / coach
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Создать БД из схемы**

Run: `sqlite3 history/training.db < history/schema.sql`
Expected: без ошибок

- [ ] **Step 3: Проверить таблицы**

Run: `sqlite3 history/training.db ".tables"`
Expected: `exercise_log  progress  training_rules  training_weeks`

- [ ] **Step 4: Создать `profile.json` (стартовое состояние)**

```json
{
  "name": "colz",
  "bodyweight_kg": 130,
  "updated": "2026-05-25",
  "push": { "level": "P0", "label": "отжимания от стены", "max_reps": null },
  "pull": { "level": "H0", "label": "вис", "max_hang_sec": 20 },
  "bands": "в пути (супер-тяжёлая ~65мм + экстра ~45мм)",
  "notes": "старт; максимумы калибруем в неделе 1"
}
```

- [ ] **Step 5: Проверить, что profile.json валиден и игнорируется git**

Run: `python3 -c "import json;json.load(open('profile.json'));print('profile OK')" && git check-ignore profile.json`
Expected: `profile OK` и строка `profile.json`

- [ ] **Step 6: Коммит (БД и схема коммитятся, profile.json — нет)**

```bash
git add history/schema.sql history/training.db
git commit -m "БД training.db: weeks, exercise_log, progress, training_rules"
```

---

## Task 6: Витрина `index.html`

**Files:**
- Create: `index.html`
- Reference: `/Users/colz/gitrepos/envs/health_food/index.html`

- [ ] **Step 1: Открыть эталон и понять блоки**

Run: `sed -n '1,135p' /Users/colz/gitrepos/envs/health_food/index.html`
Изучи: `<head>` с PWA-тегами, `:root`, `.menu-card`, `header`, блок `#ptr` и PTR-скрипт в конце.

- [ ] **Step 2: Создать `index.html`** — структура та же, но новая тема, копирайт и пути `/push_pull-ups/`. Полное содержимое:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Отжимания и подтягивания — программа</title>
<link rel="manifest" href="/push_pull-ups/manifest.json">
<meta name="theme-color" content="#0e1217">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Push·Pull">
<link rel="apple-touch-icon" href="/push_pull-ups/icons/icon.svg">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#0e1217; --surface:#161d26; --card:#1b232e; --card-back:#1f2a37;
    --border:#2c3a48; --accent:#4f9dd9; --accent-push:#e0a04e; --accent-mob:#a07fc4;
    --text:#e6edf3; --text-muted:#8b9bab; --text-dim:#51606e;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh;padding:0 0 60px}
  body{padding-bottom:env(safe-area-inset-bottom,16px)}
  header{padding:40px 24px 0;text-align:center}
  header{padding-top:max(40px,calc(env(safe-area-inset-top) + 16px))}
  header::after{content:'';display:block;width:60px;height:2px;background:var(--accent);margin:14px auto 0;border-radius:2px}
  header h1{font-family:'Playfair Display',serif;font-size:clamp(22px,5vw,36px);color:var(--text)}
  header p{margin-top:6px;color:var(--text-muted);font-size:13px}
  main{max-width:700px;margin:40px auto 0;padding:0 20px}
  h2{font-family:'Playfair Display',serif;font-size:18px;color:var(--accent);margin-bottom:16px}
  .menu-list{display:flex;flex-direction:column;gap:10px}
  .menu-card{display:flex;align-items:center;justify-content:space-between;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 20px;text-decoration:none;color:var(--text);transition:border-color .2s,box-shadow .2s}
  .menu-card:hover{border-color:var(--accent);box-shadow:0 0 0 1px #4f9dd933}
  .menu-card-left .week{font-size:14px;font-weight:500}
  .menu-card-left .days{font-size:12px;color:var(--text-muted);margin-top:3px}
  .menu-card-right{font-size:12px;color:var(--accent-push);font-weight:500;white-space:nowrap}
  .empty{color:var(--text-dim);font-size:13px;text-align:center;padding:40px 0}
  .intro{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin-bottom:22px;font-size:13px;color:var(--text-muted);line-height:1.6}
  .intro b{color:var(--text)}
</style>
</head>
<body>
<header>
  <h1>Отжимания и подтягивания</h1>
  <p>Программа с нуля · по неделям · подходами в течение дня</p>
</header>
<main>
  <div class="intro">
    Режим <b>Greasing the Groove</b>: лёгкие подходы вне отказа, разнесённые по дню.
    Жми неделю → внутри дни с карточками (утро/день/вечер). Нажми карточку — детали и техника.
  </div>
  <h2>Недели</h2>
  <div class="menu-list">

    <a class="menu-card" href="weeks/2026/week_2026-05-25.html">
      <div class="menu-card-left">
        <div class="week">Неделя 25 мая 2026 · №1</div>
        <div class="days">Калибровка · P0 отжимания от стены · H0 вис · мобилити · каждый день, Чт и Вс полегче</div>
      </div>
      <div class="menu-card-right">→</div>
    </a>

  </div>
</main>

<!-- Pull-to-refresh -->
<div id="ptr" aria-hidden="true">
  <svg viewBox="0 0 44 76" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect id="ptr-bar" x="6" y="40" width="32" height="5" rx="2.5" fill="#4f9dd9"/>
    <circle id="ptr-head" cx="22" cy="56" r="6" fill="#e0a04e" opacity="0"/>
  </svg>
</div>

<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/push_pull-ups/sw.js', { scope: '/push_pull-ups/' });
  }
  // Pull-to-refresh (минимальный)
  (function(){
    const ptr=document.getElementById('ptr');
    if(!ptr) return;
    const head=document.getElementById('ptr-head');
    const THRESHOLD=82; let startY=0,delta=0,active=false;
    function draw(p){ ptr.style.top=(-76+p*90)+'px'; ptr.style.opacity=Math.min(p*2.5,1); head.style.opacity=Math.max(0,(p-0.5)/0.5); }
    function retract(){ ptr.style.transition='top .28s ease,opacity .22s ease'; ptr.style.top='-76px'; ptr.style.opacity='0'; setTimeout(()=>{ptr.style.cssText='';head.style.opacity='0';},300); }
    document.addEventListener('touchstart',e=>{ if(window.scrollY!==0)return; startY=e.touches[0].clientY; active=true; ptr.style.cssText='transition:none'; },{passive:true});
    document.addEventListener('touchmove',e=>{ if(!active)return; delta=Math.max(0,e.touches[0].clientY-startY); draw(Math.min(delta/THRESHOLD,1)); },{passive:true});
    document.addEventListener('touchend',()=>{ if(!active)return; active=false; if(delta>THRESHOLD){ location.reload(); } else { retract(); } delta=0; });
  })();
</script>
<style>
  #ptr{position:fixed;top:-76px;left:50%;transform:translateX(-50%);width:44px;height:76px;z-index:999;pointer-events:none;opacity:0}
</style>
</body>
</html>
```

- [ ] **Step 3: Проверить структуру**

Run: `python3 -c "import re,sys;h=open('index.html').read();assert '/push_pull-ups/manifest.json' in h;assert 'week_2026-05-25.html' in h;assert '--accent:#4f9dd9' in h;print('index OK')"`
Expected: `index OK`

- [ ] **Step 4: Коммит**

```bash
git add index.html
git commit -m "Витрина index.html: список недель, холодная тема, PWA"
```

---

## Task 7: Первая неделя `weeks/2026/week_2026-05-25.html` (калибровка)

**Files:**
- Create: `weeks/2026/week_2026-05-25.html`
- Reference: `/Users/colz/gitrepos/envs/health_food/menus/2026/week_2026-05-25_pn-vs.html`

**Что переиспользуем из эталона (скопировать ВЕРБАТИМ, затем поправить):**
- Весь CSS из `<style>` (но `:root` заменить на нашу тему; цвета точек — см. ниже).
- Скрипт в конце файла: функции `showSection`, `openCard`, `organizeDays`, регистрация SW, блок PTR. **УДАЛИТЬ** `showPerson` и `.person-switch` (у нас один человек). В регистрации SW заменить путь на `/push_pull-ups/sw.js`.
- Структуру `back-link → header → nav → section`.

**Изменения относительно эталона:**
1. `<head>`: title/манифест/иконка → пути `/push_pull-ups/`, тема как в Task 6.
2. Точки блоков вместо приёмов пищи:
   ```css
   .dot-pull{background:#4f9dd9}
   .dot-push{background:#e0a04e}
   .dot-mob{background:#a07fc4}
   .dot-rest{background:#51606e}
   ```
3. `nav`: три вкладки — `📅 Дни`, `📈 Прогрессия`, `🧰 Техника` (через `showSection('days'|'progress'|'tech')`).
4. Убрать `.person-switch` и атрибуты `data-sergey/data-elvira` — у карточек один набор данных.
5. `back-link` → `<a class="back-link" href="../../index.html">← Все недели</a>`.

- [ ] **Step 1: Открыть эталон целиком (особенно JS в конце)**

Run: `sed -n '670,1496p' /Users/colz/gitrepos/envs/health_food/menus/2026/week_2026-05-25_pn-vs.html`
Изучи разметку секций «Покупки»/«Готовка» (заменим на «Прогрессия»/«Техника») и скрипты `showSection`/`openCard`/`organizeDays`/PTR.

- [ ] **Step 2: Создать файл с `<head>` + темой + классами**

Скопируй `<head>` и `<style>` из эталона, применив тему Task 6 и точки блоков (выше). Сохрани все классы карточек: `.day-col`, `.day-label`, `.flip-wrap`, `.card-front`, `.meal-type`(оставь имя класса), `.meal-type-dot`, `.meal-title`, `.meal-kcal`(переиспользуем как «бейдж объёма»), `.flip-hint`, `#card-modal`, `.portion-row`, `.recipe-*`, `.day-col.today`, `.day-col.past`, `.past-header`. Это даёт работающую флип-модалку «из коробки».

- [ ] **Step 3: Заполнить секцию «Дни»** — `data-date` на каждой колонке. Карточка одного блока выглядит так (пример — утренний pull понедельника):

```html
<div class="flip-wrap" onclick="openCard(this)">
  <div class="flip-inner">
    <div class="card-front">
      <div class="meal-type"><span class="meal-type-dot dot-pull"></span>Утро · Подтягивания</div>
      <div class="meal-title">Вис на перекладине</div>
      <span class="meal-kcal">3 × 15-20 сек</span>
      <div class="flip-hint">↻ детали</div>
    </div>
    <div class="card-back">
      <div class="back-title">Вис — как делать</div>
      <div class="portion-row"><span class="portion-name">Подходы</span><span class="portion-amount">3</span></div>
      <div class="portion-row"><span class="portion-name">Время</span><span class="portion-amount">15-20 сек</span></div>
      <div class="portion-row"><span class="portion-name">Отдых</span><span class="portion-amount">60-90 сек</span></div>
      <div class="recipe-divider"></div>
      <div class="recipe-label">Техника</div>
      <div class="recipe-step"><div class="recipe-num">1</div><div class="recipe-text">Хват на ширине плеч, плечи опустить <strong>от ушей вниз</strong>, дышать ровно.</div></div>
      <div class="recipe-step"><div class="recipe-num">2</div><div class="recipe-text">Слезай <em>до</em> срыва хвата — копим запас, не до отказа.</div></div>
      <div class="recipe-note">Тяжело? Меньше времени (3×10 сек). Легко? +5 сек.</div>
    </div>
  </div>
</div>
```

Данные на 7 дней (повторить структуру карточки с этими значениями; «Перед сном · Мобилити» — каждый день одинаковый):

| День (data-date) | Утро · Pull | День · Push | Вечер · Pull | Вечер · Push | Перед сном · Mob |
|---|---|---|---|---|---|
| Пн 2026-05-25 | Вис 3×15-20 сек | От стены 3×8 | Активный вис 3×10-15 сек | От стены 3×8 | Запястья+плечи 3-4 мин |
| Вт 2026-05-26 | Вис 3×15-20 сек | От стены 3×8 | Активный вис 3×10-15 сек | От стены 3×8 | Запястья+плечи 3-4 мин |
| Ср 2026-05-27 | Вис 3×18-22 сек | От стены 3×10 | Активный вис 3×12 сек | От стены 3×10 | Запястья+плечи 3-4 мин |
| **Чт 2026-05-28 (лёгкий)** | Вис 2×15 сек | От стены 2×8 | — | — | Мобилити 5 мин |
| Пт 2026-05-29 | Вис 3×18-22 сек | От стены 3×10 | Активный вис 3×12 сек | От стены 3×10 | Запястья+плечи 3-4 мин |
| Сб 2026-05-30 | Вис 3×20-25 сек | От стены 3×10-12 | Scapular pulls 3×5 | От стены 3×10-12 | Запястья+плечи 3-4 мин |
| **Вс 2026-05-31 (лёгкий)** | Вис 2×20 сек | От стены 2×10 | — | — | Мобилити 5 мин |

Для лёгких дней добавь колонке класс `day-col cheatmeal`→ переименуй стиль: используй класс `day-col light` и в CSS:
```css
.day-col.light .day-label{color:var(--accent-mob);border-bottom-color:var(--accent-mob)}
```
И баннер в начале лёгкого дня:
```html
<div class="cheat-banner" style="border-color:var(--accent-mob);color:#c9b8e6;background:#231d2e">
  <strong>Лёгкий день.</strong> Меньше объёма, упор на мобилити и восстановление.
</div>
```

Техника по упражнениям (используй в `card-back` соответствующих карточек):
- **От стены (push):** тело прямое как планка; руки на ширине плеч на стене; локти ~45°; грудь к стене и обратно полностью; пресс/ягодицы в тонусе. Тяжело → шагни ближе к стене. Легко → шагни дальше / опора ниже (P1).
- **Активный вис (pull):** из виса свести и опустить лопатки вниз-назад, корпус чуть напрячь, удержать. Это подготовка к scapular pulls.
- **Scapular pulls (pull):** руки прямые, тянем тело вверх ТОЛЬКО лопатками (маленькая амплитуда), пауза вверху 1 сек, медленно вниз.
- **Мобилити:** запястья — ладони от себя и к себе по 20 сек; плечи — вращения + растяжка в дверном проёме 20 сек; кошка-корова 30 сек.

- [ ] **Step 4: Секция «Прогрессия»** (`<section class="section" id="progress">`):

```html
<div class="info-card" style="background:var(--card);border:1px solid var(--border);border-radius:18px;padding:28px;margin-bottom:16px">
  <h2 style="font-family:'Playfair Display',serif;font-size:20px;color:var(--text);margin-bottom:6px">Где ты сейчас</h2>
  <p style="font-size:12px;color:var(--text-muted);margin-bottom:18px">Неделя 1 — калибровка и техника</p>
  <div class="portion-row"><span class="portion-name">Отжимания (PUSH)</span><span class="portion-amount" style="color:var(--accent-push)">P0 · от стены</span></div>
  <div class="portion-row"><span class="portion-name">Подтягивания (PULL)</span><span class="portion-amount">H0 · вис (~20 сек)</span></div>
  <div class="recipe-divider"></div>
  <div class="recipe-label">Ближайшая цель</div>
  <div class="recipe-step"><div class="recipe-num">1</div><div class="recipe-text"><strong>PUSH:</strong> 3×8-10 от стены легко и чисто → переходим к P1 (от стола).</div></div>
  <div class="recipe-step"><div class="recipe-num">2</div><div class="recipe-text"><strong>PULL:</strong> вис 3×30 сек уверенно → активный вис и scapular в каждый день.</div></div>
  <div class="recipe-note">📏 На этой неделе сделай 1 замер без отказа: сколько чистых отжиманий от стены и сколько секунд чистого виса. Напиши мне — внесу в прогресс и рассчитаю рабочие подходы (40-60%).</div>
</div>
```

- [ ] **Step 5: Секция «Техника»** (`<section class="section" id="tech">`): карточки-блоки с разбором каждого упражнения недели (вис, активный вис, scapular pulls, отжимания от стены, мобилити) в формате `cook-block`/`recipe-step` из эталона. Текст cues — из Step 3.

- [ ] **Step 6: Скрипт в конце** — скопировать из эталона `showSection`, `openCard`, `organizeDays`, PTR и регистрацию SW. Удалить `showPerson`. Заменить путь SW на `/push_pull-ups/sw.js`. `organizeDays` использует `data-date` — оставить как есть (подсветит «сегодня», уведёт прошедшие дни в конец).

- [ ] **Step 7: Проверить структуру**

Run: `python3 -c "h=open('weeks/2026/week_2026-05-25.html').read();assert h.count('data-date=')==7,'нужно 7 дней';assert 'showPerson' not in h,'person-switch не убран';assert '/push_pull-ups/sw.js' in h;assert 'dot-pull' in h and 'dot-push' in h;assert \"showSection('progress')\" in h or 'id=\"progress\"' in h;print('week OK')"`
Expected: `week OK`

- [ ] **Step 8: Открыть в браузере и проверить вручную**

Run: `python3 -m http.server 8000` (в фоне), затем открой `http://localhost:8000/weeks/2026/week_2026-05-25.html`
Проверь: вкладки Дни/Прогрессия/Техника переключаются; клик по карточке открывает модалку с техникой; сегодняшний день подсвечен; на мобильной ширине колонки в один столбец.

- [ ] **Step 9: Коммит**

```bash
git add weeks/2026/week_2026-05-25.html
git commit -m "Неделя 1 (калибровка): вис + отжимания от стены + мобилити"
```

---

## Task 8: Скилл `/make-week`

**Files:**
- Create: `.claude/skills/make-week/SKILL.md`
- Reference: `/Users/colz/gitrepos/envs/health_food/.claude/skills/make-menu/SKILL.md`

- [ ] **Step 1: Создать `.claude/skills/make-week/SKILL.md`**

````markdown
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
Read: profile.json            # текущие уровни push/pull, базовые цифры, вес
Read: plan/progression.md     # лестницы, milestones, техника, правила GtG
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
  на висе/активном висе/scapular.

## ШАГ 4 — Разложить неделю
- 4-5 блоков в день по окнам Утро/День/Вечер(+перед сном мобилити). push и pull чередовать.
- 1-2 лёгких дня (короткий вис + мобилити, отжимания вдвое меньше).
- Каждый день — мобилити запястий и плеч.

## ШАГ 5 — Создать HTML недели
**Имя:** `weeks/2026/week_YYYY-MM-DD.html` (YYYY-MM-DD = понедельник).
- Скопируй структуру и стили из последней недели `weeks/2026/week_2026-05-25.html`
  (НЕ изобретай дизайн): тема, точки `dot-pull/dot-push/dot-mob`, nav
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
WEEK_ID=$(sqlite3 history/training.db "SELECT last_insert_rowid();")
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
Если перешли уровень — обнови `push.level`/`pull.level` и `updated`.

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
💪 PUSH:   [уровень]   🤸 PULL: [уровень]
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
````

- [ ] **Step 2: Проверить frontmatter и шаги**

Run: `grep -q "^name: make-week" .claude/skills/make-week/SKILL.md && grep -c "ШАГ" .claude/skills/make-week/SKILL.md`
Expected: число ≥ 10

- [ ] **Step 3: Коммит**

```bash
git add .claude/skills/make-week/SKILL.md
git commit -m "Скилл /make-week: генерация недели с учётом фидбэка"
```

---

## Task 9: CLAUDE.md и README.md

**Files:**
- Create: `CLAUDE.md`
- Create: `README.md`

- [ ] **Step 1: Создать `CLAUDE.md`**

````markdown
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
````

- [ ] **Step 2: Создать `README.md`**

```markdown
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
```

- [ ] **Step 3: Проверить**

Run: `test -f CLAUDE.md && test -f README.md && grep -q "Greasing the Groove" CLAUDE.md && echo OK`
Expected: `OK`

- [ ] **Step 4: Коммит**

```bash
git add CLAUDE.md README.md
git commit -m "Документация: CLAUDE.md и README.md"
```

---

## Task 10: Финальная проверка и деплой

**Files:** нет новых — проверка целостности.

- [ ] **Step 1: Проверить дерево проекта**

Run: `find . -type f -not -path './.git/*' -not -path './docs/*' | sort`
Expected (порядок не важен):
```
./.claude/skills/make-week/SKILL.md
./.gitignore
./CLAUDE.md
./README.md
./equipment.md
./history/schema.sql
./history/training.db
./icons/icon.svg
./index.html
./manifest.json
./plan/progression.md
./sw.js
./weeks/2026/week_2026-05-25.html
```
(`profile.json` есть локально, но НЕ в git — это норма.)

- [ ] **Step 2: Локальный прогон сайта**

Run: `python3 -m http.server 8000`
Открой `http://localhost:8000/`:
- Витрина показывает неделю №1 → клик ведёт в неделю.
- Внутри: вкладки переключаются, карточки открывают модалку с техникой, сегодня подсвечен.
- DevTools → Application → Manifest без ошибок, Service Worker регистрируется.

- [ ] **Step 3: Проверить, что git чист и история на месте**

Run: `git status --short && git log --oneline`
Expected: рабочее дерево чисто (кроме untracked `profile.json`), 9-10 коммитов реализации.

- [ ] **Step 4: Деплой — ШАГИ ПОЛЬЗОВАТЕЛЯ (выполняет colz)**

> Сообщить пользователю выполнить:
> 1. Создать пустой репозиторий `push_pull-ups` на GitHub (без README/лицензии).
> 2. ```bash
>    git remote add origin https://github.com/colzphml/push_pull-ups.git
>    git push -u origin main
>    ```
> 3. GitHub → репозиторий → Settings → Pages → Source: `main / (root)` → Save.
> 4. Через ~1 мин сайт: `https://colzphml.github.io/push_pull-ups/`. Добавить на экран «Домой» на iPhone.

- [ ] **Step 5 (после пуша): проверить деплой**

Открой `https://colzphml.github.io/push_pull-ups/` — витрина и неделя грузятся, иконка/манифест подхватились.

---

## Self-review заметки
- Покрытие спеца: §3 методика → Task 3; §4 день/карточки → Task 7; §5 тема → Tasks 6-7; §6 файлы → все; §7 БД → Task 5; §8 скилл → Task 8; §9 экипировка → Task 4; §10 деплой → Task 10; §11 старт → Task 7 (неделя 1 калибровка) + Task 5 (profile.json).
- Типы/имена согласованы: классы карточек переиспользуются из эталона (`flip-wrap/card-front/card-back/openCard`); точки `dot-pull/dot-push/dot-mob/dot-rest`; вкладки `days/progress/tech`; метрики `progress.metric` совпадают между Task 5, 7, 8.
- PNG-иконки и анимация PTR-«фигурки» — упрощены (SVG, минимальный PTR); полноценные PNG/анимация — необязательная полировка позже.
