// Regenerate public/data/iran-domains.json from the upstream release (or a local domains.txt).
// Usage: node scripts/update-snapshot.mjs [path-to-domains.txt]
import { readFile, writeFile } from 'node:fs/promises';
import { countGroups, encodeGroups, parseDomainList } from '../src/shared/iranlist.ts';

const URL_LATEST =
  'https://github.com/bootmortis/iran-hosted-domains/releases/latest/download/domains.txt';
const local = process.argv[2];
const text = local ? await readFile(local, 'utf8') : await (await fetch(URL_LATEST)).text();

const groups = encodeGroups(parseDomainList(text));
const out = {
  source: 'https://github.com/bootmortis/iran-hosted-domains',
  generatedAt: new Date().toISOString(),
  count: countGroups(groups),
  groups,
};
await writeFile(new URL('../public/data/iran-domains.json', import.meta.url), JSON.stringify(out));
console.log(`wrote ${out.count} domains in ${Object.keys(groups).length} groups`);
