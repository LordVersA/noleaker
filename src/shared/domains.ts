const LABEL = '[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?';
const DOMAIN = new RegExp(`^${LABEL}(\\.${LABEL})*$`);

/** Accepts "Example.com", "*.example.com", "https://example.com/path" ... -> "example.com", or null. */
export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/[/?#].*$/, '');
  d = d
    .replace(/:\d+$/, '')
    .replace(/^\*?\./, '')
    .replace(/\.$/, '');
  if (d.length === 0 || d.length > 253) return null;
  if (/[^ -~]/.test(d)) {
    try {
      d = new URL(`http://${d}`).hostname;
    } catch {
      return null;
    }
  }
  return DOMAIN.test(d) ? d : null;
}

/** True when `host` is one of the entries or a subdomain of one. */
export function hostMatches(host: string, entries: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return entries.some((e) => h === e || h.endsWith(`.${e}`));
}

/** Parse a textarea (one domain per line). Returns the valid domains and the rejected lines. */
export function parseDomainLines(text: string): { domains: string[]; invalid: string[] } {
  const domains = new Set<string>();
  const invalid: string[] = [];
  for (const raw of text.split(/[\n,]+/)) {
    if (!raw.trim()) continue;
    const d = normalizeDomain(raw);
    if (d) domains.add(d);
    else invalid.push(raw.trim());
  }
  return { domains: [...domains], invalid };
}
