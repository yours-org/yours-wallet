/**
 * USB unlock keeper. An invisible extension page (chrome.offscreen) that the
 * background opens whenever USB unlock is on.
 *
 * Why it exists: Chrome keeps a File System Access grant only while some page
 * of the extension is open. The action popup closes on any focus change, so
 * without this page the grant obtained in the standalone window would vanish
 * the moment that window closed, and the popup could never read the drive.
 *
 * It also watches the drive. Reads need no user gesture, so it probes on a
 * timer and reports presence to the background, which locks the wallet after
 * two consecutive misses. It holds no secrets: the probe result it reports is
 * a boolean.
 */
import { probeSticks } from './services/UsbKey.service';
import type { UsbSecurity } from './services/types/chromeStorage.types';

const PROBE_MS = 3000;

let last: 'present' | 'absent' | 'permission' | 'off' | undefined;

/**
 * Offscreen documents get chrome.runtime messaging and nothing else from the
 * extension APIs (no chrome.storage), so the settings come from the background.
 * They contain wrappers and a verifier, never a secret.
 */
const fetchUsbSecurity = async (): Promise<UsbSecurity | undefined> => {
  try {
    const res = (await chrome.runtime.sendMessage({ action: 'USB_GET_CONFIG' })) as
      | { success?: boolean; data?: UsbSecurity }
      | undefined;
    return res?.success ? res.data : undefined;
  } catch {
    return undefined;
  }
};

const probe = async () => {
  const usb = await fetchUsbSecurity();
  let state: typeof last;
  if (!usb?.enabled) {
    state = 'off';
  } else {
    try {
      const result = await probeSticks(usb);
      state = result.status === 'ok' ? 'present' : result.status === 'permission' ? 'permission' : 'absent';
    } catch {
      state = 'absent';
    }
  }
  if (state !== last) {
    last = state;
    chrome.runtime.sendMessage({ action: 'USB_PRESENCE', state }).catch(() => {});
  }
};

void probe();
setInterval(() => void probe(), PROBE_MS);

chrome.runtime.onMessage.addListener((message: { action?: string }, _sender, sendResponse) => {
  if (message?.action === 'USB_KEEPER_PING') {
    sendResponse({ type: 'USB_KEEPER_PING', success: true, state: last });
    return true;
  }
  return false;
});
