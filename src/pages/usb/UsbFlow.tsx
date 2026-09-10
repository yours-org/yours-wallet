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
import { RotateFlow } from './RotateFlow';
import { UsbShell } from './UsbLayout';
import { BlockedStep } from './steps';

const MODES: UsbWindowMode[] = ['enroll', 'add', 'repick', 'rotate', 'disable'];

const readMode = (): UsbWindowMode | null => {
  const m = new URLSearchParams(window.location.search).get('mode');
  return MODES.includes(m as UsbWindowMode) ? (m as UsbWindowMode) : null;
};

const needsUnlock = (mode: UsbWindowMode): boolean => mode !== 'repick';
const needsEnabled = (mode: UsbWindowMode): boolean => mode !== 'enroll';

export const UsbFlow = () => {
  const { theme } = useTheme();
  const { chromeStorageService, isLocked, isReady, setIsLocked } = useServiceContext();
  const [mode] = useState<UsbWindowMode | null>(readMode);
  const [usbSecurity, setUsbSecurity] = useState<UsbSecurity | undefined | 'loading'>('loading');

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
    body = (
      <BlockedStep
        title="USB unlock isn't available here"
        message="USB key security needs a browser that supports the File System Access API, such as Chrome or Edge."
      />
    );
  } else if (needsEnabled(mode) && !usbSecurity?.enabled) {
    body = (
      <BlockedStep
        title="USB key security is off"
        message="Turn it on from Settings → Security before using this action."
      />
    );
  } else if (mode === 'enroll' && usbSecurity?.enabled) {
    body = (
      <BlockedStep
        title="USB key security is already on"
        message="Use Settings → Security to add another USB key, rotate, or turn it off."
      />
    );
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
