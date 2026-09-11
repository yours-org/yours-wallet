import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useServiceContext } from '../../hooks/useServiceContext';
import { driveHasUsbBackup, readUsbBackup } from '../../services/usbBackup';
import { saveHandle } from '../../services/UsbKey.service';
import { sendMessageAsync } from '../../utils/chromeHelpers';
import { Stepper } from './UsbLayout';
import { BlockedStep, ChooseDriveStep, DoneStep, PasswordStep } from './steps';
import { errorText } from './usbHelpers';

const STEPS = ['Choose drive', 'Password', 'Done'];

type RestoreResponse = { success: boolean; error?: string };

/**
 * Restore a wallet from the backup on a USB key. Fresh install only: no
 * session, no unlock, and the feature is off. Hands the existing
 * MASTER_RESTORE handler exactly what a file restore sends, so the wallet
 * lands with password-only keys and USB unlock off.
 */
export const RestoreFlow = () => {
  const { chromeStorageService } = useServiceContext();
  const [step, setStep] = useState(0);
  const [partial, setPartial] = useState<string[]>([]);
  const [drive, setDrive] = useState<FileSystemDirectoryHandle | null>(null);
  const [progress, setProgress] = useState('Reading the backup…');

  // The background streams its stages while it restores; show them instead of a static label.
  useEffect(() => {
    const listener = (message: { action?: string; data?: { message?: string } }) => {
      if (message?.action === 'MASTER_RESTORE_PROGRESS' && message.data?.message) setProgress(message.data.message);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Decided once when the flow opens. The restore itself writes accounts, and
  // the page's storage view refreshes while the flow is still on screen; a
  // check on every render would replace the done screen with this block.
  const [hadWallet] = useState(() => chromeStorageService.getAllAccounts().length > 0);
  if (hadWallet) {
    return (
      <BlockedStep
        title="This browser already has a wallet"
        message="Restore from USB works on a fresh install. Sign out first, or use Settings → Wallet Backup."
      />
    );
  }

  const onPicked = async (handle: FileSystemDirectoryHandle) => {
    if (!(await driveHasUsbBackup(handle))) throw new Error('No Yours backup found on this drive');
    setDrive(handle);
    setStep(1);
  };

  const confirmPassword = async (password: string): Promise<string | null> => {
    if (!drive) return 'No USB drive chosen';
    let payload;
    setProgress('Reading and decrypting the backup…');
    try {
      payload = await readUsbBackup(drive, password);
    } catch (e) {
      return errorText(e, 'Could not read the backup');
    }
    setProgress(`Restoring ${Object.keys(payload.chunksData).length} data chunks…`);
    let res: RestoreResponse | undefined;
    try {
      const { usb, partialAccounts: _p, ...data } = payload;
      res = await sendMessageAsync<RestoreResponse>({
        action: 'MASTER_RESTORE',
        legacy: false,
        ...data,
        password,
        usbRekey: { newPassKey: usb.combinedPassKey, usbSecurity: usb.usbSecurity },
      });
    } catch (e) {
      res = { success: false, error: errorText(e) };
    }
    if (!res?.success) return res?.error ?? 'Restore failed';
    // This drive is now a registered key on this computer too.
    await saveHandle(payload.usb.stickId, drive);
    setPartial(payload.partialAccounts);
    setStep(2);
    return null;
  };

  return (
    <>
      <Stepper steps={STEPS} current={step} />
      <AnimatePresence mode="wait">
        {step === 0 && (
          <ChooseDriveStep
            key="s0"
            title="Restore from USB key"
            subtitle="Pick the USB key that holds your backup."
            onPicked={onPicked}
          />
        )}
        {step === 1 && (
          <PasswordStep
            key="s1"
            subtitle="Enter the wallet password used with this key."
            buttonLabel="Restore wallet"
            busyLabel={progress}
            onConfirm={confirmPassword}
          />
        )}
        {step === 2 && (
          <DoneStep
            key="s2"
            title="Wallet restored"
            message={
              partial.length > 0
                ? `Keys restored and this USB security key is on. Open the Yours icon; history finishes importing in the background. ${partial.length} account(s) had no complete backup on this key (${partial.join(', ')}); their history will sync from remote storage if they use it.`
                : 'Keys restored and this USB security key is on. Open the Yours icon; history finishes importing in the background. Other registered keys need "Find my USB key" once on this computer.'
            }
          />
        )}
      </AnimatePresence>
    </>
  );
};
