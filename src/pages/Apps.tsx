import styled from 'styled-components';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useEffect, useState } from 'react';
import { Show } from '../components/Show';
import { useTheme } from '../hooks/useTheme';
import { SettingsRow as AppsRow } from '../components/SettingsRow';
import { HeaderText, Text } from '../components/Reusable';
import { ForwardButton } from '../components/ForwardButton';
import { BackButton } from '../components/BackButton';
import { PandaHead } from '../components/PandaHead';
import { Button } from '../components/Button';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: calc(75%);
  overflow-y: scroll;
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

type AppsPage = 'main' | 'sponsor';

export const Apps = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const [page, setPage] = useState<AppsPage>('main');

  useEffect(() => {
    setSelected('apps');
  }, [setSelected]);

  const main = (
    <>
      <AppsRow
        name="Sponsor Panda Wallet"
        description="Fund the project's open source developers"
        onClick={() => setPage('sponsor')}
        jsxElement={<ForwardButton />}
      />
    </>
  );

  const generateButtons = (amounts: string[]) => {
    return amounts.map((amt) => {
      return (
        <Button
          key={window.crypto.randomUUID()}
          theme={theme}
          style={{ maxWidth: '5rem' }}
          type="primary"
          label={amt === 'Other' ? amt : `$${amt}`}
        />
      );
    });
  };

  const sponsorPage = (
    <PageWrapper $marginTop={'0'}>
      <BackButton onClick={() => setPage('main')} />
      <PandaHead width="3rem" />
      <HeaderText theme={theme}>Fund Development</HeaderText>
      <Text theme={theme} style={{ width: '95%', margin: '0.5rem 0' }}>
        Panda Wallet is built by dedicated open-source developers and relies on sponsorships to fund on-going
        contributions.
      </Text>
      <AmountsWrapper>{generateButtons(['25', '50', '100', '250', '500', 'Other'])}</AmountsWrapper>
      <Text theme={theme} style={{ width: '95%', margin: '2rem 0 0 0' }}>
        Give Monthly through Panda Wallet's transparent Open Collective.
      </Text>
      <Button
        theme={theme}
        type="secondary"
        label="View Open Collective"
        onClick={() => window.open('https://opencollective.com/panda-wallet', '_blank')}
      />
    </PageWrapper>
  );

  return (
    <Content>
      <HeaderWrapper>
        <HeaderText style={{ fontSize: '1.25rem' }} theme={theme}>
          {page === 'sponsor' ? '' : 'Apps'}
        </HeaderText>
      </HeaderWrapper>
      <Show when={page === 'main'}>{main}</Show>
      <Show when={page === 'sponsor'}>{sponsorPage}</Show>
    </Content>
  );
};
