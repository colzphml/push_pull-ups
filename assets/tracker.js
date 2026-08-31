// DOM-слой трекера: контролы на карточках, шторки уточнения и добавления, шапка, синхронизация.
import { weekStats, pendingEntries, mergeEntries, sameEntries, entryKey, syncState, freeCustomTitle } from './tracker-core.js';
import { blockFromDotClass, windowFromMealType, isTrackable } from './tracker-parse.js';
import { Store } from './tracker-store.js';
import { pullWeek, syncWeek, AuthError, describeSyncError } from './tracker-github.js';

const SYNC_DELAY_MS = 120000;

const store = new Store(window.localStorage);
const device = store.deviceName();
let weekStart = '';
let dates = [];
let entries = [];
let syncTimer = null;
let syncing = false;
let lastError = null;

const styles = `
.tr-mark{position:absolute;top:11px;right:11px;width:27px;height:27px;border-radius:50%;
  border:1.5px solid var(--border);background:transparent;color:var(--text-dim);
  font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;
  z-index:3;padding:0;transition:.15s}
.card-front[data-tr] .meal-type{padding-right:32px}
.tr-mark:hover{border-color:var(--accent)}
.tr-mark.done{border-color:var(--accent);background:var(--accent);color:#0d1117;font-weight:600}
.tr-mark.miss{border-color:#7a4a4a;color:#c98080}
.tr-detail{display:inline-block;margin-left:9px;font-size:11px;color:var(--text-dim);
  background:none;border:none;cursor:pointer;padding:2px 0;vertical-align:middle}
/* Явный display перебивает браузерное [hidden]{display:none} — возвращаем скрытие. */
.tr-detail[hidden]{display:none}
.tr-detail:hover{color:var(--accent)}
.tr-bar{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;
  margin:10px 0 0;font-size:12.5px;color:var(--text-dim)}
.tr-bar b{color:var(--accent);font-weight:600}
.tr-dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:#4caf50}
.tr-dot.pending{background:#d9a441}
.tr-dot.error{background:#d95f5f}
.tr-status.pending{color:#d9a441}
.tr-status.error{color:#d95f5f}
.tr-bar button{background:none;border:1px solid var(--border);border-radius:8px;
  color:var(--text-dim);font-size:11.5px;padding:3px 9px;cursor:pointer}
/* Настройка токена нужна раз в полгода — она не должна выглядеть как призыв к действию. */
.tr-gear{border:none;opacity:.55;font-size:13px;padding:3px 4px}
.tr-gear:hover{opacity:1}
.tr-sheet{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;
  align-items:flex-end;justify-content:center;z-index:1000}
.tr-sheet.open{display:flex}
.tr-sheet-inner{background:var(--surface);border:1px solid var(--border);
  border-radius:16px 16px 0 0;padding:20px;width:100%;max-width:520px;max-height:85vh;overflow:auto}
.tr-sheet h3{margin:0 0 4px;font-size:15px}
.tr-sheet .tr-plan{font-size:12px;color:var(--text-dim);margin:0 0 16px}
.tr-sheet label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.6px;
  color:var(--text-dim);margin:14px 0 6px}
.tr-sheet input,.tr-sheet textarea{width:100%;box-sizing:border-box;background:#0f151c;
  border:1px solid var(--border);border-radius:9px;color:inherit;padding:9px 11px;
  font:inherit;font-size:14px}
.tr-chips{display:flex;gap:7px;flex-wrap:wrap}
.tr-chips button{flex:1;min-width:70px;background:#0f151c;border:1px solid var(--border);
  border-radius:9px;color:var(--text-dim);padding:8px 4px;font-size:12.5px;cursor:pointer}
.tr-chips button.on{border-color:var(--accent);color:var(--accent)}
.tr-chips button[data-felt="больно"].on{border-color:#d95f5f;color:#d95f5f}
.tr-actions{display:flex;gap:9px;margin-top:20px}
.tr-actions button{flex:1;padding:11px;border-radius:9px;font-size:13.5px;cursor:pointer;
  border:1px solid var(--border);background:none;color:var(--text-dim)}
.tr-actions .tr-save{background:var(--accent);border-color:var(--accent);color:#0d1117;font-weight:600}
.tr-actions .tr-danger{border-color:#7a4a4a;color:#c98080}
/* Свои активности: точка и кнопка добавления. Классы dot-* по блокам живут в разметке
   недели, но custom-карточки создаёт сам трекер — их точку он и красит. */
.meal-type-dot.dot-custom{background:#d9c96f}
.tr-custom .card-front{cursor:pointer}
.tr-add{display:block;width:100%;margin-bottom:10px;padding:10px 12px;background:transparent;
  border:1.5px dashed var(--border);border-radius:14px;color:var(--text-dim);
  font:inherit;font-size:12px;letter-spacing:.3px;cursor:pointer;text-align:center;transition:.15s}
.tr-add:hover{border-color:var(--accent);color:var(--accent)}
.tr-presets button{flex:1 1 44%}
`;

