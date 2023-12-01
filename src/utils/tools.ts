import { StoredUtxo, UTXO } from '../hooks/useBsv';
import { storage } from './storage';

export const getCurrentUtcTimestamp = (): number => {
  const currentDate = new Date();
  const utcTimestamp = currentDate.getTime();
  return Math.floor(utcTimestamp);
};

export const updateStoredPaymentUtxos = async (
  inputsUsed: UTXO[],
  pulledUtxos: StoredUtxo[],
  change: number,
  changeVout: number,
  script: string,
  txid: string,
) => {
  return new Promise((resolve) => {
    storage.get(['paymentUtxos'], async ({ paymentUtxos }) => {
      inputsUsed.forEach((input) => {
        const spentUtxo = pulledUtxos.find((utxo) => utxo.txid === input.txid);
        if (spentUtxo) {
          spentUtxo.spent = true;
          spentUtxo.spentUnixTime = getCurrentUtcTimestamp();
        }
      });

      if (change > 0) {
        // checking for truthy first incase
        const newUtxo: StoredUtxo = {
          satoshis: change,
          script,
          txid: txid!,
          vout: changeVout,
          spent: false,
          spentUnixTime: 0,
        };
        pulledUtxos.push(newUtxo);
      }

      const removeDuplicates = (utxos: StoredUtxo[]) => {
        const uniqueTxids: Record<string, boolean> = {};
        const result = utxos.filter((obj) => {
          if (!uniqueTxids[obj.txid]) {
            uniqueTxids[obj.txid] = true;
            return true;
          } else if (obj.spent) {
            uniqueTxids[obj.txid] = true;
            return true;
          }
          return false;
        });

        return result;
      };

      const updatedUtxos = removeDuplicates([...pulledUtxos, ...paymentUtxos]);

      storage.set({ paymentUtxos: updatedUtxos });
      resolve(updatedUtxos);
    });
  });
};
