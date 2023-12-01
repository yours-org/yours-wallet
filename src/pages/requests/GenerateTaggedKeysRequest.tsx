import { P2PKHAddress, PublicKey } from 'bsv-wasm-web';
import { buildInscription } from 'js-1sat-ord-web';
import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBsv } from '../../hooks/useBsv';
import { useGorillaPool } from '../../hooks/useGorillaPool';
import { useKeys } from '../../hooks/useKeys';
import { useNetwork } from '../../hooks/useNetwork';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useWeb3Context } from '../../hooks/useWeb3Context';
import { encryptUsingPrivKey } from '../../utils/crypto';
import { truncate } from '../../utils/format';
import { DerivationTag, getPrivateKeyFromTag, getTaggedDerivationKeys, Keys } from '../../utils/keys';
import { sleep } from '../../utils/sleep';
import { storage } from '../../utils/storage';

export type GenerateTaggedKeysRequestProps = {
  web3Request: DerivationTag;
  popupId: number | undefined;
  onResponse: () => void;
};

export type TaggedDerivationResponse = {
  address?: string;
  pubKey?: string;
  tag?: DerivationTag;
  error?: string;
};

export const GenerateTaggedKeysRequest = (props: GenerateTaggedKeysRequestProps) => {
  const { web3Request, popupId, onResponse } = props;
  const { theme } = useTheme();
  const { network } = useNetwork();
  const { isProcessing, setIsProcessing, sendBsv, getChainParams } = useBsv();
  const { setDerivationTags } = useGorillaPool();
  const { retrieveKeys } = useKeys();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [successTxId, setSuccessTxId] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { isPasswordRequired } = useWeb3Context();

  useEffect(() => {
    if (!successTxId) return;
    if (!message) {
      resetSendState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successTxId, message]);

  useEffect(() => {
    const onbeforeunloadFn = () => {
      if (popupId) chrome.windows.remove(popupId);
    };

    window.addEventListener('beforeunload', onbeforeunloadFn);
    return () => {
      window.removeEventListener('beforeunload', onbeforeunloadFn);
    };
  }, [popupId]);

  const resetSendState = () => {
    setPasswordConfirm('');
    setSuccessTxId('');
    setIsProcessing(false);
  };

  const createTaggedKeys = async (
    password: string,
    derivationTag: DerivationTag,
    keys: Keys,
  ): Promise<TaggedDerivationResponse> => {
    setIsProcessing(true);
    try {
      if (!keys?.mnemonic || !keys.identityPubKey || !keys.identityAddress) {
        return { error: 'no-keys' };
      }
      const existingTag: TaggedDerivationResponse = await new Promise((resolve, reject) => {
        storage.get(['derivationTags'], ({ derivationTags }) => {
          resolve(
            derivationTags.find(
              (res: TaggedDerivationResponse) =>
                res.tag?.domain === derivationTag.domain &&
                res.tag.label === derivationTag.label &&
                res.tag.id === derivationTag.id,
            ),
          );
        });
      });

      if (existingTag) return existingTag;

      const taggedKeys = getTaggedDerivationKeys(derivationTag, keys.mnemonic);
      const message = JSON.stringify(derivationTag);
      const encryptPrivKey = getPrivateKeyFromTag({ label: 'panda', id: 'identity', domain: '' }, keys);

      const encryptedMessages = encryptUsingPrivKey(
        message,
        'utf8',
        [PublicKey.from_hex(keys.identityPubKey)],
        encryptPrivKey,
      );

      const insScript = buildInscription(
        P2PKHAddress.from_string(keys.identityAddress),
        encryptedMessages[0],
        'panda/tag',
      );
      const txid = await sendBsv([{ satoshis: 1, script: insScript.to_hex() }], password);

      if (!txid) {
        return { error: 'no-txid' };
      }

      const taggedAddress = P2PKHAddress.from_string(taggedKeys.address)
        .set_chain_params(getChainParams(network))
        .to_string();

      return {
        address: taggedAddress,
        pubKey: taggedKeys.pubKey.to_hex(),
        tag: derivationTag,
      };
    } catch (error: any) {
      console.log(error);
      setIsProcessing(false);
      return { error: error.message ?? 'unknown' };
    }
  };

  const handleGetTaggedKeys = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);

    await sleep(25);
    if (!web3Request.label || !web3Request.id) {
      addSnackbar('Invalid or missing tag data', 'info');
      setIsProcessing(false);
      return;
    }

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      return;
    }

    const keys = (await retrieveKeys(passwordConfirm)) as Keys;
    const res = await createTaggedKeys(passwordConfirm, web3Request, keys);
    setIsProcessing(true); // sendBsv call in createTaggedKeys sets to false but it's still processing at this point

    if (!res.address || !res.pubKey) {
      const message =
        res.error === 'invalid-password'
          ? 'Invalid Password!'
          : res.error === 'no-keys'
            ? 'Could not locate the wallet keys!'
            : res.error === 'no-txid'
              ? 'Error creating tag inscription'
              : 'An unknown error has occurred! Try again.';

      addSnackbar(message, 'error');
      return;
    }

    await sleep(3000); // give enough time for indexer to index newly created tag
    await setDerivationTags(keys.identityAddress, keys);

    setSuccessTxId(res.pubKey);
    setIsProcessing(false);
    addSnackbar('Successfully generated key!', 'success');

    chrome.runtime.sendMessage({
      action: 'generateTaggedKeysResponse',
      address: res.address,
      pubKey: res.pubKey,
      tag: res.tag,
    });

    setTimeout(async () => {
      onResponse();
      storage.remove('generateTaggedKeysRequest');
      if (popupId) chrome.windows.remove(popupId);
    }, 2000);
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Processing request..." />
      </Show>

      <Show when={!isProcessing && !!web3Request}>
        <ConfirmContent>
          <HeaderText theme={theme}>Approve Request</HeaderText>
          <FormContainer noValidate onSubmit={(e) => handleGetTaggedKeys(e)}>
            <Text theme={theme} style={{ margin: '1rem 0' }}>
              {`The app is requesting to generate a new set of tagged keys with label ${web3Request.label} and id ${
                web3Request.id.length > 20 ? truncate(web3Request.id, 5, 5) : web3Request.id
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
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
