import {
  countGroups,
  decodeGroups,
  encodeGroups,
  parseDomainList,
  type Groups,
  type IranListMeta,
} from '../shared/iranlist';
import { log } from '../shared/log';
import { getState, setState } from '../shared/storage';

const LIST_KEY = 'iranList';
export const META_KEY = 'iranListMeta';
export const CANDIDATE_KEY = 'iranListCandidate';

interface Candidate {
  id: string;
  groups: Groups;
  count: number;
  base: string;
  added: string[];
  removed: string[];
}
export const UPDATE_ALARM = 'iran-list-update';
export const UPDATE_MINUTES = 24 * 60;

const BASE = 'https://github.com/bootmortis/iran-hosted-domains/releases/latest/download';
const LIST_URL = `${BASE}/domains.txt`;
const SHA_URL = `${BASE}/domains.txt.sha256`;
const MIN_DOMAINS = 5000;
/**
 * Largest compact list we accept, in characters. The list is embedded in the PAC script, and a
 * script Chrome refuses would stop all proxying. The full upstream list (about 127,000 domains,
 * `.ir` included) is 890,000 and a real Chrome 155 applied it; an update that grows past this keeps
 * the current list instead of risking that.
 */
export const MAX_LIST_CHARS = 1_000_000;

/** The stored list, falling back to (and storing) the snapshot bundled with the extension. */
export async function loadIranGroups(): Promise<Groups> {
  const stored = (await chrome.storage.local.get(LIST_KEY))[LIST_KEY] as Groups | undefined;
  if (stored) return stored;
  const res = await fetch(chrome.runtime.getURL('data/iran-domains.json'));
  const snapshot = (await res.json()) as { groups: Groups; count: number };
  await saveList(snapshot.groups, snapshot.count, 'bundled');
  return snapshot.groups;
}

async function saveList(groups: Groups, count: number, source: IranListMeta['source']) {
  const meta: IranListMeta = { count, updatedAt: Date.now(), source };
  await chrome.storage.local.set({ [LIST_KEY]: groups, [META_KEY]: meta });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchChecked(url: string): Promise<Response> {
  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

/**
 * Download and stage an unsigned candidate (checksum + sanity checks). Never apply automatically. On any failure the
 * current list is kept. The request uses the browser's normal route: through the proxy when it
 * is on (so no direct-traffic window), direct otherwise.
 */
export async function updateIranList(): Promise<{
  ok: boolean;
  count?: number;
  error?: string;
  candidateId?: string;
  added?: string[];
  removed?: string[];
  warning?: string;
}> {
  try {
    const state = await getState();
    if (state.routingMode === 'strict' || !state.listUpdates)
      throw new Error('Routing-list updates are disabled.');
    if (state.killSwitchActive) throw new Error('Proxy is unreachable; try again later.');
    const [bytes, shaText] = await Promise.all([
      fetchChecked(LIST_URL).then((r) => r.arrayBuffer()),
      fetchChecked(SHA_URL).then((r) => r.text()),
    ]);
    const expected = shaText.trim().split(/\s+/)[0]?.toLowerCase();
    if (!expected || expected !== (await sha256Hex(bytes))) throw new Error('Checksum mismatch.');

    const groups = encodeGroups(parseDomainList(new TextDecoder().decode(bytes)));
    const count = countGroups(groups);
    const previous = (await chrome.storage.local.get(META_KEY))[META_KEY] as
      IranListMeta | undefined;
    if (count < MIN_DOMAINS || (previous && count < previous.count / 2)) {
      throw new Error(`Downloaded list looks wrong (${count} domains).`);
    }
    const prior = new Set(decodeGroups(await loadIranGroups()));
    const next = new Set(decodeGroups(groups));
    const added = [...next].filter((domain) => !prior.has(domain)).length;
    const removed = [...prior].filter((domain) => !next.has(domain)).length;
    const warning =
      added > Math.max(100, prior.size * 0.1) || removed > Math.max(100, prior.size * 0.1)
        ? 'Routing list changed by more than 10%. Review the changes below, then approve to replace the current list. Until approval, the current list stays active.'
        : undefined;
    if (JSON.stringify(groups).length > MAX_LIST_CHARS) {
      throw new Error(
        'Downloaded list is too large for the proxy script; keeping the current list.',
      );
    }
    const candidate: Candidate = {
      id: crypto.randomUUID(),
      groups,
      count,
      base: JSON.stringify(encodeGroups([...prior])),
      added: [...next].filter((domain) => !prior.has(domain)).sort(),
      removed: [...prior].filter((domain) => !next.has(domain)).sort(),
    };
    await chrome.storage.local.set({ [CANDIDATE_KEY]: candidate });
    log('info', `Iran list staged for manual review (${count} domains)`);
    return {
      ok: true,
      count,
      candidateId: candidate.id,
      warning,
      added: candidate.added,
      removed: candidate.removed,
    };
  } catch (e) {
    log('warn', 'Iran list update failed', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function scheduleUpdates(): void {
  void chrome.alarms.get(UPDATE_ALARM).then((a) => {
    if (!a) chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: UPDATE_MINUTES });
  });
}

/** Apply exactly the candidate reviewed in the extension options, provided its base is unchanged. */
export async function approveIranList(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const state = await getState();
    if (state.routingMode === 'strict' || !state.listUpdates || state.killSwitchActive)
      throw new Error('Routing-list approval is unavailable in the current protection state.');
    const candidate = (await chrome.storage.local.get(CANDIDATE_KEY))[CANDIDATE_KEY] as
      Candidate | undefined;
    if (!candidate || candidate.id !== id)
      throw new Error('Candidate changed. Download and review it again.');
    const base = JSON.stringify(encodeGroups(decodeGroups(await loadIranGroups())));
    if (base !== candidate.base)
      throw new Error('Active list changed. Download and review it again.');
    await saveList(candidate.groups, candidate.count, 'remote');
    await chrome.storage.local.remove(CANDIDATE_KEY);
    await setState({ iranDomainsUpdatedAt: Date.now() });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
