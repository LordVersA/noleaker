import { describe, expect, it } from 'vitest';
import { BADGE_COLORS, iconView } from '../src/shared/badge';
import { DEFAULT_STATE } from '../src/shared/storage';
import type { State } from '../src/shared/types';

const profile = { id: 'a', name: 'a', host: 'h.com', port: 1 };
const on = (over: Partial<State> = {}): State => ({
  ...DEFAULT_STATE,
  enabled: true,
  profiles: [profile],
  activeProfileId: 'a',
  detectedExit: { ip: '1.2.3.4', countryCode: 'de', timezone: 'Europe/Berlin', detectedAt: 0 },
  controlsVerifiedAt: Date.now(),
  ...over,
});

describe('toolbar icon badge', () => {
  it('has no badge while the proxy is off', () => {
    expect(iconView(DEFAULT_STATE)).toMatchObject({ status: 'off', badge: '' });
  });
  it('shows the exit country code in green while connected', () => {
    const v = iconView(on());
    expect(v).toMatchObject({ status: 'on', badge: 'DE', badgeColor: BADGE_COLORS.ok });
    expect(v.title).toContain('Germany (DE)');
    expect(v.title).toContain('1.2.3.4');
  });
  it('does not show a green exit badge when control verification is stale', () => {
    expect(iconView(on({ controlsVerifiedAt: Date.now() - 150001 }))).toMatchObject({
      badgeColor: BADGE_COLORS.wait,
      badge: '…',
    });
    expect(iconView(on({ controlsVerifiedAt: null })).title).toContain(
      'not been recently verified',
    );
  });
  it('discloses compatibility exceptions during failure', () => {
    expect(iconView(on({ killSwitchActive: true, routingMode: 'compatibility' })).title).toContain(
      'direct exceptions remain',
    );
  });
  it('shows a waiting badge until the exit is known', () => {
    expect(iconView(on({ detectedExit: null }))).toMatchObject({
      status: 'on',
      badge: '…',
      badgeColor: BADGE_COLORS.wait,
    });
  });
  it('shows "!" in red when the kill switch is active, with no country', () => {
    expect(iconView(on({ killSwitchActive: true }))).toMatchObject({
      status: 'error',
      badge: '!',
      badgeColor: BADGE_COLORS.bad,
    });
  });
  it('shows "!" when it is enabled but there is no proxy', () => {
    expect(iconView({ ...DEFAULT_STATE, enabled: true })).toMatchObject({
      status: 'error',
      badge: '!',
    });
  });
  it('keeps the connected country on the badge and mentions a manual identity country', () => {
    const v = iconView(on({ countryOverride: 'JP' }));
    expect(v.badge).toBe('DE');
    expect(v.title).toContain('identity set to Japan');
  });
  it('copes with a country that is not in the table', () => {
    const v = iconView(
      on({ detectedExit: { ip: '9.9.9.9', countryCode: 'ZZ', timezone: '', detectedAt: 0 } }),
    );
    expect(v.badge).toBe('ZZ');
    expect(v.title).toContain('ZZ');
  });
});
