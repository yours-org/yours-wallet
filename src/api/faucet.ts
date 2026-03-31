const WITNESSONCHAIN_API_URL = 'https://witnessonchain.com/v1';

interface FaucetResponse {
  code: number;
  message: string;
  raw: string;
  txid: string;
}

export async function requestTestnetCoins(address: string): Promise<FaucetResponse> {
  try {
    const response = await fetch(`${WITNESSONCHAIN_API_URL}/faucet/tbsv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, channel: 'yours-wallet' }),
    });
    if (!response.ok) throw new Error(`Faucet request failed: ${response.status}`);
    return response.json() as Promise<FaucetResponse>;
  } catch (error) {
    console.error('Error requesting testnet coins:', error);
    throw error;
  }
}
