import '../../background/privacy-watch';
import { onConfigChange, onProxyError } from '../../background/monitor';
import { ENV_KEY } from '../../shared/browser-env';
import { refreshEnv, resistFingerprinting } from './env';
import { firefoxProxy, onRequest } from './routing';

// Registered synchronously when the background starts, so Firefox keeps (primes) the listener and
// holds early requests until it answers. Imported for its side effects by the background entry.
firefoxProxy().onRequest.addListener(onRequest, { urls: ['<all_urls>'] });
firefoxProxy().onError.addListener((error) => onProxyError({ error: error.message }));

// Private-window access and resistFingerprinting: re-read on every start, follow RFP changes, and
// re-sync (icon badge, effective shields) whenever either changes. The popup re-checks private
// access when it opens, since Firefox has no event for that permission.
resistFingerprinting()?.onChange.addListener(() => void refreshEnv());
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ENV_KEY in changes) onConfigChange();
});
void refreshEnv();
