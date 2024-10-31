import axios from 'axios';

const WHATSONCHAIN_API_URL = 'https://api.whatsonchain.com/v1/bsv/test';
const WITNESSONCHAIN_API_URL = 'https://witnessonchain.com/v1';

interface FaucetResponse {
  code: number;
  message: string;
  raw: string;
  txid: string;
}

export async function requestTestnetCoins(address: string): Promise<FaucetResponse> {
  try {
    const response = await axios.post<FaucetResponse>(`${WITNESSONCHAIN_API_URL}/faucet/tbsv`, {
      address,
      channel: 'yours-wallet',
    });
    return response.data;
  } catch (error) {
    console.error('Error requesting testnet coins:', error);
    throw error;
  }
}
