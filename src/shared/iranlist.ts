/**
 * Compact form of the Iran-hosted domain list, small enough to embed in a PAC script.
 * Domains are grouped by their last label (TLD); inside a group the names are sorted and
 * front-coded: each entry is one base-36 char (shared prefix length with the previous name)
 * followed by the rest of the name, entries joined by ",".
 */
export type Groups = Record<string, string>;

export interface IranListMeta {
  count: number;
  updatedAt: number;
  source: 'bundled' | 'remote';
}

const MAX_PREFIX = 35;
const VALID = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)+$/;

/**
 * Parse the upstream domains.txt: one domain per line. `.ir` entries are kept: only listed `.ir`
 * domains go direct (there is no blanket `.ir` rule).
 */
export function parseDomainList(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split('\n')) {
    let d = line.trim().toLowerCase().replace(/^\./, '');
    if (!d || d.startsWith('#')) continue;
    if (/[^ -~]/.test(d)) {
      try {
        d = new URL(`http://${d}`).hostname;
      } catch {
        continue;
      }
    }
    if (d.length <= 253 && VALID.test(d)) out.add(d);
  }
  return [...out];
}

export function encodeGroups(domains: readonly string[]): Groups {
  const byTld = new Map<string, string[]>();
  for (const d of domains) {
    const i = d.lastIndexOf('.');
    if (i <= 0) continue;
    const tld = d.slice(i + 1);
    const names = byTld.get(tld) ?? [];
    names.push(d.slice(0, i));
    byTld.set(tld, names);
  }
  const groups: Groups = {};
  for (const [tld, names] of [...byTld].sort(([a], [b]) => (a < b ? -1 : 1))) {
    names.sort();
    let prev = '';
    const entries = names.map((name) => {
      let k = 0;
      while (k < prev.length && k < name.length && k < MAX_PREFIX && prev[k] === name[k]) k++;
      prev = name;
      return k.toString(36) + name.slice(k);
    });
    groups[tld] = entries.join(',');
  }
  return groups;
}

export function decodeGroups(groups: Groups): string[] {
  const out: string[] = [];
  for (const [tld, encoded] of Object.entries(groups)) {
    let prev = '';
    for (const entry of encoded.split(',')) {
      const name = prev.slice(0, parseInt(entry[0]!, 36)) + entry.slice(1);
      prev = name;
      out.push(`${name}.${tld}`);
    }
  }
  return out;
}

export function countGroups(groups: Groups): number {
  return Object.values(groups).reduce((n, g) => n + g.split(',').length, 0);
}

/** Does `host` (or a parent domain) appear in the compact list? Mirrors the PAC lookup. */
export function groupsContain(groups: Groups, host: string): boolean {
  const labels = host.toLowerCase().split('.');
  const tld = labels[labels.length - 1]!;
  const encoded = groups[tld];
  if (!encoded) return false;
  const names = new Set<string>();
  let prev = '';
  for (const entry of encoded.split(',')) {
    prev = prev.slice(0, parseInt(entry[0]!, 36)) + entry.slice(1);
    names.add(prev);
  }
  for (let i = 0; i < labels.length - 1; i++) {
    if (names.has(labels.slice(i, -1).join('.'))) return true;
  }
  return false;
}

/** Is the site connected directly: your own direct domains, or the Iran list? */
export function isDirectHost(
  host: string,
  groups: Groups | undefined,
  extra: readonly string[],
): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (extra.some((e) => h === e || h.endsWith(`.${e}`))) return true;
  return !!groups && groupsContain(groups, h);
}
