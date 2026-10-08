/* eslint-disable @typescript-eslint/no-explicit-any */
import type { GpuModel } from '../shared/gpus';
import type { SpoofConfig } from '../shared/spoof-config';
import { installAudio } from './audio';
import { installFingerprint } from './fingerprint';
import { installRects } from './rects';
import { createNative } from './native';
import { installSpoof } from './spoof';
import { installWorkerBase } from './worker-base';

export interface WorkerInit {
  config: SpoofConfig;
  /** URL of the script the page asked for. */
  base: string;
  /** The GPU the page claims, so the worker agrees with it. */
  gpu: GpuModel | null;
}

/** Re-apply the page's shields inside a worker realm. Runs once, before the worker's own script. */
export function initWorker(g: any, init: WorkerInit): void {
  createNative(g, { strict: init.config.stealth === true });
  installWorkerBase(g, init.base);
  if (init.config.strict) {
    const native = createNative(g);
    for (const key of ['Worker', 'SharedWorker'])
      if (typeof g[key] === 'function')
        native.patchCtor(g, key, g[key], () => {
          throw new g.DOMException('Nested workers are blocked in strict mode.', 'SecurityError');
        });
  }
  installSpoof(g).setConfig(init.config);
  const fingerprint = installFingerprint(g, { gpu: init.gpu });
  const fp = init.config.active ? init.config.fingerprint : null;
  fingerprint.setConfig(fp);
  // Text metrics exist in workers (OffscreenCanvas); the audio and element APIs are skipped there.
  installAudio(g).setConfig(fp);
  installRects(g).setConfig(fp);
}
