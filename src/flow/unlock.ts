/* eslint-disable @typescript-eslint/no-explicit-any */
import { createNative } from '../content/native';
import { mentionsFrames, patchBatchResponse, patchParsed } from './batchexecute';

const BATCH_PATH = '/data/batchexecute';

export interface FlowUnlock {
  /** True once at least one Flow response has been rewritten. */
  patched(): boolean;
}

const isBatchUrl = (url: unknown): boolean => typeof url === 'string' && url.includes(BATCH_PATH);

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input && typeof (input as any).href === 'string') return (input as any).href;
  return String((input as any)?.url ?? '');
}

/**
 * Wrap `fetch` and `XMLHttpRequest` so Flow's `batchexecute` answers say "allowed". Only calls to
 * that path are touched; everything else goes through unchanged. Runs in the page's MAIN world and
 * knows nothing about the other shields: a change on Google's side can only break this file.
 */
export function installFlowUnlock(g: any): FlowUnlock {
  const { patch, patchGetter } = createNative(g, { strict: true });
  let patched = false;

  const text = (body: string): string => {
    if (!mentionsFrames(body)) return body;
    const next = patchBatchResponse(body);
    if (next === null) return body;
    patched = true;
    return next;
  };

  if (typeof g.fetch === 'function') {
    patch(
      g,
      'fetch',
      (orig) =>
        async function (this: any, ...args: any[]) {
          const response: Response = await orig.apply(this, args);
          if (!isBatchUrl(urlOf(args[0]))) return response;
          try {
            const body = await response.clone().text();
            const next = text(body);
            if (next === body) return response;
            return new g.Response(next, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          } catch {
            return response; // never break the page's own request
          }
        },
    );
  }

  const xhr: any = g.XMLHttpRequest?.prototype;
  if (xhr) {
    // The request URL is kept off the XHR object itself, where a page could see it.
    const urls = new WeakMap<object, string>();
    patch(
      xhr,
      'open',
      (orig) =>
        function (this: any, ...args: any[]) {
          urls.set(this, urlOf(args[1]));
          return orig.apply(this, args);
        },
    );
    patchGetter(xhr, 'responseText', (orig, self) => {
      const body = orig();
      return typeof body === 'string' && isBatchUrl(urls.get(self)) ? text(body) : body;
    });
    patchGetter(xhr, 'response', (orig, self) => {
      const body = orig();
      if (!isBatchUrl(urls.get(self))) return body;
      if (typeof body === 'string') return text(body);
      // responseType "json": the page gets the parsed array.
      if (Array.isArray(body) && patchParsed(body).changed) patched = true;
      return body;
    });
  }

  return { patched: () => patched };
}