function injectStyles() {
  const tag = document.createElement('style');
  tag.textContent = styles;
  document.head.appendChild(tag);
}

function nowIso() {
  return new Date().toISOString();
}

/** Собирает описание карточки из существующей разметки недели. */
function describeCard(wrap) {
  const dayCol = wrap.closest('.day-col');
  const dot = wrap.querySelector('.meal-type-dot');
  const title = wrap.querySelector('.meal-title');
  if (!dayCol || !dot || !title) return null;
  const block = blockFromDotClass(dot.className);
  if (!isTrackable(block)) return null;
  const mealType = wrap.querySelector('.meal-type');
  const kcal = wrap.querySelector('.meal-kcal');
  return {
    date: dayCol.dataset.date,
    window: windowFromMealType(mealType ? mealType.textContent : ''),
    block,
    exercise: title.textContent.trim(),
    planned: kcal ? kcal.textContent.trim() : '',
  };
}

function findEntry(card) {
  const key = entryKey(card);
  return entries.find(e => entryKey(e) === key);
}

function saveEntry(card, changes) {
  const existing = findEntry(card) || {};
  const entry = {
    date: card.date,
    window: card.window,
    block: card.block,
    exercise: card.exercise,
    planned: card.planned,
    done: existing.done ?? null,
    actual: existing.actual || '',
    felt: existing.felt || '',
    note: existing.note || '',
    ...changes,
    updated_at: nowIso(),
    device,
  };
  entries = store.upsertEntry(weekStart, entry);
  render();
  scheduleSync();
  return entry;
}

/** Циклический статус: нет отметки → сделал → не вышло → нет отметки. */
function nextDone(current) {
  if (current === 1) return 0;
  if (current === 0) return null;
  return 1;
}

/* --- свои активности --- */

const PRESETS = ['🚶 Прогулка', '🚴 Велосипед', '🏊 Плавание', '🤸 Зарядка', '🧘 Растяжка', '🧹 Дела по дому'];

/** Описание карточки для своей записи — тот же формат, что отдаёт describeCard. */
function customCard(entry) {
  return {
    date: entry.date,
    window: entry.window || 'своё',
    block: 'custom',
    exercise: entry.exercise,
    planned: '',
  };
}

function addCustom(date, name, amount) {
  const exercise = freeCustomTitle(entries, date, name);
  saveEntry(
    { date, window: 'своё', block: 'custom', exercise, planned: '' },
    { done: 1, actual: amount }
  );
}

function buildMark(entry, card) {
  const mark = document.createElement('button');
  mark.type = 'button';
  mark.className = 'tr-mark';
  mark.classList.toggle('done', entry?.done === 1);
  mark.classList.toggle('miss', entry?.done === 0);
  mark.textContent = entry?.done === 1 ? '✓' : entry?.done === 0 ? '✕' : '';
  mark.setAttribute('aria-label',
    entry?.done === 1 ? 'Сделано' : entry?.done === 0 ? 'Не вышло' : 'Отметить выполнение');
  mark.onclick = event => {
    event.stopPropagation();
    const current = findEntry(card);
    saveEntry(card, { done: nextDone(current ? current.done : null) });
  };
  return mark;
}

/**
 * Карточки своих активностей строятся из записей лога, а не из разметки недели:
 * только так они переживают перезагрузку и приходят с другого устройства.
 */
