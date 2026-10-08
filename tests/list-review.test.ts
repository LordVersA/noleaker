import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveIranList, CANDIDATE_KEY, updateIranList } from '../src/background/iranlist';
import { encodeGroups } from '../src/shared/iranlist';
import { DEFAULT_STATE } from '../src/shared/storage';

vi.mock('../src/shared/log', () => ({ log: vi.fn() }));
let stored: Record<string, unknown>;
const domains = Array.from({ length: 5000 }, (_, i) => `site${i}.example`);
const list = [...domains, 'new.example'].join('\n');
beforeEach(() => {
  stored = {
    state: { ...DEFAULT_STATE, routingMode: 'compatibility', listUpdates: true },
    iranList: encodeGroups(domains),
  };
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: stored[key] }),
        set: async (items: Record<string, unknown>) => Object.assign(stored, items),
        remove: async (key: string) => {
          delete stored[key];
        },
      },
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url: string) =>
        new Response(
          url.endsWith('.sha256') ? createHash('sha256').update(list).digest('hex') : list,
        ),
    ),
  );
});

describe('unsigned routing-list review', () => {
  it('stages changes above 10% and replaces the list only after explicit approval', async () => {
    const additions = Array.from({ length: 501 }, (_, i) => `added${i}.example`);
    const removals = domains.slice(0, 501);
    const updatedDomains = [...domains.slice(501), ...additions];
    const updated = updatedDomains.join('\n');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            url.endsWith('.sha256') ? createHash('sha256').update(updated).digest('hex') : updated,
          ),
      ),
    );
    const old = stored.iranList;
    const result = await updateIranList();
    expect(result.ok).toBe(true);
    expect(result.warning).toContain('more than 10%');
    expect(result.added).toEqual(additions.sort());
    expect(result.removed).toEqual(removals.sort());
    expect(stored.iranList).toBe(old);
    expect(await approveIranList(result.candidateId!)).toEqual({ ok: true });
    expect(stored.iranList).toEqual(encodeGroups(updatedDomains));
    expect(stored[CANDIDATE_KEY]).toBeUndefined();
  });
  it('stages the complete diff without changing live routing', async () => {
    const old = stored.iranList;
    const result = await updateIranList();
    expect(result).toMatchObject({ ok: true, added: ['new.example'], removed: [] });
    expect(stored.iranList).toBe(old);
    expect(stored.state).not.toHaveProperty('iranDomainsUpdatedAt', expect.any(Number));
    expect(await approveIranList(result.candidateId!)).toEqual({ ok: true });
    expect(stored.iranList).not.toBe(old);
    expect(stored[CANDIDATE_KEY]).toBeUndefined();
  });
  it('rejects approval of a replaced candidate', async () => {
    const first = await updateIranList();
    await updateIranList();
    expect(await approveIranList(first.candidateId!)).toMatchObject({ ok: false });
    expect(stored.iranList).toEqual(encodeGroups(domains));
  });
  it('rejects a changed baseline and strict-mode approvals', async () => {
    const result = await updateIranList();
    stored.iranList = encodeGroups([...domains, 'other.example']);
    expect(await approveIranList(result.candidateId!)).toMatchObject({ ok: false });
    stored.state = { ...DEFAULT_STATE, listUpdates: true };
    expect(await approveIranList(result.candidateId!)).toMatchObject({ ok: false });
    expect(await updateIranList()).toMatchObject({ ok: false });
  });
  it('keeps live routing on checksum failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(list)),
    );
    expect(await updateIranList()).toMatchObject({ ok: false });
    expect(stored.iranList).toEqual(encodeGroups(domains));
    expect(stored[CANDIDATE_KEY]).toBeUndefined();
  });
});
