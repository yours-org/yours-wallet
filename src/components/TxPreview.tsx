import { useTheme } from '../hooks/useTheme';
import { KNOWN_BURN_ADDRESSES } from '../utils/constants';
import { convertAtomicValueToReadableTokenValue, formatNumberWithCommasAndDecimals, truncate } from '../utils/format';
import { Show } from './Show';
import lockImage from '../assets/lock.svg';
import { Flame } from 'lucide-react';
import type { ParseContext, Txo } from '@1sat/wallet-browser';
import { ONESAT_MAINNET_CONTENT_URL } from '@1sat/actions';
import { useServiceContext } from '../hooks/useServiceContext';

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

type TxPreviewProps = {
  txData: ParseContext;
  inputsToSign?: number[];
};

const getOrigin = (txo: Txo): Origin | undefined => txo.data.origin?.data as Origin | undefined;
const getBsv21 = (txo: Txo): Bsv21Data | undefined => txo.data.bsv21?.data as Bsv21Data | undefined;
const getLock = (txo: Txo): { until: number } | undefined => txo.data.lock?.data as { until: number } | undefined;
const getSatoshis = (txo: Txo): number => Number(txo.output.satoshis || 0);

const TxPreview = ({ txData, inputsToSign }: TxPreviewProps) => {
  console.log('txData', txData);
  const { theme } = useTheme();
  const { apiContext } = useServiceContext();
  const labelMaxLength = 20;
  const baseUrl = apiContext?.services?.baseUrl ?? ONESAT_MAINNET_CONTENT_URL;

  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const row = theme.color.global.row;
  const successColor = theme.color.component.snackbarSuccess;
  const errorColor = theme.color.component.snackbarError;

  const renderNftOrTokenImage = (txo: Txo) => {
    const origin = getOrigin(txo);
    const bsv21 = getBsv21(txo);
    const lock = getLock(txo);

    const inscriptionWithOutpoint = origin?.insc?.file?.type?.startsWith('image') && !!origin.outpoint;
    const bsv21WithIcon = !!bsv21 && !!bsv21.icon;
    const isLock = !!lock;

    if (inscriptionWithOutpoint && origin?.outpoint) {
      return (
        <img
          src={`${baseUrl}/content/${origin.outpoint}`}
          alt="NFT"
          className="mx-1 ml-2"
          style={{ width: '2.75rem', height: '2.75rem', borderRadius: '0.25rem' }}
        />
      );
    }

    if (bsv21WithIcon) {
      return (
        <img
          src={bsv21.icon?.startsWith('https://') ? bsv21.icon : `${baseUrl}/content/${bsv21.icon}`}
          alt="Token"
          className="mx-1 ml-2"
          style={{ width: '2rem', height: '2rem', borderRadius: '50%' }}
        />
      );
    }

    if (isLock) {
      return (
        <img
          src={lockImage}
          alt="Lock"
          className="mx-1 ml-2"
          style={{ width: '2rem', height: '2rem', borderRadius: '50%' }}
        />
      );
    }
    return null;
  };

  if (!txData?.spends || !txData?.txos) return null;

  const renderTxoRow = (txo: Txo, index: number, isInput: boolean) => {
    const origin = getOrigin(txo);
    const bsv21 = getBsv21(txo);
    const satoshis = getSatoshis(txo);
    const mapName = origin?.map?.name as string | undefined;
    const toSign = isInput && !!inputsToSign?.includes(index);

    return (
      <div
        key={index}
        className="flex justify-between items-center p-3 mb-2 rounded"
        style={{
          backgroundColor: row,
          border: toSign ? `1px solid ${successColor}` : 'none',
        }}
      >
        <div className="flex items-center">
          <span className="font-bold mr-2" style={{ color: gray }}>
            #{index}
          </span>
          <span style={{ color: contrast }}>{txo.owner ? truncate(txo.owner, 6, 6) : 'Script/Contract'}</span>
          {toSign && (
            <span className="ml-2" style={{ color: contrast }}>
              ✍️
            </span>
          )}
          {!isInput && !!txo.owner && KNOWN_BURN_ADDRESSES.includes(txo.owner) && (
            <Flame size={16} color={errorColor} className="ml-2" />
          )}
        </div>

        <div className="flex items-center">
          <span style={{ color: contrast }}>
            <Show
              when={!!bsv21}
              whenFalseContent={
                <Show
                  when={!!mapName}
                  whenFalseContent={
                    <span className="text-right" style={{ color: contrast }}>
                      {formatNumberWithCommasAndDecimals(satoshis, 0)} {satoshis > 1 ? 'sats' : 'sat'}
                    </span>
                  }
                >
                  <span className="text-right" style={{ color: contrast }}>
                    {mapName && truncate(mapName, labelMaxLength, 0)}
                  </span>
                </Show>
              }
            >
              <span className="text-right" style={{ color: contrast }}>
                {convertAtomicValueToReadableTokenValue(Number(bsv21?.amt || 0), Number(bsv21?.dec || 0))}{' '}
                {truncate(bsv21?.sym ?? 'Unknown FT', labelMaxLength, 0)}
              </span>
            </Show>
          </span>
          {renderNftOrTokenImage(txo)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col w-full">
      <h3 className="font-black mb-2 text-xl mt-2" style={{ color: contrast }}>
        Inputs
      </h3>
      {txData.spends.map((txo: Txo, index: number) => renderTxoRow(txo, index, true))}

      <h3 className="font-black mb-2 text-xl" style={{ color: contrast }}>
        Outputs
      </h3>
      {txData.txos.map((txo: Txo, index: number) => renderTxoRow(txo, index, false))}
    </div>
  );
};

export default TxPreview;
