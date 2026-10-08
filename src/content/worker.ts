// Prelude that runs inside a dedicated worker, ahead of the page's own worker script.
// The page-side wrapper (workers.ts) puts the init data on `self.__noleaker__`; it is read
// and removed immediately so the worker's own code never sees it.
import { initWorker, type WorkerInit } from './worker-main';

const scope = self as unknown as { __noleaker__?: WorkerInit };
const init = scope.__noleaker__;
delete scope.__noleaker__;
if (init) initWorker(self, init);
