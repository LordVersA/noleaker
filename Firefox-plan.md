# noleaker for Firefox: implementation plan

Port of [`../noleaker`](../noleaker) (Chrome MV3, v0.1.1) to Firefox desktop.
The work happens **inside the `noleaker` repo** as a second build target; this file is only the plan.

Date: 2026-10-14. Status: Phase 0 done; Phase 1 done except a manual load check in Firefox (see spike notes).

## 1. Decisions

| #   | Topic                  | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Codebase               | One codebase, two build targets, in the existing `noleaker` repo.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1b  | Per-platform builds    | Platform code lives in `src/platform/chrome/*` and `src/platform/firefox/*`, imported through an `@platform/*` alias resolved **at build time**. Each bundle contains only its own platform code. No `webextension-polyfill`, no runtime `isFirefox` branches. Small differences use `define` constants (`__BROWSER__`, `__FEATURE_FLOW__`) that the minifier removes. Shared code keeps using `chrome.*` where both browsers support it (Firefox MV3 supports the `chrome` namespace with promises). |
| 2   | Proxy routing          | `browser.proxy.onRequest` in Firefox (not PAC). PAC matching logic is extracted into a pure, shared `route(host, ctx)` function. The Iran list is kept in memory as a lookup structure instead of a 127k-entry PAC string.                                                                                                                                                                                                                                                                            |
| 2b  | SOCKS auth             | SOCKS5 username/password supported **in Firefox only** (`proxyInfo.username/password`). Shared profile type gets optional fields; Chrome UI hides them.                                                                                                                                                                                                                                                                                                                                               |
| 3   | Kill switch / guard    | Kill switch, transition guard and strict-mode local-host block are decided **inside `route()`** (dead-end proxy, or cancel). `guard.ts` becomes Chrome-only. Accept-Language and Alt-Svc stripping stay on **DNR** (shared `rules.ts`); any DNR feature Firefox lacks falls back to `webRequest` for that one case only.                                                                                                                                                                              |
| 4   | Target                 | Firefox desktop, `strict_min_version: "140.0"` (ESR 140). Android not in scope (optional late phase). Forks (LibreWolf, Floorp, Zen) "probably works, untested". Tor Browser out of scope.                                                                                                                                                                                                                                                                                                            |
| 5   | Distribution           | First **unlisted, AMO-signed** `.xpi` on GitHub Releases with self-hosted `update_url`. Public AMO listing later, after a policy review.                                                                                                                                                                                                                                                                                                                                                              |
| 6   | Google Flow unlock     | Ported behind build flag `__FEATURE_FLOW__`. Included in the GitHub (unlisted) build, compiled out entirely in the AMO build. Late phase.                                                                                                                                                                                                                                                                                                                                                             |
| 7   | Containers             | No per-container routing, ever. One proxy for all containers, same model as Chrome.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8   | Private windows        | Warning only: notice in popup/options/leak test, plus a **warning badge on the toolbar icon** when "Run in Private Windows" is not allowed. Status logic otherwise unchanged. Manifest `"incognito": "spanning"`.                                                                                                                                                                                                                                                                                     |
| 9   | Firefox RFP / FPP      | When `privacy.resistFingerprinting` is on, our fingerprint shields (canvas, audio, WebGL, screen, CPU) are disabled automatically, with a note in options and the leak test. Timezone and locale spoofing stay on. FPP cannot be read: documented note only. We never change the user's RFP setting.                                                                                                                                                                                                  |
| 10  | Testing                | vitest unit (shared + `route()` + manifest) + **bundle-content test** + `web-ext lint` in CI + small **Selenium/geckodriver E2E** suite for 4 leak scenarios: startup, kill switch, private window without access, WebRTC. Everything else on the manual checklist.                                                                                                                                                                                                                                   |
| 11  | Version / ID / release | One version for both targets, one GitHub release with `noleaker-chrome-X.Y.Z.zip` and `noleaker-firefox-X.Y.Z.xpi`, both in `SHA256SUMS.txt`. Gecko ID `noleaker@lordversa.github.io` (permanent). `update_url` → `updates.json` attached to GitHub Releases (`releases/latest/download/updates.json`).                                                                                                                                                                                               |

