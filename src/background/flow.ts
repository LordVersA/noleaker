import { allowBounce, bounceTarget, FLOW_MATCHES, isUnsupportedCountryUrl } from '../flow/urls';
import { log } from '../shared/log';
import { getState } from '../shared/storage';
import type { State } from '../shared/types';

// Everything the Google Flow unlock needs from the service worker. The page side lives in
// src/flow/ and the network rule in rules.ts (`flowRules`); nothing here touches the shields.

const SCRIPT_ID = 'noleaker-flow';
const BOUNCES_KEY = 'flowBounces';

const script = (): chrome.scripting.RegisteredContentScript => ({
  id: SCRIPT_ID,
  matches: FLOW_MATCHES,
  js: ['content/flow.js'],
  runAt: 'document_start',
  world: 'MAIN',
  persistAcrossSessions: true,
});

/**
 * The page script exists only while the switch is on: it is registered here instead of in the
 * manifest, so with the switch off no Flow code runs, and the page needs no channel to learn the
 * setting. Already open Flow tabs pick the change up on their next load.
 */
export async function syncFlowScript(state: Pick<State, 'flowUnlock'>): Promise<void> {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    if (!state.flowUnlock) {
      if (existing.length > 0)
        await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
      return;
    }
    // Update rather than skip: a new extension version may have changed the script's settings.
    if (existing.length > 0) await chrome.scripting.updateContentScripts([script()]);
    else await chrome.scripting.registerContentScripts([script()]);
  } catch (e) {
    log('error', 'Could not update the Google Flow script', e);
  }
}

// --- sending a tab back from the country page ---------------------------------------------------

/** Bounce handling runs one at a time, so two events for one navigation count as one attempt. */
let queue: Promise<unknown> = Promise.resolve();

async function bounce(tabId: number, url: string): Promise<void> {
  if (tabId < 0 || !isUnsupportedCountryUrl(url)) return;
  if (!(await getState()).flowUnlock) return;
  const all = ((await chrome.storage.session.get(BOUNCES_KEY))[BOUNCES_KEY] ?? {}) as Record<
    string,
    number[]
  >;
  const verdict = allowBounce(all[tabId] ?? [], Date.now());
  all[tabId] = verdict.attempts;
  await chrome.storage.session.set({ [BOUNCES_KEY]: all });
  if (!verdict.allowed) {
    log('warn', 'Google Flow keeps sending this tab to its country page; not bouncing again');
    return;
  }
  try {
    await chrome.tabs.update(tabId, { url: bounceTarget(url) });
  } catch {
    // the tab was closed meanwhile
  }
}

function enqueue(tabId: number, url: string): void {
  queue = queue.then(() => bounce(tabId, url)).catch((e) => log('error', 'Flow bounce failed', e));
}

/** Register the navigation listeners. Must run synchronously when the service worker starts. */
export function listenForFlowBounce(): void {
  // The country page was reached by a normal navigation.
  chrome.webNavigation.onCommitted.addListener((d) => {
    if (d.frameId === 0) enqueue(d.tabId, d.url);
  });
  // Flow's own router moved to it without loading a page.
  chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
    if (d.frameId === 0) enqueue(d.tabId, d.url);
  });
  // The network rule blocked it before it loaded.
  chrome.webNavigation.onErrorOccurred.addListener((d) => {
    if (d.frameId === 0 && d.error.includes('ERR_BLOCKED_BY_CLIENT')) enqueue(d.tabId, d.url);
  });
  chrome.tabs.onRemoved.addListener((tabId) => void forgetFlowTab(tabId));
}

async function forgetFlowTab(tabId: number): Promise<void> {
  const all = ((await chrome.storage.session.get(BOUNCES_KEY))[BOUNCES_KEY] ?? {}) as Record<
    string,
    number[]
  >;
  if (!(tabId in all)) return;
  delete all[tabId];
  await chrome.storage.session.set({ [BOUNCES_KEY]: all });
}
