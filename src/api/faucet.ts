import axios from 'axios';

const WHATSONCHAIN_API_URL = 'https://api.whatsonchain.com/v1/bsv/test';
const WITNESSONCHAIN_API_URL = 'https://witnessonchain.com/v1';

interface FaucetResponse {
  code: number;
  message: string;
  raw: string;
  txid: string;
}

interface BalanceResponse {
  confirmed: number;
  unconfirmed: number;
}

export async function requestTestnetCoins(address: string): Promise<FaucetResponse> {
  try {
    const response = await axios.post<FaucetResponse>(`${WITNESSONCHAIN_API_URL}/faucet/tbsv`, {
      address,
      channel: 'yours-wallet'
    });
    return response.data;
  } catch (error) {
    console.error('Error requesting testnet coins:', error);
    throw error;
  }
}

export async function getAddressBalance(address: string): Promise<number> {
  try {
    const response = await axios.get<BalanceResponse>(`${WHATSONCHAIN_API_URL}/address/${address}/balance`);
    return response.data.confirmed + response.data.unconfirmed;
  } catch (error) {
    console.error('Error fetching address balance:', error);
    throw error;
  }
}

export async function waitForTransaction(txid: string, maxAttempts = 10, interval = 5000): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await axios.get(`${WHATSONCHAIN_API_URL}/tx/hash/${txid}`);
      if (response.data && response.data.txid) {
        return true;
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response && error.response.status !== 404) {
        console.error('Error checking transaction:', error);
      }
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}