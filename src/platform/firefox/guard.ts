import { setGuarded } from './routing';

// Firefox has no DNR request guard: the transition guard lives in the proxy.onRequest routing table
// (everything refused except the extension's probe requests) and the strict local-host block is
// part of route(). The guard is kept in session storage so an event-page restart keeps it.

export const GUARD_KEY = 'requestGuard';

/** No local-host DNR rules exist in the Firefox build. */
export const LOCAL_RULE_IDS: readonly number[] = [];

export async function setGuard(blocked: boolean): Promise<void> {
  setGuarded(blocked);
  await chrome.storage.session.set({ [GUARD_KEY]: blocked });
}

export async function setLocalGuard(_strict: boolean): Promise<void> {}
