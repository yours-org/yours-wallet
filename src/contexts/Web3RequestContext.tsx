import { createContext, useState, ReactNode } from 'react';
import {
  Broadcast,
  DecryptRequest,
  EncryptRequest,
  GetSignatures,
  PurchaseOrdinal,
  SendBsv,
  SendBsv20,
  SignMessage,
  TaggedDerivationRequest,
  TransferOrdinal,
} from 'yours-wallet-provider';
import { RequestParams } from '../inject';
import { ChromeStorageService } from '../services/ChromeStorage.service';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { sleep } from '../utils/sleep';

export type Web3RequestContextProps = {
  connectRequest: RequestParams | undefined;
  sendBsvRequest: SendBsv[] | undefined;
  sendBsv20Request: SendBsv20 | undefined;
  transferOrdinalRequest: TransferOrdinal | undefined;
  purchaseOrdinalRequest: PurchaseOrdinal | undefined;
  signMessageRequest: SignMessage | undefined;
  broadcastRequest: Broadcast | undefined;
  getSignaturesRequest: GetSignatures | undefined;
  generateTaggedKeysRequest: TaggedDerivationRequest | undefined;
  encryptRequest: EncryptRequest | undefined;
  decryptRequest: DecryptRequest | undefined;
  popupId: number | undefined;
  getStorageAndSetRequestState: (chromeStorageService: ChromeStorageService) => void;
  clearRequest: (type: keyof Omit<Web3RequestContextProps, 'clearRequest'>) => void;
};

export const Web3RequestContext = createContext<Web3RequestContextProps | undefined>(undefined);

export const Web3RequestProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [connectRequest, setConnectRequest] = useState<RequestParams | undefined>(undefined);
  const [sendBsvRequest, setSendBsvRequest] = useState<SendBsv[] | undefined>(undefined);
  const [sendBsv20Request, setSendBsv20Request] = useState<SendBsv20 | undefined>(undefined);
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
      transferOrdinalRequest,
      purchaseOrdinalRequest,
      signMessageRequest,
      broadcastRequest,
      getSignaturesRequest,
      generateTaggedKeysRequest,
      encryptRequest,
      decryptRequest,
      popupWindowId,
    } = result;

    if (connectRequest) setConnectRequest(connectRequest);
    if (sendBsvRequest) setSendBsvRequest(sendBsvRequest);
    if (sendBsv20Request) setSendBsv20Request(sendBsv20Request);
    if (transferOrdinalRequest) setTransferOrdinalRequest(transferOrdinalRequest);
    if (purchaseOrdinalRequest) setPurchaseOrdinalRequest(purchaseOrdinalRequest);
    if (signMessageRequest) setSignMessageRequest(signMessageRequest);
    if (broadcastRequest) setBroadcastRequest(broadcastRequest);
    if (getSignaturesRequest) setGetSignaturesRequest(getSignaturesRequest);
    if (generateTaggedKeysRequest) setGenerateTaggedKeysRequest(generateTaggedKeysRequest);
    if (encryptRequest) setEncryptRequest(encryptRequest);
    if (decryptRequest) setDecryptRequest(decryptRequest);
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
        transferOrdinalRequest,
        purchaseOrdinalRequest,
        signMessageRequest,
        broadcastRequest,
        getSignaturesRequest,
        generateTaggedKeysRequest,
        encryptRequest,
        decryptRequest,
        clearRequest,
        popupId,
        getStorageAndSetRequestState,
      }}
    >
      {children}
    </Web3RequestContext.Provider>
  );
};
