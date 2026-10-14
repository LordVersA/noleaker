/** proxy.onRequest has no settings that another extension can take over; Phase 2 checks the listener. */
export async function verifyProxyControl(): Promise<void> {}

export interface ProxyControl {
  levelOfControl: string;
  mode: string;
  pac: string | undefined;
  mandatory: boolean;
}

/** Leak-test report of the proxy setup. Firefox routing (proxy.onRequest) arrives in Phase 2. */
export async function readProxyControl(): Promise<ProxyControl> {
  return { levelOfControl: 'not_implemented', mode: 'none', pac: undefined, mandatory: false };
}
