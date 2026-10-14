import { ENV_KEY, getEnv, PRIVATE_WARNING, RFP_NOTE, setEnv } from './browser-env';

/**
 * Firefox-only notices for an extension page: private-window access and resistFingerprinting.
 * Re-reads private access on open (Firefox has no event for it) and follows later changes.
 */
export function showEnvNotes(privateEl: HTMLElement, rfpEl: HTMLElement): void {
  const render = () =>
    void getEnv().then((env) => {
      privateEl.textContent = PRIVATE_WARNING;
      privateEl.hidden = env.privateAccess;
      rfpEl.textContent = RFP_NOTE;
      rfpEl.hidden = !env.rfp;
    });
  void chrome.extension
    .isAllowedIncognitoAccess()
    .then((privateAccess) => setEnv({ privateAccess }))
    .catch(() => undefined)
    .finally(render);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ENV_KEY in changes) render();
  });
}
