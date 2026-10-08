/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SpoofConfig } from '../shared/spoof-config';
import { createNative } from './native';

/**
 * Forces `iceTransportPolicy: "relay"` at API level, on top of the browser's WebRTC policy.
 * With relay only, the page never gathers host or server-reflexive candidates, so no local or
 * public address can show up in them.
 */
export function installWebRtc(
  g: any,
  pending = false,
): { setConfig(config: SpoofConfig | null): void } {
  const { patch, patchCtor } = createNative(g);
  let on = pending;

  const relay = (configuration: unknown): unknown => {
    if (!on) return configuration;
    if (
      configuration !== undefined &&
      (typeof configuration !== 'object' || configuration === null)
    ) {
      return configuration; // let the native constructor reject it
    }
    const merged = Object.create((configuration as object | undefined) ?? null);
    merged.iceTransportPolicy = 'relay';
    return merged;
  };

  for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
    const Native = g[name];
    if (typeof Native !== 'function') continue;
    patchCtor(g, name, Native, (args) => [relay(args[0]), ...args.slice(1)]);
  }

  const proto: any = g.RTCPeerConnection?.prototype;
  if (proto?.setConfiguration) {
    patch(
      proto,
      'setConfiguration',
      (orig) =>
        function (this: any, configuration: unknown) {
          return orig.call(this, relay(configuration));
        },
    );
  }

  return {
    setConfig(config) {
      on = !!config?.strict || (!!config?.active && config.shields.webrtc);
    },
  };
}
