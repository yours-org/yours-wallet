/**
 * One shape for every fungible token the home list, favourites and Manage
 * Tokens handle, whether it is a BSV21 token (indexed, address-addressed) or a
 * 1Color token (held by the wallet's color module, handle-addressed). The
 * favourites setting stores ids, and both kinds use the `<txid>_<vout>`
 * outpoint form, so one list covers both.
 */
import { ONESAT_MAINNET_CONTENT_URL, type Bsv21Balance } from '@1sat/actions';
import { GENERIC_TOKEN_ICON } from '../utils/constants';
import { isUri } from '../utils/uri';
import { oneColorTicker, type OneColorBalance } from './oneColor';

export type WalletToken = {
  kind: 'bsv21' | '1color';
  /** `<txid>_<vout>`; the favourites key. */
  id: string;
  name: string;
  icon: string;
  dec: number;
  /** Spendable now. */
  confirmed: bigint;
  /** Not part of the balance: unconfirmed (BSV21) or held by an unsent send (1Color). */
  pending: bigint;
  bsv21?: Bsv21Balance;
  oneColor?: OneColorBalance;
};

export const bsv21WalletToken = (b: Bsv21Balance): WalletToken | null =>
  b.id
    ? {
        kind: 'bsv21',
        id: b.id,
        name: b.sym || 'Null',
        icon: b.icon ? (isUri(b.icon) ? b.icon : `${ONESAT_MAINNET_CONTENT_URL}/${b.icon}`) : GENERIC_TOKEN_ICON,
        dec: b.dec,
        confirmed: b.all.confirmed,
        pending: b.all.pending,
        bsv21: b,
      }
    : null;

export const oneColorWalletToken = (t: OneColorBalance): WalletToken => ({
  kind: '1color',
  id: t.assetId,
  name: oneColorTicker(t),
  icon: t.icon || GENERIC_TOKEN_ICON,
  dec: t.dec,
  confirmed: t.available,
  pending: t.pending,
  oneColor: t,
});

/** Both kinds as one list; BSV21 entries without an id are dropped. */
export const walletTokensOf = (bsv21s: Bsv21Balance[], oneColors: OneColorBalance[]): WalletToken[] => [
  ...bsv21s.map(bsv21WalletToken).filter((t): t is WalletToken => t !== null),
  ...oneColors.map(oneColorWalletToken),
];
