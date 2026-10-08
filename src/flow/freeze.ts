/* eslint-disable @typescript-eslint/no-explicit-any */
import { UNSUPPORTED_ROUTE } from './urls';

/** How often the page is stopped, and for how long, once Flow has rendered without being patched. */
const STOPS = 30;
const STOP_EVERY_MS = 60;
const ROUTE_POLL_MS = 250;

/** Text that marks Flow's main screen as rendered. */
const CREATE_WORDS = ['new project', 'create'];

export interface FlowFreeze {
  /** Stop everything this module scheduled. */
  dispose(): void;
}

/**
 * Keeps Flow from replacing a working screen with the country error.
 *
 * If Flow drew its main screen but none of its answers were rewritten (so the unlock did not get
 * to act on this load), stop the page's remaining loading for a couple of seconds. The country
 * page itself is never stopped: leaving it is the background's job (it sends the tab back to
 * Flow's home page), and stopping here could cancel that navigation.
 */
export function installFlowFreeze(g: any, patched: () => boolean): FlowFreeze {
  const doc: Document = g.document;
  const timers: any[] = [];
  let froze = false;
  let observer: MutationObserver | null = null;
  let poll: any = null;

  const onCountryPage = (): boolean =>
    g.location.pathname.toLowerCase().includes(UNSUPPORTED_ROUTE);

  const cancel = (): void => {
    timers.forEach((t) => g.clearTimeout(t));
    timers.length = 0;
    froze = true;
  };

  const freeze = (): void => {
    if (froze) return;
    froze = true;
    for (let i = 0; i < STOPS; i++) timers.push(g.setTimeout(() => g.stop(), i * STOP_EVERY_MS));
  };

  const renderedMainScreen = (): boolean =>
    Array.from(doc.querySelectorAll('button, [role="button"]')).some((el) => {
      const label = `${el.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''}`.toLowerCase();
      return CREATE_WORDS.some((w) => label.includes(w));
    });

  const dispose = (): void => {
    observer?.disconnect();
    if (poll !== null) g.clearInterval(poll);
    cancel();
  };

  if (onCountryPage()) {
    cancel(); // nothing to freeze; the background bounces the tab
    return { dispose };
  }

  const watch = (): void => {
    observer = new g.MutationObserver(() => {
      if (froze || patched() || !renderedMainScreen()) return;
      observer?.disconnect();
      freeze();
    });
    observer!.observe(doc.documentElement, { childList: true, subtree: true });
  };
  if (doc.documentElement) watch();
  else doc.addEventListener('DOMContentLoaded', watch, { once: true });

  // A client-side move to the country page: let go of any freeze so the bounce can happen.
  poll = g.setInterval(() => {
    if (!patched() && onCountryPage()) cancel();
  }, ROUTE_POLL_MS);

  return { dispose };
}
