import { firefoxProxy, onRequest } from './routing';

export interface ProxyControl {
  levelOfControl: string;
  mode: string;
  pac: string | undefined;
  mandatory: boolean;
}

/** Throws unless noleaker's proxy.onRequest listener is registered. */
export async function verifyProxyControl(): Promise<void> {
  if (!firefoxProxy().onRequest.hasListener(onRequest))
    throw new Error('Effective proxy control was lost before guard release.');
}

/** Leak-test report of the proxy setup: Firefox routes through proxy.onRequest, not a PAC. */
export async function readProxyControl(): Promise<ProxyControl> {
  const on = firefoxProxy().onRequest.hasListener(onRequest);
  return {
    levelOfControl: on ? 'controlled_by_this_extension' : 'not_controllable',
    mode: 'on_request',
    pac: undefined,
    mandatory: on,
  };
}
