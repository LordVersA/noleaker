// Rewrites Google's `batchexecute` responses so Flow's country check passes.
//
// A response looks like this (lengths are counted by the server, so editing a frame means fixing
// the number in front of it, and the total in the closing "e" frame):
//
//   )]}'
//
//   <length>
//   [["wrb.fr","<rpc id>","<payload>",null,null,null,"generic"],["di",42]]
//   <length>
//   [["e",4,null,null,<total bytes>]]
//
// The payload of a `wrb.fr` frame is a JSON string, a JSON array, or base64 protobuf. This is a
// private Google format: the recorded samples in tests/phase16.test.ts exist to show quickly when
// it changes.
import { rewriteVarintField } from './protobuf';

/** The rpc that carries Flow's feature flags. */
export const CONFIG_RPC = 'cPZSdc';
/** The rpc that carries the access status. */
export const STATUS_RPC = 'KV2T2d';
/** Flag numbers (1-based, as in the protobuf) that must be on. JSON index = number - 1. */
export const CONFIG_FLAGS = [31, 32];
/** The status field (number 1 in protobuf, index 0 in JSON) and the codes that mean "blocked". */
export const STATUS_FIELD = 1;
export const BLOCKED_STATUSES = [4, 5, 6, 8];
export const ALLOWED_STATUS = 1;

/** How deep a `wrb.fr` frame can sit inside the parsed frame array. */
const MAX_DEPTH = 3;

// --- payload edits ------------------------------------------------------------------------------

function patchConfigArray(payload: unknown[]): boolean {
  let changed = false;
  for (const flag of CONFIG_FLAGS) {
    if (payload[flag - 1] !== true) {
      payload[flag - 1] = true;
      changed = true;
    }
  }
  return changed;
}

function patchStatusArray(payload: unknown[]): boolean {
  const at = STATUS_FIELD - 1;
  if (!BLOCKED_STATUSES.includes(Number(payload[at]))) return false;
  payload[at] = ALLOWED_STATUS;
  return true;
}

function patchConfigProto(bytes: Uint8Array): Uint8Array | null {
  let out = bytes;
  let changed = false;
  for (const flag of CONFIG_FLAGS) {
    const next = rewriteVarintField(out, flag, (v) => (v === 1 ? null : 1), 1);
    if (next !== null) {
      out = next;
      changed = true;
    }
  }
  return changed ? out : null;
}

function patchStatusProto(bytes: Uint8Array): Uint8Array | null {
  return rewriteVarintField(
    bytes,
    STATUS_FIELD,
    (v) => (BLOCKED_STATUSES.includes(v) ? ALLOWED_STATUS : null),
    null,
  );
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Patch a string payload: a JSON array, or base64 protobuf. Null when nothing changed. */
function patchPayloadString(rpc: string, text: string): string | null {
  const payload = text.trim();
  if (payload === '') return null;
  if (payload.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return null;
    }
    if (!Array.isArray(parsed)) return null;
    const changed = rpc === CONFIG_RPC ? patchConfigArray(parsed) : patchStatusArray(parsed);
    return changed ? JSON.stringify(parsed) : null;
  }
  const bytes = fromBase64(payload);
  if (bytes === null) return null;
  const next = rpc === CONFIG_RPC ? patchConfigProto(bytes) : patchStatusProto(bytes);
  return next === null ? null : toBase64(next);
}

// --- frames -------------------------------------------------------------------------------------

interface FrameResult {
  rpc: string | null;
  changed: boolean;
}

/** Patch one `["wrb.fr", rpc, payload, ...]` frame in place. */
function patchWrbFrame(frame: unknown[]): FrameResult {
  const rpc = frame[1];
  if (rpc !== CONFIG_RPC && rpc !== STATUS_RPC) return { rpc: null, changed: false };
  const payload = frame[2];
  if (Array.isArray(payload)) {
    const changed = rpc === CONFIG_RPC ? patchConfigArray(payload) : patchStatusArray(payload);
    return { rpc, changed };
  }
  if (typeof payload !== 'string') return { rpc, changed: false };
  const next = patchPayloadString(rpc, payload);
  if (next === null) return { rpc, changed: false };
  frame[2] = next;
  return { rpc, changed: true };
}

export interface PatchSummary {
  changed: boolean;
  /** Rpc ids of the frames that were recognised, changed or not. */
  seen: string[];
  /** True when the feature-flag rpc was changed. */
  configPatched: boolean;
}

/** Patch every relevant `wrb.fr` frame inside an already parsed response. Mutates `value`. */
export function patchParsed(value: unknown): PatchSummary {
  const seen = new Set<string>();
  const summary: PatchSummary = { changed: false, seen: [], configPatched: false };
  const walk = (node: unknown, depth: number): void => {
    if (!Array.isArray(node) || depth > MAX_DEPTH) return;
    if (node[0] !== 'wrb.fr') {
      node.forEach((child) => walk(child, depth + 1));
      return;
    }
    const result = patchWrbFrame(node);
    if (result.rpc !== null) seen.add(result.rpc);
    summary.changed ||= result.changed;
    summary.configPatched ||= result.changed && result.rpc === CONFIG_RPC;
  };
  walk(value, 0);
  summary.seen = [...seen];
  return summary;
}

