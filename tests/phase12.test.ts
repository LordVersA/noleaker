import { describe, expect, it } from 'vitest';
import {
  CORE_IDS,
  coreRules,
  headerExclusions,
  headerRules,
  installStage,
  languageExclusions,
  RULE,
  type DnrRule,
} from '../src/background/rules';
import { CAPTCHA_DOMAINS, isCaptchaPage, RECAPTCHA_URL_FILTER } from '../src/shared/antibot';
import { protectionPlan } from '../src/shared/plan';
import { rulesProblem, type RulesStatus } from '../src/shared/rules-status';
import { SHIELD_DEFAULTS } from '../src/shared/shields';
import { DEFAULT_STATE } from '../src/shared/storage';
import { summarize } from '../src/shared/status';
import type { State } from '../src/shared/types';

const profile = { id: 'a', name: 'a', host: 'h.com', port: 1 };
const exit = { ip: '1.1.1.1', countryCode: 'DE', timezone: 'Europe/Berlin', detectedAt: 0 };
const live = (shields: Partial<State['shields']> = {}): State => ({
  ...DEFAULT_STATE,
  controlsVerifiedAt: Date.now(),
  enabled: true,
  profiles: [profile],
  activeProfileId: 'a',
  detectedExit: exit,
  shields: { ...SHIELD_DEFAULTS, ...shields },
});

describe('captcha detection', () => {
  it('matches providers and their subdomains', () => {
    for (const host of CAPTCHA_DOMAINS) expect(isCaptchaPage(host, '/'), host).toBe(true);
    expect(isCaptchaPage('newassets.hcaptcha.com', '/captcha/')).toBe(true);
    expect(isCaptchaPage('API.RECAPTCHA.NET', '/')).toBe(true);
  });
  it('matches only the reCAPTCHA path on www.google.com', () => {
    expect(isCaptchaPage('www.google.com', '/recaptcha/api2/anchor')).toBe(true);
    expect(isCaptchaPage('www.google.com', '/search')).toBe(false);
    expect(isCaptchaPage('google.com', '/recaptcha/')).toBe(false);
  });
  it('does not match lookalikes', () => {
    expect(isCaptchaPage('nothcaptcha.com', '/')).toBe(false);
    expect(isCaptchaPage('hcaptcha.com.evil.net', '/')).toBe(false);
    expect(isCaptchaPage('example.com', '/recaptcha/')).toBe(false);
  });
});

describe('protectionPlan: headers shield', () => {
  it('is off by default and follows its own switch only', () => {
    expect(protectionPlan(live()).headers).toBe(false);
    const on = protectionPlan(live({ headers: true }));
    expect(on).toMatchObject({ headers: true, acceptLanguage: true, altSvc: true, webrtc: true });
    expect(protectionPlan(live({ headers: true, locale: false }))).toMatchObject({
      headers: true,
      acceptLanguage: false,
    });
  });
  it('pauses with spoofing (proxy off or unreachable)', () => {
    expect(protectionPlan({ ...live({ headers: true }), enabled: false }).headers).toBe(false);
    expect(protectionPlan({ ...live({ headers: true }), killSwitchActive: true }).headers).toBe(
      false,
    );
  });
});

describe('rule building', () => {
  const find = (rules: DnrRule[], id: number) => rules.find((r) => r.id === id);

  it('core rules: Alt-Svc always, language and the reCAPTCHA allow rule with the language shield', () => {
    const rules = coreRules(
      { altSvc: true, acceptLanguage: true, headers: false },
      'en-US,en;q=0.9',
      ['x.com'],
    );
    expect(rules.map((r) => r.id).sort()).toEqual([1, 2, 4]);
    expect(find(rules, RULE.ACCEPT_LANGUAGE)?.condition).toMatchObject({
      excludedRequestDomains: ['x.com'],
      excludedInitiatorDomains: ['x.com'],
    });
    expect(find(rules, RULE.RECAPTCHA_ALLOW)?.condition.urlFilter).toBe(RECAPTCHA_URL_FILTER);
    expect(
      coreRules({ altSvc: true, acceptLanguage: false, headers: false }, 'x', []).map((r) => r.id),
    ).toEqual([1]);
    expect(coreRules({ altSvc: false, acceptLanguage: false, headers: false }, 'x', [])).toEqual(
      [],
    );
  });
  it('the allow rule beats the header rules but not Alt-Svc stripping', () => {
    const rules = coreRules({ altSvc: true, acceptLanguage: true, headers: false }, 'x', []);
    const alt = find(rules, RULE.ALT_SVC)!.priority;
    const allow = find(rules, RULE.RECAPTCHA_ALLOW)!.priority;
    const lang = find(rules, RULE.ACCEPT_LANGUAGE)!.priority;
    expect(alt).toBeGreaterThan(allow);
    expect(allow).toBeGreaterThan(lang);
    expect(headerRules(true, [])[0]!.priority).toBeLessThan(allow);
  });
  it('header rule sets DNT and Sec-GPC and removes If-None-Match', () => {
    const [rule] = headerRules(true, []);
    expect(rule!.id).toBe(RULE.HEADERS);
    expect(rule!.action.requestHeaders).toEqual([
      { header: 'dnt', operation: 'set', value: '1' },
      { header: 'sec-gpc', operation: 'set', value: '1' },
      { header: 'if-none-match', operation: 'remove' },
    ]);
    expect(rule!.condition).not.toHaveProperty('excludedRequestDomains'); // empty list: key omitted
    expect(headerRules(false, ['x.com'])).toEqual([]);
  });
  it('exclusions keep captcha and whitelist first, Iran domains last', () => {
    const lang = languageExclusions(['a.com', 'hcaptcha.com']);
    expect(lang.slice(0, CAPTCHA_DOMAINS.length)).toEqual([...CAPTCHA_DOMAINS]);
    expect(lang.filter((d) => d === 'hcaptcha.com')).toHaveLength(1);
    const header = headerExclusions(['a.com'], ['mine.org'], ['iran1.com', 'iran2.com']);
    expect(header.slice(-3)).toEqual(['mine.org', 'iran1.com', 'iran2.com']);
    expect(header.indexOf('a.com')).toBeLessThan(header.indexOf('mine.org'));
    expect(header).not.toContain('ir'); // no blanket .ir exclusion
  });
});

