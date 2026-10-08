import { describe, expect, it } from 'vitest';
import { parseIpwho, parseTrace } from '../src/shared/lookup';
import { effectiveExit } from '../src/shared/exit';
import { DEFAULT_STATE } from '../src/shared/storage';

describe('parseTrace', () => {
  it('reads ip and loc', () => {
    expect(parseTrace('fl=1\nip=1.2.3.4\nloc=DE\nts=1\n')).toEqual({
      ip: '1.2.3.4',
      countryCode: 'DE',
    });
  });
  it('rejects missing or non-country loc', () => {
    expect(parseTrace('ip=1.2.3.4\n')).toBeNull();
    expect(parseTrace('ip=1.2.3.4\nloc=XXX\n')).toBeNull();
  });
});

describe('parseIpwho', () => {
  it('reads ip, country and timezone', () => {
    expect(
      parseIpwho({
        success: true,
        ip: '1.1.1.1',
        country_code: 'FR',
        timezone: { id: 'Europe/Paris' },
      }),
    ).toEqual({ ip: '1.1.1.1', countryCode: 'FR', timezone: 'Europe/Paris' });
  });
  it('rejects failures', () => {
    expect(parseIpwho({ success: false })).toBeNull();
    expect(parseIpwho(null)).toBeNull();
  });
});

describe('effectiveExit', () => {
  const exit = { ip: '1.1.1.1', countryCode: 'FR', timezone: 'Europe/Paris', detectedAt: 0 };
  it('is null without detection or override', () => {
    expect(effectiveExit(DEFAULT_STATE)).toBeNull();
  });
  it('uses detection', () => {
    expect(effectiveExit({ ...DEFAULT_STATE, detectedExit: exit })?.timezone).toBe('Europe/Paris');
  });
  it('falls back to the country table when the lookup has no timezone', () => {
    const s = { ...DEFAULT_STATE, detectedExit: { ...exit, timezone: '' } };
    expect(effectiveExit(s)?.timezone).toBe('Europe/Paris');
  });
  it('override wins and uses the country default timezone', () => {
    const e = effectiveExit({ ...DEFAULT_STATE, detectedExit: exit, countryOverride: 'JP' });
    expect(e).toMatchObject({ countryCode: 'JP', timezone: 'Asia/Tokyo', overridden: true });
  });
});
