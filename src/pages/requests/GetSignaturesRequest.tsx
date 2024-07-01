import init, { P2PKHAddress, Transaction } from 'bsv-wasm-web';
import React, { useEffect, useState } from 'react';
import { DefaultTheme, styled } from 'styled-components';
import { GetSignatures, SignatureResponse } from 'yours-wallet-provider';
import { BackButton } from '../../components/BackButton';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { ConfirmContent, FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useContracts } from '../../hooks/useContracts';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useWeb3Context } from '../../hooks/useWeb3Context';
import { removeWindow, sendMessage } from '../../utils/chromeHelpers';
import { sleep } from '../../utils/sleep';
import { storage } from '../../utils/storage';

const TxInput = styled.div`
  border: 1px solid yellow;
  margin: 0.5rem 0;
  padding: 0.5rem;
  width: 85%;
`;

const TxOutput = styled.div`
  border: 1px solid green;
  margin: 0.5rem 0;
  padding: 0.5rem;
  width: 85%;
`;

const TxContainer = styled.div`
  max-height: 10rem;
  overflow-y: auto;
  overflow-x: hidden;
`;

const TxInputsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const TxOutputsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const InputContent = (props: {
  idx: number;
  tag: string;
  addr: string | string[];
  sats: number;
  theme?: DefaultTheme | undefined;
}) => {
  return (
    <div style={{ color: props.theme?.color || 'white' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: '0.2rem',
        }}
      >
        <span>#{props.idx}</span>
        <span>{props.tag}</span>
        <span>{props.sats} sats</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>Signer:</div>
        <div style={{ overflowX: 'scroll', padding: '0.5rem 0 0.5rem 0.5rem' }}>{props.addr}</div>
      </div>
    </div>
  );
};

const OutputContent = (props: {
  idx: number;
  tag: string;
  addr: string | string[];
  sats: number;
  theme?: DefaultTheme | undefined;
}) => {
  return (
    <div style={{ color: props.theme?.color || 'white' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          paddingTop: '0.2rem',
        }}
      >
        <span>#{props.idx}</span>
        <span>{props.tag}</span>
        <span>{props.sats} sats</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div>Payee:</div>
        <div style={{ overflowX: 'scroll', padding: '0.5rem 0 0.5rem 0.5rem' }}>{props.addr}</div>
      </div>
    </div>
  );
};

const TxViewer = (props: { request: GetSignatures }) => {
  const { theme } = useTheme();
  const [showDetail, setShowDetail] = useState(false);
  const { request } = props;
  const [txOutputs, setTxOutputs] = useState<{ asm: string; satoshis: number }[]>([]);

  useEffect(() => {
    const setTheTx = async () => {
      try {
        await init();
        const tx = Transaction.from_hex(request.rawtx);
        const numOuts = tx.get_noutputs();
        const outputs: { asm: string; satoshis: number }[] = [];
        for (let i = 0; i < numOuts; i++) {
          const output = tx.get_output(i);
          const asm = output?.get_script_pub_key().to_asm_string();
          const satoshis = output?.get_satoshis();
          if (!asm) throw new Error('Could not parse output and get asm string');
          outputs.push({ asm, satoshis: Number(satoshis) });
        }
        setTxOutputs(outputs);
      } catch (error) {
        console.error(error);
      }
    };
    setTheTx();
  }, [request.rawtx]);

  return (
    <TxContainer>
      <Show when={!showDetail}>
        <Button
          theme={theme}
          type="secondary"
          label="Details"
          onClick={() => setShowDetail(!showDetail)}
          style={{ marginTop: '0' }}
        />
      </Show>

      <Show when={showDetail}>
        <TxInputsContainer>
          <Text theme={theme} style={{ margin: '0.5rem 0' }}>
            Inputs To Sign
          </Text>
          {request.sigRequests.map((sigReq) => (
            <TxInput key={sigReq.inputIndex}>
              <InputContent
                idx={sigReq.inputIndex}
                tag={sigReq.script ? 'nonStandard' : 'P2PKH'}
                addr={[sigReq.address].flat().join(', ')}
                sats={sigReq.satoshis}
                theme={theme}
              />
            </TxInput>
          ))}
        </TxInputsContainer>
        <TxOutputsContainer>
          <Text theme={theme} style={{ margin: '0.5rem 0' }}>
            Outputs
          </Text>
          {txOutputs.length > 0 ? (
            txOutputs.map(({ asm, satoshis }, idx: number) => {
              const pubkeyHash = (/^OP_DUP OP_HASH160 ([0-9a-fA-F]{40}) OP_EQUALVERIFY OP_CHECKSIG$/.exec(asm) ||
                [])[1];
              const isP2PKH = !!pubkeyHash;
              const toAddr = pubkeyHash
                ? P2PKHAddress.from_pubkey_hash(Uint8Array.from(Buffer.from(pubkeyHash, 'hex'))).to_string()
                : 'Unknown Address';

              return (
                <TxOutput key={idx}>
                  <OutputContent
                    idx={idx}
                    tag={isP2PKH ? 'P2PKH' : 'nonStandard'}
                    addr={toAddr}
                    sats={satoshis}
                    theme={theme}
                  />
                </TxOutput>
              );
            })
          ) : (
            <>Parsing Tx ...</>
          )}
        </TxOutputsContainer>
      </Show>
    </TxContainer>
  );
};

