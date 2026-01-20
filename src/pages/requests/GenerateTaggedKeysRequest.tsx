import { useEffect, useState } from 'react';
import { DerivationTag, NetWork, TaggedDerivationRequest } from 'yours-wallet-provider';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useServiceContext } from '../../hooks/useServiceContext';
import { removeWindow, sendMessage } from '../../utils/chromeHelpers';
import { encryptUsingPrivKey } from '../../utils/crypto';
import { truncate } from '../../utils/format';
import { getPrivateKeyFromTag, getTaggedDerivationKeys, Keys } from '../../utils/keys';
import { sleep } from '../../utils/sleep';
import { PublicKey } from '@bsv/sdk';
import { OrdP2PKH } from 'js-1sat-ord';
import { convertAddressToMainnet, convertAddressToTestnet, getErrorMessage } from '../../utils/tools';
import { ChromeStorageObject } from '../../services/types/chromeStorage.types';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { sendBsv } from '@1sat/wallet-toolbox';

export type GenerateTaggedKeysRequestProps = {
  request: TaggedDerivationRequest & { domain?: string };
  popupId: number | undefined;
  onResponse: () => void;
};

export type InternalTaggedDerivationResponse = {
  address?: string;
  pubKey?: string;
  tag?: DerivationTag;
  error?: string;
};

export const GenerateTaggedKeysRequest = (props: GenerateTaggedKeysRequestProps) => {
  const { request, popupId, onResponse } = props;
  const { hideMenu } = useBottomMenu();
  const { theme } = useTheme();
  const [isProcessing, setIsProcessing] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { chromeStorageService, keysService, apiContext } = useServiceContext();
  const isPasswordRequired = chromeStorageService.isPasswordRequired();

  useEffect(() => {
    hideMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!successTxId) return;
    if (!message) {
      resetSendState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message]);

  const resetSendState = () => {
    setPasswordConfirm('');
    setSuccessTxId('');
    setIsProcessing(false);
  };

  const createTaggedKeys = async (
    password: string,
    derivationTag: DerivationTag,
    keys: Keys,
  ): Promise<InternalTaggedDerivationResponse> => {
    setIsProcessing(true);
    try {
      if (!keys?.mnemonic || !keys.identityPubKey || !keys.identityAddress) {
        return { error: 'no-keys' };
      }

      const { account } = chromeStorageService.getCurrentAccountObject();
      if (!account) throw Error('No account found');
      const derivationTags = account.derivationTags ?? [];

      const existingTag = derivationTags.find(
        (res: InternalTaggedDerivationResponse) =>
          res.tag?.domain === derivationTag.domain &&
          res.tag.label === derivationTag.label &&
          res.tag.id === derivationTag.id,
      );

      if (existingTag) return existingTag;

      const taggedKeys = getTaggedDerivationKeys(derivationTag, keys.mnemonic);
      const message = JSON.stringify(derivationTag);
      const encryptPrivKey = getPrivateKeyFromTag({ label: 'yours', id: 'identity', domain: '' }, keys);

      const encryptedMessages = encryptUsingPrivKey(
        message,
        'utf8',
        [PublicKey.fromString(keys.identityPubKey)],
        encryptPrivKey,
      );

      const insScript = new OrdP2PKH().lock(keys.identityAddress, {
        dataB64: encryptedMessages[0],
        contentType: 'yours/tag',
      });
      const sendRes = await sendBsv.execute(apiContext, {
        recipients: [{ satoshis: 1, script: insScript.toHex() }],
      });

      if (!sendRes.txid || sendRes.error) {
        return { error: sendRes.error || 'no-tag-inscription-txid' };
      }
      const txid = sendRes.txid;

      const network = chromeStorageService.getNetwork();
      const taggedAddress =
        network === NetWork.Mainnet
          ? convertAddressToMainnet(taggedKeys.address)
          : convertAddressToTestnet(taggedKeys.address);

      const newTag = {
        address: taggedAddress,
        pubKey: taggedKeys.pubKey.toString(),
        tag: derivationTag,
      };

      const key: keyof ChromeStorageObject = 'accounts';
      const update: Partial<ChromeStorageObject['accounts']> = {
        [keysService.identityAddress]: {
          ...account,
          derivationTags: [...derivationTags, newTag],
        },
      };
      await chromeStorageService.updateNested(key, update);

      return newTag;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.log(error);
      setIsProcessing(false);
      return { error: error.message ?? 'unknown' };
    }
  };

  const handleCreateTaggedKeys = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    if (!request?.domain) {
      addSnackbar('Invalid or domain information', 'info');
      setIsProcessing(false);
      return;
    }

    await sleep(25);
    if (!request.label || !request.id) {
      addSnackbar('Invalid or missing tag data', 'info');
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    const keys = (await keysService.retrieveKeys(passwordConfirm)) as Keys;
    const res = await createTaggedKeys(passwordConfirm, request as DerivationTag, keys);
    setIsProcessing(true); // sendBsv processing in createTaggedKeys sets to false but it's still processing at this point

    if (!res.address || !res.pubKey) {
      addSnackbar(getErrorMessage(res.error), 'error');
      setIsProcessing(false);
      return;
    }

    await sleep(3000); // give enough time for indexer to index newly created tag
    // TODO: Migrate setDerivationTags to use OneSatWallet
    // await setDerivationTags(keys, wallet, chromeStorageService);

    setSuccessTxId(res.pubKey);
    addSnackbar('Successfully generated key!', 'success');
    await sleep(2000);

    sendMessage({
      action: 'generateTaggedKeysResponse',
      address: res.address,
      pubKey: res.pubKey,
      tag: res.tag,
    });
    onResponse();
  };

  const clearRequest = async () => {
    sendMessage({
      action: 'generateTaggedKeysResponse',
      error: 'User cancelled the request',
    });
    await chromeStorageService.remove('generateTaggedKeysRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Processing request..." />
      </Show>

      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Approve Request</HeaderText>
          <FormContainer noValidate onSubmit={(e) => handleCreateTaggedKeys(e)}>
            <Text theme={theme} style={{ margin: '1rem 0' }}>
              {`The app is requesting to generate a new set of tagged keys with label ${request.label} and id ${
                request.id.length > 20 ? truncate(request.id, 5, 5) : request.id
              }`}
            </Text>
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Password"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                style={{ margin: '0.25rem' }}
              />
            </Show>
            <Button theme={theme} type="primary" label="Approve" disabled={isProcessing} isSubmit />
            <Button theme={theme} type="secondary" label="Cancel" onClick={clearRequest} disabled={isProcessing} />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
