// Хранилище на устройстве. Хранилище инжектится, чтобы тесты шли без браузера.
import { entryKey } from './tracker-core.js';

const TOKEN_KEY = 'ppu:token';
const DEVICE_KEY = 'ppu:device';
const logKey = weekStart => `ppu:log:${weekStart}`;
const syncKey = weekStart => `ppu:synced:${weekStart}`;

export class Store {
  constructor(storage) {
    this.storage = storage;
  }

  #readJson(key, fallback) {
    const raw = this.storage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  getToken() {
    return this.storage.getItem(TOKEN_KEY);
  }

  setToken(token) {
    this.storage.setItem(TOKEN_KEY, String(token).trim());
  }

  clearToken() {
    this.storage.removeItem(TOKEN_KEY);
  }

  loadWeek(weekStart) {
    const data = this.#readJson(logKey(weekStart), []);
    return Array.isArray(data) ? data : [];
  }

  upsertEntry(weekStart, entry) {
    const key = entryKey(entry);
    const entries = this.loadWeek(weekStart).filter(e => entryKey(e) !== key);
    entries.push(entry);
    this.replaceWeek(weekStart, entries);
    return entries;
  }

  replaceWeek(weekStart, entries) {
    this.storage.setItem(logKey(weekStart), JSON.stringify(entries));
  }

  getSyncedAt(weekStart) {
    return this.storage.getItem(syncKey(weekStart));
  }

  setSyncedAt(weekStart, iso) {
    this.storage.setItem(syncKey(weekStart), iso);
  }

  /** Нужно только для разбора конфликтов: кто поставил отметку. */
  deviceName() {
    const existing = this.storage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const isPhone = typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent || '');
    const name = isPhone ? 'phone' : 'desktop';
    this.storage.setItem(DEVICE_KEY, name);
    return name;
  }
}
