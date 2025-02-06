import { NetWork } from 'yours-wallet-provider';

export const WOC_BASE_URL = 'https://api.whatsonchain.com/v1/bsv/main';

export const WOC_TESTNET_BASE_URL = 'https://api.whatsonchain.com/v1/bsv/test';

export const URL_WHATSONCHAIN = 'https://whatsonchain.com/tx/';
export const URL_WHATSONCHAIN_TESTNET = 'https://test.whatsonchain.com/tx/';

export const GP_BASE_URL = 'https://ordinals.gorillapool.io';
export const JUNGLE_BUS_URL = 'https://junglebus.gorillapool.io';

export const GP_TESTNET_BASE_URL = 'https://testnet.ordinals.gorillapool.io';
export const GORILLA_POOL_ARC_URL = 'https://arc.gorillapool.io/v1';
export const MAINNET_ADDRESS_PREFIX = 0x00;
export const TESTNET_ADDRESS_PREFIX = 0x6f;
export const BSV_DECIMAL_CONVERSION = 100000000;
export const BSV20_INDEX_FEE = 1000;
export const FEE_PER_KB = 10;
export const MAX_BYTES_PER_TX = 50000000; // 50MB;
export const GLOBAL_ORDERBOOK_MARKET_RATE = 0.05;
export const FEE_SATS = 125;
export const P2PKH_INPUT_SIZE = 148;
export const P2PKH_OUTPUT_SIZE = 34;
export const DUST = 10;
export const INACTIVITY_LIMIT = 10 * 60 * 1000; // 10 minutes
export const SNACKBAR_TIMEOUT = 3 * 1000; // 2.5 seconds
export const HOSTED_YOURS_IMAGE = 'https://i.ibb.co/zGcthBv/yours-org-light.png';
export const YOURS_DEV_WALLET = '1MtzWXQEYGp89bQ9U2nfrnuChFv37j6pV6';
export const PROVIDER_DOCS_URL = 'https://yours-wallet.gitbook.io/provider-api/intro/introduction';
export const ONE_SAT_MARKET_URL = 'https://1sat.market/market';
export const GENERIC_TOKEN_ICON =
  'https://static-00.iconduck.com/assets.00/generic-cryptocurrency-icon-2048x2029-vzaeox5w.png';
