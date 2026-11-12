import { createCWI, type CWIEventName } from '@1sat/wallet-browser';
import { reviveCwiError } from './cwi-errors';

/** Keep the shared wallet method mapping while preserving structured failures
 * across the page/content-script/service-worker JSON boundary. */
export function createStructuredEventCWI(target: EventTarget = self) {
  return createCWI(
    <TResult>(action: CWIEventName, params: unknown): Promise<TResult> =>
      new Promise((resolve, reject) => {
        const messageId = `${action}-${crypto.randomUUID()}`;
        const onResponse = (event: Event) => {
          const detail = (event as CustomEvent).detail;
          if (detail?.success === true) resolve(detail.data as TResult);
          else reject(reviveCwiError(detail?.walletError, detail?.error ?? 'No response from service worker'));
        };
        target.addEventListener(messageId, onResponse, { once: true });
        try {
          target.dispatchEvent(new CustomEvent('YoursRequest', { detail: { messageId, type: action, params } }));
        } catch (error) {
          target.removeEventListener(messageId, onResponse);
          reject(reviveCwiError(undefined, error));
        }
      }),
  );
}
