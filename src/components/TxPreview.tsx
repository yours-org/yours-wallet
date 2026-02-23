import styled from 'styled-components';
import { useTheme } from '../hooks/useTheme';
import { WhiteLabelTheme } from '../theme.types';
import { KNOWN_BURN_ADDRESSES } from '../utils/constants';
import { convertAtomicValueToReadableTokenValue, formatNumberWithCommasAndDecimals, truncate } from '../utils/format';
import { Show } from './Show';
import lockImage from '../assets/lock.svg';
import { FaFire } from 'react-icons/fa';
import type { ParseContext, Txo } from '@1sat/wallet-remote';
import { useServiceContext } from '../hooks/useServiceContext';

// Helper types for indexed data
interface Origin {
  outpoint?: string;
  nonce?: number;
  insc?: { file?: { type: string; size: number; hash: string; content?: number[] } };
  map?: { [key: string]: unknown };
}

interface Bsv21Data {
  id?: string;
  sym?: string;
  dec?: number;
  amt?: string | bigint;
  icon?: string;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  width: 90%;
`;

const SectionHeader = styled.h3<WhiteLabelTheme>`
  color: ${({ theme }) => theme.color.global.contrast};
  font-weight: 900;
  margin-bottom: 0.5rem;
  font-size: 1.25rem;
`;

const Row = styled.div<WhiteLabelTheme & { $toSign: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background-color: ${({ theme }) => theme.color.global.row};
  border: ${({ theme, $toSign }) => ($toSign ? `1px solid ${theme.color.component.snackbarSuccess}` : 'none')};
  border-radius: 0.25rem;
`;

const Index = styled.div<WhiteLabelTheme>`
  font-weight: bold;
  color: ${({ theme }) => theme.color.global.gray};
  margin-right: 0.5rem;
`;

const RowData = styled.div<WhiteLabelTheme>`
  color: ${({ theme }) => theme.color.global.contrast};
`;

const NftImage = styled.img<{ $isCircle: boolean }>`
  width: ${({ $isCircle }) => ($isCircle ? '2rem' : '2.75rem')};
  height: ${({ $isCircle }) => ($isCircle ? '2rem' : '2.75rem')};
  border-radius: ${({ $isCircle }) => ($isCircle ? '50%' : '0.25rem')};
  margin: 0 0.25rem 0 0.5rem;
`;

const AmountImageWrapper = styled.div`
  display: flex;
  align-items: center;
`;

const IndexOwnerWrapper = styled.div`
  display: flex;
  align-items: center;
`;

const Label = styled.div<WhiteLabelTheme>`
  color: ${({ theme }) => theme.color.global.contrast};
  text-align: right;
`;

type TxPreviewProps = {
  txData: ParseContext;
  inputsToSign?: number[];
};

// Helper to extract data from Txo
const getOrigin = (txo: Txo): Origin | undefined => txo.data.origin?.data as Origin | undefined;
const getBsv21 = (txo: Txo): Bsv21Data | undefined => txo.data.bsv21?.data as Bsv21Data | undefined;
const getLock = (txo: Txo): { until: number } | undefined => txo.data.lock?.data as { until: number } | undefined;
const getSatoshis = (txo: Txo): number => Number(txo.output.satoshis || 0);

const TxPreview = ({ txData, inputsToSign }: TxPreviewProps) => {
  console.log('txData', txData);
  const { theme } = useTheme();
  const { wallet } = useServiceContext();
  const labelMaxLength = 20;
  const baseUrl = wallet.services.baseUrl;

  const renderNftOrTokenImage = (txo: Txo) => {
    const origin = getOrigin(txo);
    const bsv21 = getBsv21(txo);
    const lock = getLock(txo);

    const inscriptionWithOutpoint = origin?.insc?.file?.type?.startsWith('image') && !!origin.outpoint;
    const bsv21WithIcon = !!bsv21 && !!bsv21.icon;
    const isLock = !!lock;

    if (inscriptionWithOutpoint && origin?.outpoint) {
      return <NftImage $isCircle={false} src={`${baseUrl}/content/${origin.outpoint}`} alt="NFT" />;
    }

    if (bsv21WithIcon) {
      return (
        <NftImage
          $isCircle
          src={bsv21.icon?.startsWith('https://') ? bsv21.icon : `${baseUrl}/content/${bsv21.icon}`}
          alt="Token"
        />
      );
    }

    if (isLock) {
      return <NftImage $isCircle src={lockImage} alt="Lock" />;
    }
    return null;
  };

  if (!txData?.spends || !txData?.txos) return null;

  const renderTxoRow = (txo: Txo, index: number, isInput: boolean) => {
    const origin = getOrigin(txo);
    const bsv21 = getBsv21(txo);
    const satoshis = getSatoshis(txo);
    const mapName = origin?.map?.name as string | undefined;

    return (
      <Row $toSign={isInput && !!inputsToSign?.includes(index)} key={index} theme={theme}>
        <IndexOwnerWrapper>
          <Index theme={theme}>#{index}</Index>
          <RowData theme={theme}>{txo.owner ? truncate(txo.owner, 6, 6) : 'Script/Contract'}</RowData>
          {isInput && !!inputsToSign?.includes(index) && (
            <RowData style={{ marginLeft: '0.5rem' }} theme={theme}>
              ✍️
            </RowData>
          )}
          {!isInput && !!txo.owner && KNOWN_BURN_ADDRESSES.includes(txo.owner) && (
            <FaFire color={theme.color.component.snackbarError} size={'1rem'} style={{ marginLeft: '0.5rem' }} />
          )}
        </IndexOwnerWrapper>

        <AmountImageWrapper>
          <RowData theme={theme}>
            <Show
              when={!!bsv21}
              whenFalseContent={
                <Show
                  when={!!mapName}
                  whenFalseContent={
                    <Label theme={theme}>
                      {formatNumberWithCommasAndDecimals(satoshis, 0)} {satoshis > 1 ? 'sats' : 'sat'}
                    </Label>
                  }
                >
                  <Label theme={theme}>{mapName && truncate(mapName, labelMaxLength, 0)}</Label>
                </Show>
              }
            >
              <Label theme={theme}>
                {convertAtomicValueToReadableTokenValue(Number(bsv21?.amt || 0), Number(bsv21?.dec || 0))}{' '}
                {truncate(bsv21?.sym ?? 'Unknown FT', labelMaxLength, 0)}
              </Label>
            </Show>
          </RowData>
          {renderNftOrTokenImage(txo)}
        </AmountImageWrapper>
      </Row>
    );
  };

  return (
    <Container>
      <SectionHeader theme={theme} style={{ marginTop: '0.5rem' }}>
        Inputs
      </SectionHeader>
      {txData.spends.map((txo: Txo, index: number) => renderTxoRow(txo, index, true))}

      <SectionHeader theme={theme}>Outputs</SectionHeader>
      {txData.txos.map((txo: Txo, index: number) => renderTxoRow(txo, index, false))}
    </Container>
  );
};

export default TxPreview;