function renderCustom() {
  document.querySelectorAll('.tr-custom').forEach(el => el.remove());
  for (const entry of entries) {
    if (entry.block !== 'custom' || entry.deleted) continue;
    const col = document.querySelector(`.day-col[data-date="${entry.date}"]`);
    if (!col) continue;
    const card = customCard(entry);

    const wrap = document.createElement('div');
    wrap.className = 'flip-wrap tr-custom';
    const inner = document.createElement('div');
    inner.className = 'flip-inner';
    const front = document.createElement('div');
    front.className = 'card-front';
    front.dataset.tr = '1';

    const type = document.createElement('div');
    type.className = 'meal-type';
    const dot = document.createElement('span');
    dot.className = 'meal-type-dot dot-custom';
    type.append(dot, 'Своё · Активность');
    const title = document.createElement('div');
    title.className = 'meal-title';
    title.textContent = entry.exercise;
    front.append(type, title);
    if (entry.actual) {
      const kcal = document.createElement('span');
      kcal.className = 'meal-kcal';
      kcal.textContent = entry.actual;
      front.appendChild(kcal);
    }
    front.appendChild(buildMark(entry, card));
    front.onclick = () => openSheet(card);

    inner.appendChild(front);
    wrap.appendChild(inner);
    col.insertBefore(wrap, col.querySelector('.tr-add'));
  }
}

function render() {
  renderCustom();
  document.querySelectorAll('.flip-wrap[data-tr]').forEach(wrap => {
    const card = describeCard(wrap);
    if (!card) return;
    const entry = findEntry(card);
    const mark = wrap.querySelector('.tr-mark');
    const detail = wrap.querySelector('.tr-detail');
    mark.classList.toggle('done', entry?.done === 1);
    mark.classList.toggle('miss', entry?.done === 0);
    mark.textContent = entry?.done === 1 ? '✓' : entry?.done === 0 ? '✕' : '';
    mark.setAttribute('aria-label',
      entry?.done === 1 ? 'Сделано' : entry?.done === 0 ? 'Не вышло' : 'Отметить выполнение');
    detail.hidden = entry?.done === undefined || entry?.done === null;
  });
  renderBar();
}

function renderBar() {
  const bar = document.getElementById('tr-bar');
  if (!bar) return;
  const stats = weekStats(entries, dates);
  const state = syncState({
    hasToken: Boolean(store.getToken()),
    pendingCount: pendingCount(),
    syncing,
    error: lastError,
  });
  const tone = state.tone === 'ok' ? '' : ` ${state.tone}`;

  bar.innerHTML = '';
  const dot = document.createElement('span');
  dot.className = `tr-dot${tone}`;
  bar.appendChild(dot);

  const hits = document.createElement('span');
  hits.append('Попал: ');
  const hitsValue = document.createElement('b');
  hitsValue.textContent = `${stats.hitDays} из ${stats.totalDays}`;
  hits.append(hitsValue, ' дней');
  bar.appendChild(hits);

  // Гиря — отдельный ежедневный трек, в «Попал» не входит; счётчик — на неделях с kb-блоком.
  if (document.querySelector('.dot-kb') || stats.kbDays > 0) {
    const kb = document.createElement('span');
    kb.textContent = `🏋️ гиря: ${stats.kbDays}`;
    bar.appendChild(kb);
  }

  const cold = document.createElement('span');
  cold.textContent = `❄️ финишей: ${stats.coldFinishes}`;
  bar.appendChild(cold);

  // Счётчик шагов — только на неделях, где такой блок вообще есть; «своё» — когда есть записи.
  if (document.querySelector('.dot-steps') || stats.stepsDays > 0) {
    const steps = document.createElement('span');
    steps.textContent = `🚶 10к: ${stats.stepsDays}`;
    bar.appendChild(steps);
  }
  if (stats.ownDone > 0) {
    const own = document.createElement('span');
    own.textContent = `✚ своё: ${stats.ownDone}`;
    bar.appendChild(own);
  }

  const status = document.createElement('span');
  status.className = `tr-status${tone}`;
  status.textContent = state.label;
  bar.appendChild(status);

  if (state.button) {
    const button = document.createElement('button');
    button.textContent = state.button.label;
    button.onclick = state.button.kind === 'token' ? askToken
      : state.button.kind === 'retry' ? retrySync
      : runSync;
    bar.appendChild(button);
  }

  if (state.settings) {
    const gear = document.createElement('button');
    gear.className = 'tr-gear';
    gear.textContent = '⚙';
    gear.title = 'Токен GitHub';
    gear.setAttribute('aria-label', 'Токен GitHub');
    gear.onclick = askToken;
    bar.appendChild(gear);
  }
}

