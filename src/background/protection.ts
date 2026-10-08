import { decodeGroups } from '../shared/iranlist';
import { log } from '../shared/log';
import { protectionPlan, type ProtectionPlan } from '../shared/plan';
import { RULES_STATUS_KEY, type RulesStatus } from '../shared/rules-status';
import { CONFIG_KEY, PRELUDE_KEY } from '../shared/spoof-config';
import { getState } from '../shared/storage';
import { setGuard } from './guard';
import type { State } from '../shared/types';
import { loadIranGroups, META_KEY } from './iranlist';
import {
  CORE_IDS,
  coreRules,
  FLOW_IDS,
  flowRules,
  HEADER_IDS,
  headerExclusions,
  headerRules,
  installStage,
  languageExclusions,
  type DnrRule,
} from './rules';

const SIG_KEY = 'rulesSig';

export { protectionPlan };

/**
 * Leak protection that follows the state:
 *  - proxy on: WebRTC may only use proxied UDP, and Alt-Svc is stripped so nothing upgrades to QUIC.
 *  - spoofing active: Accept-Language matches navigator.language, and content scripts get the config.
 */
export async function syncProtection(): Promise<void> {
  try {
    await applyProtection();
  } catch (e) {
    log('error', 'Could not apply leak protection', e);
    throw e;
  }
}

/** Store the worker prelude script where the bridge can read it (it cannot fetch extension files). */
async function syncPrelude(): Promise<void> {
  const text = await (await fetch(chrome.runtime.getURL('content/worker.js'))).text();
  const stored = (await chrome.storage.local.get(PRELUDE_KEY))[PRELUDE_KEY];
  if (stored !== text) await chrome.storage.local.set({ [PRELUDE_KEY]: text });
}

async function applyProtection(): Promise<void> {
  await syncPrelude().catch((e) => log('warn', 'Could not store the worker prelude', e));
  const state = await getState();
  const plan = protectionPlan(state);
  const { config } = plan;

  if (plan.webrtc) {
    const rtc = await chrome.privacy.network.webRTCIPHandlingPolicy.get({});
    if (
      rtc.value !== 'disable_non_proxied_udp' ||
      rtc.levelOfControl !== 'controlled_by_this_extension'
    )
      await chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: 'disable_non_proxied_udp' });
  } else {
    const rtc = await chrome.privacy.network.webRTCIPHandlingPolicy.get({});
    if (rtc.levelOfControl === 'controlled_by_this_extension')
      await chrome.privacy.network.webRTCIPHandlingPolicy.clear({});
  }

  const prediction = chrome.privacy.network.networkPredictionEnabled;
  if (plan.proxyOn) {
    const previous = await prediction.get({});
    if (previous.value !== false || previous.levelOfControl !== 'controlled_by_this_extension')
      await prediction.set({ value: false });
    const result = await prediction.get({});
    if (result.value !== false || result.levelOfControl !== 'controlled_by_this_extension')
      throw new Error('Network prediction control is unavailable.');
    if (plan.webrtc) {
      const rtc = await chrome.privacy.network.webRTCIPHandlingPolicy.get({});
      if (
        rtc.value !== 'disable_non_proxied_udp' ||
        rtc.levelOfControl !== 'controlled_by_this_extension'
      )
        throw new Error('WebRTC policy is not controlled by noleaker.');
    }
  } else if ((await prediction.get({})).levelOfControl === 'controlled_by_this_extension')
    await prediction.clear({});

  await syncNetworkRules(state, plan);
  const rules = (await chrome.storage.local.get(RULES_STATUS_KEY))[RULES_STATUS_KEY] as
    RulesStatus | undefined;
  if (plan.proxyOn && (!rules?.core.ok || (plan.headers && !rules.headers?.ok)))
    throw new Error('Required network rules could not be installed.');
  if (plan.proxyOn) {
    // Settings can change while rules are installed; verify again immediately before release.
    const proxy = await chrome.proxy.settings.get({ incognito: false });
    if (
      proxy.levelOfControl !== 'controlled_by_this_extension' ||
      proxy.value.mode !== 'pac_script' ||
      proxy.value.pacScript?.mandatory !== true
    )
      throw new Error('Effective proxy control was lost before guard release.');
    const predictionNow = await prediction.get({});
    if (
      predictionNow.value !== false ||
      predictionNow.levelOfControl !== 'controlled_by_this_extension'
    )
      throw new Error('Network prediction protection was lost before guard release.');
    if (plan.webrtc) {
      const rtcNow = await chrome.privacy.network.webRTCIPHandlingPolicy.get({});
      if (
        rtcNow.value !== 'disable_non_proxied_udp' ||
        rtcNow.levelOfControl !== 'controlled_by_this_extension'
      )
        throw new Error('WebRTC protection was lost before guard release.');
    }
  }
  await setGuard(plan.proxyOn && state.killSwitchActive && state.routingMode === 'strict');

  // Only write when it changed: the bridge reacts to every write.
  const stored = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY];
  if (JSON.stringify(stored) !== JSON.stringify(config)) {
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
  }
}

