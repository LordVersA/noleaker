import { hashString } from './fingerprint';

export type Os = 'mac' | 'win' | 'linux';

/** A GPU a machine could plausibly report, with the machines it fits. */
export interface GpuModel {
  os: Os;
  /** WebGL UNMASKED_VENDOR_WEBGL. */
  vendor: string;
  /** WebGL UNMASKED_RENDERER_WEBGL. */
  renderer: string;
  /** WebGPU GPUAdapterInfo.description. */
  description: string;
  /** WebGPU GPUAdapterInfo.device. */
  device: string;
  /** Logical core counts of machines that ship with this GPU. */
  cores: readonly number[];
  /** Smallest screen (CSS px) such a machine has. */
  minWidth: number;
  minHeight: number;
}

const apple = (name: string, cores: number[], minWidth: number): GpuModel => ({
  os: 'mac',
  vendor: 'Google Inc. (Apple)',
  renderer: `ANGLE (Apple, ANGLE Metal Renderer: ${name}, Unspecified Version)`,
  description: name,
  device: '',
  cores,
  minWidth,
  minHeight: 800,
});

const d3d = (
  vendor: 'NVIDIA' | 'Intel' | 'AMD',
  name: string,
  id: string,
  cores: number[],
  min: [number, number],
): GpuModel => ({
  os: 'win',
  vendor: `Google Inc. (${vendor})`,
  renderer: `ANGLE (${vendor}, ${name} (${id}) Direct3D11 vs_5_0 ps_5_0, D3D11)`,
  description: name,
  device: id.toLowerCase(),
  cores,
  minWidth: min[0],
  minHeight: min[1],
});

/**
 * The model table. A GPU is only offered when the machine's core count and screen make sense
 * for it: an Apple M1 has 8 cores, a desktop RTX card does not sit behind a 1366x768 screen.
 */
export const GPU_MODELS: readonly GpuModel[] = [
  apple('Apple M1', [8], 1440),
  apple('Apple M1 Pro', [8, 10], 1512),
  apple('Apple M2', [8], 1440),
  apple('Apple M2 Pro', [10, 12], 1512),
  apple('Apple M3', [8], 1440),
  apple('Apple M3 Pro', [11, 12], 1512),
  apple('Apple M3 Max', [14, 16], 1512),

  d3d('NVIDIA', 'NVIDIA GeForce GTX 1660 SUPER', '0x000021C4', [6, 8, 12], [1920, 1080]),
  d3d('NVIDIA', 'NVIDIA GeForce RTX 3060', '0x00002504', [8, 12, 16], [1920, 1080]),
  d3d('NVIDIA', 'NVIDIA GeForce RTX 4070', '0x00002786', [12, 16], [1920, 1080]),
  d3d('Intel', 'Intel(R) UHD Graphics 630', '0x00003E92', [4, 6, 8, 12], [1366, 768]),
  d3d('Intel', 'Intel(R) Iris(R) Xe Graphics', '0x000046A6', [8, 12, 16], [1366, 768]),
  d3d('AMD', 'AMD Radeon RX 580 Series', '0x000067DF', [6, 8, 12, 16], [1920, 1080]),

  {
    os: 'linux',
    vendor: 'Google Inc. (Intel)',
    renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)',
    description: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
    device: '',
    cores: [4, 8],
    minWidth: 1366,
    minHeight: 768,
  },
  {
    os: 'linux',
    vendor: 'Google Inc. (NVIDIA Corporation)',
    renderer: 'ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1650/PCIe/SSE2, OpenGL 4.5.0)',
    description: 'NVIDIA GeForce GTX 1650/PCIe/SSE2',
    device: '',
    cores: [8, 12],
    minWidth: 1920,
    minHeight: 1080,
  },
  {
    os: 'linux',
    vendor: 'Google Inc. (AMD)',
    renderer: 'ANGLE (AMD, AMD Radeon Graphics (radeonsi, renoir, LLVM 15.0.7), OpenGL 4.6)',
    description: 'AMD Radeon Graphics (radeonsi, renoir, LLVM 15.0.7)',
    device: '',
    cores: [8, 16],
    minWidth: 1366,
    minHeight: 768,
  },
];

/**
 * Pick a GPU that fits the machine. `cores` and `screen` are the values the page will see (the
 * spoofed ones if those shields are on). Returns null when nothing fits, and the caller then
 * keeps the real GPU: a fake GPU that does not fit the machine is worse than the real one.
 */
export function chooseGpu(
  os: Os,
  seed: string,
  cores: number,
  screen: { width: number; height: number } | null,
): GpuModel | null {
  if (!cores) return null;
  const fits = GPU_MODELS.filter(
    (m) =>
      m.os === os &&
      m.cores.includes(cores) &&
      (!screen || !screen.width || (screen.width >= m.minWidth && screen.height >= m.minHeight)),
  );
  return fits.length ? fits[hashString(`gpu:${seed}`) % fits.length]! : null;
}