## 2. What changes and what is shared

Inventory of Chrome-specific code in `noleaker/src` today:

| File                            | Chrome-specific part                                                         | Firefox plan                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `background/proxy.ts`           | `chrome.proxy.settings` + PAC, `levelOfControl` verification                 | `platform/firefox/proxy.ts`: `proxy.onRequest` listener calling shared `route()`  |
| `shared/pac.ts`                 | PAC string generator                                                         | Split: shared `route()` (pure logic) + Chrome-only PAC serializer                 |
| `background/guard.ts`           | DNR block-all / local-host block                                             | Chrome-only. Firefox: inside `route()`                                            |
| `background/protection.ts`      | WebRTC + prediction via `chrome.privacy`, PAC re-verification before release | Shared core; proxy re-verification moves behind `@platform/proxy-verify`          |
| `background/rules.ts`           | DNR rules                                                                    | Shared; verify Firefox DNR feature support (Phase 1 spike)                        |
| `background/monitor.ts`         | `chrome.proxy.onProxyError`, `proxy.settings.onChange`                       | Firefox: `proxy.onError`; no settings-change watch needed for `onRequest`         |
| `background/index.ts`           | Listener wiring for proxy/privacy changes                                    | Platform-specific wiring module                                                   |
| `content/native.ts`             | `chrome-extension://` stack cleaning (stealth)                               | Must also strip `moz-extension://<uuid>/` frames; Firefox stack format differs    |
| `leaktest/checks.ts`, `main.ts` | Proxy / incognito checks                                                     | Add private-window access + RFP checks; QUIC check adapted                        |
| `popup/main.ts`                 | `chrome.extension.isAllowedIncognitoAccess` etc.                             | Private-window warning; auth fields hidden/shown per platform                     |
| `shared/rules-status.ts`        | DNR status types                                                             | Shared                                                                            |
| `public/manifest.json`          | MV3 Chrome manifest                                                          | `manifest.chrome.json` + `manifest.firefox.json` (or one base + per-target patch) |

Everything else (storage, messages, settings, countries, timezone tables, Iran list parsing, spoof
config, content spoofing, popup/options/leak-test UI) is shared as is.

## 3. Phases

Each phase ends with something that runs and can be checked by hand. The Chrome build must keep
passing all existing tests after every phase.

### Phase 0: Multi-target build (Chrome unchanged)

- Add `--mode chrome|firefox` to `vite.config.ts` and `vite.content.config.ts`; output to
  `dist/chrome/` and `dist/firefox/`.
- `@platform/*` alias → `src/platform/<target>/`; `define` constants `__BROWSER__`, `__FEATURE_FLOW__`.
- Move Chrome-only code (`guard.ts`, PAC serializer, proxy settings verification, Chrome listener
  wiring) into `src/platform/chrome/` without behavior change.
- Extract `route(host, ctx)` from `pac.ts` as a pure shared function; the Chrome PAC serializer
  produces the same PAC from it (existing `pac.test.ts` must still pass).
- Split manifest into per-target files; update `scripts/package.mjs`, `scripts/dev.mjs` and the
  version check in `release.yml`.
- Bundle test: Chrome bundle size and content are not worse than before (record a baseline first).
- Lint rule (`no-restricted-imports` / `no-restricted-syntax`): shared code may not import
  `platform/*` directly or use Chrome-only APIs.

**Done when:** `npm run build:chrome` output loads and behaves exactly like v0.1.1, all tests pass,
and the bundle is not larger.

### Phase 1: Firefox skeleton and API spikes

- `manifest.firefox.json`: MV3, `background.scripts` (event page, not `service_worker`),
  `browser_specific_settings.gecko` (`id`, `strict_min_version: "140.0"`, `update_url`,
  `data_collection_permissions`), `"incognito": "spanning"`, permissions (`proxy`, `storage`,
  `alarms`, `privacy`, `declarativeNetRequest`, `scripting`, `webNavigation`, `<all_urls>`).
