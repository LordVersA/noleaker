// Firefox has no DNR request guard: the kill switch, transition guard and strict local-host block
// are decided inside the shared route() by the proxy.onRequest listener (Phase 2).

/** No local-host DNR rules exist in the Firefox build. */
export const LOCAL_RULE_IDS: readonly number[] = [];

export async function setGuard(_blocked: boolean): Promise<void> {}

export async function setLocalGuard(_strict: boolean): Promise<void> {}
