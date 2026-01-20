import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../components/Button';
import { ForwardButton as RightChevron } from '../components/ForwardButton';
import { PageLoader } from '../components/PageLoader';
import yoursLogo from '../assets/logos/icon.png';
import { DateTimePicker, HeaderText, Text, Warning } from '../components/Reusable';
import { SettingsRow as AppsRow } from '../components/SettingsRow';
import { Show } from '../components/Show';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useTheme } from '../hooks/useTheme';
import { WhiteLabelTheme } from '../theme.types';
import { BSV_DECIMAL_CONVERSION, YOURS_DEV_WALLET, featuredApps } from '../utils/constants';
import { formatNumberWithCommasAndDecimals, truncate } from '../utils/format';
import { BsvSendRequest } from './requests/BsvSendRequest';
import { TopNav } from '../components/TopNav';
import { useServiceContext } from '../hooks/useServiceContext';
import { Outpoint, type ParseContext, type Txo, getChainInfo, unlockBsv, lockBsv } from '@1sat/wallet-toolbox';
import { Script } from '@bsv/sdk';
import { FaExternalLinkAlt } from 'react-icons/fa';

// Helper type for lock data stored in Txo.data.lock.data
interface LockData {
  until: number;
}
import { Input } from '../components/Input';
import TxPreview from '../components/TxPreview';
import { TransactionFormat } from 'yours-wallet-provider';
import { getTxFromRawTxFormat } from '../utils/tools';
import { useSnackbar } from '../hooks/useSnackbar';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: calc(75%);
  overflow-y: auto;
  overflow-x: hidden;
`;

const PageWrapper = styled.div<{ $marginTop: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: ${(props) => props.$marginTop};
  width: 100%;
`;

const AmountsWrapper = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
`;

const ButtonsWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 90%;
`;

const ScrollableContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 25rem;
  overflow-y: auto;
  overflow-x: hidden;
  width: 100%;
  padding: 1rem;
  margin-top: 1rem;
`;

const DiscoverAppsRow = styled.div<WhiteLabelTheme>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.color.global.row};
  border-radius: 0.5rem;
  padding: 0.5rem;
  margin: 0.25rem;
  width: 80%;
  cursor: pointer;
`;

const ImageAndDomain = styled.div`
  display: flex;
  align-items: center;
`;

const AppIcon = styled.img`
  width: 3rem;
  height: 3rem;
  margin-right: 1rem;
  border-radius: 0.5rem;
`;

const DiscoverAppsText = styled(Text)<WhiteLabelTheme>`
  color: ${({ theme }) => theme.color.global.contrast};
  margin: 0;
  font-weight: 600;
  text-align: left;
`;

const LockDetailsContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  width: 80%;
`;

const LockDetailsText = styled(Text)<WhiteLabelTheme>`
  margin: 0;
  color: ${({ theme }) => theme.color.global.contrast};
`;

const LockDetailsHeaderText = styled(LockDetailsText)`
  font-size: 0.85rem;
  font-weight: 600;
`;

const Dropdown = styled.select<WhiteLabelTheme>`
  width: 80%;
  padding: 0.5rem;
  margin-bottom: 1rem;
  border-radius: 0.5rem;
  color: ${({ theme }) => theme.color.global.contrast};
  background-color: ${({ theme }) => theme.color.global.row};
  border: 1px solid ${({ theme }) => theme.color.global.gray + '50'};
`;

const TextArea = styled.textarea<WhiteLabelTheme>`
  background-color: ${({ theme }) => theme.color.global.row};
  border-radius: 0.5rem;
  border: 1px solid ${({ theme }) => theme.color.global.gray + '50'};
  width: 80%;
  height: 4rem;
  font-size: 0.85rem;
  font-family: 'Inter', Arial, Helvetica, sans-serif;
  padding: 1rem;
  margin: 0.5rem;
  outline: none;
  color: ${({ theme }) => theme.color.global.contrast + '80'};
  resize: none;

  &::placeholder {
    color: ${({ theme }) => theme.color.global.contrast + '80'};
  }
