import { createContext, useState, useEffect, ReactNode } from 'react';
import {
  Broadcast,
  DecryptRequest,
  EncryptRequest,
  GetSignatures,
  PurchaseOrdinal,
  SendBsv,
  SignMessage,
  TaggedDerivationRequest,
  TransferOrdinal,
} from 'yours-wallet-provider';
import { RequestParams, WhitelistedApp } from '../inject';

type Dispatch<T> = (value: T) => void;
type SetStateAction<T> = T | ((prevState: T) => T);

export type Web3ContextTypeNew = {
  connectRequest: RequestParams | undefined;
  setConnectRequest: Dispatch<SetStateAction<RequestParams | undefined>>;
  sendBsvRequest: SendBsv[] | undefined;
  setSendBsvRequest: Dispatch<SetStateAction<SendBsv[] | undefined>>;
  transferOrdinalRequest: TransferOrdinal | undefined;
  setTransferOrdinalRequest: Dispatch<SetStateAction<TransferOrdinal | undefined>>;
  purchaseOrdinalRequest: (PurchaseOrdinal & { password: string }) | undefined;
  setPurchaseOrdinalRequest: Dispatch<SetStateAction<(PurchaseOrdinal & { password: string }) | undefined>>;
  signMessageRequest: SignMessage | undefined;
  setSignMessageRequest: Dispatch<SetStateAction<SignMessage | undefined>>;
  broadcastRequest: Broadcast | undefined;
  setBroadcastRequest: Dispatch<SetStateAction<Broadcast | undefined>>;
  getSignaturesRequest: GetSignatures | undefined;
  setGetSignaturesRequest: Dispatch<SetStateAction<GetSignatures | undefined>>;
  generateTaggedKeysRequest: (TaggedDerivationRequest & { domain?: string }) | undefined;
  setGenerateTaggedKeysRequest: Dispatch<SetStateAction<(TaggedDerivationRequest & { domain?: string }) | undefined>>;
  encryptRequest: EncryptRequest | undefined;
  setEncryptRequest: Dispatch<SetStateAction<EncryptRequest | undefined>>;
  decryptRequest: DecryptRequest | undefined;
  setDecryptRequest: Dispatch<SetStateAction<DecryptRequest | undefined>>;
  popupId: number | undefined;
  setPopupId: Dispatch<SetStateAction<number | undefined>>;
  whitelist: WhitelistedApp[];
  setWhitelist: Dispatch<SetStateAction<WhitelistedApp[]>>;
  encryptedKeys: string | undefined;
  setEncryptedKeys: Dispatch<SetStateAction<string | undefined>>;
  clearRequest: (type: keyof Omit<Web3ContextTypeNew, 'clearRequest'>) => void;
};

export const Web3ContextNew = createContext<Web3ContextTypeNew | undefined>(undefined);

