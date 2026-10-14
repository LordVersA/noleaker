import { onConfigChange, onControlLoss } from './monitor';

// WebRTC and network-prediction settings: noleaker must keep controlling them while the proxy is
// on. Same API and values in Chrome and Firefox. Imported for its side effects by the wiring.
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
