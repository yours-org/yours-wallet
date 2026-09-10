import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useServiceContext } from '../../hooks/useServiceContext';
import { derivePasswordKey } from '../../services/passKey';
import { deleteHandle, saveHandle } from '../../services/UsbKey.service';
import type { UsbSecurity } from '../../services/types/chromeStorage.types';
import { sendMessageAsync } from '../../utils/chromeHelpers';
import { combinePassKey, computeMasterCheck, newMaster, wrapMaster } from '../../utils/usbCrypto';
import { Note, Stepper } from './UsbLayout';
import { IdentityStep } from './presence';
import { ChooseDriveStep, DoneStep, LabelStep, PasswordStep, RecoveryCodeStep } from './steps';
import { prepareDrive, type PreparedDrive, type RekeyResponse } from './usbHelpers';

const STEPS = ['Confirm', 'Choose drive', 'Name', 'Recovery code', 'Password', 'Done'];

export const RotateFlow = ({ usbSecurity }: { usbSecurity: UsbSecurity }) => {
  const { chromeStorageService, setIsLocked } = useServiceContext();
  const [step, setStep] = useState(0);
  const [oldMaster, setOldMaster] = useState<string | null>(null);
  const [drive, setDrive] = useState<PreparedDrive | null>(null);
  const [label, setLabel] = useState('USB key 1');
  const [master] = useState(() => newMaster());

  const onPicked = async (handle: FileSystemDirectoryHandle) => {
    const prepared = await prepareDrive(handle, usbSecurity);
    setDrive(prepared);
    if (prepared.registered) setLabel(prepared.registered.label);
    setStep(2);
  };

  const confirmPassword = async (password: string): Promise<string | null> => {
    if (!drive || !oldMaster) return 'Missing USB key material';
    if (!(await chromeStorageService.verifyPassword(password, { master: oldMaster }))) return 'Incorrect password';
    const { salt } = chromeStorageService.getCurrentAccountObject();
    if (!salt) return 'Wallet salt is missing';
    const newPassKey = await combinePassKey(derivePasswordKey(password, salt), master);
    const wrappedMaster = await wrapMaster(master, drive.secret, drive.id);
    const masterCheck = await computeMasterCheck(master);
    const next: UsbSecurity = {
      ...usbSecurity,
      masterCheck,
      sticks: [{ id: drive.id, label, wrappedMaster, addedAt: new Date().toISOString() }],
    };
    let res: RekeyResponse | undefined;
    try {
      res = await sendMessageAsync<RekeyResponse>({ action: 'USB_REKEY', newPassKey, usbSecurity: next });
    } catch (e) {
      res = { success: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res?.success) return res?.error ?? 'Rotation failed';
    for (const s of usbSecurity.sticks) {
      if (s.id !== drive.id) await deleteHandle(s.id);
    }
    await saveHandle(drive.id, drive.handle);
    await chromeStorageService.getAndSetStorage();
    setIsLocked(false);
    setStep(5);
    return null;
  };

  const driveNote = drive?.registered
    ? `Registered as "${drive.registered.label}". It stays registered.`
    : drive?.existed
      ? 'This drive already has a Yours key file. It will be reused.'
      : undefined;

  return (
    <>
      <Stepper steps={STEPS} current={step} />
      {step === 0 && (
        <Note tone="warn">
          New secret, new recovery code. Other keys stop working until you add them again. Copies of your wallet data
          taken before now still open with an old key and your password.
        </Note>
      )}
      <AnimatePresence mode="wait">
        {step === 0 && (
          <IdentityStep
            key="s0"
            usbSecurity={usbSecurity}
            onIdentified={({ master: m }) => {
              setOldMaster(m);
              setStep(1);
            }}
          />
        )}
        {step === 1 && (
          <ChooseDriveStep
            key="s1"
            title="Choose the drive to keep"
            subtitle="Your only key until you add the others again."
            onPicked={onPicked}
          />
        )}
        {step === 2 && (
          <LabelStep
            key="s2"
            defaultLabel={label}
            note={driveNote}
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
            buttonLabel="Rotate USB key"
            onConfirm={confirmPassword}
          />
        )}
        {step === 5 && (
          <DoneStep key="s5" title="Rotation complete" message="Add your other USB keys again from Settings." />
        )}
      </AnimatePresence>
    </>
  );
};