- Remove/replace keys Firefox does not support (check `match_origin_as_fallback`,
  `minimum_chrome_version`, `options_page` → `options_ui`).
- Popup and options open with no errors; storage works.
- **Spikes (write results back into this file):**
  1. **Startup window:** with an MV3 event page, are requests made at browser start (restored tabs,
     session restore) held until the `proxy.onRequest` listener answers, or do they go direct?
     If they can leak, design the fallback (for example a `proxy.settings` block-all set while
     enabled, or blocking `webRequest`) before Phase 2 ends.
  2. **DNR support:** `regexFilter`, `initiatorDomains`, `excludedRequestDomains` with large lists,
     `modifyHeaders` on response headers (Alt-Svc), dynamic rule limits.
  3. **MAIN world:** `content_scripts[].world: "MAIN"` at `document_start`, all frames,
     `about:blank`; ordering against inline page scripts; `scripting.registerContentScripts` with
     `world: "MAIN"` (needed by Flow).
  4. **HTTP/3 over SOCKS:** confirm Firefox does not use QUIC for SOCKS-proxied requests, so
     Alt-Svc stripping stays a mitigation and nothing more is needed.
  5. **`privacy.network.*`:** `webRTCIPHandlingPolicy` (`disable_non_proxied_udp`) and
     `networkPredictionEnabled` values and `levelOfControl` behaviour in Firefox.

**Done when:** `web-ext run` loads `dist/firefox` with no errors, and all 5 spikes have a written
answer.

#### Phase 1 results (2026-10-14)

Done: `manifests/manifest.firefox.json` (MV3, `background.scripts` + `type: module`, gecko ID,
`strict_min_version: "140.0"`, self-hosted `update_url`, `data_collection_permissions: none`,
`incognito: spanning`, `options_ui`, no `minimum_chrome_version`, `match_origin_as_fallback`
dropped). `npm run lint:firefox` (`web-ext lint --self-hosted`): 0 errors, 1 warning (Android
min-version for `data_collection_permissions`; Android is out of scope). Firefox platform modules
are stubs: enabling the proxy in Firefox raises a protection error instead of pretending traffic is
proxied.

**Not verified here:** `web-ext run` could not attach to Firefox from the agent sandbox (debugger
port never opened). Run `npm run build:firefox && npm run start:firefox` and check the popup,
options and leak test open with no console errors and settings persist.

Spike answers below come from Mozilla docs and source knowledge, **not from experiments**. Each
must be confirmed by the Phase 6 E2E suite (or by hand) before the phase that depends on it is done.

1. **Startup window.** Firefox "primes" persistent listeners of event pages and holds matching
   requests until the background script starts, but only for listeners registered synchronously at
   top level in the previous session; first install, updates and a slow/failing start are not
   covered. Also: an exception or rejected promise in `proxy.onRequest` makes Firefox **ignore the
   listener and continue as if there were no proxy** (direct), surfaced only via `proxy.onError`.
   Phase 2 design: register `proxy.onRequest` synchronously at top level; the listener catches
   everything and returns the dead-end proxy on any error or while state is not loaded; plus a
   fail-closed `proxy.settings` value (manual proxy to the dead end) while enabled, so a missing
   listener never means direct. E2E test 1 must prove no request goes direct at startup.
2. **DNR.** Firefox (113+, all of it in 140) supports `regexFilter`, `initiatorDomains`,
   `excludedRequestDomains`, `modifyHeaders` on request and response headers (Alt-Svc removal) and
   dynamic rules. Limits differ from Chrome (regex rule count and dynamic rule caps); check
   `rules.ts` counts against `declarativeNetRequest.MAX_NUMBER_OF_*` at runtime and keep the
   existing `rules-status` reporting so a failed install is visible.
3. **MAIN world.** `content_scripts[].world: "MAIN"` and `scripting.registerContentScripts` with
   `world: "MAIN"` are supported from Firefox 128. `match_about_blank` is supported;
   `match_origin_as_fallback` was removed from the Firefox manifest pending confirmation. Run order
   at `document_start` against inline page scripts must be measured in Phase 4 (fixture page).
