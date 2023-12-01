import { P2PKHAddress, Transaction } from 'bsv-wasm';
import { StoredUtxo } from '../hooks/useBsv';
import { storage } from './storage';

export const getCurrentUtcTimestamp = (): number => {
  const currentDate = new Date();
  const utcTimestamp = currentDate.getTime();
  return Math.floor(utcTimestamp);
};

export const updateStoredPaymentUtxos = async (rawtx: string, fundingAddress: string) => {
  return new Promise(() => {
    storage.get(['paymentUtxos'], async (result) => {
      const paymentUtxos: StoredUtxo[] = result.paymentUtxos;
      const tx = Transaction.from_hex(rawtx);
      let inputCount = tx.get_ninputs();
      let outputCount = tx.get_noutputs();
      const spends: string[] = [];

      for (let i = 0; i < inputCount; i++) {
        const txIn = tx.get_input(i);
        spends.push(`${txIn!.get_prev_tx_id_hex()}_${txIn!.get_vout()}`);
      }
      paymentUtxos.forEach((utxo) => {
        if (spends.includes(`${utxo.txid}_${utxo.vout}`)) {
          utxo.spent = true;
          utxo.spentUnixTime = getCurrentUtcTimestamp();
        }
      });

      const fundingScript = P2PKHAddress.from_string(fundingAddress).get_locking_script().to_hex();
      const txid = tx.get_id_hex();

      for (let i = 0; i < outputCount; i++) {
        const txOut = tx.get_output(i);
        const outScript = txOut?.get_script_pub_key_hex();
        if (outScript === fundingScript) {
          paymentUtxos.push({
            satoshis: Number(txOut!.get_satoshis()),
            script: fundingScript,
            txid,
            vout: i,
            spent: false,
            spentUnixTime: 0,
          });
        }
      }
      storage.set({ paymentUtxos });
    });
  });
};

// export const updateStoredPaymentUtxos = async (
//   inputsUsed: UTXO[],
//   pulledUtxos: StoredUtxo[],
//   change: number,
//   changeVout: number,
//   script: string,
//   txid: string,
// ) => {
//   await init();
//   return new Promise((resolve) => {
//     storage.get(['paymentUtxos'], async ({ paymentUtxos }) => {
//       inputsUsed.forEach((input) => {
//         const spentUtxo = pulledUtxos.find((utxo) => utxo.txid === input.txid);
//         if (spentUtxo) {
//           spentUtxo.spent = true;
//           spentUtxo.spentUnixTime = getCurrentUtcTimestamp();
//         }
//       });

//       if (change > 0) {
//         const newUtxo: StoredUtxo = {
//           satoshis: change,
//           script,
//           txid: txid!,
//           vout: changeVout,
//           spent: false,
//           spentUnixTime: 0,
//         };
//         pulledUtxos.push(newUtxo);
//       }

//       const removeDuplicates = (utxos: StoredUtxo[]) => {
//         const uniqueTxids: Record<string, boolean> = {};
//         const result = utxos.filter((obj) => {
//           if (!uniqueTxids[obj.txid]) {
//             uniqueTxids[obj.txid] = true;
//             return true;
//           } else if (obj.spent) {
//             uniqueTxids[obj.txid] = true;
//             return true;
//           }
//           return false;
//         });

//         return result;
//       };

//       const updatedUtxos = removeDuplicates([...pulledUtxos, ...paymentUtxos]);

//       storage.set({ paymentUtxos: updatedUtxos });
//       resolve(updatedUtxos);
//     });
//   });
// };
