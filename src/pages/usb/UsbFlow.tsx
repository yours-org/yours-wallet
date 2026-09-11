/**
 * The dedicated USB window (usb.html). Opened by other pages through
 * `openUsbWindow(mode)`; the mode arrives as `?mode=` in the URL. It exists
 * because the OS folder picker steals focus and the action popup closes on
 * blur, which would abort the picker.
 */
import { useEffect, useState } from 'react';
import { PageLoader } from '../../components/PageLoader';
import { UnlockWallet } from '../../components/UnlockWallet';
import { useServiceContext } from '../../hooks/useServiceContext';
import { useTheme } from '../../hooks/useTheme';
import { isUsbSupported, type UsbWindowMode } from '../../services/UsbKey.service';
import type { UsbSecurity } from '../../services/types/chromeStorage.types';
import { AddFlow } from './AddFlow';
import { DisableFlow } from './DisableFlow';
import { EnrollFlow } from './EnrollFlow';
import { RepickFlow } from './RepickFlow';
import { RestoreFlow } from './RestoreFlow';
import { RotateFlow } from './RotateFlow';
import { UsbShell } from './UsbLayout';
import { BlockedStep, DoneStep } from './steps';

const MODES: UsbWindowMode[] = ['enroll', 'add', 'repick', 'rotate', 'disable', 'unlock', 'restore'];

const readMode = (): UsbWindowMode | null => {
  const m = new URLSearchParams(window.location.search).get('mode');
  return MODES.includes(m as UsbWindowMode) ? (m as UsbWindowMode) : null;
};

// 'restore' runs on a fresh install: no wallet, no session, feature off.
const needsUnlock = (mode: UsbWindowMode): boolean => mode !== 'repick' && mode !== 'unlock' && mode !== 'restore';
const needsEnabled = (mode: UsbWindowMode): boolean => mode !== 'enroll' && mode !== 'restore';

export const UsbFlow = () => {
  const { theme } = useTheme();
  const { chromeStorageService, isLocked, isReady, setIsLocked } = useServiceContext();
  const [mode] = useState<UsbWindowMode | null>(readMode);
  const [usbSecurity, setUsbSecurity] = useState<UsbSecurity | undefined | 'loading'>('loading');
  const [unlockedHere, setUnlockedHere] = useState(false);

  /**
   * The action popup can't hold a drive grant (Chrome drops it when the last
   * extension page closes, and the popup closes on any focus change), so with
   * USB unlock on the popup hands off to this window. After a successful
   * unlock, try to reopen the popup; Chrome only allows that in some
   * contexts, so the done screen also tells the user to click the icon.
   */
  const finishUnlock = () => {
    setIsLocked(false);
    setUnlockedHere(true);
    const action = (chrome as unknown as { action?: { openPopup?: () => Promise<void> } }).action;
    action
      ?.openPopup?.()
      .then(() => window.close())
      .catch(() => {});
  };

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;
    void (async () => {
      await chromeStorageService.getAndSetStorage();
      if (!cancelled) setUsbSecurity(chromeStorageService.getUsbSecurity());
    })();
    return () => {
      cancelled = true;
    };
  }, [isReady, chromeStorageService]);

  if (!isReady || usbSecurity === 'loading') {
    return (
      <UsbShell>
        <PageLoader message="Loading..." theme={theme} />
      </UsbShell>
    );
  }

  let body: React.ReactNode;
  if (!mode) {
    body = <BlockedStep title="Nothing to do" message="This window was opened without a USB key action." />;
  } else if (!isUsbSupported()) {
    body = <BlockedStep title="USB security key isn't available here" message="It needs Chrome or Edge." />;
  } else if (mode === 'restore') {
    body = <RestoreFlow />;
  } else if (needsEnabled(mode) && !usbSecurity?.enabled) {
    body = <BlockedStep title="USB security key is off" message="Turn it on from Settings → Security." />;
  } else if (mode === 'enroll' && usbSecurity?.enabled) {
    body = <BlockedStep title="USB security key is already on" message="Manage it from Settings → Security." />;
  } else if (mode === 'unlock') {
    if (unlockedHere || !isLocked) {
      body = <DoneStep title="Unlocked" message="Click the Yours icon to open your wallet." />;
    } else {
      return (
        <UsbShell>
          <div className="flex items-center justify-center w-full flex-1">
            <UnlockWallet onUnlock={finishUnlock} />
          </div>
        </UsbShell>
      );
    }
  } else if (needsUnlock(mode) && isLocked) {
    return (
      <UsbShell>
        <div className="flex items-center justify-center w-full flex-1">
          <UnlockWallet onUnlock={() => setIsLocked(false)} />
        </div>
      </UsbShell>
    );
  } else if (mode === 'enroll') {
    body = <EnrollFlow />;
  } else if (mode === 'add' && usbSecurity) {
    body = <AddFlow usbSecurity={usbSecurity} />;
  } else if (mode === 'repick' && usbSecurity) {
    body = <RepickFlow usbSecurity={usbSecurity} />;
  } else if (mode === 'rotate' && usbSecurity) {
    body = <RotateFlow usbSecurity={usbSecurity} />;
  } else if (mode === 'disable' && usbSecurity) {
    body = <DisableFlow usbSecurity={usbSecurity} />;
  }

  return (
    <UsbShell>
      <div className="w-full" style={{ maxWidth: '26rem' }}>
        {body}
      </div>
    </UsbShell>
  );
};
