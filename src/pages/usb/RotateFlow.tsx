import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useServiceContext } from '../../hooks/useServiceContext';
import { derivePasswordKey } from '../../services/passKey';
import { deleteHandle, getHandle, listPresentSticks, saveHandle } from '../../services/UsbKey.service';
import { wipeUsbBackup } from '../../services/usbBackup';
import { endUsbRecoverySession } from '../../services/usbPresence';
import type { UsbSecurity } from '../../services/types/chromeStorage.types';
import { sendMessageAsync } from '../../utils/chromeHelpers';
import { computeMasterCheck, newMaster, wrapMaster } from '../../utils/usbCrypto';
import { Note, Stepper } from './UsbLayout';
import { IdentityStep } from './presence';
import { ChooseDriveStep, DoneStep, LabelStep, PasswordStep, RecoveryCodeStep } from './steps';
import {
  commitFreshFile,
  prepareDrive,
  restorePreviousFile,
  type PreparedDrive,
  type RekeyResponse,
} from './usbHelpers';

const STEPS = ['Confirm', 'Choose drive', 'Name', 'Recovery code', 'Password', 'Done'];

export const RotateFlow = ({ usbSecurity }: { usbSecurity: UsbSecurity }) => {
  const { chromeStorageService, setIsLocked } = useServiceContext();
  // Opened by a recovery-code unlock: the user has no key to insert, so the
  // confirm step starts on code entry and says why it is asked for again.
  const [viaRecovery] = useState(() => new URLSearchParams(window.location.search).get('via') === 'recovery');
  const [step, setStep] = useState(0);
  const [oldMaster, setOldMaster] = useState<string | null>(null);
  const [drive, setDrive] = useState<PreparedDrive | null>(null);
  const [label, setLabel] = useState('USB key 1');
  const [master] = useState(() => newMaster());

  const onPicked = async (handle: FileSystemDirectoryHandle) => {
    // A new secret on the drive, always: reusing the old one would leave any
    // copy of the old key file able to open the rotated wallet.
    const prepared = await prepareDrive(handle, usbSecurity, { fresh: true });
    setDrive(prepared);
    if (prepared.registered) setLabel(prepared.registered.label);
    setStep(2);
  };

  const confirmPassword = async (password: string): Promise<string | null> => {
    if (!drive || !oldMaster) return 'Missing USB key material';
    if (!(await chromeStorageService.verifyPassword(password, { master: oldMaster }))) return 'Incorrect password';
    const { salt } = chromeStorageService.getCurrentAccountObject();
    if (!salt) return 'Wallet salt is missing';
    const passwordKey = derivePasswordKey(password, salt);
    const wrappedMaster = await wrapMaster(master, drive.secret, drive.id);
    const masterCheck = await computeMasterCheck(master);
    const next: UsbSecurity = {
      ...usbSecurity,
      masterCheck,
      sticks: [{ id: drive.id, label, wrappedMaster, addedAt: new Date().toISOString() }],
    };
    // Keys reachable now, before their handles go: their backups are under the
    // old key and get erased below. Keys not inserted keep theirs.
    const { present } = await listPresentSticks(usbSecurity);
    // Save the handle first: if the window closes between the commit and this
    // write, the new key would otherwise be registered with no way to read it.
    const wasRegistered = usbSecurity.sticks.some((s) => s.id === drive.id);
    await saveHandle(drive.id, drive.handle);
    // The drive's new secret goes on only now that the password is confirmed.
    if (drive.pendingWrite) await commitFreshFile(drive);
    let res: RekeyResponse | undefined;
    try {
      res = await sendMessageAsync<RekeyResponse>({
        action: 'USB_REKEY',
        passwordKey,
        master: oldMaster,
        newMaster: master,
        usbSecurity: next,
      });
    } catch (e) {
      res = { success: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res?.success) {
      if (!wasRegistered) await deleteHandle(drive.id);
      // Nothing was re-keyed: put the drive's previous secret back so it still opens this wallet.
      if (drive.pendingWrite) await restorePreviousFile(drive).catch(() => {});
      return res?.error ?? 'Rotation failed';
    }
    // Old backups are under the old master: erase what can be reached. The
    // kept drive gets a fresh one on the next sync.
    for (const stickId of present) {
      const handle = await getHandle(stickId);
      if (handle) await wipeUsbBackup(handle);
    }
    await wipeUsbBackup(drive.handle);
    for (const s of usbSecurity.sticks) {
      if (s.id !== drive.id) await deleteHandle(s.id);
    }
    await chromeStorageService.getAndSetStorage();
    // A recovery-code session ends here: there is a key to check again.
    await endUsbRecoverySession();
    if (!res.relocked) setIsLocked(false);
    setStep(5);
    return null;
  };

  const driveNote = drive?.existed
    ? 'This drive now holds a new secret. Any other wallet or Chrome profile that used it must add it again.'
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
            title={viaRecovery ? 'Set up a new USB key' : undefined}
            subtitle={
              viaRecovery
                ? 'You unlocked with your recovery code. Enter it once more to confirm, then pick a drive for your new key.'
                : undefined
            }
            startWithCode={viaRecovery}
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
