import { isCWIEventName } from '@1sat/wallet-browser';
import { cwiFailure } from './cwi-errors';

interface RuntimeChannel {
  sendMessage(message: unknown, callback: (response: any) => void): void;
  lastError?: { message?: string };
}

/** The content script supplies originator; page-controlled payload fields never do. */
export function installCwiContentBridge(target: EventTarget, originator: () => string, runtime: RuntimeChannel) {
  const listener = (event: Event) => {
    const { type, messageId, params = {} } = (event as CustomEvent).detail ?? {};
    if (!isCWIEventName(type) || typeof messageId !== 'string') return;
    // Preserve raw values for validation in the service worker, including null
    // and arrays; converting them to records would hide malformed requests.
    try {
      runtime.sendMessage({ action: type, params, originator: originator() }, (response) => {
        const detail = runtime.lastError
          ? { success: false, error: runtime.lastError.message || 'Message channel closed' }
          : (response ?? { success: false, error: 'No response from service worker' });
        target.dispatchEvent(new CustomEvent(messageId, { detail }));
      });
    } catch (error) {
      // Invalidated extensions and non-serializable requests can throw before
      // Chrome registers a callback. Settle the public promise on that path too.
      target.dispatchEvent(new CustomEvent(messageId, { detail: { success: false, ...cwiFailure(error) } }));
    }
  };
  target.addEventListener('YoursRequest', listener);
  return () => target.removeEventListener('YoursRequest', listener);
}
