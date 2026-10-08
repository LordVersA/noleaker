# noleaker — Design Doc

A Chrome (Manifest V3) extension that replaces FoxyProxy and adds leak protection. You add a SOCKS5 proxy, turn it on or off from the popup, and noleaker makes the browser look like it is in the proxy's country: timezone, locale, WebRTC and QUIC are all handled. Written from scratch; no third-party extension code, no account, no license.

## Current hardening amendments

The historical decisions/phases below describe the original compatibility design. The
[privacy hardening plan](docs/PRIVACY-HARDENING.md) and README privacy-mode section supersede its
routing and assurance claims: strict routing, mandatory PAC, verified controls, persistent request
guards, disabled prediction, opt-in list updates, per-host seeds and strict worker blocking are now
implemented. List downloads follow the active browser route, not forced direct. Alt-Svc removal
is a mitigation, not a browser-wide QUIC switch. The manifest is authoritative for permissions.
No complete leak-prevention or anonymity guarantee is made. Live release checks remain pending.

## 1. Goals and non-goals

**Goals**

- Manage SOCKS5 proxies inside the extension (no FoxyProxy) and turn the proxy on and off with one click.
- Route everything through the proxy except Iranian sites and local addresses.
- Never leak the real IP: WebRTC, QUIC/UDP and a dead proxy must not expose it.
- Make timezone and locale match the proxy's exit country.
- Give a built-in leak test so the setup can be verified.
- Optional, off by default: canvas, WebGL, screen and hardware spoofing.

**Non-goals**

