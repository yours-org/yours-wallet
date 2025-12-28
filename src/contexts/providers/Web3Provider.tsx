import { ReactNode, useState } from 'react';
import {
  Broadcast,
  DecryptRequest,
  EncryptRequest,
  GetSignatures,
  PurchaseOrdinal,
  SendBsv,
  SendBsv20,
  SendMNEE,
  SignMessage,
  TaggedDerivationRequest,
  TransferOrdinal,
} from 'yours-wallet-provider';
import { RequestParams } from '../../inject';
import { ChromeStorageService } from '../../services/ChromeStorage.service';
import { ChromeStorageObject } from '../../services/types/chromeStorage.types';
import { sleep } from '../../utils/sleep';
import { Web3RequestContext, Web3RequestContextProps } from '../Web3RequestContext';
import type { CreateSignatureArgs, WalletEncryptArgs, WalletDecryptArgs, CreateActionArgs } from '../../cwi';

export const Web3RequestProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [connectRequest, setConnectRequest] = useState<RequestParams | undefined>(undefined);
  const [sendBsvRequest, setSendBsvRequest] = useState<SendBsv[] | undefined>(undefined);
  const [sendBsv20Request, setSendBsv20Request] = useState<SendBsv20 | undefined>(undefined);
  const [sendMNEERequest, setSendMNEERequest] = useState<SendMNEE[] | undefined>(undefined);
  const [transferOrdinalRequest, setTransferOrdinalRequest] = useState<TransferOrdinal | undefined>(undefined);
  const [purchaseOrdinalRequest, setPurchaseOrdinalRequest] = useState<PurchaseOrdinal | undefined>(undefined);
  const [signMessageRequest, setSignMessageRequest] = useState<SignMessage | undefined>(undefined);
  const [broadcastRequest, setBroadcastRequest] = useState<Broadcast | undefined>(undefined);
  const [getSignaturesRequest, setGetSignaturesRequest] = useState<GetSignatures | undefined>(undefined);
  const [generateTaggedKeysRequest, setGenerateTaggedKeysRequest] = useState<TaggedDerivationRequest | undefined>(
    undefined,
  );
  const [encryptRequest, setEncryptRequest] = useState<EncryptRequest | undefined>(undefined);
  const [decryptRequest, setDecryptRequest] = useState<DecryptRequest | undefined>(undefined);
  // CWI (BRC-100) requests
  const [cwiCreateSignatureRequest, setCwiCreateSignatureRequest] = useState<CreateSignatureArgs | undefined>(undefined);
  const [cwiEncryptRequest, setCwiEncryptRequest] = useState<WalletEncryptArgs | undefined>(undefined);
  const [cwiDecryptRequest, setCwiDecryptRequest] = useState<WalletDecryptArgs | undefined>(undefined);
  const [cwiCreateActionRequest, setCwiCreateActionRequest] = useState<CreateActionArgs | undefined>(undefined);
  const [popupId, setPopupId] = useState<number | undefined>(undefined);

  const clearRequest = async (type: keyof Omit<Web3RequestContextProps, 'clearRequest'>) => {
    await sleep(1000);
    switch (type) {
      case 'connectRequest':
        setConnectRequest(undefined);
        break;
      case 'sendBsvRequest':
        setSendBsvRequest(undefined);
        break;
      case 'sendBsv20Request':
        setSendBsv20Request(undefined);
        break;
      case 'sendMNEERequest':
        setSendMNEERequest(undefined);
        break;
      case 'transferOrdinalRequest':
        setTransferOrdinalRequest(undefined);
        break;
      case 'purchaseOrdinalRequest':
        setPurchaseOrdinalRequest(undefined);
        break;
      case 'signMessageRequest':
        setSignMessageRequest(undefined);
        break;
      case 'broadcastRequest':
        setBroadcastRequest(undefined);
        break;
      case 'getSignaturesRequest':
        setGetSignaturesRequest(undefined);
        break;
      case 'generateTaggedKeysRequest':
        setGenerateTaggedKeysRequest(undefined);
        break;
      case 'encryptRequest':
        setEncryptRequest(undefined);
        break;
      case 'decryptRequest':
        setDecryptRequest(undefined);
        break;
      // CWI (BRC-100) requests
      case 'cwiCreateSignatureRequest':
        setCwiCreateSignatureRequest(undefined);
        break;
      case 'cwiEncryptRequest':
        setCwiEncryptRequest(undefined);
        break;
      case 'cwiDecryptRequest':
        setCwiDecryptRequest(undefined);
        break;
      case 'cwiCreateActionRequest':
        setCwiCreateActionRequest(undefined);
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
      sendBsvRequest,
      sendBsv20Request,
      sendMNEERequest,
      transferOrdinalRequest,
      purchaseOrdinalRequest,
      signMessageRequest,
      broadcastRequest,
      getSignaturesRequest,
      generateTaggedKeysRequest,
      encryptRequest,
      decryptRequest,
      // CWI (BRC-100) requests
      cwiCreateSignatureRequest,
      cwiEncryptRequest,
      cwiDecryptRequest,
      cwiCreateActionRequest,
      popupWindowId,
    } = result;

    if (connectRequest) setConnectRequest(connectRequest);
    if (sendBsvRequest) setSendBsvRequest(sendBsvRequest);
    if (sendBsv20Request) setSendBsv20Request(sendBsv20Request);
    if (sendMNEERequest) setSendMNEERequest(sendMNEERequest);
    if (transferOrdinalRequest) setTransferOrdinalRequest(transferOrdinalRequest);
    if (purchaseOrdinalRequest) setPurchaseOrdinalRequest(purchaseOrdinalRequest);
    if (signMessageRequest) setSignMessageRequest(signMessageRequest);
    if (broadcastRequest) setBroadcastRequest(broadcastRequest);
    if (getSignaturesRequest) setGetSignaturesRequest(getSignaturesRequest);
    if (generateTaggedKeysRequest) setGenerateTaggedKeysRequest(generateTaggedKeysRequest);
    if (encryptRequest) setEncryptRequest(encryptRequest);
    if (decryptRequest) setDecryptRequest(decryptRequest);
    // CWI (BRC-100) requests
    if (cwiCreateSignatureRequest) setCwiCreateSignatureRequest(cwiCreateSignatureRequest);
    if (cwiEncryptRequest) setCwiEncryptRequest(cwiEncryptRequest);
    if (cwiDecryptRequest) setCwiDecryptRequest(cwiDecryptRequest);
    if (cwiCreateActionRequest) setCwiCreateActionRequest(cwiCreateActionRequest);
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
        sendBsvRequest,
        sendBsv20Request,
        sendMNEERequest,
        transferOrdinalRequest,
        purchaseOrdinalRequest,
        signMessageRequest,
        broadcastRequest,
        getSignaturesRequest,
        generateTaggedKeysRequest,
        encryptRequest,
        decryptRequest,
        // CWI (BRC-100) requests
        cwiCreateSignatureRequest,
        cwiEncryptRequest,
        cwiDecryptRequest,
        cwiCreateActionRequest,
        clearRequest,
        popupId,
        getStorageAndSetRequestState,
      }}
    >
      {children}
    </Web3RequestContext.Provider>
  );
};
