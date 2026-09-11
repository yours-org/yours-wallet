import { useState } from 'react';
import { Usb } from 'lucide-react';
import { Button } from '../../components/Button';
import { useServiceContext } from '../../hooks/useServiceContext';
import { useTheme } from '../../hooks/useTheme';
import type { UsbCheckRequest } from '../../promptProtocol';
import { confirmUsbForApproval } from '../../services/usbPresence';
import { sendMessage } from '../../utils/chromeHelpers';

export type UsbCheckRequestProps = {
  request: UsbCheckRequest;
  onResponse: () => void;
};

/**
 * A site with a standing permission asked the wallet to sign or spend, and
 * no wallet window has seen the USB key recently. One click: Chrome grants
 * drive access on the gesture, the key is read, and the call goes ahead.
 */
export const UsbCheckRequestPage = ({ request, onResponse }: UsbCheckRequestProps) => {
  const { theme } = useTheme();
  const { chromeStorageService } = useServiceContext();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const respond = async (ok: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    if (ok) {
      const usb = await confirmUsbForApproval(chromeStorageService);
      if (!usb.ok) {
        setError(usb.message);
        setBusy(false);
        return;
      }
    }
    sendMessage({ action: 'USB_CHECK_RESPONSE', requestID: request.requestID, ok });
    onResponse();
  };

  const gray = theme.color.global.gray;
  const contrast = theme.color.global.contrast;

  return (
    <div className="flex flex-col items-center justify-center w-full h-full px-6 text-center gap-3">
      <Usb size={40} style={{ color: contrast }} />
      <h2 className="m-0 text-lg font-semibold" style={{ color: contrast }}>
        Confirm your USB key
      </h2>
      <p className="m-0 text-xs leading-relaxed" style={{ color: gray, maxWidth: '18rem' }}>
        {request.originator
          ? `${request.originator} is asking Yours to ${request.reason}.`
          : `A site is asking Yours to ${request.reason}.`}{' '}
        Insert your USB key, then confirm.
      </p>
      {error && (
        <p className="m-0 text-xs" style={{ color: '#ef4444' }}>
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 w-full mt-2" style={{ maxWidth: '18rem' }}>
        <Button
          theme={theme}
          type="primary"
          label="Confirm USB key"
          disabled={busy}
          onClick={() => void respond(true)}
        />
        <Button
          theme={theme}
          type="secondary-outline"
          label="Cancel"
          disabled={busy}
          onClick={() => void respond(false)}
        />
      </div>
    </div>
  );
};