- Not a VPN. Only Chrome traffic is covered; other apps are not.
- No SOCKS5 with username/password (Chrome's proxy API cannot do it).
- No accounts, subscriptions or remote servers of our own.
- No anti-bot-evasion claims. Spoofing reduces obvious mismatches only.

## 2. Decisions (from the interview)

| #   | Topic            | Decision                                                                                                                                                    |
| --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Exit country     | Auto-detect through the proxy, plus a manual override in the popup. Re-check on a timer and whenever the proxy changes.                                     |
| 2   | IP lookup        | `cloudflare.com/cdn-cgi/trace` first, `ipwho.is` as fallback.                                                                                               |
| 3   | Timezone         | Use the exact IANA timezone from the lookup. Fall back to a per-country default table if missing.                                                           |
| 4   | Locale           | Always English (`en-US`, `en`). Not tied to the exit country.                                                                                               |
| 5   | Proxy mode       | Proxy all URLs. When no proxy is active, pause spoofing and show a warning.                                                                                 |
| 6   | Proxy type       | SOCKS5 with remote DNS.                                                                                                                                     |
| 7   | Proxy management | Built in; FoxyProxy is not used. Add, edit, delete and switch SOCKS5 profiles, plus on/off.                                                                 |
| 8   | Proxy auth       | None. Host and port only.                                                                                                                                   |
| 9   | Routing          | Everything through the proxy except the Iran-hosted domain list, your own direct domains, localhost and private IP ranges, which go direct. (Originally `.ir` was direct too; that blanket rule was removed, so a `.ir` site is direct only if you list it.) Done with a generated PAC script. |
| 10  | Fail mode        | Kill switch: if the proxy is on but unreachable, block requests instead of going direct.                                                                    |
| 11  | UDP leaks        | WebRTC policy `disable_non_proxied_udp` and QUIC/HTTP3 blocked.                                                                                             |
| 12  | Fingerprint      | Canvas/WebGL/screen/hardware spoofing in a late optional phase, off by default.                                                                             |
| 13  | UI and stack     | English UI. TypeScript + Vite, vanilla DOM, no UI framework.                                                                                                |
| 14  | Iran list        | Bundled snapshot, refreshed daily from `bootmortis/iran-hosted-domains` (fetched direct, not through the proxy). User can add their own domains.            |

## 3. Architecture

```
noleaker/
  manifest.json            MV3
  src/
    background/            service worker: state, proxy, detection, alarms
    content/               document_start, MAIN world: timezone, locale, WebRTC stubs
    bridge/                isolated-world content script: passes settings to MAIN world
    popup/                 on/off, proxy picker, exit info, status
    options/               proxy profiles, Iran list, whitelist, advanced toggles
    leaktest/              built-in leak test page
    shared/                types, storage, messages, country/timezone tables
  data/iran-domains.json   bundled snapshot
  tests/
```

**Permissions:** `proxy`, `storage`, `alarms`, `privacy`, `declarativeNetRequest`, `scripting`, `tabs`, `webNavigation`, plus `host_permissions` for `<all_urls>`.

**State** (in `chrome.storage.local`, one typed object): proxy profiles, active profile id, on/off, kill-switch state, detected and chosen country, timezone, Iran list and update time, whitelist, advanced toggles.

**Message flow:** the service worker is the single source of truth. On any change it recomputes the _effective config_ (country, timezone, locale, toggles) and pushes it to content scripts through the bridge. The MAIN-world script never reads storage directly.

**Key rule:** spoofing is only active when the proxy is on and the exit lookup succeeded. Otherwise noleaker pauses spoofing and shows a warning, so a fake timezone is never paired with the real IP.

## 4. Phases

Each phase ends with something that works and can be tested by hand.

### Phase 0 — Project skeleton

- Vite + TypeScript + MV3 setup, lint, formatter, `npm run build`, load-unpacked instructions.
- Typed storage wrapper and message bus.
- Empty popup and options pages.

**Done when:** the extension loads in Chrome with no errors and the popup opens.

### Phase 1 — Proxy manager (FoxyProxy replacement)

- Options page: add, edit and delete SOCKS5 profiles (name, host, port).
- Popup: profile picker and on/off switch.
- Apply with `chrome.proxy.settings.set` using a generated PAC script that sends all traffic through `SOCKS5 host:port` and returns `DIRECT` for `.ir`, localhost and private ranges (Iran list comes in Phase 4; `.ir` only for now).
- Toolbar icon shows on/off/error.
- Remote DNS: PAC must use SOCKS5 (not SOCKS4) so Chrome resolves names through the proxy.

**Done when:** turning it on shows your proxy's IP on any IP-check site, turning it off restores direct, and `.ir` sites stay direct.

### Phase 2 — Exit detection and kill switch

- On enable, on profile change and on a timer: fetch Cloudflare trace through the proxy, fall back to `ipwho.is`; store IP, country code and timezone.
- Manual country override in the popup.
- Health check of the proxy (periodic request plus `chrome.proxy.onProxyError`).
- Kill switch: if the proxy is on and unreachable, switch to a blocking PAC (everything fails except Iran-direct/local) and show "proxy unreachable". Recover automatically when the check passes.

**Done when:** stopping the proxy server blocks browsing within one check interval and never falls back to your real IP; restarting it recovers.

### Phase 3 — Timezone, locale and leak protection

- MAIN-world script at `document_start`, all frames, including `about:blank` and workers where possible.
- Timezone: override `Intl.DateTimeFormat` resolved options, `Date` offset and string methods so they agree with the detected IANA timezone (DST-correct).
- Locale: `navigator.language`/`languages` = `en-US`/`en`; `Accept-Language` set via `declarativeNetRequest`.
- WebRTC: `chrome.privacy.network.webRTCIPHandlingPolicy = disable_non_proxied_udp`.
- QUIC: block through the browser QUIC setting or a `declarativeNetRequest` rule so traffic falls back to TCP through SOCKS5.
- Spoofing active only when the proxy is on and detection succeeded (see Key rule).
- Native-looking patched functions (correct `name`, `length`, `toString`).

**Done when:** in the leak test, JS timezone, `Intl`, `Date`, language and WebRTC candidates all agree with the proxy exit and show no real IP.

### Phase 4 — Iran-direct list and whitelist

- Bundle `data/iran-domains.json`; daily `chrome.alarms` refresh from the `bootmortis/iran-hosted-domains` release, fetched direct, validated, and kept on failure.
- Regenerate the PAC script when the list changes.
- User-defined extra direct domains and a per-site whitelist (disable spoofing for chosen sites).

**Done when:** an Iran-hosted `.com` site loads direct, a normal site goes through the proxy, and a whitelisted site is not spoofed.

### Phase 5 — Built-in leak test and status UI

- `leaktest` page checks: public IP vs. expected, DNS exit, WebRTC candidates, QUIC fallback, timezone/language consistency, kill-switch state.
- Popup status summary (green/yellow/red) with the reason.
- Import/export of settings as JSON.

**Done when:** one click runs all checks and every failure points to the setting that fixes it.

### Phase 6 — Optional fingerprint spoofing (off by default)

- Toggles: canvas noise, WebGL vendor/renderer, screen size, `hardwareConcurrency`, `deviceMemory`.
- Stable per-profile seed so values do not change on every load.
- Documented risk: partial spoofing can make the browser more unique; keep defaults off.

**Done when:** each toggle changes only its own values and breaks nothing on the test site list.

### Phase 7 — Hardening and release

- Test matrix: Chrome stable and beta, Windows and macOS.
- Service-worker restart handling, upgrade/migration of stored state, error logging (local only).
- README, privacy statement (no data leaves the browser except the lookup and list-update requests), packaging.

## 5. Testing

- **Unit:** PAC generator, config merging, country/timezone tables, Iran list parsing.
- **Integration:** run a local SOCKS5 server and a small test page; assert proxy IP, kill-switch behavior and recovery.
- **Manual:** the leak test page plus external leak-test sites before each release.

## 6. Risks and open items

- **SOCKS5 UDP:** Chrome does not carry UDP through SOCKS5; the WebRTC policy and QUIC block are the mitigation, and calls over WebRTC may not work.
- **Worker scopes:** spoofing inside Web/Service Workers is limited; verify what leaks there in Phase 3.
- **Lookup trust:** the IP lookup services see your exit IP; they are third parties.
- **Service worker lifetime:** MV3 workers sleep, so all state must live in storage and alarms, not memory.
- **Not yet decided:** per-site whitelist semantics (spoofing only vs. also proxy bypass), and whether to support more than one active proxy at a time. Default for now: whitelist disables spoofing only; one active proxy.