/** One frame of the framed text: where it sits and where the length in front of it sits. */
interface Frame {
  start: number;
  end: number;
  text: string;
  /** Start and end of the digits that give this frame's length. */
  tokenStart: number;
  digitsEnd: number;
}

const byteLength = (text: string): number => new TextEncoder().encode(text).length;
const isDigit = (c: string): boolean => c >= '0' && c <= '9';
const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\r' || c === '\n';

/** Index after the JSON value that starts at `from` (a `[` or `{`), or -1 if it never closes. */
function scanValue(text: string, from: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < text.length; i++) {
    const c = text.charAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth += 1;
    else if (c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function lengthToken(text: string, start: number, end: number): Frame {
  let digitsEnd = start;
  while (digitsEnd > 0 && isSpace(text.charAt(digitsEnd - 1))) digitsEnd -= 1;
  let tokenStart = digitsEnd;
  while (tokenStart > 0 && isDigit(text.charAt(tokenStart - 1))) tokenStart -= 1;
  return { start, end, text: text.slice(start, end), tokenStart, digitsEnd };
}

function splitFrames(text: string): Frame[] | null {
  const first = text.indexOf('[');
  if (first === -1) return null;
  const frames: Frame[] = [];
  let at = first;
  while (at < text.length) {
    while (at < text.length && text.charAt(at) !== '[' && text.charAt(at) !== '{') at += 1;
    if (at >= text.length) break;
    const end = scanValue(text, at);
    if (end === -1) return null;
    frames.push(lengthToken(text, at, end));
    at = end;
  }
  return frames.length > 0 ? frames : null;
}

/** The closing frame holds the response's total size: `[["e", ..., <bytes>]]`. */
function endFrameMatches(frameText: string, total: number): boolean | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frameText);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  for (const item of parsed) {
    if (Array.isArray(item) && item[0] === 'e' && item.length > 0) {
      return item[item.length - 1] === total;
    }
  }
  return null;
}

function withEndTotal(frameText: string, total: number): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frameText);
  } catch {
    return frameText;
  }
  if (!Array.isArray(parsed)) return frameText;
  for (const item of parsed) {
    if (Array.isArray(item) && item[0] === 'e' && item.length > 0) {
      item[item.length - 1] = total;
      return JSON.stringify(parsed);
    }
  }
  return frameText;
}

function patchFrameText(frameText: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frameText);
  } catch {
    return null;
  }
  return patchParsed(parsed).changed ? JSON.stringify(parsed) : null;
}

interface Rebuild {
  text: string;
  frames: Frame[];
  patched: (string | null)[];
  endIndex: number;
}

/** Put the (possibly edited) frames back, fixing each length by the size change of its frame. */
function rebuild(input: Rebuild, endTotal: number | null): string {
  const { text, frames, patched, endIndex } = input;
  let out = text.slice(0, frames[0]!.tokenStart);
  let cursor = frames[0]!.tokenStart;
  frames.forEach((frame, i) => {
    const replacement =
      patched[i] ??
      (i === endIndex && endTotal !== null ? withEndTotal(frame.text, endTotal) : null);
    out += text.slice(cursor, frame.tokenStart);
    if (replacement === null) {
      out += text.slice(frame.tokenStart, frame.end);
    } else {
      const oldLength = Number.parseInt(text.slice(frame.tokenStart, frame.digitsEnd), 10);
      const newLength = oldLength + (replacement.length - frame.text.length);
      out += String(newLength) + text.slice(frame.digitsEnd, frame.start) + replacement;
    }
    cursor = frame.end;
  });
  return out + text.slice(cursor);
}

/** The closing total counts its own digits, so it may need a few rounds to settle. */
const SETTLE_ROUNDS = 4;

/**
 * Patch a whole framed `batchexecute` response. Returns the new text, or null when nothing in it
 * needed changing (or it does not look like a response at all).
 */
export function patchBatchResponse(text: string): string | null {
  const frames = splitFrames(text);
  if (frames === null) return null;
  const total = byteLength(text);
  const endIndex = frames.findIndex((f) => endFrameMatches(f.text, total) === true);
  const patched = frames.map((f) => patchFrameText(f.text));
  if (patched.every((p) => p === null)) return null;

  const input: Rebuild = { text, frames, patched, endIndex };
  let out = rebuild(input, null);
  if (endIndex === -1) return out;
  let size = byteLength(out);
  for (let round = 0; round < SETTLE_ROUNDS; round++) {
    out = rebuild(input, size);
    const next = byteLength(out);
    if (next === size) return out;
    size = next;
  }
  return out;
}

/** True for the responses worth looking at. */
export function mentionsFrames(text: string): boolean {
  return text.includes('wrb.fr');
}
