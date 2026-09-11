import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useServiceContext } from '../../hooks/useServiceContext';
import { driveHasUsbBackup, readUsbBackup } from '../../services/usbBackup';
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
  const [drive, setDrive] = useState<FileSystemDirectoryHandle | null>(null);

  if (chromeStorageService.getAllAccounts().length > 0) {
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
    try {
      payload = await readUsbBackup(drive, password);
    } catch (e) {
      return errorText(e, 'Could not read the backup');
    }
    let res: RestoreResponse | undefined;
    try {
      res = await sendMessageAsync<RestoreResponse>({ action: 'MASTER_RESTORE', legacy: false, ...payload, password });
    } catch (e) {
      res = { success: false, error: errorText(e) };
    }
    if (!res?.success) return res?.error ?? 'Restore failed';
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
            busyLabel="Restoring… this can take a minute"
            onConfirm={confirmPassword}
          />
        )}
        {step === 2 && (
          <DoneStep
            key="s2"
            title="Wallet restored"
            message="Open the Yours icon to unlock your wallet. USB unlock is off until you turn it on again."
          />
        )}
      </AnimatePresence>
    </>
  );
};