export const GENERIC_NFT_ICON = 'https://cdn-icons-png.flaticon.com/512/6228/6228867.png';
export const KNOWN_BURN_ADDRESSES = ['1111111111111111111114oLvT2', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'];

// MNEE
export const MNEE_API = 'https://mnee-cosigner-production.up.railway.app/v1'; // TODO: update to production
export const MNEE_SYM = 'MNEE';
export const MNEE_TOKEN_ID = 'c16a7b22240885c40d9b00ca65d97ed032561d748e85b46dcdf6ace4c84ab988_0'; // TODO: update to production
export const MNEE_ICON_ID = '9c7f7f1788c6382d5ac737a4052334cf150b52d1e46c484ecfb1d6e00184f263_0'; // TODO: update to production
export const MNEE_ICON_URL = `${GP_BASE_URL}/content/${MNEE_ICON_ID}`;
export const MNEE_DECIMALS = 5; // TODO: update to production

// DERIVATION PATHS
export const DEFAULT_WALLET_PATH = "m/44'/236'/0'/1/0";
export const DEFAULT_ORD_PATH = "m/44'/236'/1'/0/0";
export const DEFAULT_RELAYX_ORD_PATH = "m/44'/236'/0'/2/0";
export const SWEEP_PATH = "m/44'/236'/0'/0/0";
export const DEFAULT_IDENTITY_PATH = "m/0'/236'/0'/0/0";
export const DEFAULT_TWETCH_WALLET_PATH = 'm/0/0';
export const DEFAULT_AYM_WALLET_PATH = 'm/0/0';
export const DEFAULT_AYM_ORD_PATH = 'm';
export const DEFAULT_SIGHASH_TYPE = 65; // SIGHASH_ALL | SIGHASH_FORKID
export const CHROME_STORAGE_OBJECT_VERSION = 1;

export const SCRYPT_PREFIX =
  '2097dfd76851bf465e8f715593b217714858bbe9570ff3bd5e33840a34e20ff0262102ba79df5f8ae7604a9830f03c7933028186aede0675a16f025dc4f8be8eec0382201008ce7480da41702918d1ec8e6849ba32b4d65b1e40dc669c31a1e6306b266c0000';
export const O_LOCK_SUFFIX =
  '615179547a75537a537a537a0079537a75527a527a7575615579008763567901c161517957795779210ac407f0e4bd44bfc207355a778b046225a7068fc59ee7eda43ad905aadbffc800206c266b30e6a1319c66dc401e5bd6b432ba49688eecd118297041da8074ce081059795679615679aa0079610079517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01007e81517a75615779567956795679567961537956795479577995939521414136d08c5ed2bf3ba048afe6dcaebafeffffffffffffffffffffffffffffff00517951796151795179970079009f63007952799367007968517a75517a75517a7561527a75517a517951795296a0630079527994527a75517a6853798277527982775379012080517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01205279947f7754537993527993013051797e527e54797e58797e527e53797e52797e57797e0079517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a756100795779ac517a75517a75517a75517a75517a75517a75517a75517a75517a7561517a75517a756169587951797e58797eaa577961007982775179517958947f7551790128947f77517a75517a75618777777777777777777767557951876351795779a9876957795779ac777777777777777767006868';
export const LOCK_SUFFIX =
  '610079040065cd1d9f690079547a75537a537a537a5179537a75527a527a7575615579014161517957795779210ac407f0e4bd44bfc207355a778b046225a7068fc59ee7eda43ad905aadbffc800206c266b30e6a1319c66dc401e5bd6b432ba49688eecd118297041da8074ce081059795679615679aa0079610079517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01007e81517a75615779567956795679567961537956795479577995939521414136d08c5ed2bf3ba048afe6dcaebafeffffffffffffffffffffffffffffff00517951796151795179970079009f63007952799367007968517a75517a75517a7561527a75517a517951795296a0630079527994527a75517a6853798277527982775379012080517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f517f7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e7c7e01205279947f7754537993527993013051797e527e54797e58797e527e53797e52797e57797e0079517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a75517a756100795779ac517a75517a75517a75517a75517a75517a75517a75517a75517a7561517a75517a756169557961007961007982775179517954947f75517958947f77517a75517a756161007901007e81517a7561517a7561040065cd1d9f6955796100796100798277517951790128947f755179012c947f77517a75517a756161007901007e81517a7561517a756105ffffffff009f69557961007961007982775179517954947f75517958947f77517a75517a756161007901007e81517a7561517a75615279a2695679a95179876957795779ac7777777777777777';

// Featured 3rd party integrations
export const featuredApps = [
  {
    icon: 'https://avatars.githubusercontent.com/u/159480043?s=400&u=8b1a3850d6e233f4d59af3275fe9e5e3fd81dcb3&v=4',
    name: 'Yours',
    link: 'https://yours.org',
  },
  {
    icon: 'https://pbs.twimg.com/profile_images/1469020626912354306/4WA3cIs3_400x400.jpg',
    name: 'Take It NFT',
    link: 'https://www.takeitnft.com/marketplace/global',
  },
  {
    icon: 'https://taleofshua.com/assets/shua_swd_512.png',
    name: 'Tale of Shua',
    link: 'https://taleofshua.com/profile/',
  },
  {
    icon: 'https://avatars.githubusercontent.com/u/52027588?v=4',
    name: 'sCrypt',
    link: 'https://docs.scrypt.io/tokens/tutorials/ordinal-lock/#use-panda-wallet',
  },
  {
    icon: 'https://pbs.twimg.com/profile_images/1555622553799892993/m0C6BWiv_400x400.jpg',
    name: 'Haste Arcade',
    link: 'https://hastearcade.com',
  },
];

export const DEFAULT_ACCOUNT = {
  network: NetWork.Mainnet,
  addresses: { bsvAddress: '', ordAddress: '', identityAddress: '' },
  pubKeys: { bsvPubKey: '', ordPubKey: '', identityPubKey: '' },
  settings: {
    noApprovalLimit: 0,
    whitelist: [],
    isPasswordRequired: true,
    socialProfile: { avatar: HOSTED_YOURS_IMAGE, displayName: 'Anonymous' },
    favoriteTokens: [],
    customFeeRate: 10,
  },
  balance: { bsv: 0, satoshis: 0, usdInCents: 0 },
  mneeBalance: { amount: 0, decimalAmount: 0 },
  encryptedKeys: '',
  derivationTags: [],
  icon: HOSTED_YOURS_IMAGE,
  name: 'Account 1',
  ordinals: [],
  paymentUtxos: [],
};