function askToken() {
  const current = store.getToken();
  const value = window.prompt(
    'Токен GitHub (fine-grained, права Contents: Read and write).\nПустая строка — удалить сохранённый токен.',
    current || ''
  );
  if (value === null) return;
  if (value.trim() === '') store.clearToken();
  else store.setToken(value);
  // Новый токен — новая попытка: старая жалоба к нему уже не относится.
  lastError = null;
  renderBar();
  if (store.getToken()) runPull().then(runSync);
}

/** Кнопка «Повторить»: снимаем прошлую ошибку и проходим цикл целиком. */
function retrySync() {
  lastError = null;
  renderBar();
  runPull().then(runSync);
}

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, SYNC_DELAY_MS);
}

function logPath() {
  return `history/log/${weekStart}.json`;
}

function pendingCount() {
  return pendingEntries(entries, store.getSyncedAt(weekStart)).length;
}

function isDirty() {
  return pendingCount() > 0;
}

function handleSyncError(error) {
  // Стирать токен можно только по 401: там GitHub прямо сказал, что он не годен.
  // При лимите запросов и нехватке прав токен исправен, и его стирание лишь загоняет
  // в круг «ввожу заново — снова не работает».
  if (error instanceof AuthError) store.clearToken();
  lastError = describeSyncError(error);
  // Отметки уже в localStorage — повторим при следующем открытии страницы.
  console.warn('Синхронизация не удалась:', error.name, error.message);
}

/**
 * Подтягивание без записи — вызывается при открытии страницы.
 * Только так отметки, поставленные на другом устройстве, попадают сюда:
 * запись при каждом открытии плодила бы пустые коммиты.
 */
async function runPull() {
  const token = store.getToken();
  if (!token || syncing) { renderBar(); return; }
  syncing = true;
  renderBar();
  try {
    const remoteEntries = await pullWeek({
      fetchFn: window.fetch.bind(window),
      token,
      path: logPath(),
    });
    // Перечитываем хранилище: соседняя вкладка могла что-то отметить, пока летел ответ.
    entries = mergeEntries(remoteEntries, mergeEntries(store.loadWeek(weekStart), entries));
    store.replaceWeek(weekStart, entries);
    // Сравниваем с тем, что реально лежит в репозитории, а не со снимком «было ли грязно»
    // до запроса: отметку, поставленную пока летел ответ, слияние сохранит, и она обязана
    // остаться неотправленной. Между сравнением и записью метки нет await — вклиниться некуда.
    if (sameEntries(entries, remoteEntries)) store.setSyncedAt(weekStart, nowIso());
    lastError = null;
    render();
  } catch (error) {
    handleSyncError(error);
  } finally {
    syncing = false;
    renderBar();
  }
}

/** Отправка: срабатывает по дебаунсу после отметки и по кнопке. */
async function runSync() {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  const token = store.getToken();
  if (!token || !isDirty()) { renderBar(); return; }
  // Чтение уже идёт — не отменяем отправку молча, а откладываем её.
  if (syncing) { scheduleSync(); return; }
  syncing = true;
  renderBar();
  const startedAt = nowIso();
  try {
    const merged = await syncWeek({
      fetchFn: window.fetch.bind(window),
      token,
      path: logPath(),
      weekStart,
      localEntries: entries,
      message: `log: ${weekStart} · отметок: ${entries.length}`,
    });
    // syncWeek работал со снимком, сделанным до запроса. Пока он летел, пользователь мог
    // отметить ещё что-то: без слияния присваивание стёрло бы новую отметку и из памяти,
    // и из localStorage. Метку синхронизации ставим, только если отправлено ровно всё.
    entries = mergeEntries(merged, mergeEntries(store.loadWeek(weekStart), entries));
    store.replaceWeek(weekStart, entries);
    if (sameEntries(entries, merged)) store.setSyncedAt(weekStart, startedAt);
    lastError = null;
    render();
  } catch (error) {
    handleSyncError(error);
  } finally {
    syncing = false;
    renderBar();
  }
}

/**
 * Досылка недель, страница которых больше не открывается.
 * Отметку, поставленную в воскресенье вечером, иначе никто бы не отправил:
 * в понедельник открывается уже другая неделя со своим weekStart.
 */
