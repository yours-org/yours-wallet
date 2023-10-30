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
import { useBsv } from '../hooks/useBsv';
import { Input } from '../components/Input';
import { BSV_DECIMAL_CONVERSION, PANDA_DEV_WALLET } from '../utils/constants';
import { BsvSendRequest } from './requests/BsvSendRequest';

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

const ButtonsWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 90%;
`;

type AppsPage = 'main' | 'sponsor' | 'sponsor-thanks';

export const Apps = () => {
  const { theme } = useTheme();
  const { setSelected } = useBottomMenu();
  const { exchangeRate } = useBsv();
  const [page, setPage] = useState<AppsPage>('main');
  const [otherIsSelected, setOtherIsSelected] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [satAmount, setSatAmount] = useState(0);
  const [didSubmit, setDidSubmit] = useState(false);

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
      <HeaderText theme={theme}>Fund Development</HeaderText>
      <Text theme={theme} style={{ width: '95%', margin: '0.5rem 0 1rem 0' }}>
        Panda Wallet is built by open-source contributors and relies on sponsors to fund on-going development.
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
          {page === 'sponsor' || page === 'sponsor-thanks' ? '' : 'Apps & Tools'}
        </HeaderText>
      </HeaderWrapper>
      <Show when={page === 'main'}>{main}</Show>
      <Show when={page === 'sponsor' && !didSubmit}>{sponsorPage}</Show>
      <Show when={page === 'sponsor-thanks'}>{thankYouSponsorPage}</Show>
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
