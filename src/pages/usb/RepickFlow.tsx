import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { HardDrive } from 'lucide-react';
import { Button } from '../../components/Button';
import { useTheme } from '../../hooks/useTheme';
import { adoptPickedDrive, pickDrive } from '../../services/UsbKey.service';
import type { UsbSecurity } from '../../services/types/chromeStorage.types';
import { ErrorText, Heading, Note, StepBody } from './UsbLayout';
import { DoneStep } from './steps';
import { errorText, isAbort, MUTED } from './usbHelpers';

/** "Find my USB key": works while locked, needs no session state. */
export const RepickFlow = ({ usbSecurity }: { usbSecurity: UsbSecurity }) => {
  const { theme } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);

  const find = async () => {
    setError(null);
    setBusy(true);
    try {
      let handle: FileSystemDirectoryHandle;
      try {
        handle = await pickDrive();
      } catch (e) {
        if (isAbort(e)) return;
        throw e;
      }
      const result = await adoptPickedDrive(handle, usbSecurity);
      if (result.status !== 'ok') {
        setError("That drive doesn't hold one of your registered USB keys.");
        return;
      }
      setFound(usbSecurity.sticks.find((s) => s.id === result.stickId)?.label ?? 'USB key');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {found ? (
        <DoneStep key="done" title={`Found ${found}`} message="Close this window and unlock." />
      ) : (
        <StepBody key="pick" stepKey="repick">
          <Heading
            title="Find my USB key"
            subtitle="Pick the drive that holds one of your registered USB keys so the wallet can read it again."
          />
          <Note>
            The dialog will say <strong>&ldquo;Yours Wallet wants to edit files&rdquo;</strong>. Pick the USB drive
            itself, at its top level.
          </Note>
          <div
            className="flex items-center justify-center w-full rounded-xl py-6 mb-3"
            style={{ backgroundColor: theme.color.global.row }}
          >
            <HardDrive size={40} style={{ color: MUTED }} />
          </div>
          <Button theme={theme} type="primary" label="Choose USB drive" onClick={() => void find()} loading={busy} />
          <ErrorText>{error}</ErrorText>
        </StepBody>
      )}
    </AnimatePresence>
  );
};
