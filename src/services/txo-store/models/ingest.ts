export enum IngestStatus {
  FAILED = -1,
  DOWNLOAD = 0,
  INGEST = 1,
  CONFIRMED = 2,
}

export class Ingest {
  status = IngestStatus.DOWNLOAD;
  constructor(
    public txid: string,
    public height: number,
    public idx: number,
    public isDep = false,
    public checkSpends = false,
    public downloadOnly = false,
  ) {
    if (typeof idx == 'string') {
      this.idx = parseInt(idx);
    }
  }
}