export type GetSignaturesResponse = {
  sigResponses?: SignatureResponse[];
  error?: string;
};

export type GetSignaturesRequestProps = {
  request: GetSignatures;
  popupId: number | undefined;
  onSignature: () => void;
};

export const GetSignaturesRequest = (props: GetSignaturesRequestProps) => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const { addSnackbar, message } = useSnackbar();
  const { isPasswordRequired } = useWeb3Context();

  const { request, onSignature, popupId } = props;
  //TODO: this type should just be the response from the provider. Figure out how to better handle error.
  const [getSigsResponse, setGetSigsResponse] = useState<{
    sigResponses?: SignatureResponse[] | undefined;
    error?:
      | {
          message: string;
          cause?: any;
        }
      | undefined;
  }>();
  const { isProcessing, setIsProcessing, getSignatures } = useContracts();

  useEffect(() => {
    setSelected('bsv');
  }, [setSelected]);

  const resetSendState = () => {
    setPasswordConfirm('');
    setGetSigsResponse(undefined);
    setIsProcessing(false);
  };

  useEffect(() => {
    if (!getSigsResponse) return;
    if (!message && getSigsResponse) {
      resetSendState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, getSigsResponse]);

  useEffect(() => {
    const onbeforeunloadFn = () => {
      if (popupId) removeWindow(popupId);
    };

    window.addEventListener('beforeunload', onbeforeunloadFn);
    return () => {
      window.removeEventListener('beforeunload', onbeforeunloadFn);
    };
  }, [popupId]);

  const handleSigning = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error', 3000);
      setIsProcessing(false);
      return;
    }

    const getSigsRes = await getSignatures(request, passwordConfirm);

    if (getSigsRes?.error) {
      const message =
        getSigsRes.error.message === 'invalid-password'
          ? 'Invalid Password!'
          : getSigsRes.error.message === 'unknown-address'
            ? 'Unknown Address: ' + (getSigsRes.error.cause ?? '')
            : 'An unknown error has occurred! Try again.';

      sendMessage({
        action: 'getSignaturesResponse',
        ...getSigsRes,
      });

      setIsProcessing(false);

      addSnackbar(message, 'error', 3000);

      return;
    }

    setGetSigsResponse(getSigsRes);
    sendMessage({
      action: 'getSignaturesResponse',
      ...getSigsRes,
    });

    setIsProcessing(false);

    addSnackbar('Successfully Signed!', 'success');

    setTimeout(async () => {
      onSignature();
      await storage.remove('getSignaturesRequest');
      if (popupId) removeWindow(popupId);
    }, 2000);
  };

  const rejectSigning = async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();
    if (popupId) removeWindow(popupId);
    await storage.remove('getSignaturesRequest');
  };

  const clearRequest = async () => {
    await storage.remove('getSignaturesRequest');
    if (popupId) removeWindow(popupId);
    window.location.reload();
  };

  return (
    <>
      <Show when={isProcessing}>
        <PageLoader theme={theme} message="Signing Transaction..." />
      </Show>
      <Show when={!isProcessing && !!request}>
        <ConfirmContent>
          <BackButton onClick={clearRequest} />
          <HeaderText theme={theme}>Sign Transaction</HeaderText>
          <Text theme={theme} style={{ margin: '0.75rem 0' }}>
            The app is requesting signatures for a transaction.
          </Text>
          <FormContainer noValidate onSubmit={(e) => handleSigning(e)}>
            <TxViewer request={request} />
            <Show when={isPasswordRequired}>
              <Input
                theme={theme}
                placeholder="Enter Wallet Password"
                type="password"
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </Show>
            <Button theme={theme} type="primary" label="Sign the transaction" isSubmit disabled={isProcessing} />
            <Button
              theme={theme}
              type="secondary"
              label="Cancel"
              disabled={isProcessing}
              onClick={rejectSigning}
              style={{ marginTop: '0' }}
            />
          </FormContainer>
        </ConfirmContent>
      </Show>
    </>
  );
};
