import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useServiceContext } from '../../hooks/useServiceContext';
import { saveHandle } from '../../services/UsbKey.service';
import type { UsbSecurity, UsbStickEntry } from '../../services/types/chromeStorage.types';
import { wrapMaster } from '../../utils/usbCrypto';
import { Stepper } from './UsbLayout';
import { PresenceStep } from './presence';
import { ChooseDriveStep, DoneStep, LabelStep } from './steps';
import { nextKeyLabel, prepareDrive, type PreparedDrive } from './usbHelpers';

const STEPS = ['Confirm key', 'Choose drive', 'Name', 'Done'];

export const AddFlow = ({ usbSecurity }: { usbSecurity: UsbSecurity }) => {
  const { chromeStorageService } = useServiceContext();
  const [step, setStep] = useState(0);
  const [master, setMaster] = useState<string | null>(null);
  const [drive, setDrive] = useState<PreparedDrive | null>(null);

  const onPicked = async (handle: FileSystemDirectoryHandle) => {
    const prepared = await prepareDrive(handle, usbSecurity);
    if (prepared.registered) throw new Error('This USB key is already registered');
    setDrive(prepared);
    setStep(2);
  };

  const register = async (label: string) => {
    if (!drive || !master) throw new Error('Missing USB key material');
    const wrappedMaster = await wrapMaster(master, drive.secret, drive.id);
    const entry: UsbStickEntry = { id: drive.id, label, wrappedMaster, addedAt: new Date().toISOString() };
    const newUsb: UsbSecurity = { ...usbSecurity, sticks: [...usbSecurity.sticks, entry] };
    await chromeStorageService.replaceTopLevel({ usbSecurity: newUsb });
    await saveHandle(drive.id, drive.handle);
    await chromeStorageService.getAndSetStorage();
    setStep(3);
  };

  return (
    <>
      <Stepper steps={STEPS} current={step} />
      <AnimatePresence mode="wait">
        {step === 0 && (
          <PresenceStep
            key="s0"
            usbSecurity={usbSecurity}
            subtitle="Adding a key copies the master factor from a key you already registered."
            onPresent={(p) => {
              setMaster(p.master);
              setStep(1);
            }}
          />
        )}
        {step === 1 && (
          <ChooseDriveStep
            key="s1"
            title="Choose the new USB drive"
            subtitle="Insert the drive you want to add, then pick it."
            onPicked={onPicked}
          />
        )}
        {step === 2 && (
          <LabelStep
            key="s2"
            defaultLabel={nextKeyLabel(usbSecurity)}
            note={
              drive?.existed ? 'This drive already carries a Yours USB key file. It will be reused as is.' : undefined
            }
            buttonLabel="Add USB key"
            onNext={register}
          />
        )}
        {step === 3 && <DoneStep key="s3" title="USB key added" message="Added. Both keys now unlock this wallet." />}
      </AnimatePresence>
    </>
  );
};
