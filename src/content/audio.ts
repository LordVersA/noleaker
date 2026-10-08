/* eslint-disable @typescript-eslint/no-explicit-any */
import { hashString, type FingerprintConfig } from '../shared/fingerprint';
import { createNative } from './native';
import { signed, unit } from './noise';

/** Noise size added to audio samples. Far below audibility, enough to change a hash. */
export const AUDIO_AMPLITUDE = 1e-4;
/** Share of byte bins that move by one step. */
const BYTE_RATE = 0.1;

/**
 * Audio fingerprint noise. Silence stays silent: zero samples, -Infinity dB bins and the 128
 * midpoint of byte time-domain data are never touched. The noise at a position depends only on
 * the site seed, the channel and the index, so repeated reads agree and reloads match.
 */
export function installAudio(g: any): { setConfig(fp: FingerprintConfig | null): void } {
  const { patch } = createNative(g);
  let fp: FingerprintConfig | null = null;
  const on = (): boolean => !!fp?.audioNoise;
  const seedFor = (salt: string): number => hashString(`${fp!.siteSeed}:audio:${salt}`);

  /** Channels whose data we already noised in place (getChannelData returns a live view). */
  const noised = new WeakMap<object, Set<number>>();

  function addFloatNoise(
    data: ArrayLike<number> & { [i: number]: number },
    seed: number,
    offset = 0,
  ): void {
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      if (v !== 0 && Number.isFinite(v)) data[i] = v + signed(seed, offset + i) * AUDIO_AMPLITUDE;
    }
  }

  const bufferProto: any = g.AudioBuffer?.prototype;
  if (bufferProto?.getChannelData) {
    patch(
      bufferProto,
      'getChannelData',
      (orig) =>
        function (this: any, channel: number) {
          const data = orig.call(this, channel);
          if (!on()) return data;
          const done = noised.get(this) ?? new Set<number>();
          if (!done.has(channel)) {
            addFloatNoise(data, seedFor(`channel${channel}`));
            done.add(channel);
            noised.set(this, done);
          }
          return data;
        },
    );
  }
  if (bufferProto?.copyFromChannel) {
    patch(
      bufferProto,
      'copyFromChannel',
      (orig) =>
        function (this: any, destination: any, channel: number, offset = 0, ...rest: unknown[]) {
          const result = orig.call(this, destination, channel, offset, ...rest);
          // If the channel was already noised in place the copy carries that noise already.
          if (on() && !noised.get(this)?.has(channel)) {
            addFloatNoise(destination, seedFor(`channel${channel}`), Number(offset) || 0);
          }
          return result;
        },
    );
  }

  const analyser: any = g.AnalyserNode?.prototype;
  if (analyser) {
    for (const name of ['getFloatFrequencyData', 'getFloatTimeDomainData']) {
      if (!analyser[name]) continue;
      patch(
        analyser,
        name,
        (orig) =>
          function (this: any, array: any) {
            const result = orig.call(this, array);
            if (on()) addFloatNoise(array, seedFor(name));
            return result;
          },
      );
    }
    for (const [name, silent] of [
      ['getByteFrequencyData', 0],
      ['getByteTimeDomainData', 128],
    ] as const) {
      if (!analyser[name]) continue;
      patch(
        analyser,
        name,
        (orig) =>
          function (this: any, array: any) {
            const result = orig.call(this, array);
            if (on()) {
              const seed = seedFor(name);
              for (let i = 0; i < array.length; i++) {
                const r = unit(seed, i);
                if (array[i] !== silent && r < BYTE_RATE) {
                  array[i] = Math.max(0, Math.min(255, array[i] + (r < BYTE_RATE / 2 ? -1 : 1)));
                }
              }
            }
            return result;
          },
      );
    }
  }

  return {
    setConfig(next) {
      fp = next;
    },
  };
}
