import { useEffect, useState } from 'react';
import styled from 'styled-components';
import externalLink from '../assets/external-link.svg';
import { BackButton } from '../components/BackButton';
import { Button } from '../components/Button';
import { ForwardButton } from '../components/ForwardButton';
import { Input } from '../components/Input';
import { PageLoader } from '../components/PageLoader';
import { PandaHead } from '../components/PandaHead';
import { HeaderText, Text } from '../components/Reusable';
import { SettingsRow as AppsRow } from '../components/SettingsRow';
import { Show } from '../components/Show';
import { OrdinalTxo } from '../hooks/ordTypes';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useBsv } from '../hooks/useBsv';
import { useContracts } from '../hooks/useContracts';
import { useGorillaPool } from '../hooks/useGorillaPool';
import { usePasswordSetting } from '../hooks/usePasswordSetting';
import { useSnackbar } from '../hooks/useSnackbar';
import { useTheme } from '../hooks/useTheme';
import { useWhatsOnChain } from '../hooks/useWhatsOnChain';
import { ColorThemeProps } from '../theme';
import { BSV_DECIMAL_CONVERSION, PANDA_DEV_WALLET, PROVIDER_DOCS_URL, featuredApps } from '../utils/constants';
import { truncate } from '../utils/format';
import { sleep } from '../utils/sleep';
import { BsvSendRequest } from './requests/BsvSendRequest';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: calc(75%);
  overflow-y: auto;
  overflow-x: hidden;
`;

const HeaderWrapper = styled.div`
  position: absolute;
  top: 1rem;
`;

const PageWrapper = styled.div<{ $marginTop: string }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: ${(props) => props.$marginTop};
  width: 100%;
`;

const AmountsWrapper = styled.div`
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
`;

const DiscoverAppsRow = styled.div<ColorThemeProps>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: ${({ theme }) => theme.darkAccent};
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

const DiscoverAppsText = styled(Text)<ColorThemeProps>`
  color: ${({ theme }) => theme.white};
  margin: 0;
  font-weight: 600;
  text-align: left;
`;

const ExternalLinkIcon = styled.img`
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;
`;

const LockDetailsContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem;
  width: 80%;
`;

const LockDetailsText = styled(Text)<ColorThemeProps>`
  margin: 0;
  color: ${(props) => props.theme.white};
`;

const LockDetailsHeaderText = styled(LockDetailsText)`
  font-size: 1rem;
  font-weight: 600;
