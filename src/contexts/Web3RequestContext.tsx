import { createContext, useState, useEffect, ReactNode, SetStateAction } from 'react';
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
import { storage } from '../utils/storage';
import { ChromeStorageObject, Dispatch } from './types/global.types';

export type Web3RequestContextProps = {
  connectRequest: RequestParams | undefined;
  setConnectRequest: Dispatch<SetStateAction<RequestParams | undefined>>;
  sendBsvRequest: SendBsv[] | undefined;
  setSendBsvRequest: Dispatch<SetStateAction<SendBsv[] | undefined>>;
  transferOrdinalRequest: TransferOrdinal | undefined;
  setTransferOrdinalRequest: Dispatch<SetStateAction<TransferOrdinal | undefined>>;
  purchaseOrdinalRequest: PurchaseOrdinal | undefined;
  setPurchaseOrdinalRequest: Dispatch<SetStateAction<PurchaseOrdinal | undefined>>;
  signMessageRequest: SignMessage | undefined;
  setSignMessageRequest: Dispatch<SetStateAction<SignMessage | undefined>>;
  broadcastRequest: Broadcast | undefined;
  setBroadcastRequest: Dispatch<SetStateAction<Broadcast | undefined>>;
  getSignaturesRequest: GetSignatures | undefined;
  setGetSignaturesRequest: Dispatch<SetStateAction<GetSignatures | undefined>>;
  generateTaggedKeysRequest: TaggedDerivationRequest | undefined;
  setGenerateTaggedKeysRequest: Dispatch<SetStateAction<TaggedDerivationRequest | undefined>>;
  encryptRequest: EncryptRequest | undefined;
  setEncryptRequest: Dispatch<SetStateAction<EncryptRequest | undefined>>;
  decryptRequest: DecryptRequest | undefined;
  setDecryptRequest: Dispatch<SetStateAction<DecryptRequest | undefined>>;
  popupId: number | undefined;
  setPopupId: Dispatch<SetStateAction<number | undefined>>;
  whitelist: WhitelistedApp[];
  setWhitelist: Dispatch<SetStateAction<WhitelistedApp[]>>;
  clearRequest: (type: keyof Omit<Web3RequestContextProps, 'clearRequest'>) => void;
};

export const Web3RequestContext = createContext<Web3RequestContextProps | undefined>(undefined);

export const Web3RequestProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [connectRequest, setConnectRequest] = useState<RequestParams | undefined>(undefined);
  const [sendBsvRequest, setSendBsvRequest] = useState<SendBsv[] | undefined>(undefined);
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
  const [whitelist, setWhitelist] = useState<WhitelistedApp[]>([]);

  const clearRequest = () => {
    setConnectRequest(undefined);
    setSendBsvRequest(undefined);
    setTransferOrdinalRequest(undefined);
    setPurchaseOrdinalRequest(undefined);
    setSignMessageRequest(undefined);
    setBroadcastRequest(undefined);
    setGetSignaturesRequest(undefined);
    setGenerateTaggedKeysRequest(undefined);
    setEncryptRequest(undefined);
    setDecryptRequest(undefined);
  };

  useEffect(() => {
    const handleRequestStates = async (result: Partial<ChromeStorageObject>) => {
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
    };

    const getStorageAndSetRequestState = async () => {
      const res: ChromeStorageObject = await storage.get(null); // passing null returns everything in storage
      handleRequestStates(res);
    };

    getStorageAndSetRequestState();
  }, []);

  return (
    <Web3RequestContext.Provider
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
      }}
    >
      {children}
    </Web3RequestContext.Provider>
  );
};
