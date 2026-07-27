// DOM-слой трекера: контролы на карточках, шторка уточнения, шапка, синхронизация.
import { weekStats, pendingEntries, mergeEntries, sameEntries } from './tracker-core.js';
import { blockFromDotClass, windowFromMealType, isTrackable } from './tracker-parse.js';
import { Store } from './tracker-store.js';
import { pullWeek, syncWeek, AuthError } from './tracker-github.js';

const SYNC_DELAY_MS = 120000;

const store = new Store(window.localStorage);
const device = store.deviceName();
let weekStart = '';
let dates = [];
let entries = [];
let syncTimer = null;
let syncing = false;

const styles = `
.tr-mark{position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:50%;
  border:1.5px solid var(--border);background:transparent;color:var(--text-dim);
  font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;
  z-index:3;padding:0;transition:.15s}
.tr-mark:hover{border-color:var(--accent)}
.tr-mark.done{border-color:var(--accent);background:var(--accent);color:#0d1117;font-weight:600}
.tr-mark.miss{border-color:#7a4a4a;color:#c98080}
.tr-detail{position:absolute;bottom:10px;left:14px;font-size:11px;color:var(--text-dim);
  background:none;border:none;cursor:pointer;padding:2px 0;z-index:3}
.tr-detail:hover{color:var(--accent)}
.tr-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:10px 0 0;
  font-size:12.5px;color:var(--text-dim)}
.tr-bar b{color:var(--accent);font-weight:600}
.tr-dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:#4caf50}
.tr-dot.pending{background:#d9a441}
.tr-dot.error{background:#d95f5f}
.tr-bar button{background:none;border:1px solid var(--border);border-radius:8px;
  color:var(--text-dim);font-size:11.5px;padding:3px 9px;cursor:pointer}
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
  return entries.find(
    e => e.date === card.date && e.block === card.block
      && e.exercise.trim().toLowerCase() === card.exercise.toLowerCase()
  );
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

function render() {
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
  const hasToken = Boolean(store.getToken());
  const dirty = isDirty();
  let state = 'synced';
  if (!hasToken) state = 'error';
  else if (dirty || syncing) state = 'pending';

  bar.innerHTML = '';
  const dot = document.createElement('span');
  dot.className = `tr-dot${state === 'synced' ? '' : ` ${state === 'error' ? 'error' : 'pending'}`}`;
  dot.title = state === 'error' ? 'Нужен токен GitHub'
    : state === 'pending' ? 'Есть неотправленные отметки' : 'Всё сохранено в репозитории';
  bar.appendChild(dot);

  const hits = document.createElement('span');
  hits.append('Попал: ');
  const hitsValue = document.createElement('b');
  hitsValue.textContent = `${stats.hitDays} из ${stats.totalDays}`;
  hits.append(hitsValue, ' дней');
  bar.appendChild(hits);

  const cold = document.createElement('span');
  cold.textContent = `❄️ финишей: ${stats.coldFinishes}`;
  bar.appendChild(cold);

  const button = document.createElement('button');
  button.textContent = hasToken ? (state === 'pending' ? 'Отправить сейчас' : 'Токен') : 'Ввести токен';
  button.onclick = () => (hasToken && state === 'pending' ? runSync() : askToken());
  bar.appendChild(button);
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
  renderBar();
  if (store.getToken()) runPull().then(runSync);
}

function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, SYNC_DELAY_MS);
}

function logPath() {
  return `history/log/${weekStart}.json`;
}

function isDirty() {
  return pendingEntries(entries, store.getSyncedAt(weekStart)).length > 0;
}

function handleSyncError(error) {
  if (error instanceof AuthError) store.clearToken();
  // Отметки уже в localStorage — повторим при следующем открытии страницы.
  console.warn('Синхронизация не удалась:', error.name);
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
    entries = mergeEntries(remoteEntries, entries);
    store.replaceWeek(weekStart, entries);
    // Сравниваем с тем, что реально лежит в репозитории, а не со снимком «было ли грязно»
    // до запроса: отметку, поставленную пока летел ответ, слияние сохранит, и она обязана
    // остаться неотправленной. Между сравнением и записью метки нет await — вклиниться некуда.
    if (sameEntries(entries, remoteEntries)) store.setSyncedAt(weekStart, nowIso());
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
  if (!token || syncing || !isDirty()) { renderBar(); return; }
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
    entries = merged;
    store.replaceWeek(weekStart, merged);
    store.setSyncedAt(weekStart, startedAt);
    render();
  } catch (error) {
    handleSyncError(error);
  } finally {
    syncing = false;
    renderBar();
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
  document.getElementById('tr-sheet-plan').textContent = `План: ${card.planned}`;
  document.getElementById('tr-actual').value = entry.actual || card.planned;
  document.getElementById('tr-note').value = entry.note || '';
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

/* --- запуск --- */

function mount() {
  const dayCols = [...document.querySelectorAll('.day-col[data-date]')];
  if (dayCols.length === 0) return;
  dates = dayCols.map(col => col.dataset.date).sort();
  weekStart = dates[0];
  entries = store.loadWeek(weekStart);

  injectStyles();
  buildSheet();

  document.querySelectorAll('.day-col[data-date] .flip-wrap').forEach(wrap => {
    const card = describeCard(wrap);
    if (!card) return;
    wrap.dataset.tr = '1';
    wrap.style.position = 'relative';

    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'tr-mark';
    mark.onclick = event => {
      event.stopPropagation();
      const entry = findEntry(card);
      saveEntry(card, { done: nextDone(entry ? entry.done : null) });
    };
    wrap.appendChild(mark);

    const detail = document.createElement('button');
    detail.type = 'button';
    detail.className = 'tr-detail';
    detail.textContent = '✎ уточнить';
    detail.hidden = true;
    detail.onclick = event => { event.stopPropagation(); openSheet(card); };
    wrap.appendChild(detail);
  });

  const bar = document.createElement('div');
  bar.className = 'tr-bar';
  bar.id = 'tr-bar';
  const header = document.querySelector('header');
  if (header) header.appendChild(bar);

  render();
  runPull();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