async function flushOtherWeeks() {
  const token = store.getToken();
  if (!token) return;
  for (const other of store.weekStarts()) {
    if (other === weekStart) continue;
    const stored = store.loadWeek(other);
    if (pendingEntries(stored, store.getSyncedAt(other)).length === 0) continue;
    const startedAt = nowIso();
    try {
      const merged = await syncWeek({
        fetchFn: window.fetch.bind(window),
        token,
        path: `history/log/${other}.json`,
        weekStart: other,
        localEntries: stored,
        message: `log: ${other} · отметок: ${stored.length}`,
      });
      const actual = mergeEntries(merged, store.loadWeek(other));
      store.replaceWeek(other, actual);
      if (sameEntries(actual, merged)) store.setSyncedAt(other, startedAt);
    } catch (error) {
      handleSyncError(error);
    }
  }
}

/* --- шторка уточнения --- */

let sheet = null;

function buildSheet() {
  sheet = document.createElement('div');
  sheet.className = 'tr-sheet';
  sheet.innerHTML = `
    <div class="tr-sheet-inner">
      <h3 id="tr-sheet-title"></h3>
      <p class="tr-plan" id="tr-sheet-plan"></p>
      <label for="tr-actual">Как вышло</label>
      <input id="tr-actual" type="text" autocomplete="off">
      <label>Ощущения</label>
      <div class="tr-chips" id="tr-chips">
        <button type="button" data-felt="легко">легко</button>
        <button type="button" data-felt="норм">норм</button>
        <button type="button" data-felt="тяжело">тяжело</button>
        <button type="button" data-felt="больно">больно</button>
      </div>
      <label for="tr-note">Заметка</label>
      <textarea id="tr-note" rows="2"></textarea>
      <div class="tr-actions">
        <button type="button" class="tr-danger" id="tr-delete" hidden>Удалить</button>
        <button type="button" id="tr-cancel">Отмена</button>
        <button type="button" class="tr-save" id="tr-save">Сохранить</button>
      </div>
    </div>`;
  document.body.appendChild(sheet);
  sheet.addEventListener('click', event => { if (event.target === sheet) closeSheet(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSheet(); });
}

function closeSheet() {
  sheet.classList.remove('open');
  document.body.style.overflow = '';
}

function openSheet(card) {
  const entry = findEntry(card) || {};
  document.getElementById('tr-sheet-title').textContent = card.exercise;
  document.getElementById('tr-sheet-plan').textContent =
    card.block === 'custom' ? 'Своя активность' : `План: ${card.planned}`;
  document.getElementById('tr-actual').value = entry.actual || card.planned;
  document.getElementById('tr-note').value = entry.note || '';
  // Удаление есть только у своих записей: плановая карточка — часть недели, её не удаляют.
  const del = document.getElementById('tr-delete');
  del.hidden = card.block !== 'custom';
  del.onclick = () => {
    if (!window.confirm('Удалить эту запись?')) return;
    saveEntry(card, { deleted: 1 });
    closeSheet();
  };
  const chips = [...document.querySelectorAll('#tr-chips button')];
  chips.forEach(chip => {
    chip.classList.toggle('on', chip.dataset.felt === entry.felt);
    chip.onclick = () => chips.forEach(c => c.classList.toggle('on', c === chip));
  });
  document.getElementById('tr-cancel').onclick = closeSheet;
  document.getElementById('tr-save').onclick = () => {
    const selected = document.querySelector('#tr-chips button.on');
    saveEntry(card, {
      done: entry.done ?? 1,
      actual: document.getElementById('tr-actual').value.trim(),
      felt: selected ? selected.dataset.felt : '',
      note: document.getElementById('tr-note').value.trim(),
    });
    closeSheet();
  };
  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/* --- шторка добавления активности --- */

let addSheet = null;
let addDate = '';

function buildAddSheet() {
  addSheet = document.createElement('div');
  addSheet.className = 'tr-sheet';
  addSheet.innerHTML = `
    <div class="tr-sheet-inner">
      <h3>Добавить активность</h3>
      <p class="tr-plan" id="tr-add-day"></p>
      <label>Быстрый выбор</label>
      <div class="tr-chips tr-presets" id="tr-add-presets"></div>
      <label for="tr-add-name">Что делал</label>
      <input id="tr-add-name" type="text" autocomplete="off" placeholder="Или напиши своими словами">
      <label for="tr-add-amount">Сколько — по желанию</label>
      <input id="tr-add-amount" type="text" autocomplete="off" placeholder="40 мин · 5 км · 12 500 шагов">
      <div class="tr-actions">
        <button type="button" id="tr-add-cancel">Отмена</button>
        <button type="button" class="tr-save" id="tr-add-save">Добавить</button>
      </div>
    </div>`;
  const chips = addSheet.querySelector('#tr-add-presets');
  for (const preset of PRESETS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.textContent = preset;
    chip.onclick = () => {
      addSheet.querySelector('#tr-add-name').value = preset;
      [...chips.children].forEach(c => c.classList.toggle('on', c === chip));
    };
    chips.appendChild(chip);
  }
  document.body.appendChild(addSheet);
  addSheet.addEventListener('click', event => { if (event.target === addSheet) closeAddSheet(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeAddSheet(); });
  addSheet.querySelector('#tr-add-cancel').onclick = closeAddSheet;
  addSheet.querySelector('#tr-add-save').onclick = () => {
    const nameInput = document.getElementById('tr-add-name');
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }
    addCustom(addDate, name, document.getElementById('tr-add-amount').value.trim());
    closeAddSheet();
  };
}

/** Заголовок дня из разметки: «Понедельник, 10 августа» читается лучше, чем ISO-дата. */
function dayTitle(date) {
  const label = document.querySelector(`.day-col[data-date="${date}"] .day-label`);
  const text = label && label.childNodes[0] ? label.childNodes[0].textContent.trim() : '';
  return text || date;
}

function closeAddSheet() {
  addSheet.classList.remove('open');
  document.body.style.overflow = '';
}

function openAddSheet(date) {
  addDate = date;
  document.getElementById('tr-add-day').textContent = dayTitle(date);
  document.getElementById('tr-add-name').value = '';
  document.getElementById('tr-add-amount').value = '';
  [...addSheet.querySelectorAll('#tr-add-presets button')].forEach(c => c.classList.remove('on'));
  addSheet.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/* --- запуск --- */

function mount() {
  const dayCols = [...document.querySelectorAll('.day-col[data-date]')];
  if (dayCols.length === 0) return;
  dates = dayCols.map(col => col.dataset.date).sort();
  weekStart = dates[0];
  entries = store.loadWeek(weekStart);

  injectStyles();
  buildSheet();
  buildAddSheet();

  // Кнопка «+ активность» есть в каждом дне, включая прошедшие: вчерашнюю прогулку
  // тоже надо куда-то записывать. Custom-карточки вставляются перед этой кнопкой.
  dayCols.forEach(col => {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'tr-add';
    add.textContent = '+ активность';
    add.onclick = () => openAddSheet(col.dataset.date);
    col.appendChild(add);
  });

  document.querySelectorAll('.day-col[data-date] .flip-wrap').forEach(wrap => {
    const card = describeCard(wrap);
    if (!card) return;
    wrap.dataset.tr = '1';
    const front = wrap.querySelector('.card-front');
    front.dataset.tr = '1';

    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'tr-mark';
    mark.onclick = event => {
      event.stopPropagation();
      const entry = findEntry(card);
      saveEntry(card, { done: nextDone(entry ? entry.done : null) });
    };
    front.appendChild(mark);

    const detail = document.createElement('button');
    detail.type = 'button';
    detail.className = 'tr-detail';
    detail.textContent = '✎ уточнить';
    detail.hidden = true;
    detail.onclick = event => { event.stopPropagation(); openSheet(card); };
    // Ставим сразу за плашкой плана: абсолютом она садилась ровно на неё.
    const kcal = front.querySelector('.meal-kcal');
    if (kcal) kcal.insertAdjacentElement('afterend', detail);
    else front.appendChild(detail);
  });

  const bar = document.createElement('div');
  bar.className = 'tr-bar';
  bar.id = 'tr-bar';
  const header = document.querySelector('header');
  if (header) header.appendChild(bar);

  // Уход со страницы — последний момент, когда отметку ещё можно отправить.
  // Ждать дебаунса нельзя: вкладку закроют или телефон заблокируют раньше.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') runSync();
  });

  render();
  // Сначала подтягиваем чужие отметки, затем досылаем свои: так неотправленное
  // после прошлого сбоя действительно уедет при следующем открытии страницы.
  runPull().then(runSync).then(flushOtherWeeks);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
