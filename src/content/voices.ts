/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SpoofConfig } from '../shared/spoof-config';
import { createNative } from './native';

const PERSIAN = /^fa([-_]|$)/i;

/** `speechSynthesis.getVoices()` without Persian voices. */
export function installVoices(g: any): { setConfig(config: SpoofConfig | null): void } {
  const { patch } = createNative(g);
  let on = false;

  const proto: any = g.SpeechSynthesis?.prototype;
  if (proto?.getVoices) {
    patch(
      proto,
      'getVoices',
      (orig) =>
        function (this: any) {
          const voices: any[] = orig.call(this);
          return on ? voices.filter((v) => !PERSIAN.test(String(v.lang))) : voices;
        },
    );
  }

  return {
    setConfig(config) {
      on = !!config?.active && config.shields.voices;
    },
  };
}