describe('installStage fallback (oversized exclusion list)', () => {
  const build = (excluded: string[]): DnrRule[] => [
    { id: 3, priority: 1, action: {}, condition: { excludedRequestDomains: excluded } },
  ];
  const domains = (n: number) => Array.from({ length: n }, (_, i) => `d${i}.com`);
  /** A fake Chrome that rejects any rule set with more than `limit` excluded domains. */
  const limited =
    (limit: number, seen: number[] = []) =>
    async (rules: DnrRule[]) => {
      const n = (rules[0]?.condition.excludedRequestDomains as string[] | undefined)?.length ?? 0;
      seen.push(n);
      if (n > limit) throw new Error('Rule too large');
    };

  it('installs everything when Chrome accepts it', async () => {
    const seen: number[] = [];
    const status = await installStage(limited(1000, seen), build, domains(500));
    expect(status).toEqual({ ok: true, requested: 500, installed: 500 });
    expect(seen).toEqual([500]);
  });
  it('halves the list until it fits and records how much was kept', async () => {
    const seen: number[] = [];
    const status = await installStage(limited(1000, seen), build, domains(60_000));
    expect(status.ok).toBe(true);
    expect(status.requested).toBe(60_000);
    expect(status.installed).toBeLessThanOrEqual(1000);
    expect(status.installed).toBeGreaterThan(0);
    expect(seen).toEqual([60000, 30000, 15000, 7500, 3750, 1875, 937]);
  });
  it('drops the tail first, so the important domains stay', async () => {
    let last: string[] = [];
    const update = async (rules: DnrRule[]) => {
      last = rules[0]!.condition.excludedRequestDomains as string[];
      if (last.length > 4) throw new Error('too large');
    };
    const list = [
      'captcha.com',
      'whitelisted.com',
      'x.com',
      'a.com',
      'b.com',
      'c.com',
      'd.com',
      'e.com',
    ];
    const status = await installStage(update, build, list);
    expect(status.installed).toBe(4);
    expect(last).toEqual(['captcha.com', 'whitelisted.com', 'x.com', 'a.com']);
  });
  it('falls back to an empty list and reports failure only if that is rejected too', async () => {
    const ok = await installStage(limited(0), build, domains(10));
    expect(ok).toMatchObject({ ok: true, requested: 10, installed: 0 });
    const failed = await installStage(
      async () => {
        throw new Error('Invalid rule');
      },
      build,
      domains(10),
    );
    expect(failed).toEqual({ ok: false, requested: 10, installed: 0, error: 'Invalid rule' });
  });
  it('does not loop on an empty list', async () => {
    let calls = 0;
    const status = await installStage(
      async () => {
        calls++;
        throw new Error('no');
      },
      build,
      [],
    );
    expect(status.ok).toBe(false);
    expect(calls).toBe(1);
  });
  it('core rule ids are the ones the plan manages', () => {
    expect(CORE_IDS).toEqual([1, 2, 4]);
  });
});

describe('rules problems in the popup summary', () => {
  const stage = (over = {}) => ({ ok: true, requested: 10, installed: 10, ...over });
  const status = (core = stage(), headers: RulesStatus['headers'] = null): RulesStatus => ({
    core,
    headers,
    updatedAt: 0,
  });

  it('no problem when everything is installed or unknown', () => {
    expect(rulesProblem(undefined)).toBeNull();
    expect(rulesProblem(status(stage(), stage()))).toBeNull();
    expect(summarize(live(), status()).level).toBe('ok');
  });
  it('a shortened list is a warning, a failed core install is bad', () => {
    expect(rulesProblem(status(stage({ installed: 5 })))?.level).toBe('warn');
    expect(rulesProblem(status(stage(), stage({ installed: 0 })))?.level).toBe('warn');
    expect(rulesProblem(status(stage({ ok: false, error: 'boom' })))).toMatchObject({
      level: 'bad',
      reason: expect.stringContaining('boom'),
    });
    expect(rulesProblem(status(stage(), stage({ ok: false, error: 'nope' })))?.reason).toContain(
      'nope',
    );
  });
  it('shows up in summarize with the right level', () => {
    expect(summarize(live(), status(stage({ installed: 5 })))).toMatchObject({
      level: 'warn',
      label: 'Rules',
    });
    expect(summarize(live(), status(stage({ ok: false, error: 'x' })))).toMatchObject({
      level: 'bad',
      label: 'Rules',
    });
    expect(summarize({ ...live(), enabled: false }, status(stage({ ok: false })))).toMatchObject({
      level: 'off',
    });
  });
});
