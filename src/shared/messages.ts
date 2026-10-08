import type { ExitRefresh } from './exit';
import type { StaleReport } from './stale';
import type { State } from './types';

/** Request type -> response type. Add new messages here. */
export interface MessageMap {
  staleReport: {
    request: StaleReport;
    response: { reloaded: boolean; reason: string };
  };
  refreshExit: { request: { type: 'refreshExit' }; response: ExitRefresh };
  approveIranList: {
    request: { type: 'approveIranList'; candidateId: string };
    response: { ok: boolean; error?: string };
  };
  ping: { request: { type: 'ping' }; response: 'pong' };
  getState: { request: { type: 'getState' }; response: State };
  updateIranList: {
    request: { type: 'updateIranList' };
    response: {
      ok: boolean;
      count?: number;
      error?: string;
      candidateId?: string;
      added?: string[];
      removed?: string[];
      warning?: string;
    };
  };
}

export type Message = MessageMap[keyof MessageMap]['request'];
export type ResponseFor<M extends Message> = MessageMap[M['type']]['response'];

export function sendMessage<M extends Message>(message: M): Promise<ResponseFor<M>> {
  return chrome.runtime.sendMessage(message);
}

export type Handlers = {
  [K in keyof MessageMap]: (
    message: MessageMap[K]['request'],
    sender: chrome.runtime.MessageSender,
  ) => MessageMap[K]['response'] | Promise<MessageMap[K]['response']>;
};

/** Register handlers in the service worker. */
export function listen(handlers: Handlers): void {
  chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    if (!Object.hasOwn(handlers, message?.type)) return false;
    const handler = handlers[message?.type] as
      ((m: Message, s: chrome.runtime.MessageSender) => unknown) | undefined;
    if (!handler) return false;
    // Always answer: a handler that throws must not leave the sender with an undefined response.
    void Promise.resolve()
      .then(() => handler(message, sender))
      .then(sendResponse, (e) =>
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      );
    return true; // keep the channel open for the async response
  });
}