`;

const SweepInfo = styled.div`
  width: 80%;
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 0.5rem;
  background-color: ${({ theme }) => theme.color.global.row};
`;

type AppsPage =
  | 'main'
  | 'sponsor'
  | 'sponsor-thanks'
  | 'discover-apps'
  | 'unlock'
  | 'lock-page'
  | 'decode-broadcast'
  | 'decode'
  | 'sweep-wif';

export const AppsAndTools = () => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const { query } = useBottomMenu();
  const { keysService, chromeStorageService, wallet, apiContext } = useServiceContext();
  const { bsvAddress, ordAddress, identityAddress, getWifBalance, sweepWif } = keysService;
  const exchangeRate = chromeStorageService.getCurrentAccountObject().exchangeRateCache?.rate ?? 0;
  const [isProcessing, setIsProcessing] = useState(false);
  const [page, setPage] = useState<AppsPage>(query === 'pending-locks' ? 'unlock' : 'main');
  const [otherIsSelected, setOtherIsSelected] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [satAmount, setSatAmount] = useState(0);
  const [didSubmit, setDidSubmit] = useState(false);
  const [lockedUtxos, setLockedUtxos] = useState<Txo[]>([]);
  const [currentBlockHeight, setCurrentBlockHeight] = useState(0);
  const [txData, setTxData] = useState<ParseContext>();
  const [rawTx, setRawTx] = useState<string | number[]>('');
  const [transactionFormat, setTransactionFormat] = useState<TransactionFormat>('tx');
  const [satsOut, setSatsOut] = useState(0);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [lockBlockHeight, setLockBlockHeight] = useState(0);
  const [lockBsvAmount, setLockBsvAmount] = useState<number | null>(null);
  const [lockPassword, setLockPassword] = useState('');

  const [wifKey, setWifKey] = useState('');
  const [sweepBalance, setSweepBalance] = useState(0);
  const [isSweeping, setIsSweeping] = useState(false);

  const checkWIFBalance = async (wif: string) => {
    const balance = await getWifBalance(wif);
    if (balance === undefined) {
      addSnackbar('Error checking balance. Please ensure the WIF key is valid.', 'error');
      return;
    }
    if (balance === 0) {
      addSnackbar('No balance found for this WIF key', 'info');
      setSweepBalance(balance);
      return;
    }

    addSnackbar(`Balance found: ${balance / BSV_DECIMAL_CONVERSION} BSV`, 'success');
    setSweepBalance(balance);
  };

  const sweepFunds = async () => {
    try {
      if (!wifKey) return;
      setIsSweeping(true);
      const res = await sweepWif(wifKey);
      if (res?.txid) {
        addSnackbar('Successfully swept funds to your wallet', 'success');
        handleResetSweep();
        return;
      } else {
        addSnackbar('Error sweeping funds. Please try again.', 'error');
      }
    } catch (error) {
      addSnackbar('Error sweeping funds. Please try again.', 'error');
      console.error('Sweep error:', error);
    } finally {
      setIsSweeping(false);
    }
  };

  const handleWifChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const wif = e.target.value;
    if (!wif) return;
    checkWIFBalance(wif);
    setWifKey(e.target.value);
  };

  const handleResetSweep = () => {
    setWifKey('');
    setSweepBalance(0);
    setIsSweeping(false);
    setPage('main');
  };

  const getLockData = async () => {
    setIsProcessing(true);
    const chainInfo = await getChainInfo.execute(apiContext, {});
    const height = chainInfo?.blocks ?? 0;
    setCurrentBlockHeight(height);

    const result = await wallet!.listOutputs({ basket: 'lock', limit: 10000 });
    const txos: Txo[] = [];
    for (const o of result.outputs) {
      const outpoint = new Outpoint(o.outpoint.replace('.', '_'));
      const output = {
        lockingScript: Script.fromHex(o.lockingScript || ''),
        satoshis: o.satoshis,
      };
      const txo = await wallet!.parseOutput(output, outpoint);
      txos.push(txo);
    }
    setLockedUtxos(txos);
    setIsProcessing(false);
  };

  useEffect(() => {
    if (page === 'unlock' && identityAddress) {
      getLockData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityAddress, page]);

  useEffect(() => {
    if (!satAmount) return;
    setDidSubmit(true);
  }, [satAmount]);

  const handleSubmit = (amount: number) => {
    if (!amount || !exchangeRate) return;

    const satAmount = Math.round((amount / exchangeRate) * BSV_DECIMAL_CONVERSION);
    setSatAmount(satAmount);
  };

  const handleDecode = async () => {
    setIsProcessing(true);
    try {
      const tx = getTxFromRawTxFormat(rawTx, transactionFormat);
      const data = await wallet!.parseTransaction(tx);
      setTxData(data);
      let userSatsOut = data.spends.reduce((acc, spend) => {
        if (spend.owner && [bsvAddress, ordAddress, identityAddress].includes(spend.owner)) {
          return acc + BigInt(spend.output.satoshis || 0);
        }
        return acc;
      }, 0n);

      // how much did the user get back from the tx
      userSatsOut = data.txos.reduce((acc, txo) => {
        if (txo.owner && [bsvAddress, ordAddress, identityAddress].includes(txo.owner)) {
          return acc - BigInt(txo.output.satoshis || 0);
        }
        return acc;
      }, userSatsOut);

      setSatsOut(Number(userSatsOut));
      setIsProcessing(false);
      setPage('decode');
    } catch (error) {
      console.error('Decode error:', error);
      addSnackbar('An error occurred while decoding the transaction', 'error');
      setIsProcessing(false);
    }
  };

  const handleBroadcast = async () => {
    if (!rawTx || !transactionFormat) return;
    try {
      setIsBroadcasting(true);
      setIsProcessing(true);
      const tx = getTxFromRawTxFormat(rawTx, transactionFormat);
      await wallet!.broadcast(tx, 'manual');
      addSnackbar('Transaction broadcasted successfully', 'success');
      setPage('decode-broadcast');
    } catch (error) {
      console.log(error);
      addSnackbar('An error occurred while broadcasting the transaction', 'error');
      setPage('decode-broadcast');
    } finally {
      setIsBroadcasting(false);
      setIsProcessing(false);
    }
  };

  const handleUnlock = async () => {
    try {
      setIsProcessing(true);
      const res = await unlockBsv.execute(apiContext, {});
      if (!res?.txid) {
        addSnackbar(`Error unlocking funds. ${res?.error ?? 'Please try again.'}`, 'error');
        return;
      }

      addSnackbar('Funds unlocked successfully', 'success');
    } catch (error) {
      console.error('Unlock error:', error);
    } finally {
      setIsProcessing(false);
      getLockData();
    }
  };

  const handleBlockHeightChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateChoice = new Date(e.target.value).getTime();
    const blockCount = Math.ceil((dateChoice - Date.now()) / 1000 / 60 / 10);
    const chainInfo = await getChainInfo.execute(apiContext, {});
    const currentHeight = chainInfo?.blocks ?? 0;
    const blockHeight = currentHeight + blockCount;
    setLockBlockHeight(blockHeight);
  };

  const handleLockBsv = async () => {
    try {
      if (!identityAddress) return;
      if (!lockBsvAmount || !lockBlockHeight) throw new Error('Invalid lock amount or block height');
      if (!lockPassword) throw new Error('Please enter a password');
      setIsProcessing(true);
      const chainInfo = await getChainInfo.execute(apiContext, {});
      const currentHeight = chainInfo?.blocks ?? 0;
      if (currentHeight >= lockBlockHeight) {
        throw new Error('Invalid block height. Please choose a future block height.');
      }
      const sats = Math.round(lockBsvAmount * BSV_DECIMAL_CONVERSION);
      const res = await lockBsv.execute(apiContext, {
        locks: [{ lockAddress: identityAddress, until: lockBlockHeight, satoshis: sats }],
      });

      if (!res?.txid) throw new Error(`${res?.error ?? 'An error occurred. Please try again.'}`);

      addSnackbar('Funds locked successfully', 'success');
      setLockBlockHeight(0);
      setLockBsvAmount(null);
    } catch (error) {
      console.error('Lock error:', error);
      addSnackbar(`${error ?? 'An error has occurred!'}`, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const main = (
    <>
      <Show when={theme.settings.walletName === 'Yours'}>
        <AppsRow
          name="Support Yours"
          description="Fund Yours Wallet's open source developers"
          onClick={() => setPage('sponsor')}
          jsxElement={<RightChevron color={theme.color.global.contrast} />}
        />
      </Show>
      <AppsRow
        name="Decode/Broadcast"
        description="Decode and broadcast raw transactions"
        onClick={() => setPage('decode-broadcast')}
        jsxElement={<RightChevron color={theme.color.global.contrast} />}
      />
      <Show when={theme.settings.services.locks}>
        <AppsRow
          name="Lock BSV"
          description="Lock your coins for a set period of time"
          onClick={() => setPage('lock-page')}
          jsxElement={<RightChevron color={theme.color.global.contrast} />}
        />
      </Show>
      <Show when={theme.settings.services.locks}>
        <AppsRow
          name="Pending Locks"
          description="View the pending coins you've locked"
          onClick={() => setPage('unlock')}
          jsxElement={<RightChevron color={theme.color.global.contrast} />}
        />
      </Show>
      <Show when={theme.settings.services.apps}>
        <AppsRow
          name="Discover Apps"
          description={`Meet the apps using ${theme.settings.walletName} Wallet`}
          onClick={() => setPage('discover-apps')}
          jsxElement={<RightChevron color={theme.color.global.contrast} />}
        />
      </Show>
      <AppsRow
        name="Sweep Private Key"
        description="Import funds from WIF private key"
        onClick={() => setPage('sweep-wif')}
        jsxElement={<RightChevron color={theme.color.global.contrast} />}
      />
      <AppsRow
        name="Contribute or integrate"
        description="All the tools you need to get involved"
        onClick={() => window.open(theme.settings.repo, '_blank')}
        jsxElement={
          <FaExternalLinkAlt color={theme.color.global.contrast} size={'1rem'} style={{ margin: '0.5rem' }} />
        }
      />
    </>
  );

  const headerLockDetailsRow = (
    <LockDetailsContainer>
      <LockDetailsHeaderText style={{ textAlign: 'left' }} theme={theme}>
        TxId
      </LockDetailsHeaderText>
      <LockDetailsHeaderText style={{ textAlign: 'right' }} theme={theme}>
        Blocks Left
      </LockDetailsHeaderText>
      <LockDetailsHeaderText style={{ textAlign: 'right' }} theme={theme}>
        Amount
      </LockDetailsHeaderText>
    </LockDetailsContainer>
  );

  const lockPage = (
    <PageWrapper $marginTop={'0'}>
      <HeaderText style={{ marginBottom: '1rem' }} theme={theme}>
        Lock BSV
      </HeaderText>
      <Text theme={theme} style={{ marginBottom: '1rem' }}>
        Lock your BSV for a set period of time. This will prevent you from spending them until the lock expires.
      </Text>
      <Input
        theme={theme}
        placeholder={'Enter BSV Amount'}
        type="number"
        min="0.00000001"
        value={lockBsvAmount !== null && lockBsvAmount !== undefined ? lockBsvAmount : ''}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const inputValue = e.target.value;
          if (inputValue === '') {
            setLockBsvAmount(null);
          } else {
            setLockBsvAmount(parseFloat(inputValue));
          }
        }}
      />
      <DateTimePicker theme={theme} onChange={handleBlockHeightChange} />
      <Input
        theme={theme}
        placeholder={'Password'}
        type="password"
        value={lockPassword}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLockPassword(e.target.value)}
      />
      <Button
        style={{ margin: '1rem' }}
        theme={theme}
        type="primary"
        label={
          isProcessing
            ? 'Locking...'
            : `${lockBlockHeight ? `Lock until block ${formatNumberWithCommasAndDecimals(lockBlockHeight, 0)}` : 'Lock'}`
        }
        onClick={handleLockBsv}
        disabled={isProcessing}
      />
      <Button
        style={{ margin: '1rem' }}
        theme={theme}
        type="secondary"
        label={'Go back'}
        onClick={() => setPage('main')}
      />
    </PageWrapper>
  );

  const unlockPage = (
    <PageWrapper $marginTop={'0'}>
      <HeaderText style={{ marginBottom: '1rem' }} theme={theme}>
        Pending Locks
      </HeaderText>
      {headerLockDetailsRow}
      {lockedUtxos
        .sort((a, b) => {
          const aLock = a.data.lock?.data as unknown as LockData | undefined;
          const bLock = b.data.lock?.data as unknown as LockData | undefined;
          return Number(aLock?.until ?? 0) - Number(bLock?.until ?? 0);
        })
        .map((u) => {
          const lockData = u.data.lock?.data as unknown as LockData | undefined;
          const blocksRemaining = Number(lockData?.until ?? 0) - currentBlockHeight;
          const satoshis = BigInt(u.output.satoshis || 0);
          return (
            <LockDetailsContainer key={u.outpoint.txid}>
              <LockDetailsText style={{ textAlign: 'left' }} theme={theme}>
                {truncate(u.outpoint.txid, 4, 4)}
              </LockDetailsText>
              <LockDetailsText style={{ textAlign: 'center' }} theme={theme}>
                {blocksRemaining < 0 ? '0' : blocksRemaining}
              </LockDetailsText>
              <LockDetailsText style={{ textAlign: 'right' }} theme={theme}>
                {satoshis < 1000n
                  ? `${satoshis} ${satoshis > 1n ? 'sats' : 'sat'}`
                  : `${Number(satoshis) / BSV_DECIMAL_CONVERSION} BSV`}
              </LockDetailsText>
            </LockDetailsContainer>
          );
        })}

      <Button style={{ margin: '1rem' }} theme={theme} type="primary" label={'Unlock Funds'} onClick={handleUnlock} />
      <Button
        style={{ margin: '1rem' }}
        theme={theme}
        type="secondary"
        label={'Go back'}
        onClick={() => setPage('main')}
      />
    </PageWrapper>
  );

  const discoverAppsPage = (
    <PageWrapper $marginTop={featuredApps.length === 0 ? '10rem' : '0'}>
      <Show when={featuredApps.length > 0} whenFalseContent={<Text theme={theme}>No apps</Text>}>
        <Text theme={theme} style={{ marginBottom: 0 }}>
          If your app has integrated Yours Wallet but is not listed,{' '}
          <a
            href={theme.settings.repo}
            rel="noreferrer"
            target="_blank"
            style={{
              color: theme.color.global.contrast,
            }}
          >
            let us know!
          </a>
        </Text>
        <ScrollableContainer>
          {featuredApps.map((app, idx) => {
            return (
              <DiscoverAppsRow key={app.name + idx} theme={theme} onClick={() => window.open(app.link, '_blank')}>
                <ImageAndDomain>
                  <AppIcon src={app.icon} />
                  <DiscoverAppsText theme={theme}>{app.name}</DiscoverAppsText>
                </ImageAndDomain>
                <FaExternalLinkAlt color={theme.color.global.contrast} size={'1rem'} style={{ margin: '0.5rem' }} />
              </DiscoverAppsRow>
            );
          })}
          <Button
            style={{ marginTop: '2rem' }}
            theme={theme}
            type="secondary"
            label={'Go back'}
            onClick={() => setPage('main')}
          />
        </ScrollableContainer>
      </Show>
    </PageWrapper>
  );

  const generateButtons = (amounts: string[]) => {
    return amounts.map((amt, idx) => {
      return (
        <Button
          key={`${amt}_${idx}`}
          theme={theme}
          type="secondary-outline"
          label={amt === 'Other' ? amt : `$${amt}`}
          onClick={() => {
            if (amt === 'Other') {
              setOtherIsSelected(true);
            } else {
              handleSubmit(Number(amt));
            }
          }}
        />
      );
    });
  };

  const sponsorPage = (
    <PageWrapper $marginTop={'0'}>
      <img src={yoursLogo} alt="Wallet Logo" style={{ width: '3rem', height: '3rem', margin: '0.5rem' }} />
      <HeaderText theme={theme}>Support Project</HeaderText>
      <Text theme={theme} style={{ width: '95%', margin: '0.5rem 0 1rem 0' }}>
        Yours is an open-source initiative, consider supporting its continued development.
      </Text>
      <Show
        when={otherIsSelected}
        whenFalseContent={
          <AmountsWrapper>{generateButtons(['25', '50', '100', '250', '500', 'Other'])}</AmountsWrapper>
        }
      >
        <Input
          theme={theme}
          placeholder={'Enter USD Amount'}
          type="number"
          step="1"
          value={selectedAmount !== null && selectedAmount !== undefined ? selectedAmount : ''}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const inputValue = e.target.value;
            if (inputValue === '') {
              setSelectedAmount(null);
            } else {
              setSelectedAmount(Number(inputValue));
            }
          }}
        />
        <ButtonsWrapper>
          <Button theme={theme} type="secondary-outline" label="Cancel" onClick={() => setOtherIsSelected(false)} />
          <Button theme={theme} type="primary" label="Submit" onClick={() => handleSubmit(Number(selectedAmount))} />
        </ButtonsWrapper>
      </Show>
      <Text theme={theme} style={{ width: '95%', margin: '2rem 0 1rem 0' }}>
        Give Monthly through Yours Wallet's transparent Open Collective (formerly Panda Wallet).
      </Text>
      <Button
        theme={theme}
        type="primary"
        label="View Open Collective"
        onClick={() => window.open('https://opencollective.com/yours-wallet', '_blank')}
      />
      <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('main')} />
    </PageWrapper>
  );

  const thankYouSponsorPage = (
    <PageWrapper $marginTop={'8rem'}>
      <HeaderText theme={theme}>🙏 Thank You</HeaderText>
      <Text theme={theme} style={{ width: '95%', margin: '0.5rem 0 1rem 0' }}>
        Your contribution has been received.
      </Text>
      <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('main')} />
    </PageWrapper>
  );

  const decodeOrBroadcastPage = (
    <PageWrapper $marginTop={'0'}>
      <HeaderText theme={theme}>Decode/Broadcast</HeaderText>
      <Text theme={theme}>Decode or broadcast a raw transaction in various formats</Text>

      <Dropdown
        theme={theme}
        onChange={(e) =>
          setTransactionFormat(e.target.value === 'hex' ? 'tx' : e.target.value === 'beef' ? 'beef' : 'ef')
        }
      >
        <option value="hex">Raw Hex</option>
        <option value="beef">BEEF</option>
        <option value="extended">Extended Format</option>
      </Dropdown>

      <TextArea theme={theme} placeholder="Paste your raw transaction" onChange={(e) => setRawTx(e.target.value)} />

      <ButtonsWrapper>
        <Button theme={theme} type="secondary-outline" label="Decode" onClick={handleDecode} />
        <Button theme={theme} type="primary" label="Broadcast" onClick={handleBroadcast} />
      </ButtonsWrapper>
      <Button
        style={{ margin: '1rem' }}
        theme={theme}
        type="secondary"
        label={'Go back'}
        onClick={() => setPage('main')}
      />
    </PageWrapper>
  );

  const wifSweepPage = (
    <PageWrapper $marginTop={'0'}>
      <HeaderText theme={theme}>Sweep Private Key</HeaderText>
      <Text theme={theme}>Enter a private key in WIF format to sweep all funds to your wallet.</Text>
      <Input theme={theme} placeholder="Enter WIF private key" value={wifKey} onChange={handleWifChange} />

      {sweepBalance > 0 && (
        <SweepInfo theme={theme}>
          <Text theme={theme}>Available to sweep:</Text>
          <Text style={{ fontWeight: 700 }} theme={theme}>
            {sweepBalance / BSV_DECIMAL_CONVERSION} BSV
          </Text>
        </SweepInfo>
      )}

      <ButtonsWrapper>
        <Button
          theme={theme}
          type="secondary-outline"
          label="Cancel"
          onClick={handleResetSweep}
          disabled={isSweeping}
        />
        <Button
          theme={theme}
          type="primary"
          label={isSweeping ? 'Sweeping...' : 'Sweep Funds'}
          onClick={sweepFunds}
          disabled={isSweeping || sweepBalance === 0}
        />
      </ButtonsWrapper>
      <Warning theme={theme}>This will only sweep funds. 1Sat Ordinals could be lost!</Warning>
    </PageWrapper>
  );

  const decode = !!txData && (
    <>
      <TxPreview txData={txData} />
      <Button
        theme={theme}
        type="primary"
        label={`Broadcast - ${satsOut > 0 ? satsOut / BSV_DECIMAL_CONVERSION : 0} BSV`}
        onClick={handleBroadcast}
      />
      <Button theme={theme} type="secondary-outline" label="Cancel" onClick={() => setPage('decode-broadcast')} />
    </>
  );

  return (
    <Content>
      <TopNav />
      <Show when={isProcessing && page === 'unlock'}>
        <PageLoader theme={theme} message={'Gathering info...'} />
      </Show>
      <Show when={isProcessing && page === 'lock-page'}>
        <PageLoader theme={theme} message={'Locking...'} />
      </Show>
      <Show when={(isProcessing && page === 'decode-broadcast') || (isProcessing && page === 'decode')}>
        <PageLoader
          theme={theme}
          message={isBroadcasting ? 'Broadcasting transaction...' : 'Decoding transaction...'}
        />
      </Show>
      <Show when={!isProcessing && page === 'decode-broadcast'}>{decodeOrBroadcastPage}</Show>
      <Show when={!isProcessing && page === 'decode'}>{decode}</Show>
      <Show when={page === 'main'}>{main}</Show>
      <Show when={page === 'sponsor' && !didSubmit}>{sponsorPage}</Show>
      <Show when={page === 'sponsor-thanks'}>{thankYouSponsorPage}</Show>
      <Show when={!isProcessing && page === 'unlock'}>{unlockPage}</Show>
      <Show when={!isProcessing && page === 'lock-page'}>{lockPage}</Show>
      <Show when={page === 'discover-apps'}>{discoverAppsPage}</Show>
      <Show when={page === 'sweep-wif'}>{wifSweepPage}</Show>
      <Show when={page === 'sponsor' && didSubmit}>
        <BsvSendRequest
          request={[{ address: YOURS_DEV_WALLET, satoshis: satAmount }]}
          popupId={undefined}
          onResponse={() => {
            setDidSubmit(false);
            setPage('sponsor-thanks');
          }}
          requestWithinApp
        />
      </Show>
    </Content>
  );
};
