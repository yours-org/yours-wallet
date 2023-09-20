import { toHex } from "./format";
import { Transaction, Address, Script } from "bsv";

export type Utxo = {
  satoshis: number;
  txid: string;
  vout: number;
  script: string;
};

export type Inscription = {
  dataB64: string;
  contentType: string;
};

export type MAP = {
  app: string;
  type: string;
  context?: string;
  subcontext?: string;
  collection?: string;
  url?: string;
  audio?: string;
  channel?: string;
  rarity?: string;
  tx?: string;
  videoID?: string;
  provider?: string;
  tags?: string[];
  start?: string;
  duration?: string;
  [prop: string]: string | string[] | undefined;
};

export const sendOrdinal = async (
  paymentUtxo: Utxo,
  ordinalUtxo: Utxo,
  paymentPk: any,
  changeAddress: string,
  satPerByteFee: number,
  ordPk: any,
  ordDestinationAddress: string
) => {
  Transaction.DUST_AMOUNT = 1;

  const tx = new Transaction()
    .from([ordinalUtxo, paymentUtxo])
    .to(ordDestinationAddress, 1);

  const estimatedTxSize = tx._estimateSize();
  const fee = Math.ceil(satPerByteFee * estimatedTxSize);
  const change = paymentUtxo.satoshis - fee;

  tx.to(changeAddress, change); // Add change output

  tx.sign([ordPk, paymentPk]);

  return { tx, change };
};

export const buildInscription = (
  destinationAddress: string,
  b64File: string,
  mediaType: string,
  metaData?: MAP
) => {
  const MAP_PREFIX = "1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5";
  const ordHex = toHex("ord");
  const fsBuffer = Buffer.from(b64File, "base64");
  const fireShardHex = fsBuffer.toString("hex");
  const fireShardMediaType = toHex(mediaType);

  // Create ordinal output and inscription in a single output
  let inscriptionAsm = `${Script.buildPublicKeyHashOut(
    Address.fromString(destinationAddress)
  ).toASM()} OP_0 OP_IF ${ordHex} OP_1 ${fireShardMediaType} OP_0 ${fireShardHex} OP_ENDIF`;

  // MAP.app and MAP.type keys are required
  if (metaData && metaData?.app && metaData?.type) {
    const mapPrefixHex = toHex(MAP_PREFIX);
    const mapCmdValue = toHex("SET");
    inscriptionAsm = `${inscriptionAsm} OP_RETURN ${mapPrefixHex} ${mapCmdValue}`;

    for (const [key, value] of Object.entries(metaData)) {
      if (key !== "cmd") {
        inscriptionAsm = `${inscriptionAsm} ${toHex(key)} ${toHex(
          value as string
        )}`;
      }
    }
  }

  return Script.fromASM(inscriptionAsm);
};
