import { IndexContext, Txo } from 'spv-store';
import styled from 'styled-components';
import { Ordinal } from 'yours-wallet-provider';
import { useTheme } from '../hooks/useTheme';
import { WhiteLabelTheme } from '../theme.types';
import { GP_BASE_URL, KNOWN_BURN_ADDRESSES, MNEE_DECIMALS } from '../utils/constants';
import { convertAtomicValueToReadableTokenValue, formatNumberWithCommasAndDecimals, truncate } from '../utils/format';
import { mapOrdinal } from '../utils/providerHelper';
import { Show } from './Show';
import lockImage from '../assets/lock.svg';
import { useEffect, useMemo, useState } from 'react';
import { FaFire } from 'react-icons/fa';
import { useServiceContext } from '../hooks/useServiceContext';
import { MNEEConfig } from '../services/types/mnee.types';
import mneeIcon from '../assets/mnee-icon.png';

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
  txData: IndexContext;
  inputsToSign?: number[];
};

const TxPreview = ({ txData, inputsToSign }: TxPreviewProps) => {
  const { theme } = useTheme();
  const { mneeService } = useServiceContext();
  const labelMaxLength = 20;
  const mappedInputs = useMemo(() => txData?.spends.map((txo: Txo) => mapOrdinal(txo)), [txData]);
  const mappedOutputs = useMemo(() => txData?.txos.map((txo: Txo) => mapOrdinal(txo)), [txData]);
  const [mneeConfig, setMneeConfig] = useState<MNEEConfig>();

  console.log('mappedInputs', mappedInputs);
  console.log('mappedOutputs', mappedOutputs);

  useEffect(() => {
    if (!mneeService) return;
    (async () => {
      const config = await mneeService.getConfig();
      setMneeConfig(config);
    })();
  }, [mneeService]);

  const renderNftOrTokenImage = (ordinal: Ordinal, isMNEE: boolean) => {
    const inscriptionWithOutpoint =
      ordinal?.origin?.data?.insc?.file?.type.startsWith('image') && !!ordinal.origin.outpoint;
    const bsv20WithIcon = (!!ordinal?.data?.bsv20 && !!ordinal.data.bsv20.icon) || isMNEE;
    const isLock = !!ordinal?.data?.lock;

    if (inscriptionWithOutpoint) {
      return <NftImage $isCircle={false} src={`${GP_BASE_URL}/content/${ordinal.origin?.outpoint}`} alt="NFT" />;
    }

    if (bsv20WithIcon) {
      return (
        <NftImage
          $isCircle
          src={
            isMNEE
              ? mneeIcon
              : ordinal.data.bsv20?.icon?.startsWith('https://')
                ? ordinal.data.bsv20.icon
                : `${GP_BASE_URL}/content/${ordinal.data.bsv20?.icon}`
          }
          alt="Token"
        />
      );
    }

    if (isLock) {
      return <NftImage $isCircle src={lockImage} alt="Lock" />;
    }
    return null;
  };

  if (!mappedInputs || !mappedOutputs || !mneeConfig) return null;

  return (
    <Container>
      <SectionHeader theme={theme} style={{ marginTop: '0.5rem' }}>
        Inputs
      </SectionHeader>
      {mappedInputs.map((input: Ordinal, index: number) => {
        const isMNEE = input.data.bsv20?.id === mneeConfig?.tokenId;
        return (
          <Row $toSign={!!inputsToSign?.includes(index)} key={index} theme={theme}>
            <IndexOwnerWrapper>
              <Index theme={theme}>#{index}</Index>
              {<RowData theme={theme}>{input.owner ? truncate(input.owner, 6, 6) : 'Script/Contract'}</RowData>}
              {!!inputsToSign?.includes(index) && (
                <RowData style={{ marginLeft: '0.5rem' }} theme={theme}>
                  ✍️
                </RowData>
              )}
            </IndexOwnerWrapper>

            <AmountImageWrapper>
              <RowData theme={theme}>
                <Show
                  when={!!input.data.bsv20}
                  whenFalseContent={
                    <Show
                      when={!!input.origin?.data?.map?.name}
                      whenFalseContent={
                        <Label theme={theme}>
                          {formatNumberWithCommasAndDecimals(input.satoshis, 0)} {input.satoshis > 1 ? 'sats' : 'sat'}
                        </Label>
                      }
                    >
                      <Label theme={theme}>
                        {input.origin?.data?.map?.name && truncate(input.origin.data.map.name, labelMaxLength, 0)}
                      </Label>
                    </Show>
                  }
                >
                  <Label theme={theme}>
                    {(isMNEE ? '$' : '') +
                      convertAtomicValueToReadableTokenValue(
                        Number(input.data.bsv20?.amt),
                        isMNEE ? MNEE_DECIMALS : Number(input.data.bsv20?.dec),
                      )}{' '}
                    {truncate(
                      isMNEE ? 'MNEE' : (input.data.bsv20?.tick ?? input.data.bsv20?.sym ?? 'Unknown FT'),
                      labelMaxLength,
                      0,
                    )}
                  </Label>
                </Show>
              </RowData>
              {renderNftOrTokenImage(input, isMNEE)}
            </AmountImageWrapper>
          </Row>
        );
      })}

      <SectionHeader theme={theme}>Outputs</SectionHeader>
      {mappedOutputs.map((output: Ordinal, index: number) => {
        const isMNEE = output.data.bsv20?.id === mneeConfig?.tokenId;
        return (
          <Row $toSign={false} key={index} theme={theme}>
            <IndexOwnerWrapper>
              <Index theme={theme}>#{index}</Index>
              <RowData theme={theme}>{output.owner ? truncate(output.owner, 6, 6) : 'Script/Contract'}</RowData>
              <Show when={!!output.owner && KNOWN_BURN_ADDRESSES.includes(output.owner)}>
                <FaFire color={theme.color.component.snackbarError} size={'1rem'} style={{ marginLeft: '0.5rem' }} />
              </Show>
            </IndexOwnerWrapper>

            <AmountImageWrapper>
              <RowData theme={theme}>
                <Show
                  when={!!output.data.bsv20}
                  whenFalseContent={
                    <Show
                      when={!!output.origin?.data?.map?.name}
                      whenFalseContent={
                        <Label theme={theme}>
                          {formatNumberWithCommasAndDecimals(output.satoshis, 0)} {output.satoshis > 1 ? 'sats' : 'sat'}
                        </Label>
                      }
                    >
                      <Label theme={theme}>
                        {output.origin?.data?.map?.name && truncate(output.origin.data.map.name, labelMaxLength, 0)}
                      </Label>
                    </Show>
                  }
                >
                  <Label theme={theme}>
                    {(isMNEE ? '$' : '') +
                      convertAtomicValueToReadableTokenValue(
                        Number(output.data.bsv20?.amt),
                        isMNEE ? 5 : Number(output.data.bsv20?.dec),
                      )}{' '}
                    {truncate(
                      isMNEE ? 'MNEE' : output.data.bsv20?.tick || output.data.bsv20?.sym || 'Unknown FT',
                      labelMaxLength,
                      0,
                    )}
                  </Label>
                </Show>
              </RowData>
              {renderNftOrTokenImage(output, isMNEE)}
            </AmountImageWrapper>
          </Row>
        );
      })}
    </Container>
  );
};

export default TxPreview;
