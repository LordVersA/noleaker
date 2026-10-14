import { iconView } from '../../shared/badge';
import { activeProfile } from '../../shared/profiles';
import { getState } from '../../shared/storage';
import { setStatusIcon } from '../../background/icons';
import { forgetAppliedRules } from '../../background/protection';

export async function forgetAppliedPac(): Promise<void> {
  await forgetAppliedRules();
}

/**
 * Skeleton: proxy.onRequest routing lands in Phase 2. Until then enabling the proxy fails loudly
 * (protection error) instead of pretending traffic is proxied.
 */
export async function syncProxy(): Promise<void> {
  const state = await getState();
  if (state.enabled && activeProfile(state))
    throw new Error('Proxy routing is not implemented in the Firefox build yet.');
  await setStatusIcon(iconView(state));
}
