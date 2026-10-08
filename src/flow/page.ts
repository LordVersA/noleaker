// Entry of the Google Flow unlock, built to dist/content/flow.js and run in the page's MAIN world.
// The service worker registers it for Flow pages only while the "Google Flow unlock" switch is
// on, so with the switch off none of this code exists in the page.
import { installFlowFreeze } from './freeze';
import { installFlowUnlock } from './unlock';

const unlock = installFlowUnlock(globalThis);
installFlowFreeze(globalThis, unlock.patched);
