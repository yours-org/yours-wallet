import { useEffect } from 'react';
import { OneSatPermissionPrompt } from '@1sat/permission-module-ui';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useServiceContext } from '../../hooks/useServiceContext';
import { useTheme } from '../../hooks/useTheme';
import { sendMessage } from '../../utils/chromeHelpers';
import type { OneSatPromptStorageEntry } from '../../services/oneSatPrompt';

export type OneSatPermissionRequestProps = {
  request: OneSatPromptStorageEntry;
  onResponse: () => void;
};

/**
 * Render the 1Sat permission prompt fetched from the background's pending
 * map. Approve / reject post `ONE_SAT_PERMISSION_RESPONSE` back to the
 * background script, which resolves the module's pending Promise.
 */
export const OneSatPermissionRequestPage = ({ request, onResponse }: OneSatPermissionRequestProps) => {
  const { theme } = useTheme();
  const { handleSelect, hideMenu } = useBottomMenu();
  // Live verification runs here rather than in the background module: the
  // request reaches this page through chrome.storage, so it can only carry
  // data. The prompt does its own lookups with the wallet's own services.
  const { apiContext } = useServiceContext();
  const services = apiContext?.services;

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
  };

  // Pick a theme from the wallet's resolved theme. The component supports
  // 'auto' too, but the wallet already knows the user's preference.
  const isDark =
    theme.color.global.walletBackground.toLowerCase() === '#000000' ||
    /^#[01]/.test(theme.color.global.walletBackground);
  const themeProp = isDark ? 'dark' : 'light';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
      }}
    >
      <OneSatPermissionPrompt
        request={request.request}
        onApprove={() => respond(true)}
        onReject={() => respond(false)}
        theme={themeProp}
        services={services}
      />
    </div>
  );
};
