import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useServiceContext } from '../../hooks/useServiceContext';
import { derivePasswordKey } from '../../services/passKey';
import { clearHandles, deleteStickFile, getHandle, listPresentSticks } from '../../services/UsbKey.service';
import { wipeUsbBackup } from '../../services/usbBackup';
import type { UsbSecurity } from '../../services/types/chromeStorage.types';
import { sendMessageAsync } from '../../utils/chromeHelpers';
import { Stepper } from './UsbLayout';
import { IdentityStep, type Identified } from './presence';
import { Checkbox, DoneStep, PasswordStep } from './steps';
import type { RekeyResponse } from './usbHelpers';

const STEPS = ['Confirm', 'Password', 'Done'];

export const DisableFlow = ({ usbSecurity }: { usbSecurity: UsbSecurity }) => {
  const { chromeStorageService, setIsLocked } = useServiceContext();
  const [step, setStep] = useState(0);
  const [identity, setIdentity] = useState<Identified | null>(null);
  const [erase, setErase] = useState(false);
  const [wipedCount, setWipedCount] = useState(0);

  const confirmPassword = async (password: string): Promise<string | null> => {
    if (!identity) return 'Missing USB key material';
    if (!(await chromeStorageService.verifyPassword(password, { master: identity.master }))) {
      return 'Incorrect password';
    }
    const { salt } = chromeStorageService.getCurrentAccountObject();
    if (!salt) return 'Wallet salt is missing';
    const passwordKey = derivePasswordKey(password, salt);
    // Which keys can be reached now, before the handles go: their backup
    // folders are erased below. Keys not inserted keep theirs.
    const { present } = await listPresentSticks(usbSecurity);
    let res: RekeyResponse | undefined;
    try {
      res = await sendMessageAsync<RekeyResponse>({
        action: 'USB_REKEY',
        passwordKey,
        master: identity.master,
        usbSecurity: null,
      });
    } catch (e) {
      res = { success: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!res?.success) return res?.error ?? 'Could not turn off the USB security key';
    let wiped = 0;
    for (const stickId of present) {
      const handle = await getHandle(stickId);
      if (handle && (await wipeUsbBackup(handle)) === 'removed') wiped++;
    }
    if (
      identity.handle &&
      !present.includes(identity.stickId ?? '') &&
      (await wipeUsbBackup(identity.handle)) === 'removed'
    ) {
      wiped++;
    }
    setWipedCount(wiped);
    if (erase && identity.handle) await deleteStickFile(identity.handle);
    await clearHandles();
    await chromeStorageService.getAndSetStorage();
    if (!res.relocked) setIsLocked(false);
    setStep(2);
    return null;
  };

  return (
    <>
      <Stepper steps={STEPS} current={step} />
      <AnimatePresence mode="wait">
        {step === 0 && (
          <IdentityStep
            key="s0"
            usbSecurity={usbSecurity}
            title="Turn off USB security key"
            subtitle="Insert a registered USB key or enter your recovery code."
            onIdentified={(id) => {
              setIdentity(id);
              setStep(1);
            }}
          />
        )}
        {step === 1 && (
          <PasswordStep
            key="s1"
            subtitle="Enter your password to finish. The encrypted backup is erased from inserted keys."
            buttonLabel="Turn off security key"
            extra={
              identity?.handle ? (
                <Checkbox
                  checked={erase}
                  onChange={setErase}
                  label="Also erase the key file from this drive"
                  warning="Other computers using this key will need it registered again."
                />
              ) : undefined
            }
            onConfirm={confirmPassword}
          />
        )}
        {step === 2 && (
          <DoneStep
            key="s2"
            title="USB security key is off"
            message={
              wipedCount > 0
                ? `Your password alone unlocks the wallet. Backup erased from ${wipedCount} inserted key(s); any other key keeps its copy until you delete its .yours folder.`
                : 'Your password alone unlocks the wallet. Keys that were not inserted keep their backup copy until you delete their .yours folder.'
            }
          />
        )}
      </AnimatePresence>
    </>
  );
};
