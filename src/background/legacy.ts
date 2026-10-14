import { log } from '../shared/log';
import { LEGACY_FLOW_RULE_ID } from './rules';

/** Script id that noleaker up to v0.1.1 registered for the Google Flow unlock. */
export const LEGACY_FLOW_SCRIPT_ID = 'noleaker-flow';

/**
 * The Google Flow unlock moved to its own extension (noleaker-flow). Remove what older versions
 * left behind: the persisted page-script registration and the country-page block rule.
 */
export async function removeLegacyFlow(): Promise<void> {
  try {
    const left = await chrome.scripting.getRegisteredContentScripts({
      ids: [LEGACY_FLOW_SCRIPT_ID],
    });
    if (left.length > 0)
      await chrome.scripting.unregisterContentScripts({ ids: [LEGACY_FLOW_SCRIPT_ID] });
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [LEGACY_FLOW_RULE_ID],
    });
    await chrome.storage.session.remove('flowBounces');
  } catch (e) {
    log('warn', 'Could not remove the old Google Flow unlock', e);
  }
}
