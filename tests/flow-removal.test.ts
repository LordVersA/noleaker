/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_FLOW_SCRIPT_ID, removeLegacyFlow } from '../src/background/legacy';
import { LEGACY_FLOW_RULE_ID, RULE } from '../src/background/rules';
import { exportSettings, parseSettings } from '../src/shared/settings';
import { DEFAULT_STATE, migrateState, SCHEMA_VERSION } from '../src/shared/storage';

// The Google Flow unlock moved to its own extension (noleaker-flow). These tests make sure nothing
// of it is left: in stored data, in settings files, in a browser updated from v0.1.1, or in a build.

describe('stored state', () => {
  it('drops flowUnlock from older data and keeps everything else', () => {
    for (const flowUnlock of [true, false]) {
      const s = migrateState({
        schemaVersion: 8,
        flowUnlock,
        stealth: true,
        routingMode: 'strict',
      });
      expect('flowUnlock' in s).toBe(false);
      expect(s.stealth).toBe(true);
      expect(s.routingMode).toBe('strict');
      expect(s.schemaVersion).toBe(SCHEMA_VERSION);
    }
    expect('flowUnlock' in DEFAULT_STATE).toBe(false);
  });
});

describe('settings files', () => {
  it('no longer export flowUnlock', () => {
    expect(JSON.parse(exportSettings(DEFAULT_STATE))).not.toHaveProperty('flowUnlock');
  });
  it('still import older files that carry it, and ignore it', () => {
    const v7 = { ...JSON.parse(exportSettings(DEFAULT_STATE)), version: 7, flowUnlock: false };
    const result = parseSettings(JSON.stringify(v7));
    expect(result.ok).toBe(true);
    expect(result.ok && 'flowUnlock' in result.patch).toBe(false);
  });
});

describe('cleanup after updating from a version with Flow', () => {
  let registered: string[];
  let rules: number[];
  let session: Record<string, unknown>;

  beforeEach(() => {
    registered = [LEGACY_FLOW_SCRIPT_ID];
    rules = [RULE.ALT_SVC, LEGACY_FLOW_RULE_ID];
    session = { flowBounces: { 1: [0] } };
    vi.stubGlobal('chrome', {
      scripting: {
        getRegisteredContentScripts: async ({ ids }: { ids: string[] }) =>
          registered.filter((id) => ids.includes(id)).map((id) => ({ id })),
        unregisterContentScripts: async ({ ids }: { ids: string[] }) => {
          registered = registered.filter((id) => !ids.includes(id));
        },
      },
      declarativeNetRequest: {
        updateDynamicRules: async ({ removeRuleIds }: { removeRuleIds: number[] }) => {
          rules = rules.filter((id) => !removeRuleIds.includes(id));
        },
      },
      storage: {
        local: { get: async () => ({}), set: async () => undefined },
        session: { remove: async (key: string) => void delete session[key] },
      },
    });
  });

  it('unregisters the old page script and removes only the old Flow rule', async () => {
    await removeLegacyFlow();
    expect(registered).toEqual([]);
    expect(rules).toEqual([RULE.ALT_SVC]);
    expect(session).toEqual({});
  });
  it('is harmless when nothing is left, and never throws', async () => {
    registered = [];
    await removeLegacyFlow();
    (chrome.scripting as any).getRegisteredContentScripts = async () => {
      throw new Error('boom');
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(removeLegacyFlow()).resolves.toBeUndefined();
  });
  it('the old rule id is not reused', () => {
    expect(Object.values(RULE)).not.toContain(LEGACY_FLOW_RULE_ID);
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe('source and builds', () => {
  it('src/ has no Flow code', () => {
    expect(existsSync('src/flow')).toBe(false);
    expect(existsSync('src/background/flow.ts')).toBe(false);
  });
  for (const target of ['chrome', 'firefox'])
    describe.skipIf(!existsSync(`dist/${target}/background.js`))(`dist/${target}`, () => {
      it('contains no Flow code', () => {
        expect(existsSync(`dist/${target}/content/flow.js`)).toBe(false);
        for (const f of files(`dist/${target}`).filter((f) => /\.(js|html|json)$/.test(f))) {
          const text = readFileSync(f, 'utf8');
          for (const marker of ['batchexecute', 'unsupported-country', 'content/flow.js', 'cPZSdc'])
            expect(text, `${f}: ${marker}`).not.toContain(marker);
        }
      });
    });
});
