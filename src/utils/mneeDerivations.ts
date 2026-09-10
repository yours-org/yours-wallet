import { DEFAULT_DEPOSIT_PREFIX, LEGACY_ONESAT_PROTOCOL, ONESAT_PROTOCOL, type KeyDerivation } from '@1sat/actions';

export const MNEE_PROTOCOLS = [ONESAT_PROTOCOL, LEGACY_ONESAT_PROTOCOL] as const;

export function mneeKeyDerivations(startIndex: number, count: number): KeyDerivation[] {
  return MNEE_PROTOCOLS.flatMap((protocolID) =>
    Array.from({ length: count }, (_, i) => ({
      protocolID,
      keyID: `${DEFAULT_DEPOSIT_PREFIX} ${startIndex + i}`,
    })),
  );
}
