// Клиент GitHub Contents API. Знает про сеть и про кодирование, но не про DOM.
import { mergeEntries } from './tracker-core.js';

const REPO = 'colzphml/push_pull-ups';
const BRANCH = 'main';
const MAX_ATTEMPTS = 3;

export class ConflictError extends Error {
  constructor(message) { super(message); this.name = 'ConflictError'; }
}

export class AuthError extends Error {
  constructor(message) { super(message); this.name = 'AuthError'; }
}

/** btoa() падает на кириллице — кодируем через UTF-8 байты. */
export function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** GitHub возвращает base64 с переносами строк — их надо убрать до декодирования. */
export function fromBase64(b64) {
  const binary = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function url(path) {
  return `https://api.github.com/repos/${REPO}/contents/${path}`;
}

export async function readFile(fetchFn, token, path) {
  const response = await fetchFn(`${url(path)}?ref=${BRANCH}`, {
    method: 'GET',
    headers: headers(token),
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw new AuthError('Токен не принят GitHub');
  }
  if (!response.ok) throw new Error(`GitHub ответил ${response.status} на чтение`);
  const data = await response.json();
  return { text: fromBase64(data.content), sha: data.sha };
}

export async function writeFile(fetchFn, token, path, text, sha, message) {
  const payload = { message, content: toBase64(text), branch: BRANCH };
  if (sha) payload.sha = sha;
  const response = await fetchFn(url(path), {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  if (response.status === 409 || response.status === 422) {
    throw new ConflictError('Файл изменился с другого устройства');
  }
  if (response.status === 401 || response.status === 403) {
    throw new AuthError('Токен не принят GitHub');
  }
  if (!response.ok) throw new Error(`GitHub ответил ${response.status} на запись`);
  const data = await response.json();
  return { sha: data.content.sha };
}

/** Читаем актуальный файл, вливаем локальные изменения, пишем обратно. При конфликте — заново. */
export async function syncWeek({ fetchFn, token, path, weekStart, localEntries, message }) {
  let lastError = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const remote = await readFile(fetchFn, token, path);
    let remoteEntries = [];
    if (remote) {
      try {
        remoteEntries = JSON.parse(remote.text).entries || [];
      } catch {
        // Битый файл в репозитории не должен съесть локальные отметки — перезаписываем его.
        remoteEntries = [];
      }
    }
    const merged = mergeEntries(remoteEntries, localEntries);
    const body = `${JSON.stringify({ week_start: weekStart, entries: merged }, null, 2)}\n`;
    try {
      await writeFile(fetchFn, token, path, body, remote ? remote.sha : null, message);
      return merged;
    } catch (error) {
      if (error.name !== 'ConflictError') throw error;
      lastError = error;
    }
  }
  throw lastError;
}
