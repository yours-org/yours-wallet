import { ReactNode, useEffect, useState } from 'react';
import { SendMNEE } from '../../services/types/provider.types';
import { RequestParams } from '../../inject';
import { ChromeStorageService } from '../../services/ChromeStorage.service';
import { ChromeStorageObject } from '../../services/types/chromeStorage.types';
import { sleep } from '../../utils/sleep';
import { Web3RequestContext, Web3RequestContextProps } from '../Web3RequestContext';
import type {
  PermissionRequest,
  GroupedPermissionRequest,
  CounterpartyPermissionRequest,
} from '@bsv/wallet-toolbox-mobile';
import type { ApprovalContext } from '../../yoursApi';
import type { OneSatPromptStorageEntry } from '../../services/oneSatPrompt';

export const Web3RequestProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [connectRequest, setConnectRequest] = useState<RequestParams | undefined>(undefined);
  const [sendMNEERequest, setSendMNEERequest] = useState<SendMNEE[] | undefined>(undefined);
  const [permissionRequest, setPermissionRequest] = useState<(PermissionRequest & { requestID: string }) | undefined>(
    undefined,
  );
  const [groupedPermissionRequest, setGroupedPermissionRequest] = useState<GroupedPermissionRequest | undefined>(
    undefined,
  );
  const [counterpartyPermissionRequest, setCounterpartyPermissionRequest] = useState<
    CounterpartyPermissionRequest | undefined
  >(undefined);
  const [transactionApprovalRequest, setTransactionApprovalRequest] = useState<ApprovalContext | undefined>(undefined);
  const [oneSatPermissionRequest, setOneSatPermissionRequest] = useState<OneSatPromptStorageEntry | undefined>(
    undefined,
  );
  const [popupId, setPopupId] = useState<number | undefined>(undefined);

  // Listen for storage changes so popup can detect new permission requests while open
  useEffect(() => {
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.connectRequest?.newValue) {
        setConnectRequest(changes.connectRequest.newValue);
      }
      if (changes.permissionRequest?.newValue) {
        setPermissionRequest(changes.permissionRequest.newValue);
      }
      if (changes.groupedPermissionRequest?.newValue) {
        setGroupedPermissionRequest(changes.groupedPermissionRequest.newValue);
      }
      if (changes.counterpartyPermissionRequest?.newValue) {
        setCounterpartyPermissionRequest(changes.counterpartyPermissionRequest.newValue);
      }
      if ('oneSatPermissionRequest' in changes) {
        setOneSatPermissionRequest(changes.oneSatPermissionRequest.newValue);
      }
    };
    chrome.storage.local.onChanged.addListener(listener);
    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  const clearRequest = async (type: keyof Omit<Web3RequestContextProps, 'clearRequest'>) => {
    // Permission requests: just clear React state immediately.
    // Service worker manages storage and popup lifecycle for sequential permissions.
    if (type === 'permissionRequest') {
      setPermissionRequest(undefined);
      return;
    }
    if (type === 'groupedPermissionRequest') {
      setGroupedPermissionRequest(undefined);
      return;
    }
    if (type === 'counterpartyPermissionRequest') {
      setCounterpartyPermissionRequest(undefined);
      return;
    }
    if (type === 'oneSatPermissionRequest') {
      setOneSatPermissionRequest(undefined);
      return;
    }

    await sleep(1000);
    switch (type) {
      case 'connectRequest':
        setConnectRequest(undefined);
        break;
      case 'sendMNEERequest':
        setSendMNEERequest(undefined);
        break;
      case 'transactionApprovalRequest':
        setTransactionApprovalRequest(undefined);
        break;
      default:
        break;
    }
    await chrome.storage.local.remove(type);
    chrome.storage.local.get(async ({ popupWindowId }) => {
      if (popupWindowId) {
        await chrome.windows.remove(popupWindowId);
        await chrome.storage.local.remove('popupWindowId');
      }
    });
  };

  const handleRequestStates = async (result: Partial<ChromeStorageObject>) => {
    const {
      connectRequest,
      sendMNEERequest,
      permissionRequest,
      groupedPermissionRequest,
      counterpartyPermissionRequest,
      transactionApprovalRequest,
      oneSatPermissionRequest,
      popupWindowId,
    } = result;

    if (connectRequest) setConnectRequest(connectRequest);
    if (sendMNEERequest) setSendMNEERequest(sendMNEERequest);
    if (permissionRequest) setPermissionRequest(permissionRequest);
    if (groupedPermissionRequest) setGroupedPermissionRequest(groupedPermissionRequest);
    if (counterpartyPermissionRequest) setCounterpartyPermissionRequest(counterpartyPermissionRequest);
    if (transactionApprovalRequest) setTransactionApprovalRequest(transactionApprovalRequest);
    if (oneSatPermissionRequest) setOneSatPermissionRequest(oneSatPermissionRequest);
    if (popupWindowId) setPopupId(popupWindowId);
  };

  const getStorageAndSetRequestState = async (chromeStorageService: ChromeStorageService) => {
    const res = await chromeStorageService.getAndSetStorage();
    if (res) handleRequestStates(res);
  };

  return (
    <Web3RequestContext.Provider
      value={{
        connectRequest,
        sendMNEERequest,
        permissionRequest,
        groupedPermissionRequest,
        counterpartyPermissionRequest,
        transactionApprovalRequest,
        oneSatPermissionRequest,
        clearRequest,
        popupId,
        getStorageAndSetRequestState,
      }}
    >
      {children}
    </Web3RequestContext.Provider>
  );
};