/** Forget the last rule signature so the next sync installs the rules again. */
export async function forgetAppliedRules(): Promise<void> {
  await chrome.storage.session.remove(SIG_KEY);
}

async function rulesSignature(state: State, plan: ProtectionPlan): Promise<string> {
  const meta = (await chrome.storage.local.get(META_KEY))[META_KEY] as
    { updatedAt?: number } | undefined;
  return JSON.stringify([
    plan.altSvc,
    plan.acceptLanguage,
    plan.acceptLanguage ? plan.config.acceptLanguage : '',
    plan.headers,
    plan.flow,
    state.routingMode,
    state.whitelist,
    plan.headers ? [state.extraDirectDomains, meta?.updatedAt ?? 0] : 0,
  ]);
}

/** Install the DNR rules for a plan, with a fallback for oversized exclusion lists. */
async function syncNetworkRules(state: State, plan: ProtectionPlan): Promise<void> {
  const sig = await rulesSignature(state, plan);
  if ((await chrome.storage.session.get(SIG_KEY))[SIG_KEY] === sig) return;

  const update = (ids: number[]) => (rules: DnrRule[]) =>
    chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ids,
      addRules: rules as unknown as chrome.declarativeNetRequest.Rule[],
    });

  const core = await installStage(
    update(CORE_IDS),
    (excluded) => coreRules(plan, plan.config.acceptLanguage, excluded),
    state.routingMode === 'strict' ? state.whitelist : languageExclusions(state.whitelist),
  );

  let headers: RulesStatus['headers'] = null;
  if (plan.headers) {
    const iran = state.routingMode === 'strict' ? [] : decodeGroups(await loadIranGroups());
    headers = await installStage(
      update(HEADER_IDS),
      (excluded) => headerRules(true, excluded),
      state.routingMode === 'strict'
        ? state.whitelist
        : headerExclusions(state.whitelist, state.extraDirectDomains, iran),
    );
  } else {
    // Header rule off: remove it. A failure here must not hide the core status below.
    await update(HEADER_IDS)([]).catch((e) => log('warn', 'Could not remove the header rule', e));
  }

  // Flow route block: its own stage, so a failure here is reported but never touches the others.
  let flow: RulesStatus['flow'] = null;
  if (plan.flow) {
    flow = await installStage(update(FLOW_IDS), () => flowRules(true), []);
  } else {
    await update(FLOW_IDS)([]).catch((e) => log('warn', 'Could not remove the Flow rule', e));
  }

  const status: RulesStatus = { core, headers, flow, updatedAt: Date.now() };
  await chrome.storage.local.set({ [RULES_STATUS_KEY]: status });
  if (!core.ok) log('error', `Network rules failed: ${core.error}`);
  else if (core.installed < core.requested) {
    log('warn', `Network rules installed with ${core.installed} of ${core.requested} exclusions`);
  }
  if (headers && !headers.ok) log('warn', `Privacy header rule failed: ${headers.error}`);
  else if (headers && headers.installed < headers.requested) {
    log(
      'warn',
      `Privacy header rule installed with ${headers.installed} of ${headers.requested} exclusions`,
    );
  }
  if (flow && !flow.ok) log('warn', `Google Flow route block failed: ${flow.error}`);
  // Only remember the signature when everything went in, so a failure is retried next sync.
  if (core.ok && (!headers || headers.ok) && (!flow || flow.ok))
    await chrome.storage.session.set({ [SIG_KEY]: sig });
}
