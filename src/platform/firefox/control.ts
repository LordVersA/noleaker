import { sendMessage, type ProxyControl } from '../../shared/messages';
import { firefoxProxy, onRequest } from './routing';

/** Throws unless noleaker's proxy.onRequest listener is registered. */
export async function verifyProxyControl(): Promise<void> {
  if (!firefoxProxy().onRequest.hasListener(onRequest))
    throw new Error('Effective proxy control was lost before guard release.');
}

/**
 * Leak-test report of the proxy setup: Firefox routes through proxy.onRequest, not a PAC.
 * The listener lives in the background page, so other extension pages ask it there.
 */
export async function readProxyControl(): Promise<ProxyControl> {
  const on =
    firefoxProxy().onRequest.hasListener(onRequest) ||
    (await sendMessage({ type: 'proxyControl' }).then(
      (r) => r.mandatory === true,
      () => false,
    ));
  return {
    levelOfControl: on ? 'controlled_by_this_extension' : 'not_controllable',
    mode: 'on_request',
    pac: undefined,
    mandatory: on,
  };
}
