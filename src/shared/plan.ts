import { activeProfile } from './profiles';
import { buildSpoofConfig } from './spoof-config';
import type { State } from './types';

/** What leak protection should be installed for a state. Pure, so it can be unit tested. */
export function protectionPlan(state: State) {
  const proxyOn = state.enabled && !!activeProfile(state);
  const config = buildSpoofConfig(state);
  return {
    proxyOn,
    strict: state.routingMode === 'strict',
    /** WebRTC policy follows the WebRTC shield. */
    webrtc: proxyOn && (state.routingMode === 'strict' || state.shields.webrtc),
    /** Alt-Svc stripping is not a shield: it is part of keeping traffic on the proxy. */
    altSvc: proxyOn,
    /** Accept-Language follows the locale shield. */
    acceptLanguage: config.active && state.shields.locale,
    /** DNT, Sec-GPC and If-None-Match follow the headers shield. */
    headers: config.active && state.shields.headers,
    /** Google Flow unlock: independent of the proxy and of every shield. */
    flow: state.flowUnlock,
    config,
  };
}

export type ProtectionPlan = ReturnType<typeof protectionPlan>;
