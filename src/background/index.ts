import { listen } from '../shared/messages';
import { getState, onStateChanged } from '../shared/storage';
import { listenForFlowBounce } from './flow';
import { UPDATE_ALARM, updateIranList, approveIranList } from './iranlist';
import { forgetTab, handleStaleReport, trackNavigation } from './stale';
import {
  ensureAlarms,
  onAlarm,
  onConfigChange,
  onControlLoss,
  onProxyError,
  onStartup,
  refreshExitNow,
} from './monitor';

function requireOptions(sender: chrome.runtime.MessageSender): void {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('options/index.html'))
    throw new Error('Routing-list actions require extension Options.');
}

listen({
  ping: () => 'pong',
  getState: () => getState(),
  updateIranList: (_message, sender) => {
    requireOptions(sender);
    return updateIranList();
  },
  approveIranList: (message, sender) => {
    requireOptions(sender);
    return approveIranList(message.candidateId);
  },
  staleReport: (message, sender) => handleStaleReport(message, sender),
  refreshExit: () => refreshExitNow(),
});

// Alarms survive worker restarts, but make sure they exist after updates or cleared data.
ensureAlarms();
onStateChanged(onConfigChange);
chrome.alarms.onAlarm.addListener(onAlarm);
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === UPDATE_ALARM) void updateIranList();
});
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
// Reverify effective settings whenever this service worker wakes.
onConfigChange();
chrome.runtime.onInstalled.addListener(onStartup);
chrome.runtime.onStartup.addListener(onStartup);

// Stale-page recovery: know each tab's last navigation (form submits are never reloaded).
chrome.webNavigation.onCommitted.addListener((details) => void trackNavigation(details));
chrome.tabs.onRemoved.addListener((tabId) => void forgetTab(tabId));

// Google Flow unlock: send a tab back when Flow lands on its country page.
listenForFlowBounce();
