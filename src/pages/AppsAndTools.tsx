// IMPORTANT NOTE: Uncomment everything that is commented back out to re-enable the sponser page should it ever make sense

import { useEffect, useState } from 'react';
import styled from 'styled-components';
import externalLink from '../assets/external-link.svg';
import { Button } from '../components/Button';
import { ForwardButton as RightChevron } from '../components/ForwardButton';
import { PageLoader } from '../components/PageLoader';
// import yoursLogo from '../assets/yours-logo.png';
// import { HeaderText, Text, YoursLogo } from '../components/Reusable';
// import { HeaderText, Text } from '../components/Reusable';
import { HeaderText, Text } from '../components/Reusable';
import { SettingsRow as AppsRow } from '../components/SettingsRow';
import { Show } from '../components/Show';
import { OrdinalTxo } from '../hooks/ordTypes';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useBsv } from '../hooks/useBsv';
import { useContracts } from '../hooks/useContracts';
import { useGorillaPool } from '../hooks/useGorillaPool';
import { useTheme } from '../hooks/useTheme';
import { useWhatsOnChain } from '../hooks/useWhatsOnChain';
import { ColorThemeProps } from '../theme';
// import { BSV_DECIMAL_CONVERSION, PANDA_DEV_WALLET, PROVIDER_DOCS_URL, featuredApps } from '../utils/constants';
import { BSV_DECIMAL_CONVERSION, featuredApps, YOURS_GITHUB_REPOS, PANDA_GITHUB_REPO } from '../utils/constants';
import { truncate } from '../utils/format';
// import { BsvSendRequest } from './requests/BsvSendRequest';
import { TopNav } from '../components/TopNav';

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

// const AmountsWrapper = styled.div`
//   display: flex;
//   align-items: center;
//   justify-content: center;
//   flex-wrap: wrap;
// `;

// const ButtonsWrapper = styled.div`
//   display: flex;
//   align-items: center;
//   justify-content: center;
//   width: 90%;
// `;

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
  font-size: 0.85rem;
  font-weight: 600;
