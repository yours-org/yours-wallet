/**
 * USB backup restore: fold every chunk read off a drive into one consistent,
 * dependency-ordered set before the toolbox replays it.
 *
 * Why: the backup reader serves chunks from the live database outside the
 * wallet's lock queues, entity by entity. A write that lands between the
 * transaction page and the output page of one pass puts the output in this
 * pass and its transaction in the next. Replayed in chunk order, the toolbox
 * meets the output before its parent and throws. Later passes also capture
 * the same row again as it changes (a request going unsent → completed), and
 * the toolbox keeps the first status it sees for some entities.
 *
 * So: dedupe every row by its primary id keeping the newest `updated_at`
 * (later chunk wins a tie), then emit parents before children. The toolbox
 * keeps its id map across chunks within one import, so parents in an earlier
 * chunk are found by children in a later one.
 */
import type { sdk } from '@bsv/wallet-toolbox-client';

type Row = Record<string, unknown> & { updated_at?: Date | string | number };

/** Entity lists in the order the toolbox needs them: parents first. */
export const ENTITY_ORDER: Array<{ list: keyof sdk.SyncChunk; key: (r: Row) => string }> = [
  { list: 'provenTxs', key: (r) => String(r.provenTxId) },
  { list: 'outputBaskets', key: (r) => String(r.basketId) },
  { list: 'outputTags', key: (r) => String(r.outputTagId) },
  { list: 'txLabels', key: (r) => String(r.txLabelId) },
  { list: 'transactions', key: (r) => String(r.transactionId) },
  { list: 'outputs', key: (r) => String(r.outputId) },
  { list: 'txLabelMaps', key: (r) => `${r.txLabelId}:${r.transactionId}` },
  { list: 'outputTagMaps', key: (r) => `${r.outputTagId}:${r.outputId}` },
  { list: 'certificates', key: (r) => String(r.certificateId) },
  { list: 'certificateFields', key: (r) => `${r.certificateId}:${r.fieldName}` },
  { list: 'commissions', key: (r) => String(r.commissionId) },
  { list: 'provenTxReqs', key: (r) => String(r.provenTxReqId) },
];

/** Rows per emitted chunk; matches what the reader hands out. */
export const COALESCED_ROWS_PER_CHUNK = 500;

const toTime = (v: unknown): number => {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') return Date.parse(v);
  if (typeof v === 'number') return v;
  return NaN;
};

const idNumber = (k: string): number => {
  const n = Number(k);
  return Number.isFinite(n) ? n : NaN;
};

/** Sort ids numerically when they are numbers (the common case), else as strings. */
const compareIds = (a: string, b: string): number => {
  const na = idNumber(a);
  const nb = idNumber(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * Fold chunks (in the order they were written) into dependency-ordered
 * chunks with one row per id. Header fields come from the first chunk; the
 * `user` row from the last chunk that carried one.
 */
export const coalesceSyncChunks = (
  chunks: sdk.SyncChunk[],
  rowsPerChunk = COALESCED_ROWS_PER_CHUNK,
): sdk.SyncChunk[] => {
  if (chunks.length === 0) return [];
  const first = chunks[0];
  const header = {
    fromStorageIdentityKey: first.fromStorageIdentityKey,
    toStorageIdentityKey: first.toStorageIdentityKey,
    userIdentityKey: first.userIdentityKey,
  };
  let user: sdk.SyncChunk['user'];
  for (const c of chunks) if (c.user) user = c.user;

  // entity → id → newest row
  const latest = new Map<keyof sdk.SyncChunk, Map<string, Row>>();
  for (const { list } of ENTITY_ORDER) latest.set(list, new Map());
  for (const chunk of chunks) {
    for (const { list, key } of ENTITY_ORDER) {
      const rows = chunk[list] as Row[] | undefined;
      if (!rows) continue;
      const byId = latest.get(list) as Map<string, Row>;
      for (const row of rows) {
        const k = key(row);
        const prev = byId.get(k);
        if (!prev) {
          byId.set(k, row);
          continue;
        }
        const tPrev = toTime(prev.updated_at);
        const tRow = toTime(row.updated_at);
        // Newest wins; a tie (or no timestamps) goes to the later chunk.
        if (Number.isNaN(tRow) || Number.isNaN(tPrev) || tRow >= tPrev) byId.set(k, row);
      }
    }
  }

  const out: sdk.SyncChunk[] = [];
  let current: sdk.SyncChunk | null = null;
  let rowsInCurrent = 0;
  const open = () => {
    current = { ...header };
    rowsInCurrent = 0;
    out.push(current);
  };
  for (const { list } of ENTITY_ORDER) {
    const byId = latest.get(list) as Map<string, Row>;
    const ids = Array.from(byId.keys()).sort(compareIds);
    for (const id of ids) {
      if (!current || rowsInCurrent >= rowsPerChunk) open();
      const c = current as unknown as Record<string, unknown>;
      let arr = c[list] as Row[] | undefined;
      if (!arr) {
        arr = [];
        c[list] = arr;
      }
      arr.push(byId.get(id) as Row);
      rowsInCurrent++;
    }
  }
  // The toolbox's import loop ends only on a chunk where EVERY entity list is
  // present and empty; a missing list means "not reported" and keeps it
  // looping. So the set always ends with an explicit all-empty terminator,
  // and every data chunk carries every list too.
  for (const c of out) fillLists(c);
  const terminator = { ...header };
  fillLists(terminator);
  out.push(terminator);
  if (user) out[0].user = user;
  return out;
};

const fillLists = (chunk: sdk.SyncChunk): void => {
  const c = chunk as unknown as Record<string, unknown>;
  for (const { list } of ENTITY_ORDER) if (c[list] === undefined) c[list] = [];
};

/** Total rows across a chunk's entity lists. */
export const countChunkRows = (chunk: sdk.SyncChunk): number =>
  ENTITY_ORDER.reduce((n, { list }) => n + ((chunk[list] as unknown[] | undefined)?.length ?? 0), 0);
