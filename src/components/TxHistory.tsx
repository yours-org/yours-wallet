import { keyframes, styled } from 'styled-components';
import { Theme, WhiteLabelTheme } from '../theme.types';
import { useServiceContext } from '../hooks/useServiceContext';
import { useEffect, useMemo, useState } from 'react';
import { HeaderText, Text } from './Reusable';
import { GENERIC_TOKEN_ICON, URL_WHATSINCHAIN } from '../utils/constants';
import { FaTimes, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { TxLog } from 'spv-store';
import transactions from './const';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { Button } from './Button';
import bsvCoin from '../assets/bsv-coin.svg';
import lock from '../assets/lock.svg';
import priceTag from '../assets/price-tag.svg';

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

const RowWrapper = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0.5rem 0;
`;

export type TxHistoryProps = {
  theme: Theme;
  onBack: () => void;
};

export const TxHistory = (props: TxHistoryProps) => {
  const { theme, onBack } = props;
  const [data, setData] = useState<TxLog[]>(); // ! api response
  const [isSlidingOut, setIsSlidingOut] = useState(false);
  const { oneSatSPV } = useServiceContext();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const dataTest = transactions; // ! delete
  const { gorillaPoolService, chromeStorageService } = useServiceContext();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

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
  }, []); // ! add dependency of the fetch data

  const handleBackClick = () => {
    setIsSlidingOut(true);
    setTimeout(onBack, 1000);
  };

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return dataTest?.slice(startIndex, endIndex); // ! change dataTest to data
  }, [currentPage, dataTest]); // ! change dataTest to data

  const handleNextPage = () => {
    if (currentPage * itemsPerPage < (dataTest?.length ?? 0)) {
      // ! change dataTest to data
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

  const getIconForSummary = (tag: string, icon: string) => {
    switch (tag) {
      case 'fund':
        return bsvCoin;
      case 'lock':
        return lock;
      case 'list':
        return priceTag;
      default:
        return icon
          ? `${gorillaPoolService.getBaseUrl(chromeStorageService.getNetwork())}/content/${icon}`
          : GENERIC_TOKEN_ICON;
    }
  };

  const toggleRowExpansion = (idx: number) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) newSet.delete(idx);
      else newSet.add(idx);
      return newSet;
    });
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
          const isExpanded = expandedRows.has(t.idx);

          return (
            <RowWrapper>
              <FavoriteRow
                theme={theme}
                key={t.idx}
                onClick={summaryEntries.length > 1 ? () => toggleRowExpansion(t.idx) : undefined}
                style={
                  summaryEntries.length > 1
                    ? {
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        color: theme.color.global.gray,
                      }
                    : {
                        display: 'flex',
                        alignItems: 'center',
                        color: theme.color.global.gray,
                      }
                }
              >
                <TickerWrapper
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  {summaryEntries.slice(0, isExpanded ? summaryEntries.length : 1).map(([key, value], idx) => (
                    <div
                      key={idx}
                      style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'space-between' }}
                    >
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem', position: 'relative', width: '2.5rem' }}>
                          {!isExpanded &&
                            summaryEntries.slice(0, 3).map(([key, value], iconIdx) => (
                              <Icon
                                key={iconIdx}
                                src={getIconForSummary(key, value.icon)}
                                style={{
                                  position: 'absolute',
                                  left: `${iconIdx * 0.75}rem`,
                                  zIndex: 3 - iconIdx,
                                }}
                              />
                            ))}
                          {isExpanded && <Icon src={getIconForSummary(key, value.icon)} />}
                        </div>
                        <TickerTextWrapper>
                          <HeaderText style={{ fontSize: '0.85rem', marginTop: 0, marginLeft: '0.2rem' }} theme={theme}>
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
                                  ? '#E5BE01'
                                  : 'red'
                                : value.amount === 0
                                  ? theme.color.global.gray
                                  : 'green',
                            width: '60px',
                            textAlign: 'right',
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

                        <div>
                          {idx === 0 && summaryEntries.length > 1 ? (
                            isExpanded ? (
                              <FaChevronUp />
                            ) : (
                              <FaChevronDown />
                            )
                          ) : (
                            <span style={{ display: 'inline-block', width: '12px', height: '16px' }} /> // empty space to keep the icons order
                          )}
                        </div>
                      </ContentWrapper>
                    </div>
                  ))}
                </TickerWrapper>
              </FavoriteRow>
            </RowWrapper>
          );
        })
      ) : (
        <Text>No transaction records found.</Text>
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
          disabled={currentPage * itemsPerPage >= (dataTest?.length ?? 0)} // ! change dataTest to data
        />
      </ButtonsWrapper>
    </Container>
  );
};
