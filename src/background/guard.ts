/** Persistent request guard. Covers new DNR-visible requests, not existing sockets or OS traffic. */
import { ALL_TYPES } from './rules';
const GUARD_ID = 90;
const PROBE_ID = 92;
// Separate host families so every RE2 program stays below Chrome's compiled-memory limit.
const LOCAL_HOSTS = [
  'localhost',
  '[^/:]+\\.localhost',
  '[^/:]+\\.local',
  '[^./:]+',
  '(0|10|127)\\.[0-9.]+',
  '169\\.254\\.[0-9.]+',
  '172\\.(1[6-9]|2[0-9]|3[01])\\.[0-9.]+',
  '192\\.168\\.[0-9.]+',
  '\\[(::|::1)\\]',
  '\\[f[cd][0-9a-f:]*\\]',
  '\\[fe[89ab][0-9a-f:]*\\]',
  '\\[::ffff:[0-9a-f:.]+\\]',
];
export const LOCAL_RULE_IDS = LOCAL_HOSTS.map((_, i) => (i === 0 ? 91 : 92 + i));

export async function setGuard(blocked: boolean): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [GUARD_ID, PROBE_ID],
    addRules: blocked
      ? [
          {
            id: GUARD_ID,
            priority: 10000,
            action: { type: 'block' },
            condition: { urlFilter: '*', resourceTypes: ALL_TYPES },
          },
          // Only extension-origin health lookups. Page requests to the same hosts stay blocked.
          {
            id: PROBE_ID,
            priority: 10001,
            action: { type: 'allow' },
            condition: {
              regexFilter: '^https://(cloudflare\\.com/cdn-cgi/trace|ipwho\\.is/)(\\?|$)',
              initiatorDomains: [chrome.runtime.id],
              resourceTypes: ['xmlhttprequest'],
            },
          },
        ]
      : [],
  });
}

export async function setLocalGuard(strict: boolean): Promise<void> {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: LOCAL_RULE_IDS,
    addRules: strict
      ? LOCAL_HOSTS.map((host, i) => ({
          id: LOCAL_RULE_IDS[i]!,
          priority: 20000,
          action: { type: 'block' },
          condition: {
            regexFilter: `^[a-z]+://${host}\\.?(:[0-9]+)?(/|$)`,
            isUrlFilterCaseSensitive: false,
            resourceTypes: ALL_TYPES,
          },
        }))
      : [],
  });
}