export const Web3ProviderNew: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [connectRequest, setConnectRequest] = useState<RequestParams | undefined>(undefined);
  const [sendBsvRequest, setSendBsvRequest] = useState<SendBsv[] | undefined>(undefined);
  const [transferOrdinalRequest, setTransferOrdinalRequest] = useState<TransferOrdinal | undefined>(undefined);
  const [purchaseOrdinalRequest, setPurchaseOrdinalRequest] = useState<
    (PurchaseOrdinal & { password: string }) | undefined
  >(undefined);
  const [signMessageRequest, setSignMessageRequest] = useState<SignMessage | undefined>(undefined);
  const [broadcastRequest, setBroadcastRequest] = useState<Broadcast | undefined>(undefined);
  const [getSignaturesRequest, setGetSignaturesRequest] = useState<GetSignatures | undefined>(undefined);
  const [generateTaggedKeysRequest, setGenerateTaggedKeysRequest] = useState<TaggedDerivationRequest | undefined>(
    undefined,
  );
  const [encryptRequest, setEncryptRequest] = useState<EncryptRequest | undefined>(undefined);
  const [decryptRequest, setDecryptRequest] = useState<DecryptRequest | undefined>(undefined);
  const [popupId, setPopupId] = useState<number | undefined>(undefined);
  const [whitelist, setWhitelist] = useState<WhitelistedApp[]>([]);
  const [encryptedKeys, setEncryptedKeys] = useState<string | undefined>(undefined);

  const clearRequest = (type: keyof Omit<Web3ContextTypeNew, 'clearRequest'>) => {
    switch (type) {
      case 'connectRequest':
        setConnectRequest(undefined);
        break;
      case 'sendBsvRequest':
        setSendBsvRequest(undefined);
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
      case 'popupId':
        setPopupId(undefined);
        break;
      case 'whitelist':
        setWhitelist([]);
        break;
      case 'encryptedKeys':
        setEncryptedKeys(undefined);
        break;
      default:
        break;
    }
  };

  useEffect(() => {
    const handleStorageChange = (result: any) => {
      const {
        connectRequest,
        sendBsvRequest,
        transferOrdinalRequest,
        purchaseOrdinalRequest,
        signMessageRequest,
        broadcastRequest,
        getSignaturesRequest,
        generateTaggedKeysRequest,
        encryptRequest,
        decryptRequest,
        popupWindowId,
        whitelist,
        encryptedKeys,
      } = result;

      if (connectRequest) setConnectRequest(connectRequest);
      if (sendBsvRequest) setSendBsvRequest(sendBsvRequest);
      if (transferOrdinalRequest) setTransferOrdinalRequest(transferOrdinalRequest);
      if (purchaseOrdinalRequest) setPurchaseOrdinalRequest(purchaseOrdinalRequest);
      if (signMessageRequest) setSignMessageRequest(signMessageRequest);
      if (broadcastRequest) setBroadcastRequest(broadcastRequest);
      if (getSignaturesRequest) setGetSignaturesRequest(getSignaturesRequest);
      if (generateTaggedKeysRequest) setGenerateTaggedKeysRequest(generateTaggedKeysRequest);
      if (encryptRequest) setEncryptRequest(encryptRequest);
      if (decryptRequest) setDecryptRequest(decryptRequest);
      if (popupWindowId) setPopupId(popupWindowId);
      if (whitelist) setWhitelist(whitelist);
      if (encryptedKeys) setEncryptedKeys(encryptedKeys);
    };

    chrome.storage.local.get(
      [
        'connectRequest',
        'sendBsvRequest',
        'transferOrdinalRequest',
        'purchaseOrdinalRequest',
        'signMessageRequest',
        'broadcastRequest',
        'getSignaturesRequest',
        'generateTaggedKeysRequest',
        'encryptRequest',
        'decryptRequest',
        'popupWindowId',
        'whitelist',
        'encryptedKeys',
      ],
      handleStorageChange,
    );

    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local') {
        const result: any = {};
        Object.keys(changes).forEach((key) => {
          result[key] = changes[key].newValue;
        });
        handleStorageChange(result);
      }
    });
  }, []);

  return (
    <Web3ContextNew.Provider
      value={{
        connectRequest,
        setConnectRequest,
        sendBsvRequest,
        setSendBsvRequest,
        transferOrdinalRequest,
        setTransferOrdinalRequest,
        purchaseOrdinalRequest,
        setPurchaseOrdinalRequest,
        signMessageRequest,
        setSignMessageRequest,
        broadcastRequest,
        setBroadcastRequest,
        getSignaturesRequest,
        setGetSignaturesRequest,
        generateTaggedKeysRequest,
        setGenerateTaggedKeysRequest,
        encryptRequest,
        setEncryptRequest,
        decryptRequest,
        setDecryptRequest,
        clearRequest,
        popupId,
        setPopupId,
        whitelist,
        setWhitelist,
        encryptedKeys,
        setEncryptedKeys,
      }}
    >
      {children}
    </Web3ContextNew.Provider>
  );
};
