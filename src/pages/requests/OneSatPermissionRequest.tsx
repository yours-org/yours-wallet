import { useEffect } from 'react';
import { OneSatPermissionPrompt } from '@1sat/permission-module-ui';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useTheme } from '../../hooks/useTheme';
import { sendMessage } from '../../utils/chromeHelpers';
import yoursIcon from '../../assets/logos/icon.png';
import type { OneSatPromptStorageEntry } from '../../services/oneSatPrompt';

export type OneSatPermissionRequestProps = {
  request: OneSatPromptStorageEntry;
  popupId: number | undefined;
  onResponse: () => void;
};

/**
 * Render the 1Sat permission prompt fed in via chrome storage. Approve /
 * reject post `ONE_SAT_PERMISSION_RESPONSE` back to the background script,
 * which resolves the module's pending Promise.
 */
export const OneSatPermissionRequestPage = ({
  request,
  onResponse,
}: OneSatPermissionRequestProps) => {
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();

  useEffect(() => {
    handleSelect('bsv');
    hideMenu();
  }, [handleSelect, hideMenu]);

  const respond = (approved: boolean) => {
    sendMessage({
      action: 'ONE_SAT_PERMISSION_RESPONSE',
      requestID: request.requestID,
      approved,
    });
    onResponse();
    window.close();
  };

  // Pick a theme from the wallet's resolved theme. The component supports
  // 'auto' too, but the wallet already knows the user's preference.
  const isDark = theme.color.global.walletBackground.toLowerCase() === '#000000' || /^#[01]/.test(theme.color.global.walletBackground);
  const themeProp = isDark ? 'dark' : 'light';

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
      <OneSatPermissionPrompt
        request={request.request}
        onApprove={() => respond(true)}
        onReject={() => respond(false)}
        theme={themeProp}
        appName="Yours Wallet"
        appIcon={yoursIcon}
      />
    </div>
  );
};
