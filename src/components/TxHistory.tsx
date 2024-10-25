import { keyframes, styled } from 'styled-components';
import { Bsv20 } from 'yours-wallet-provider';
import { Theme, WhiteLabelTheme } from '../theme.types';
import { useServiceContext } from '../hooks/useServiceContext';
import { truncate } from '../utils/format';
import { useEffect, useMemo, useState } from 'react';
import { ToggleSwitch } from './ToggleSwitch';
import { HeaderText, Text } from './Reusable';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { GENERIC_TOKEN_ICON } from '../utils/constants';
import { FaTimes } from 'react-icons/fa';
import { TxLog } from 'spv-store';

const slideIn = keyframes`
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
`;

const slideOut = keyframes`
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
`;

const Container = styled.div<{ isSlidingOut: boolean } & WhiteLabelTheme>`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: 100vh;
  overflow-y: auto;
  background-color: ${({ theme }) => theme.color.global.walletBackground};
  z-index: 1000;
  position: absolute;
  animation: ${({ isSlidingOut }) => (isSlidingOut ? slideOut : slideIn)} 0.75s forwards;
`;

const FavoriteRow = styled.div<WhiteLabelTheme>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 95%;
  padding: 0.35rem 1.25rem 0.35rem 0.25rem;
  border-bottom: 1px solid ${({ theme }) => theme.color.global.gray + '50'};
`;

const Icon = styled.img`
  width: 2.25rem;
  height: 2.25rem;
  margin-left: 1rem;
  border-radius: 50%;
`;

const TickerWrapper = styled.div`
  display: flex;
  align-items: center;
`;

const TickerTextWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-left: 1rem;
`;

const BackWrapper = styled.div`
  position: absolute;
  top: 3rem;
  left: 2rem;
`;

const SearchInput = styled.input<WhiteLabelTheme>`
  width: 90%;
  padding: 0.5rem;
  margin: 1rem 0;
  border: 1px solid ${({ theme }) => theme.color.global.gray};
  border-radius: 0.5rem;
  font-size: 0.85rem;
  color: ${({ theme }) => theme.color.global.contrast};
  background-color: ${({ theme }) => theme.color.global.neutral};

  &:focus {
    outline: none;
  }
`;

export type Bsv20TokensListProps = {
  theme: Theme;
  onBack: () => void;
};

export const TxHistory = (props: Bsv20TokensListProps) => {
  const { theme, onBack } = props;
  const [data, setData] = useState<TxLog[]>();
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const { oneSatSPV } = useServiceContext();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const tsx = await oneSatSPV.getRecentTxs();
        setData(tsx);
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []); // ! add dependency

  const handleBackClick = () => {
    setIsSlidingOut(true);
    setTimeout(onBack, 1000); // Give time for animation to finish
  };

  const txsHistory = useMemo(() => data, [data]);

  return (
    <Container theme={theme} isSlidingOut={isSlidingOut}>
      <BackWrapper>
        <FaTimes size={'1.5rem'} color={theme.color.global.contrast} cursor="pointer" onClick={handleBackClick} />
      </BackWrapper>
      <Text style={{ marginTop: '3rem', fontSize: '1.25rem', fontWeight: 700 }} theme={theme}>
        See Last Activity
      </Text>
      {(txsHistory || []).length > 0 ? (
        txsHistory?.map((t) => (
          <FavoriteRow theme={theme} key={t.idx}>
            <TickerWrapper>
              {/* <Icon
                src={
                  t.icon
                    ? `${gorillaPoolService.getBaseUrl(chromeStorageService.getNetwork())}/content/${t.icon}`
                    : GENERIC_TOKEN_ICON
                }
              /> */}
              <p>ICON</p>
              <TickerTextWrapper>
                <HeaderText style={{ fontSize: '0.85rem', marginTop: 0 }} theme={theme}>
                  {t?.source}
                </HeaderText>
                <Text
                  theme={theme}
                  style={{ color: theme.color.global.gray, fontSize: '0.75rem', margin: 0, textAlign: 'left' }}
                >
                  {t?.idx && truncate(t.source!, 5, 5)}
                </Text>
              </TickerTextWrapper>
            </TickerWrapper>
          </FavoriteRow>
        ))
      ) : (
        <Text theme={theme} style={{ marginTop: '1rem', color: theme.color.global.gray }}>
          No tokens found
        </Text>
      )}
    </Container>
  );
};
