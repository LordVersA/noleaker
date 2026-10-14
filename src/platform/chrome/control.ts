export interface ProxyControl {
  levelOfControl: string;
  mode: string;
  pac: string | undefined;
  mandatory: boolean;
}

/** Effective Chrome proxy setting, as checked before guard release and shown by the leak test. */
export async function readProxyControl(): Promise<ProxyControl> {
  const { value, levelOfControl } = await chrome.proxy.settings.get({ incognito: false });
  return {
    levelOfControl,
    mode: value.mode,
    pac: value.pacScript?.data,
    mandatory: value.pacScript?.mandatory === true,
  };
}

/** Throws unless Chrome's effective proxy setting is still noleaker's mandatory PAC. */
export async function verifyProxyControl(): Promise<void> {
  const proxy = await readProxyControl();
  if (
    proxy.levelOfControl !== 'controlled_by_this_extension' ||
    proxy.mode !== 'pac_script' ||
    !proxy.mandatory
  )
    throw new Error('Effective proxy control was lost before guard release.');
}
