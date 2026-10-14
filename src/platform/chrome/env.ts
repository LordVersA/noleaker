import type { State } from '../../shared/types';

/** Chrome has no resistFingerprinting and its incognito model is unchanged: the state is used as is. */
export async function effectiveState(state: State): Promise<State> {
  return state;
}
