import { isCaptchaPage } from '../shared/antibot';
import { hostMatches } from '../shared/domains';
import { isDirectHost } from '../shared/iranlist';
import { log } from '../shared/log';
import {
  decideReload,
  NOTES_KEY,
  type ReloadDecision,
  type StaleReport,
  type TabNote,
} from '../shared/stale';
import { buildSpoofConfig } from '../shared/spoof-config';
import { getState } from '../shared/storage';
import { loadIranGroups } from './iranlist';

const NAVS_KEY = 'tabNavs';
const RELOADS_KEY = 'tabReloads';

type TabMap<T> = Record<string, T>;

async function readMap<T>(key: string): Promise<TabMap<T>> {
  return ((await chrome.storage.session.get(key))[key] ?? {}) as TabMap<T>;
}

async function writeMap<T>(key: string, map: TabMap<T>): Promise<void> {
  await chrome.storage.session.set({ [key]: map });
}

/** Remember each tab's last navigation (we need to know if it was a form submit). */
export async function trackNavigation(details: {
  tabId: number;
  frameId: number;
  url: string;
  transitionType: string;
}): Promise<void> {
  if (details.frameId !== 0) return;
  const navs = await readMap<{ url: string; transitionType: string }>(NAVS_KEY);
  navs[details.tabId] = { url: details.url, transitionType: details.transitionType };
  await writeMap(NAVS_KEY, navs);

  // A note describes one page; moving to another page clears it.
  const notes = await readMap<TabNote>(NOTES_KEY);
  if (notes[details.tabId] && notes[details.tabId]!.url !== details.url) {
    delete notes[details.tabId];
    await writeMap(NOTES_KEY, notes);
  }
}

export async function forgetTab(tabId: number): Promise<void> {
  for (const key of [NAVS_KEY, NOTES_KEY]) {
    const map = await readMap<unknown>(key);
    if (tabId in map) {
      delete map[tabId];
      await writeMap(key, map);
    }
  }
}

/**
 * A page reported that it runs without the MAIN-world script. Reload its tab once, if it is safe.
 * The guards live in `decideReload`; this function only gathers the facts for it.
 */
export async function handleStaleReport(
  report: StaleReport,
  sender: chrome.runtime.MessageSender,
): Promise<{ reloaded: boolean; reason: string }> {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return { reloaded: false, reason: 'no-tab' };

  const state = await getState();
  const url = new URL(report.url);
  const navs = await readMap<{ url: string; transitionType: string }>(NAVS_KEY);
  const nav = navs[tabId];
  const reloads = await readMap<number>(RELOADS_KEY);
  const reloadKey = `${tabId}|${report.url}`;

  const decision: ReloadDecision = decideReload({
    now: Date.now(),
    isTopFrame: sender.frameId === 0,
    protectionActive: buildSpoofConfig(state).active,
    whitelisted: hostMatches(url.hostname, state.whitelist),
    direct:
      state.routingMode !== 'strict' &&
      isDirectHost(url.hostname, await loadIranGroups(), state.extraDirectDomains),
    captcha: state.routingMode !== 'strict' && isCaptchaPage(url.hostname, url.pathname),
    transitionType: nav?.url === report.url ? nav.transitionType : undefined,
    serviceWorker: report.serviceWorker,
    lastReloadAt: reloads[reloadKey],
  });

  const notes = await readMap<TabNote>(NOTES_KEY);
  if (decision.reload) {
    reloads[reloadKey] = Date.now();
    await writeMap(RELOADS_KEY, reloads);
    notes[tabId] = { url: report.url, outcome: 'reloaded', at: Date.now() };
    await writeMap(NOTES_KEY, notes);
    log('info', `Reloaded a tab once to apply protection (${decision.hard ? 'hard' : 'normal'})`);
    await chrome.tabs.reload(tabId, { bypassCache: decision.hard });
    return { reloaded: true, reason: decision.reason };
  }

  // Only the cases where the user would want to know are recorded; whitelisted, direct and
  // captcha pages are unprotected on purpose.
  if (decision.reason === 'form-submit' || decision.reason === 'recently-reloaded') {
    notes[tabId] = {
      url: report.url,
      outcome: 'unprotected',
      reason: decision.reason,
      at: Date.now(),
    };
    await writeMap(NOTES_KEY, notes);
    log('warn', `A page ran without protection and was not reloaded (${decision.reason})`);
  }
  return { reloaded: false, reason: decision.reason };
}
