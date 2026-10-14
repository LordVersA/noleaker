import { onConfigChange, onControlLoss, onProxyError } from '../../background/monitor';

// Chrome-only listeners: proxy errors and effective proxy/privacy setting changes.
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
chrome.privacy.network.networkPredictionEnabled.onChange.addListener((details) => {
  if (details.levelOfControl !== 'controlled_by_this_extension' || details.value !== false)
    onControlLoss('Network prediction protection was lost.');
  else onConfigChange();
});
chrome.privacy.network.webRTCIPHandlingPolicy.onChange.addListener((details) => {
  if (
    details.levelOfControl !== 'controlled_by_this_extension' ||
    details.value !== 'disable_non_proxied_udp'
  )
    onControlLoss('WebRTC protection was lost.', 'webrtc');
  else onConfigChange();
});
