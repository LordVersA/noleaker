import type { IconStatus, IconView } from '../shared/badge';
import { BRAND_BLUE, DROP_PATH, SHIELD_PATH, SHIELD_STROKE } from '../shared/brand';

export type { IconStatus };

const COLORS: Record<IconStatus, string> = {
  off: '#8a8f98',
  on: BRAND_BLUE,
  error: '#d64545',
};

function draw(size: number, color: string): ImageData {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d')!;
  // The brand shield fills the icon; small sizes get a heavier stroke so it stays readable.
  const scale = (size / 100) * 0.98;
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-50, -50);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size <= 16 ? SHIELD_STROKE * 1.35 : SHIELD_STROKE;
  ctx.lineJoin = 'round';
  ctx.stroke(new Path2D(SHIELD_PATH));
  ctx.fill(new Path2D(DROP_PATH));
  return ctx.getImageData(0, 0, size, size);
}

/** Draw the icon in the status colour and show the badge and title of `view`. */
export async function setStatusIcon(view: IconView): Promise<void> {
  const color = COLORS[view.status];
  await chrome.action.setIcon({ imageData: { 16: draw(16, color), 32: draw(32, color) } });
  await chrome.action.setBadgeText({ text: view.badge });
  await chrome.action.setBadgeBackgroundColor({ color: view.badgeColor });
  await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  await chrome.action.setTitle({ title: view.title });
}
