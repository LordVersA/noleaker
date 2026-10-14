import '../../background/privacy-watch';
import { onConfigChange, onControlLoss, onProxyError } from '../../background/monitor';

// Chrome-only listeners: proxy errors and effective proxy setting changes (plus the shared
// privacy-setting watch).
// Imported for its side effects by the background entry.
chrome.proxy.onProxyError.addListener(onProxyError);
chrome.proxy.settings.onChange.addListener((details) => {
  if (
    details.levelOfControl !== 'controlled_by_this_extension' ||
    details.value.mode !== 'pac_script' ||
    details.value.pacScript?.mandatory !== true
  )
    onControlLoss('Effective proxy control was lost.');
  else onConfigChange();
});
