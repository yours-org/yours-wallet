import { keyframes, styled } from 'styled-components';
import { Theme, WhiteLabelTheme } from '../theme.types';
import { useServiceContext } from '../hooks/useServiceContext';
import { useEffect, useMemo, useState } from 'react';
import { HeaderText, Text } from './Reusable';
import { GENERIC_TOKEN_ICON } from '../utils/constants';
import { FaTimes } from 'react-icons/fa';
import { TxLog } from 'spv-store';
import transactions from './const';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { Button } from './Button';

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
  padding: 0.35rem;
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
  justify-content: between;
`;

const ButtonsWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: between;
  width: 40%;
`;

const TickerTextWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  margin-left: 1rem;
`;

const ContentWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const BackWrapper = styled.div`
  position: absolute;
  top: 3rem;
  left: 2rem;
`;

export type TxHistoryProps = {
  theme: Theme;
  onBack: () => void;
};

const URL_WHATSINCHAIN = 'https://whatsonchain.com/tx/';

export const TxHistory = (props: TxHistoryProps) => {
  const { theme, onBack } = props;
  const [data, setData] = useState<TxLog[]>(); // ! api response
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const { oneSatSPV } = useServiceContext();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const dataTest = transactions;
  const { gorillaPoolService, chromeStorageService } = useServiceContext();

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
    setTimeout(onBack, 1000);
  };

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return dataTest?.slice(startIndex, endIndex);
  }, [currentPage, dataTest]);

  const handleNextPage = () => {
    if (currentPage * itemsPerPage < (dataTest?.length ?? 0)) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleOpenLink = (txid: string) => {
    window.open(`${URL_WHATSINCHAIN}${txid}`, '_blank');
  };

  return (
    <Container theme={theme} isSlidingOut={isSlidingOut}>
      <BackWrapper>
        <FaTimes size={'1.5rem'} color={theme.color.global.contrast} cursor="pointer" onClick={handleBackClick} />
      </BackWrapper>
      <Text style={{ marginTop: '3rem', fontSize: '1.25rem', fontWeight: 700 }} theme={theme}>
        See Last Activity
      </Text>
      {(paginatedData || []).length > 0 ? (
        paginatedData?.map((t) => {
          const summaryEntries = Object.entries(t.summary);

          return (
            <FavoriteRow theme={theme} key={t.idx}>
              <TickerWrapper
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                {summaryEntries.length === 1 ? (
                  <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <Icon
                        src={
                          summaryEntries[0][1].icon
                            ? `${gorillaPoolService.getBaseUrl(chromeStorageService.getNetwork())}/content/${summaryEntries[0][1].icon}`
                            : GENERIC_TOKEN_ICON
                        }
                      />
                      <TickerTextWrapper>
                        <HeaderText style={{ fontSize: '0.85rem', marginTop: 0 }} theme={theme}>
                          {summaryEntries[0][0]}
                        </HeaderText>
                        <Text
                          theme={theme}
                          style={{ color: theme.color.global.gray, fontSize: '0.75rem', margin: 0, textAlign: 'left' }}
                        >
                          {summaryEntries[0][1].amount < 0
                            ? summaryEntries[0][1].amount === -1
                              ? 'Listar'
                              : 'Sent'
                            : summaryEntries[0][1].amount === 0
                              ? 'Cancelled'
                              : 'Received'}
                        </Text>
                      </TickerTextWrapper>
                    </div>
                    <ContentWrapper>
                      <HeaderText
                        style={{
                          fontSize: '0.85rem',
                          marginTop: 0,
                          color:
                            summaryEntries[0][1].amount < 0
                              ? summaryEntries[0][1].amount === -1
                                ? '#E5BE01'
                                : 'red'
                              : summaryEntries[0][1].amount === 0
                                ? theme.color.global.gray
                                : 'green',
                        }}
                        theme={theme}
                      >
                        {summaryEntries[0][1].amount}
                      </HeaderText>
                      <FaExternalLinkAlt
                        onClick={() => handleOpenLink(t.txid)}
                        style={{ cursor: 'pointer', color: theme.color.global.gray }}
                        title="See transaction in Whatsonchain"
                      />
                    </ContentWrapper>
                  </div>
                ) : (
                  summaryEntries.map(([key, value]) => (
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <Icon
                          src={
                            value.icon
                              ? `${gorillaPoolService.getBaseUrl(chromeStorageService.getNetwork())}/content/${value.icon}`
                              : GENERIC_TOKEN_ICON
                          }
                        />
                        <TickerTextWrapper>
                          <HeaderText style={{ fontSize: '0.85rem', marginTop: 0 }} theme={theme}>
                            {key}
                          </HeaderText>
                          <Text
                            theme={theme}
                            style={{
                              color: theme.color.global.gray,
                              fontSize: '0.75rem',
                              margin: 0,
                              textAlign: 'left',
                            }}
                          >
                            {value.amount < 0
                              ? value.amount === -1
                                ? 'Listar'
                                : 'Sent'
                              : value.amount === 0
                                ? 'Cancelled'
                                : 'Received'}
                          </Text>
                        </TickerTextWrapper>
                      </div>
                      <ContentWrapper>
                        <HeaderText
                          style={{
                            fontSize: '0.85rem',
                            marginTop: 0,
                            color:
                              value.amount < 0
                                ? value.amount === -1
                                  ? 'yellow'
                                  : 'red'
                                : value.amount === 0
                                  ? theme.color.global.gray
                                  : 'green',
                          }}
                          theme={theme}
                        >
                          {value.amount}
                        </HeaderText>
                        <FaExternalLinkAlt
                          onClick={() => handleOpenLink(t.txid)}
                          style={{ cursor: 'pointer', color: theme.color.global.gray }}
                          title="See transaction in Whatsonchain"
                        />
                      </ContentWrapper>
                    </div>
                  ))
                )}
              </TickerWrapper>
            </FavoriteRow>
          );
        })
      ) : (
        <Text theme={theme} style={{ marginTop: '1rem', color: theme.color.global.gray }}>
          No History found
        </Text>
      )}
      <ButtonsWrapper>
        <Button
          theme={theme}
          type="secondary"
          label="Previous"
          style={{ marginTop: '0.5rem' }}
          disabled={currentPage === 1}
          onClick={handlePreviousPage}
        />
        <Button
          theme={theme}
          type="primary"
          label="Next"
          onClick={handleNextPage}
          disabled={currentPage * itemsPerPage >= (dataTest?.length ?? 0)}
        />
      </ButtonsWrapper>
    </Container>
  );
};