`;

type AppsPage = 'main' | 'sponsor' | 'sponsor-thanks' | 'discover-apps' | 'unlock';

export const AppsAndTools = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const { exchangeRate, lockingAddress } = useBsv();
  const { getLockedUtxos, getSpentTxids } = useGorillaPool();
  const { getChainInfo } = useWhatsOnChain();
  const { isPasswordRequired } = usePasswordSetting();
  const { addSnackbar } = useSnackbar();
  const { unlock, isProcessing, setIsProcessing } = useContracts();
  const [page, setPage] = useState<AppsPage>('main');
  const [otherIsSelected, setOtherIsSelected] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [satAmount, setSatAmount] = useState(0);
  const [didSubmit, setDidSubmit] = useState(false);
  const [lockedUtxos, setLockedUtxos] = useState<OrdinalTxo[]>([]);
  const [currentBlockHeight, setCurrentBlockHeight] = useState(0);
  const [totalLocked, setTotalLocked] = useState(0);
  const [totalUnlockable, setTotalUnlockable] = useState(0);
  const [showingLockDetails, setShowingLockDetails] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    const getLockData = async () => {
      setIsProcessing(true);
      if (!lockingAddress) throw Error('Locking address missing!');
      const chainInfo = await getChainInfo();
      let lockedTxos = await getLockedUtxos(lockingAddress);
      const blockHeight = Number(chainInfo?.blocks);
      if (blockHeight) setCurrentBlockHeight(blockHeight);
      if (lockedTxos.length > 0) setLockedUtxos(lockedTxos);
      const outpoints = lockedTxos.map((txo) => txo.outpoint.toString());
      const spentTxids = await getSpentTxids(outpoints);
      console.log(spentTxids);
      lockedTxos = lockedTxos.filter((txo) => !spentTxids.includes(txo.outpoint.toString()));
      const lockTotal = lockedTxos.reduce((a: number, utxo: OrdinalTxo) => a + utxo.satoshis, 0);
      const unlockableTotal = lockedTxos.reduce((a: number, utxo: OrdinalTxo) => {
        const theBlockCoinsUnlock = Number(utxo?.data?.lock?.until);
        if (blockHeight && theBlockCoinsUnlock) {
          return theBlockCoinsUnlock <= blockHeight ? a + utxo.satoshis : 0;
        } else {
          return 0;
        }
      }, 0);
      setTotalLocked(lockTotal);
      setTotalUnlockable(unlockableTotal);
      setIsProcessing(false);
    };

    if (page === 'unlock' && lockingAddress) {
      getLockData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockingAddress, page]);

  useEffect(() => {
    setSelected('apps');
  }, [setSelected]);

  useEffect(() => {
    if (!satAmount) return;
    setDidSubmit(true);
  }, [satAmount]);

  const handleSubmit = (amount: number) => {
    if (!amount || !exchangeRate) return;

    const satAmount = Math.round((amount / exchangeRate) * BSV_DECIMAL_CONVERSION);
    setSatAmount(satAmount);
  };

  const toggleShowingLockDetails = () => setShowingLockDetails(!showingLockDetails);

  const handleUnlock = async () => {
    setIsProcessing(true);
    setIsUnlocking(true);
    await sleep(25);

    if (!totalUnlockable) {
      addSnackbar('There are no coins to unlock!', 'info');
      setIsProcessing(false);
      setIsUnlocking(false);
      return;
    }

    if (!passwordConfirm && isPasswordRequired) {
      addSnackbar('You must enter a password!', 'error');
      setIsProcessing(false);
      setIsUnlocking(false);
      return;
    }

    const unlockRes = await unlock(lockedUtxos, passwordConfirm);
    if (!unlockRes.txid || unlockRes.error) {
      const message =
        unlockRes.error === 'invalid-password'
          ? 'Invalid Password!'
          : unlockRes.error === 'insufficient-funds'
          ? 'Insufficient Funds!'
          : unlockRes.error === 'broadcast-error'
          ? 'There was an error broadcasting the tx!'
          : 'An unknown error has occurred! Try again.';

      addSnackbar(message, 'error');
      setPasswordConfirm('');
      setIsUnlocking(false);
      return;
    }

    addSnackbar('Coins Unlocked Successfully!', 'success');
    setIsUnlocking(false);
  };

  const main = (
    <>
      <AppsRow
        name="Make a Difference 🙏"
        description="Fund Panda Wallet's open source developers"
        onClick={() => setPage('sponsor')}
        jsxElement={<ForwardButton />}
      />
      <AppsRow
        name="Unlock Coins 🔐"
        description="Unlock the coins you've locked on Hodlocker"
        onClick={() => setPage('unlock')}
        jsxElement={<ForwardButton />}
      />
      <AppsRow
        name="Discover Apps 🤩"
        description="Meet the apps using Panda Wallet"
        onClick={() => setPage('discover-apps')}
        jsxElement={<ForwardButton />}
      />
      <AppsRow
        name="Integrate Panda Wallet 🛠"
        description="The tools you need to integrate Panda Wallet"
        onClick={() => window.open(PROVIDER_DOCS_URL, '_blank')}
        jsxElement={<ExternalLinkIcon src={externalLink} />}
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

  const unlockPage = (
    <PageWrapper $marginTop={'1rem'}>
      <BackButton onClick={() => setPage('main')} />
      <HeaderText style={{ fontSize: '2.5rem' }} theme={theme}>
        🔐
      </HeaderText>
      <HeaderText theme={theme}>Unlock Coins</HeaderText>
      <Text theme={theme} style={{ width: '95%', margin: '0.5rem 0 1rem 0' }}>
        Unlock coins you've previously locked up!
      </Text>
      <Text theme={theme} style={{ margin: '0.25rem', color: theme.white, fontSize: '1rem', fontWeight: 600 }}>
        {`Total Locked: ${totalLocked / BSV_DECIMAL_CONVERSION} BSV`}
      </Text>
      <Text theme={theme} style={{ margin: '0.25rem 0 1rem', color: theme.white, fontSize: '1rem', fontWeight: 600 }}>
        {`Unlockable: ${totalUnlockable / BSV_DECIMAL_CONVERSION} BSV`}
      </Text>
      <Show when={isPasswordRequired}>
        <Input
          theme={theme}
          placeholder="Enter Wallet Password"
          type="password"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
        />
      </Show>
      <Button
        theme={theme}
        type="primary"
        label={`Unlock ${totalUnlockable / BSV_DECIMAL_CONVERSION} BSV`}
        onClick={handleUnlock}
      />
      <Button
        theme={theme}
        type="secondary"
        label={showingLockDetails ? 'Hide Pending' : 'Show Pending'}
        onClick={toggleShowingLockDetails}
      />
      <Show when={showingLockDetails}>
        {headerLockDetailsRow}
        {lockedUtxos.map((u) => {
          const blocksRemaining = Number(u.data?.lock?.until) - currentBlockHeight;
          return (
            <Show key={u.txid} when={blocksRemaining > 0}>
              <LockDetailsContainer key={u.txid}>
                <LockDetailsText style={{ textAlign: 'left' }} theme={theme}>
                  {truncate(u.txid, 4, 4)}
                </LockDetailsText>
                <LockDetailsText style={{ textAlign: 'center' }} theme={theme}>
                  {blocksRemaining}
                </LockDetailsText>
                <LockDetailsText style={{ textAlign: 'right' }} theme={theme}>
                  {u.satoshis < 1000
                    ? `${u.satoshis} ${u.satoshis > 1 ? 'sats' : 'sat'}`
                    : `${u.satoshis / BSV_DECIMAL_CONVERSION} BSV`}
                </LockDetailsText>
              </LockDetailsContainer>
            </Show>
          );
        })}
      </Show>
    </PageWrapper>
  );

  const discoverAppsPage = (
    <PageWrapper $marginTop={featuredApps.length === 0 ? '10rem' : '0'}>
      <BackButton onClick={() => setPage('main')} />
      <Show when={featuredApps.length > 0} whenFalseContent={<Text theme={theme}>No apps</Text>}>
        <Text theme={theme} style={{ marginBottom: 0 }}>
          If your app has integrated Panda Wallet but is not listed,{' '}
          <a href="https://twitter.com/wallet_panda" rel="noreferrer" target="_blank" style={{ color: theme.white }}>
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
                <ExternalLinkIcon src={externalLink} />
              </DiscoverAppsRow>
            );
          })}
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
          style={{ maxWidth: '5rem' }}
          type="primary"
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
      <BackButton onClick={() => setPage('main')} />
      <PandaHead width="3rem" />
      <HeaderText theme={theme}>Fund Developers</HeaderText>
      <Text theme={theme} style={{ width: '95%', margin: '0.5rem 0 1rem 0' }}>
        Panda Wallet is an open-source initiative and relies on tips and sponsorships to sustain its development.
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
          onChange={(e) => {
            const inputValue = e.target.value;
            if (inputValue === '') {
              setSelectedAmount(null);
            } else {
              setSelectedAmount(Number(inputValue));
            }
          }}
        />
        <ButtonsWrapper>
          <Button theme={theme} type="warn" label="Cancel" onClick={() => setOtherIsSelected(false)} />
          <Button theme={theme} type="primary" label="Submit" onClick={() => handleSubmit(Number(selectedAmount))} />
        </ButtonsWrapper>
      </Show>
      <Text theme={theme} style={{ width: '95%', margin: '2rem 0 0 0' }}>
        Give Monthly through Panda Wallet's transparent Open Collective (Coming Soon).
      </Text>
      <Button
        theme={theme}
        type="secondary"
        label="View Open Collective"
        onClick={() => window.open('https://opencollective.com/panda-wallet', '_blank')}
      />
    </PageWrapper>
  );

  const thankYouSponsorPage = (
    <PageWrapper $marginTop={'8rem'}>
      <BackButton onClick={() => setPage('main')} />
      <HeaderText theme={theme}>🙏 Thank You</HeaderText>
      <Text theme={theme} style={{ width: '95%', margin: '0.5rem 0 1rem 0' }}>
        Your contribution has been received.
      </Text>
    </PageWrapper>
  );

  return (
    <Content>
      <HeaderWrapper>
        <HeaderText style={{ fontSize: '1.25rem' }} theme={theme}>
          {page === 'sponsor' || page === 'sponsor-thanks' || page === 'unlock'
            ? ''
            : page === 'discover-apps'
            ? 'Discover Apps'
            : 'Apps & Tools'}
        </HeaderText>
      </HeaderWrapper>
      <Show when={isProcessing && page === 'unlock'}>
        <PageLoader theme={theme} message={isUnlocking ? 'Unlocking coins...' : 'Gathering info...'} />
      </Show>
      <Show when={page === 'main'}>{main}</Show>
      <Show when={page === 'sponsor' && !didSubmit}>{sponsorPage}</Show>
      <Show when={page === 'sponsor-thanks'}>{thankYouSponsorPage}</Show>
      <Show when={!isProcessing && page === 'unlock'}>{unlockPage}</Show>
      <Show when={page === 'discover-apps'}>{discoverAppsPage}</Show>
      <Show when={page === 'sponsor' && didSubmit}>
        <BsvSendRequest
          web3Request={[{ address: PANDA_DEV_WALLET, satAmount }]}
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