`;

type AppsPage = 'main' | 'sponsor' | 'sponsor-thanks' | 'discover-apps' | 'unlock';

export const AppsAndTools = () => {
  const { theme } = useTheme();
  const { setSelected, query } = useBottomMenu();
  // const { exchangeRate, identityAddress } = useBsv();
  const { identityAddress } = useBsv();
  const { getLockedUtxos, getSpentTxids } = useGorillaPool();
  const { getChainInfo } = useWhatsOnChain();
  const { isProcessing, setIsProcessing } = useContracts();
  const [page, setPage] = useState<AppsPage>(query === 'pending-locks' ? 'unlock' : 'main');
  // const [otherIsSelected, setOtherIsSelected] = useState(false);
  // const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  // const [satAmount, setSatAmount] = useState(0);
  // const [didSubmit, setDidSubmit] = useState(false);
  const [lockedUtxos, setLockedUtxos] = useState<OrdinalTxo[]>([]);
  const [currentBlockHeight, setCurrentBlockHeight] = useState(0);

  const getLockData = async () => {
    setIsProcessing(true);
    if (!identityAddress) throw Error('Identity address missing!');
    const chainInfo = await getChainInfo();
    let lockedTxos = await getLockedUtxos(identityAddress);
    const blockHeight = Number(chainInfo?.blocks);
    if (blockHeight) setCurrentBlockHeight(blockHeight);
    const outpoints = lockedTxos.map((txo) => txo.outpoint.toString());
    const spentTxids = await getSpentTxids(outpoints);
    lockedTxos = lockedTxos.filter((txo) => !spentTxids.get(txo.outpoint.toString()));
    if (lockedTxos.length > 0) setLockedUtxos(lockedTxos);
    setIsProcessing(false);
  };

  useEffect(() => {
    if (page === 'unlock' && identityAddress) {
      getLockData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityAddress, page]);

  useEffect(() => {
    setSelected('apps');
  }, [setSelected]);

  // useEffect(() => {
  //   if (!satAmount) return;
  //   setDidSubmit(true);
  // }, [satAmount]);

  // const handleSubmit = (amount: number) => {
  //   if (!amount || !exchangeRate) return;

  //   const satAmount = Math.round((amount / exchangeRate) * BSV_DECIMAL_CONVERSION);
  //   setSatAmount(satAmount);
  // };

  const main = (
    <>
      {/* <AppsRow
        name="Make a Difference"
        description="Fund Panda Wallet's open source developers"
        onClick={() => setPage('sponsor')}
        jsxElement={<RightChevron />}
      /> */}
      <AppsRow
        name="Pending Locks"
        description="View the pending coins you've locked"
        onClick={() => setPage('unlock')}
        jsxElement={<RightChevron />}
      />
      <AppsRow
        name="Discover Apps"
        description="Meet the apps using Panda Wallet"
        onClick={() => setPage('discover-apps')}
        jsxElement={<RightChevron />}
      />
      <AppsRow
        name="Contribute or integrate"
        description="All the tools you need to get involved"
        onClick={() => window.open(PANDA_GITHUB_REPO, '_blank')}
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
    <PageWrapper $marginTop={'0'}>
      <HeaderText style={{ marginBottom: '1rem' }} theme={theme}>
        Pending Locks
      </HeaderText>
      {headerLockDetailsRow}
      {lockedUtxos
        .sort((a, b) => Number(a.data?.lock?.until) - Number(b.data?.lock?.until))
        .map((u) => {
          const blocksRemaining = Number(u.data?.lock?.until) - currentBlockHeight;
          return (
            <LockDetailsContainer key={u.txid}>
              <LockDetailsText style={{ textAlign: 'left' }} theme={theme}>
                {truncate(u.txid, 4, 4)}
              </LockDetailsText>
              <LockDetailsText style={{ textAlign: 'center' }} theme={theme}>
                {blocksRemaining < 0 ? '0' : blocksRemaining}
              </LockDetailsText>
              <LockDetailsText style={{ textAlign: 'right' }} theme={theme}>
                {u.satoshis < 1000
                  ? `${u.satoshis} ${u.satoshis > 1 ? 'sats' : 'sat'}`
                  : `${u.satoshis / BSV_DECIMAL_CONVERSION} BSV`}
              </LockDetailsText>
            </LockDetailsContainer>
          );
        })}
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
          <a href={YOURS_GITHUB_REPOS} rel="noreferrer" target="_blank" style={{ color: theme.white }}>
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

  // const generateButtons = (amounts: string[]) => {
  //   return amounts.map((amt, idx) => {
  //     return (
  //       <Button
  //         key={`${amt}_${idx}`}
  //         theme={theme}
  //         style={{ maxWidth: '5rem' }}
  //         type="primary"
  //         label={amt === 'Other' ? amt : `$${amt}`}
  //         onClick={() => {
  //           if (amt === 'Other') {
  //             setOtherIsSelected(true);
  //           } else {
  //             handleSubmit(Number(amt));
  //           }
  //         }}
  //       />
  //     );
  //   });
  // };

  // const sponsorPage = (
  //   <PageWrapper $marginTop={'0'}>
  //     <YoursLogo src={yoursLogo} />
  //     <HeaderText theme={theme}>Fund Developers</HeaderText>
  //     <Text theme={theme} style={{ width: '95%', margin: '0.5rem 0 1rem 0' }}>
  //       Yours is an open-source initiative, consider supporting the devs.
  //     </Text>
  //     <Show
  //       when={otherIsSelected}
  //       whenFalseContent={
  //         <AmountsWrapper>{generateButtons(['25', '50', '100', '250', '500', 'Other'])}</AmountsWrapper>
  //       }
  //     >
  //       <Input
  //         theme={theme}
  //         placeholder={'Enter USD Amount'}
  //         type="number"
  //         step="1"
  //         value={selectedAmount !== null && selectedAmount !== undefined ? selectedAmount : ''}
  //         onChange={(e) => {
  //           const inputValue = e.target.value;
  //           if (inputValue === '') {
  //             setSelectedAmount(null);
  //           } else {
  //             setSelectedAmount(Number(inputValue));
  //           }
  //         }}
  //       />
  //       <ButtonsWrapper>
  //         <Button theme={theme} type="warn" label="Cancel" onClick={() => setOtherIsSelected(false)} />
  //         <Button theme={theme} type="primary" label="Submit" onClick={() => handleSubmit(Number(selectedAmount))} />
  //       </ButtonsWrapper>
  //     </Show>
  //     <Text theme={theme} style={{ width: '95%', margin: '2rem 0 1rem 0' }}>
  //       Give Monthly through Panda Wallet's transparent Open Collective.
  //     </Text>
  //     <Button
  //       theme={theme}
  //       type="secondary-outline"
  //       label="View Open Collective"
  //       onClick={() => window.open('https://opencollective.com/panda-wallet', '_blank')}
  //     />
  //     <Button theme={theme} type="secondary" label={'Go back'} onClick={() => setPage('main')} />
  //   </PageWrapper>
  // );

  // const thankYouSponsorPage = (
  //   <PageWrapper $marginTop={'8rem'}>
  //     <BackButton onClick={() => setPage('main')} />
  //     <HeaderText theme={theme}>🙏 Thank You</HeaderText>
  //     <Text theme={theme} style={{ width: '95%', margin: '0.5rem 0 1rem 0' }}>
  //       Your contribution has been received.
  //     </Text>
  //   </PageWrapper>
  // );

  return (
    <Content>
      <TopNav />
      <Show when={isProcessing && page === 'unlock'}>
        <PageLoader theme={theme} message={'Gathering info...'} />
      </Show>
      <Show when={page === 'main'}>{main}</Show>
      {/* <Show when={page === 'sponsor' && !didSubmit}>{sponsorPage}</Show> */}
      {/* <Show when={page === 'sponsor-thanks'}>{thankYouSponsorPage}</Show> */}
      <Show when={!isProcessing && page === 'unlock'}>{unlockPage}</Show>
      <Show when={page === 'discover-apps'}>{discoverAppsPage}</Show>
      {/* <Show when={page === 'sponsor' && didSubmit}>
        <BsvSendRequest
          web3Request={[{ address: PANDA_DEV_WALLET, satoshis: satAmount }]}
          popupId={undefined}
          onResponse={() => {
            setDidSubmit(false);
            setPage('sponsor-thanks');
          }}
          requestWithinApp
        />
      </Show> */}
    </Content>
  );
};
