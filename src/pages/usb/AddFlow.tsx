import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useServiceContext } from '../../hooks/useServiceContext';
import { saveHandle } from '../../services/UsbKey.service';
import type { UsbSecurity, UsbStickEntry } from '../../services/types/chromeStorage.types';
import { wrapMaster } from '../../utils/usbCrypto';
import { Stepper } from './UsbLayout';
import { PresenceStep } from './presence';
import { ChooseDriveStep, DoneStep, LabelStep, PasswordStep } from './steps';
import { nextKeyLabel, prepareDrive, type PreparedDrive } from './usbHelpers';

const STEPS = ['Confirm key', 'Choose drive', 'Name', 'Password', 'Done'];

export const AddFlow = ({ usbSecurity }: { usbSecurity: UsbSecurity }) => {
  const { chromeStorageService } = useServiceContext();
  const [step, setStep] = useState(0);
  const [master, setMaster] = useState<string | null>(null);
  const [drive, setDrive] = useState<PreparedDrive | null>(null);
  const [label, setLabel] = useState('');

  const onPicked = async (handle: FileSystemDirectoryHandle) => {
    const prepared = await prepareDrive(handle, usbSecurity);
    if (prepared.registered) throw new Error('This USB key is already registered');
    setDrive(prepared);
    setStep(2);
  };

  // A new key is a permanent second factor: adding one takes the password,
  // like every other change to the registered set.
  const register = async (password: string): Promise<string | null> => {
    if (!drive || !master) return 'Missing USB key material';
    if (!(await chromeStorageService.verifyPassword(password, { master }))) return 'Incorrect password';
    const wrappedMaster = await wrapMaster(master, drive.secret, drive.id);
    const entry: UsbStickEntry = { id: drive.id, label, wrappedMaster, addedAt: new Date().toISOString() };
    await chromeStorageService.updateUsbSecurity((current) => {
      if (current.sticks.some((s) => s.id === entry.id)) throw new Error('This USB key is already registered');
      return { ...current, sticks: [...current.sticks, entry] };
    });
    await saveHandle(drive.id, drive.handle);
    await chromeStorageService.getAndSetStorage();
    setStep(4);
    return null;
  };

  return (
    <>
      <Stepper steps={STEPS} current={step} />
      <AnimatePresence mode="wait">
        {step === 0 && (
          <PresenceStep
            key="s0"
            usbSecurity={usbSecurity}
            subtitle="Insert a key you already registered."
            onPresent={(p) => {
              setMaster(p.master);
              setStep(1);
            }}
          />
        )}
        {step === 1 && (
          <ChooseDriveStep
            key="s1"
            title="Choose the new drive"
            subtitle="Insert the drive to add, then pick it."
            onPicked={onPicked}
          />
        )}
        {step === 2 && (
          <LabelStep
            key="s2"
            defaultLabel={nextKeyLabel(usbSecurity)}
            note={drive?.existed ? 'This drive already has a Yours key file. It will be reused.' : undefined}
            onNext={(l) => {
              setLabel(l);
              setStep(3);
            }}
          />
        )}
        {step === 3 && (
          <PasswordStep
            key="s3"
            subtitle={`Enter your password to add "${label}".`}
            buttonLabel="Add USB key"
            onConfirm={register}
          />
        )}
        {step === 4 && <DoneStep key="s4" title="USB key added" message="Both keys unlock this wallet." />}
      </AnimatePresence>
    </>
  );
};
