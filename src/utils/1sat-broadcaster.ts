import { Broadcaster, BroadcastFailure, BroadcastResponse, Transaction } from '@bsv/sdk';
import { GP_BASE_URL } from './constants';

export class OneSatBroadcaster implements Broadcaster {
  async broadcast(tx: Transaction): Promise<BroadcastResponse | BroadcastFailure> {
    const resp = await fetch(`${GP_BASE_URL}/api/tx/bin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: Buffer.from(tx.toBinary()),
    });
    const body = await resp.json();
    if (resp.status !== 200) {
      return {
        status: 'error',
        code: resp.status.toString(),
        description: `${body.message}`,
      } as BroadcastFailure;
    }
    return {
      status: 'success',
      txid: body,
      message: 'Transaction broadcast successfully',
    } as BroadcastResponse;
  }
}
