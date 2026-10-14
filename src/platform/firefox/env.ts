import { applyEnv, getEnv, setEnv } from '../../shared/browser-env';
import type { State } from '../../shared/types';

/** The user's settings with Firefox's resistFingerprinting overrides applied. */
export async function effectiveState(state: State): Promise<State> {
  return applyEnv(state, await getEnv());
}

interface BrowserSetting<T> {
  get(details: object): Promise<{ value: T }>;
  onChange: { addListener(fn: (details: { value: T }) => void): void };
}

/** privacy.websites.resistFingerprinting (Firefox only; read-only for extensions here). */
export const resistFingerprinting = (): BrowserSetting<boolean> | undefined =>
  (chrome.privacy as unknown as { websites?: { resistFingerprinting?: BrowserSetting<boolean> } })
    .websites?.resistFingerprinting;

/** Re-read both facts from the browser. Never throws. */
export async function refreshEnv(): Promise<void> {
  const [privateAccess, rfp] = await Promise.all([
    chrome.extension.isAllowedIncognitoAccess().catch(() => true),
    resistFingerprinting()
      ?.get({})
      .then((d) => d.value === true)
      .catch(() => false) ?? false,
  ]);
  await setEnv({ privateAccess, rfp }).catch(() => undefined);
}
