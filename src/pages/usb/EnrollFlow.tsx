import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Button } from '../../components/Button';
import { useServiceContext } from '../../hooks/useServiceContext';
import { useTheme } from '../../hooks/useTheme';
import { derivePasswordKey } from '../../services/passKey';
import { deleteHandle, saveHandle } from '../../services/UsbKey.service';
import type { UsbSecurity } from '../../services/types/chromeStorage.types';
import { sendMessageAsync } from '../../utils/chromeHelpers';
import { combinePassKey, computeMasterCheck, newMaster, wrapMaster } from '../../utils/usbCrypto';
import { Heading, Note, StepBody, StepList, Stepper, TextLink } from './UsbLayout';
import { ChooseDriveStep, DoneStep, LabelStep, PasswordStep, RecoveryCodeStep } from './steps';
import { prepareDrive, type PreparedDrive, type RekeyResponse } from './usbHelpers';

const STEPS = ['Overview', 'Choose drive', 'Name', 'Recovery code', 'Password', 'Done'];

const readBackupConfirmed = async (): Promise<boolean> => {
  try {
    const r = await chrome.storage.session.get('usbBackupConfirmedAt');
    return typeof r.usbBackupConfirmedAt === 'number';
  } catch {
    return false;
  }
};

const OverviewStep = ({ onContinue }: { onContinue: () => void }) => {
  const { theme } = useTheme();
  const [backedUp, setBackedUp] = useState<boolean | null>(null);
  const check = useCallback(async () => setBackedUp(await readBackupConfirmed()), []);
  useEffect(() => {
    void check();
  }, [check]);

  return (
    <StepBody stepKey="overview">
      <Heading
        title="Turn on USB unlock"
        subtitle="Two-factor unlock: your password plus a USB drive. Takes about a minute."
      />
      <StepList items={['Pick any USB drive', 'Save a recovery code', 'Confirm your password']} />
      {backedUp === false && (
        <Note tone="warn">
          <p className="m-0 mb-1 font-semibold">Back up first</p>
          Settings → Wallet Backup → Master Backup, then press &ldquo;Check again&rdquo;.
        </Note>
      )}
      <Button theme={theme} type="primary" label="Continue" disabled={backedUp !== true} onClick={onContinue} />
      {backedUp !== true && <TextLink label="Check again" onClick={() => void check()} />}
    </StepBody>
  );
};

export const EnrollFlow = () => {
  const { chromeStorageService, setIsLocked } = useServiceContext();
  const [step, setStep] = useState(0);
  const [drive, setDrive] = useState<PreparedDrive | null>(null);
  const [label, setLabel] = useState('USB key 1');
  const [master] = useState(() => newMaster());

  const onPicked = async (handle: FileSystemDirectoryHandle) => {
    setDrive(await prepareDrive(handle));
    setStep(2);
  };

  const confirmPassword = async (password: string): Promise<string | null> => {
    if (!drive) return 'No USB drive chosen';
    // USB is still off, so no material is needed here.
    if (!(await chromeStorageService.verifyPassword(password))) return 'Incorrect password';
    const { salt } = chromeStorageService.getCurrentAccountObject();
    if (!salt) return 'Wallet salt is missing';
    const pbkdf = derivePasswordKey(password, salt);
    const newPassKey = await combinePassKey(pbkdf, master);
    const wrappedMaster = await wrapMaster(master, drive.secret, drive.id);
    const masterCheck = await computeMasterCheck(master);
    const usbSecurity: UsbSecurity = {
      enabled: true,
      version: 1,
      kdfVersion: 1,
      masterCheck,
      sticks: [{ id: drive.id, label, wrappedMaster, addedAt: new Date().toISOString() }],
    };
    await saveHandle(drive.id, drive.handle);
    let res: RekeyResponse | undefined;
    try {
      res = await sendMessageAsync<RekeyResponse>({ action: 'USB_REKEY', newPassKey, usbSecurity });
    } catch (e) {
      res = { success: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res?.success) {
      await deleteHandle(drive.id);
      return res?.error ?? 'Could not turn on USB unlock';
    }
    await chromeStorageService.getAndSetStorage();
    setIsLocked(false);
    setStep(5);
    return null;
  };

  return (
    <>
      <Stepper steps={STEPS} current={step} />
      <AnimatePresence mode="wait">
        {step === 0 && <OverviewStep key="s0" onContinue={() => setStep(1)} />}
        {step === 1 && <ChooseDriveStep key="s1" onPicked={onPicked} />}
        {step === 2 && (
          <LabelStep
            key="s2"
            defaultLabel={label}
            note={drive?.existed ? 'This drive already has a Yours key file. It will be reused.' : undefined}
            onNext={(l) => {
              setLabel(l);
              setStep(3);
            }}
          />
        )}
        {step === 3 && <RecoveryCodeStep key="s3" master={master} onConfirmed={() => setStep(4)} />}
        {step === 4 && (
          <PasswordStep
            key="s4"
            subtitle="Enter your password to finish."
            buttonLabel="Turn on USB unlock"
            onConfirm={confirmPassword}
          />
        )}
        {step === 5 && (
          <DoneStep key="s5" title="USB unlock is on" message="Unlocking needs this USB key and your password." />
        )}
      </AnimatePresence>
    </>
  );
};