4. **HTTP/3 over SOCKS.** Firefox does not use HTTP/3 (QUIC) for connections that go through a
   SOCKS proxy; Alt-Svc stripping stays a mitigation only. Confirm in Phase 3 with the SOCKS test
   server log (only TCP CONNECTs).
5. **`privacy.network`.** Firefox supports `webRTCIPHandlingPolicy` (including
   `disable_non_proxied_udp`) and `networkPredictionEnabled`, with the same `levelOfControl`
   strings as Chrome, so `protection.ts` can stay shared. The `onChange` listeners in
   `platform/chrome/wiring.ts` can be reused for Firefox in Phase 3.

### Phase 2: Proxy routing, auth, kill switch, exit detection

- `platform/firefox/proxy.ts`: `proxy.onRequest` listener → `route()` →
  `{type: "socks", host, port, proxyDNS: true, username?, password?, failoverTimeout}` /
  `{type: "direct"}` / dead-end.
- Iran list and extra direct domains loaded into an in-memory lookup once per change, not per request.
  Keep `route()` allocation-free on the hot path.
- Kill switch, transition guard and strict local-host block inside `route()`; probe hosts
  (`cloudflare.com/cdn-cgi/trace`, `ipwho.is`) still go through the proxy only for
  extension-originated requests (`details.originUrl` / `documentUrl` is the extension).
- Profile type: optional `username` / `password`; options UI shows the fields only in the Firefox build.
  Credentials stored in `storage.local` (documented in PRIVACY.md).
- `monitor.ts`: Firefox health checks and `proxy.onError`; exit detection unchanged (shared).
- Startup fallback from spike 1, if needed.
- Toolbar icon states unchanged (shared `badge.ts`).

**Done when:** proxy on shows the proxy IP, Iran-list sites go direct in compatibility mode,
stopping the SOCKS server blocks everything within one check interval and never goes direct,
restarting recovers, and an authenticated SOCKS server works.

### Phase 3: Leak protection and Firefox-specific state

- `protection.ts`: WebRTC policy and network prediction via `browser.privacy.network` (from spike 5);
  proxy re-verification step replaced by the Firefox equivalent (listener registered + state ok).
- DNR header rules (Accept-Language, Alt-Svc), with a `webRequest` fallback only for whatever spike 2
  says is missing.
- **Private windows (decision 8):** `extension.isAllowedIncognitoAccess()` on startup and on popup open;
  warning in popup, options and leak test; warning badge on the icon when not allowed.
- **RFP (decision 9):** read `privacy.websites.resistFingerprinting`, watch `onChange`; when on,
  force fingerprint shields off in the effective config and show the note.

**Done when:** WebRTC shows no real IP, Accept-Language matches, the private-window badge appears
and disappears with the setting, and enabling RFP turns the fingerprint shields off.

### Phase 4: Content scripts (spoofing, bridge, workers, stealth)

- Build `main`, `bridge`, `worker` content scripts for Firefox (`target` set for Firefox, not `chrome120`).
- Verify timezone, `Intl`, `Date`, locale, geolocation, WebRTC stubs, fonts, voices, keyboard in MAIN world.
- Handshake/event channel unchanged; check it against Firefox's Xray wrappers between worlds
  (`CustomEvent.detail` as string stays safe).
- Worker prelude via blob URL: verify classic worker wrapping and CSP behaviour in Firefox.
- Stealth: `native.ts` stack cleaning for `moz-extension://` and Firefox's stack format
  (`fn@url:line:col`); `Function.prototype.toString` output matches Firefox's native format.
- Stale-page detection and per-tab audit (`webNavigation`, `scripting.executeScript`).

**Done when:** the built-in leak test shows timezone, locale, `Intl`, `Date` and workers all matching
the exit, with stealth on and off, on the browser-fixtures pages.

### Phase 5: UI, Iran list, settings

- Popup, options, leak test: Firefox-only items (auth fields, private-window notice, RFP note);
  remove Chrome-only wording ("chrome://extensions", "Chrome's proxy API") from the Firefox build.
