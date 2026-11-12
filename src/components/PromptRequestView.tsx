import type {
  CounterpartyPermissionRequest,
  GroupedPermissionRequest,
  PermissionRequest,
} from '@bsv/wallet-toolbox-client';
import { CounterpartyPermissionRequestPage } from '../pages/requests/CounterpartyPermissionRequest';
import { GroupedPermissionRequestPage } from '../pages/requests/GroupedPermissionRequest';
import { OneSatPermissionRequestPage } from '../pages/requests/OneSatPermissionRequest';
import { PermissionRequestPage } from '../pages/requests/PermissionRequest';
import { UsbCheckRequestPage } from '../pages/requests/UsbCheckRequest';
import type { OneSatPromptStorageEntry } from '../services/oneSatPrompt';
import type { UsbCheckRequest } from '../promptProtocol';

export type PendingPromptScreen =
  | { kind: 'permission'; requestID: string; payload: PermissionRequest & { requestID: string } }
  | { kind: 'groupedPermission'; requestID: string; payload: GroupedPermissionRequest }
  | { kind: 'counterpartyPermission'; requestID: string; payload: CounterpartyPermissionRequest }
  | { kind: 'oneSatPermission'; requestID: string; payload: OneSatPromptStorageEntry }
  | { kind: 'usbCheck'; requestID: string; payload: UsbCheckRequest };

/** Each queued request owns its processing state and checkbox selection.
 * Loading screens may be batched away; request identity still forces a fresh
 * component when another request of the same kind replaces the current one. */
export const PromptRequestView = ({ screen, onResponse }: { screen: PendingPromptScreen; onResponse: () => void }) => {
  switch (screen.kind) {
    case 'permission':
      return <PermissionRequestPage key={screen.requestID} request={screen.payload} onResponse={onResponse} />;
    case 'groupedPermission':
      return <GroupedPermissionRequestPage key={screen.requestID} request={screen.payload} onResponse={onResponse} />;
    case 'counterpartyPermission':
      return (
        <CounterpartyPermissionRequestPage key={screen.requestID} request={screen.payload} onResponse={onResponse} />
      );
    case 'oneSatPermission':
      return <OneSatPermissionRequestPage key={screen.requestID} request={screen.payload} onResponse={onResponse} />;
    case 'usbCheck':
      return <UsbCheckRequestPage key={screen.requestID} request={screen.payload} onResponse={onResponse} />;
  }
};
