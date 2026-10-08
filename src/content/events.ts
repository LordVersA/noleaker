import type { SpoofConfig } from '../shared/spoof-config';

/**
 * The only fixed event name. It is used for a one-shot handshake while the two content scripts
 * start, before any script of the page can run, and each side stops listening to it afterwards.
 * Everything after that travels on names that the MAIN-world script invents for each page load.
 */
export const HANDSHAKE_EVENT = '__nl__';

/** Handshake messages (JSON in the event detail). */
export type Hello = { k: 'bridge' } | { k: 'main'; n: string };

/** Name of the event the MAIN-world script answers every config message with. */
export const ackName = (name: string): string => `${name}a`;

/** A fresh unguessable event name. */
export function randomName(): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** What the bridge sends to the MAIN-world script (as a JSON string). */
export interface ConfigMessage {
  config: SpoofConfig | null;
  /** Script text that prepares a worker realm; null until the service worker has stored it. */
  prelude: string | null;
}