- Iran list daily update (alarms) and approval flow work under the event page.
- Settings import/export compatible between Chrome and Firefox (auth fields ignored on Chrome).
- Storage migration tests extended for the new profile fields.

**Done when:** every popup, options and leak-test action works in Firefox, and a settings export
from Chrome imports into Firefox (and back).

### Phase 6: Tests and CI

- Unit: `route()` matrix (Iran, extra direct, local, strict, kill switch, probe hosts, IPv6,
  auth), Firefox manifest, RFP/private-window config logic.
- **Bundle-content test:** `dist/firefox` contains no `pacScript`, `proxy.settings.set`, guard
  rules or other Chrome-only code; `dist/chrome` contains no `proxy.onRequest`; the AMO build has no
  Flow code.
- `web-ext lint` on `dist/firefox` in CI.
- **Selenium + geckodriver E2E** (local SOCKS5 server from `npm run socks`, fixture page):
  1. startup: no request goes direct before the listener is ready;
  2. kill switch: SOCKS server down → no direct request;
  3. private window without access → warning badge shown;
  4. WebRTC: no real-IP candidates.
- Manual release checklist extended with Firefox items.

**Done when:** CI runs unit, bundle, lint and E2E for both targets and is green.

### Phase 7: Release (unlisted, signed)

- `npm run package` builds both targets: `noleaker-chrome-X.Y.Z.zip` and
  `noleaker-firefox-X.Y.Z.xpi`.
- `release.yml`: `web-ext sign --channel=unlisted` with `AMO_JWT_ISSUER` / `AMO_JWT_SECRET` secrets;
  attach the signed `.xpi`, `updates.json` and updated `SHA256SUMS.txt` to the release.
- Version check covers both manifests.
- Docs: README (Firefox install, badges), PRIVACY.md (credential storage, Firefox specifics),
  docs/DETAILS.md (Firefox differences: routing, private windows, RFP, stealth limits), THIRD_PARTY.md.

**Done when:** a tag produces both artifacts, the `.xpi` installs permanently in Firefox release, and
a version bump auto-updates an installed copy.

### Phase 8: Google Flow unlock (flagged)

- `__FEATURE_FLOW__` define; `src/flow/` and `background/flow.ts` only imported behind it.
- Registered MAIN-world script for the Flow URLs (from spike 3), DNR rule for the
  `unsupported-country` page, tab bounce via `webNavigation`.
- `tests/phase16.test.ts` samples pass for the Firefox build.

**Done when:** Flow unlock works in the GitHub Firefox build and the bundle test proves the AMO build
has none of its code.

### Phase 9 (later, optional): Public AMO listing

- AMO build profile: `__FEATURE_FLOW__ = false`.
- Reproducible source package + build instructions for reviewers.
- `data_collection_permissions` reviewed; listing text, screenshots, privacy policy.
- Policy review of fingerprint shields and the domain list before submitting.

### Phase 10 (later, optional): Firefox for Android

- `gecko_android` in manifest, popup/options layout on mobile, `privacy.network` availability,
  testing on device.

## 4. Risks and open items

- **Startup leak window** (spike 1) is the biggest unknown; Phase 2 cannot be called done without
  an answer and, if needed, a fallback.
- **Private windows** leak if the user does not grant access. Decision 8 accepts a warning-only
  approach; this must be stated plainly in README and DETAILS.
- **Stealth on Firefox** is weaker until verified: Firefox stack format, `toString` output and Xray
  behaviour differ from Chrome.
- **RFP/FPP:** FPP cannot be detected, so canvas/audio noise may stack with Firefox's own when the
  user turns shields on.
- **Performance:** `proxy.onRequest` runs JS on every request; `route()` must be O(labels) with no
  allocation-heavy work, and the Iran lookup structure must be built once per list change.
- **Gecko ID is permanent** once signed: `noleaker@lordversa.github.io`.
- **SOCKS credentials** are stored unencrypted in extension storage (same as any proxy extension);
  documented, not hidden.
