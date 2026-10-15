// Firefox update manifest for the self-hosted `update_url` (manifest.firefox.json), published as a
// release asset next to the signed .xpi. Usage: node scripts/updates-json.mjs <version> <xpi>
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

/** `manifest` is manifest.firefox.json; `xpi` the signed file's bytes, named `fileName`. */
export function updatesJson(manifest, version, fileName, xpi) {
  const gecko = manifest.browser_specific_settings.gecko;
  // update_url is …/releases/latest/download/updates.json; the .xpi lives in its tagged release.
  const link = gecko.update_url.replace(
    /latest\/download\/updates\.json$/,
    `download/v${version}/${fileName}`,
  );
  if (link === gecko.update_url) throw new Error('Unexpected update_url in the Firefox manifest.');
  const update = {
    version,
    update_link: link,
    update_hash: `sha256:${createHash('sha256').update(xpi).digest('hex')}`,
    browser_specific_settings: { gecko: { strict_min_version: gecko.strict_min_version } },
  };
  return { addons: { [gecko.id]: { updates: [update] } } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [version, xpi] = process.argv.slice(2);
  if (!version || !xpi) throw new Error('usage: updates-json.mjs <version> <xpi>');
  const manifest = JSON.parse(readFileSync('manifests/manifest.firefox.json', 'utf8'));
  const out = updatesJson(manifest, version, basename(xpi), readFileSync(xpi));
  console.log(JSON.stringify(out, null, 2));
}
