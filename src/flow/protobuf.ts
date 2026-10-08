// Just enough protobuf to rewrite one varint field of a message and keep every other byte.

interface Varint {
  value: number;
  next: number;
}

export function readVarint(buf: Uint8Array, start: number): Varint | null {
  let value = 0;
  let shift = 0;
  let pos = start;
  while (pos < buf.length) {
    const byte = buf[pos] ?? 0;
    pos += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return { value, next: pos };
    shift += 7;
    if (shift > 56) return null; // longer than a safe integer
  }
  return null;
}

export function writeVarint(value: number): number[] {
  const bytes: number[] = [];
  let rest = value;
  do {
    let byte = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) byte += 128;
    bytes.push(byte);
  } while (rest > 0);
  return bytes;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Where the field that starts at `pos` (after its tag) ends, or null for a shape we do not know. */
function skipValue(buf: Uint8Array, wireType: number, pos: number): number | null {
  if (wireType === 1) return pos + 8;
  if (wireType === 5) return pos + 4;
  if (wireType === 2) {
    const len = readVarint(buf, pos);
    return len === null ? null : len.next + len.value;
  }
  return null; // groups and unknown wire types
}

/**
 * Rewrite varint field `field`: every occurrence goes through `change`, which returns the new
 * value or null to keep it. If the field is absent and `appendValue` is not null it is added at
 * the end. Returns the new bytes, or null when nothing changed or the message is not parseable.
 */
export function rewriteVarintField(
  buf: Uint8Array,
  field: number,
  change: (value: number) => number | null,
  appendValue: number | null,
): Uint8Array | null {
  const parts: Uint8Array[] = [];
  let pos = 0;
  let found = false;
  let changed = false;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    if (tag === null) return null;
    const wireType = tag.value % 8;
    const number = Math.floor(tag.value / 8);
    if (wireType !== 0) {
      const end = skipValue(buf, wireType, tag.next);
      if (end === null || end > buf.length) return null;
      parts.push(buf.subarray(pos, end));
      pos = end;
      continue;
    }
    const value = readVarint(buf, tag.next);
    if (value === null) return null;
    const replacement = number === field ? change(value.value) : null;
    if (number === field) found = true;
    if (replacement === null) {
      parts.push(buf.subarray(pos, value.next));
    } else {
      parts.push(buf.subarray(pos, tag.next), Uint8Array.from(writeVarint(replacement)));
      changed = true;
    }
    pos = value.next;
  }
  if (!found && appendValue !== null) {
    parts.push(Uint8Array.from(writeVarint(field * 8)), Uint8Array.from(writeVarint(appendValue)));
    changed = true;
  }
  return changed ? concat(parts) : null;
}
