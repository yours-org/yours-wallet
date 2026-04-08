import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserCircle,
  Globe,
  Shield,
  Key,
  Lock,
  LogOut,
  RefreshCw,
  Database,
  Gauge,
  KeyRound,
  Zap,
  ChevronLeft,
  ChevronRight,
  X,
  Download,
  QrCode as QrCodeIcon,
  HardDrive,
  Pencil,
  Plus,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { QrCode } from '../components/QrCode';
import { Show } from '../components/Show';
import { SpeedBump } from '../components/SpeedBump';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { TopNav } from '../components/TopNav';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useSocialProfile } from '../hooks/useSocialProfile';
import { useTheme } from '../hooks/useTheme';
import { useServiceContext } from '../hooks/useServiceContext';
import { WhitelistedApp, YoursEventName } from '../inject';
import { sendMessage } from '../utils/chromeHelpers';
import { FEE_PER_KB } from '../utils/constants';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { CreateAccount } from './onboarding/CreateAccount';
import { RestoreAccount } from './onboarding/RestoreAccount';
import { ImportAccount } from './onboarding/ImportAccount';
import { MasterBackupProgressEvent, streamDataToZip } from '../utils/masterExporter';
import { useSnackbar } from '../hooks/useSnackbar';
import { PermissionsManager } from './PermissionsManager';
import { StorageStatus } from './StorageStatus';
import activeCircle from '../assets/active-circle.png';
import ProgressBar from '@ramonak/react-progress-bar';

export type SettingsPage =
  | 'main'
  | 'manage-accounts'
  | 'create-account'
  | 'restore-account'
  | 'import-wif'
  | 'account-list'
  | 'edit-account'
  | 'connected-apps'
  | 'social-profile'
  | 'export-keys-options'
  | 'export-keys-qr'
  | 'preferences'
  | 'storage'
  | 'permissions';

type DecisionType = 'sign-out' | 'export-master-backup' | 'export-keys' | 'export-keys-qr-code' | 'delete-account';

// --- Animation variants ---
const pageVariants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: { opacity: 0, x: -16, transition: { duration: 0.15, ease: 'easeIn' } },
};

const stagger = {
  animate: { transition: { staggerChildren: 0.055 } },
};

const rowVariant = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};

// --- Sub-components ---

type SettingRowProps = {
  icon: React.ReactNode;
  label: string;
  description?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  danger?: boolean;
};

const SettingRow = ({ icon, label, description, right, onClick, isFirst, isLast, danger }: SettingRowProps) => {
  return (
    <motion.div
      variants={rowVariant}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      onClick={onClick}
      className={`flex items-center justify-between px-4 py-3 bg-[#17191E] ${onClick ? 'cursor-pointer hover:bg-[#1f2128]' : ''} ${isFirst ? 'rounded-t-xl' : ''} ${isLast ? 'rounded-b-xl' : ''} transition-colors duration-150`}
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: danger ? 'rgba(239,68,68,0.15)' : 'rgba(161,255,139,0.1)' }}
        >
          <span style={{ color: danger ? '#ef4444' : '#A1FF8B' }}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate" style={{ color: danger ? '#ef4444' : '#FFFFFF' }}>
            {label}
          </p>
          {description && (
            <p className="text-xs mt-0.5 leading-tight" style={{ color: '#98A2B3' }}>
              {description}
            </p>
          )}
        </div>
      </div>
      {right !== undefined ? (
        <div className="flex-shrink-0 ml-3">{right}</div>
      ) : onClick ? (
        <ChevronRight size={16} color="#98A2B3" className="flex-shrink-0 ml-2" />
      ) : null}
    </motion.div>
  );
};

const Divider = () => <div className="h-px mx-4" style={{ backgroundColor: 'rgba(152,162,179,0.1)' }} />;

type SectionProps = {
  title: string;
  children: React.ReactNode;
};

const Section = ({ title, children }: SectionProps) => (
  <motion.div variants={rowVariant} className="w-full mb-4">
    <p className="text-xs font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: '#98A2B3' }}>
      {title}
    </p>
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(152,162,179,0.12)' }}>
      {children}
    </div>
  </motion.div>
);

type SubPageHeaderProps = {
  title: string;
  onBack: () => void;
};

const SubPageHeader = ({ title, onBack }: SubPageHeaderProps) => (
  <div className="flex items-center gap-3 mb-5 w-full">
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      onClick={onBack}
      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: '#17191E', border: '1px solid rgba(152,162,179,0.15)' }}
    >
      <ChevronLeft size={18} color="#FFFFFF" />
    </motion.button>
    <h2 className="text-base font-bold" style={{ color: '#FFFFFF' }}>
      {title}
    </h2>
  </div>
);

// --- Main Component ---

export const Settings = () => {
  const { theme } = useTheme();
  const { addSnackbar } = useSnackbar();
  const { query, handleSelect } = useBottomMenu();
  const [showSpeedBump, setShowSpeedBump] = useState(false);
  const { chromeStorageService, keysService, lockWallet, wallet } = useServiceContext();
  const [page, setPage] = useState<SettingsPage>(query === 'manage-accounts' ? 'manage-accounts' : 'main');
  const [connectedApps, setConnectedApps] = useState<WhitelistedApp[]>([]);
  const [speedBumpMessage, setSpeedBumpMessage] = useState('');
  const [decisionType, setDecisionType] = useState<DecisionType | undefined>();
  const { socialProfile, storeSocialProfile } = useSocialProfile(chromeStorageService);
  const [exportKeysQrData, setExportKeysAsQrData] = useState('');
  const [shouldVisibleExportedKeys, setShouldVisibleExportedKeys] = useState(false);
  const [enteredSocialDisplayName, setEnteredSocialDisplayName] = useState(socialProfile.displayName);
  const [enteredAccountName, setEnteredAccountName] = useState('');
  const [enteredAccountIcon, setEnteredAccountIcon] = useState('');
  const [enteredSocialAvatar, setEnteredSocialAvatar] = useState(socialProfile?.avatar);
  const [isPasswordRequired, setIsPasswordRequired] = useState(chromeStorageService.isPasswordRequired());
  const [masterBackupProgress, setMasterBackupProgress] = useState(0);
  const [masterBackupEventText, setMasterBackupEventText] = useState('');
  const currentAccount = chromeStorageService.getCurrentAccountObject();
  const [noApprovalLimit, setNoApprovalLimit] = useState(currentAccount.account?.settings.noApprovalLimit ?? 0);
  const [customFeeRate, setCustomFeeRate] = useState(currentAccount.account?.settings.customFeeRate ?? FEE_PER_KB);
  const [selectedAccountIdentityAddress, setSelectedAccountIdentityAddress] = useState<string | undefined>();

  useEffect(() => {
    const getWhitelist = async (): Promise<WhitelistedApp[]> => {
      try {
        await chromeStorageService.getAndSetStorage();
        const { account } = chromeStorageService.getCurrentAccountObject();
        if (!account) return [];
        const { whitelist } = account.settings;
        setConnectedApps(whitelist ?? []);
        return whitelist ?? [];
      } catch (error) {
        console.error(error);
        return [];
      }
    };

    getWhitelist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemoveDomain = async (domain: string) => {
    const newList = connectedApps.filter((app) => app.domain !== domain);
    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (!account || !selectedAccount) return;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccount]: {
        ...account,
        settings: {
          ...account.settings,
          whitelist: newList,
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
    setConnectedApps(newList);
  };

  const handleDeleteAccountIntent = () => {
    setDecisionType('delete-account');
    setSpeedBumpMessage('Are you sure you want to delete this account? All keys and data will be lost.');
    setShowSpeedBump(true);
  };

  const handleSignOutIntent = () => {
    setDecisionType('sign-out');
    setSpeedBumpMessage('Make sure you have your seed phrase backed up!');
    setShowSpeedBump(true);
  };

  const handleMasterBackupIntent = () => {
    setDecisionType('export-master-backup');
    setSpeedBumpMessage(
      'You are about to download wallet data for all your accounts. Make sure you are in a safe place.',
    );
    setShowSpeedBump(true);
  };

  const handleExportKeysIntent = () => {
    setDecisionType('export-keys');
    setSpeedBumpMessage(
      'You are about to download your private keys. Make sure you are in a safe place and no one is watching.',
    );
    setShowSpeedBump(true);
  };

  const handleExportKeysAsQrCodeIntent = () => {
    setDecisionType('export-keys-qr-code');
    setSpeedBumpMessage(
      'You are about to make your private keys visible in QR code format. Make sure you are in a safe place and no one is watching.',
    );
    setShowSpeedBump(true);
  };

  const handleSocialProfileSave = () => {
    storeSocialProfile({
      displayName: enteredSocialDisplayName,
      avatar: enteredSocialAvatar,
    });
    setPage('main');
  };

  const handleAccountEditSave = async () => {
    const accounts = chromeStorageService.getAllAccounts();
    const account = accounts.find((acc) => acc.addresses.identityAddress === selectedAccountIdentityAddress);
    if (!account || !selectedAccountIdentityAddress) return;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccountIdentityAddress]: {
        ...account,
        name: enteredAccountName,
        icon: enteredAccountIcon,
      },
    };
    await chromeStorageService.updateNested(key, update);
    setSelectedAccountIdentityAddress(undefined);
    setPage('main');
  };

  const handleDeleteAccount = async () => {
    if (!selectedAccountIdentityAddress) {
      addSnackbar('No account selected', 'error');
      return;
    }
    const res = await chromeStorageService.getAndSetStorage();
    let accounts = chromeStorageService.getAllAccounts();
    if (accounts.length === 1) {
      addSnackbar('You cannot delete your only account', 'error');
      return;
    }
    if (res?.selectedAccount === selectedAccountIdentityAddress) {
      addSnackbar('You cannot delete the currently selected account. Switch to another account first.', 'error');
      return;
    }
    const key: keyof ChromeStorageObject = 'accounts';
    indexedDB.deleteDatabase(`txos-${selectedAccountIdentityAddress}-${chromeStorageService.getNetwork()}`);
    await chromeStorageService.removeNested(key, selectedAccountIdentityAddress);
    await chromeStorageService.getAndSetStorage();
    accounts = chromeStorageService.getAllAccounts();
    await chromeStorageService.switchAccount(accounts[0].addresses.identityAddress);
    setSelectedAccountIdentityAddress(undefined);
    setPage('main');
  };

  useEffect(() => {
    if (!socialProfile) return;
    setEnteredSocialDisplayName(socialProfile.displayName);
    setEnteredSocialAvatar(socialProfile.avatar);
  }, [socialProfile]);

  const exportKeys = async (password: string) => {
    const keys = await keysService.retrieveKeys(password);

    const keysToExport = {
      mnemonic: keys.mnemonic,
      payPk: keys.walletWif,
      payDerivationPath: keys.walletDerivationPath,
      ordPk: keys.ordWif,
      ordDerivationPath: keys.ordDerivationPath,
      identityPk: keys.identityWif,
      identityDerivationPath: keys.identityDerivationPath,
    };

    const jsonData = JSON.stringify(keysToExport, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const tempLink = document.createElement('a');
    tempLink.href = url;
    tempLink.setAttribute('download', 'yours_wallet_keys.json');
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
    URL.revokeObjectURL(url);
  };

  const exportKeysAsQrCode = async (password: string) => {
    const keys = await keysService.retrieveKeys(password);

    const keysToExport = {
      mnemonic: keys.mnemonic,
      payPk: keys.walletWif,
      payDerivationPath: keys.walletDerivationPath,
      ordPk: keys.ordWif,
      ordDerivationPath: keys.ordDerivationPath,
    };

    const jsonData = JSON.stringify(keysToExport, null, 2);
    setExportKeysAsQrData(jsonData);

    setPage('export-keys-qr');
    setShouldVisibleExportedKeys(true);
    setTimeout(() => {
      setShouldVisibleExportedKeys(false);
    }, 10000);
  };

  const signOut = async () => {
    await chromeStorageService.clear();
    wallet?.close();
    setDecisionType(undefined);
    sendMessage({
      action: YoursEventName.SIGNED_OUT,
    });
    setTimeout(() => window.location.reload(), 100);
  };

  const handleCancel = () => {
    setShowSpeedBump(false);
  };

  const handleSpeedBumpConfirm = async (password?: string) => {
    if (decisionType === 'sign-out') {
      signOut();
    }

    if (decisionType === 'delete-account') {
      await handleDeleteAccount();
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }

    if (decisionType === 'export-master-backup') {
      handleMasterBackup();
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }
    if (decisionType === 'export-keys' && password) {
      exportKeys(password);
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }
    if (decisionType === 'export-keys-qr-code' && password) {
      exportKeysAsQrCode(password);
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }
  };

  const handleUpdatePasswordRequirement = async (isRequired: boolean) => {
    setIsPasswordRequired(isRequired);
    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (!account || !selectedAccount) throw new Error('No account found');
    const accountSettings = account.settings;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccount]: {
        ...account,
        settings: {
          ...accountSettings,
          isPasswordRequired: isRequired,
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
  };

  const handleUpdateApprovalLimit = async (amount: number) => {
    setNoApprovalLimit(amount);
    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (!account || !selectedAccount) throw new Error('No account found');
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccount]: {
        ...account,
        settings: {
          ...account.settings,
          noApprovalLimit: amount,
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
  };

  const handleUpdateCustomFeeRate = async (rate: number) => {
    if (rate < 1) {
      addSnackbar('Fee rate must be at least 1 sat/byte', 'error');
      return;
    }
    setCustomFeeRate(rate);
    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (!account || !selectedAccount) throw new Error('No account found');
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccount]: {
        ...account,
        settings: {
          ...account.settings,
          customFeeRate: rate,
        },
      },
    };
    await chromeStorageService.updateNested(key, update);
  };

  const handleMasterBackup = async () => {
    await streamDataToZip(chromeStorageService, (e: MasterBackupProgressEvent) => {
      setMasterBackupEventText(e.message);
      const progress = e.endValue && e.value ? Math.ceil((e.value / e.endValue) * 100) : 0;
      setMasterBackupProgress(progress);
    });
    setMasterBackupEventText('');
  };

  const handleLockWallet = async () => {
    lockWallet();
    handleSelect('bsv');
  };

  const resyncUTXOs = async () => {
    addSnackbar('Syncing with cloud...', 'info');
    try {
      const response = await chrome.runtime.sendMessage({ action: 'FULL_SYNC' });
      if (response.success) {
        const { pushed, pulled } = response.data;
        addSnackbar(
          `Sync complete: ↑${pushed.inserts}/${pushed.updates} ↓${pulled.inserts}/${pulled.updates}`,
          'success',
        );
      } else {
        addSnackbar(response.error || 'Sync failed', 'error');
      }
    } catch (error) {
      addSnackbar('Sync failed: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  };

  // --- Page renders ---

  const mainPage = (
    <motion.div
      key="main"
      variants={stagger}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full px-4 pb-20"
    >
      {/* Account section */}
      <Section title="Account">
        <SettingRow
          icon={<Users size={16} />}
          label="Manage Accounts"
          description="Create, restore, or edit accounts"
          onClick={() => setPage('manage-accounts')}
          isFirst
        />
        <Divider />
        <SettingRow
          icon={<Globe size={16} />}
          label="Connected Apps"
          description="Manage connected dApps"
          onClick={() => setPage('connected-apps')}
        />
        <Divider />
        <SettingRow
          icon={<Shield size={16} />}
          label="Permissions"
          description="View and revoke dApp permissions"
          onClick={() => setPage('permissions')}
          isLast
        />
      </Section>

      {/* Security section */}
      <Section title="Security">
        <SettingRow
          icon={<Key size={16} />}
          label="Export Keys"
          description="Backup seed, download JSON, or QR code"
          onClick={() => setPage('export-keys-options')}
          isFirst
          isLast
        />
      </Section>

      {/* Preferences section */}
      <Section title="Preferences">
        <SettingRow
          icon={<UserCircle size={16} />}
          label="Social Profile"
          description="Display name and avatar"
          onClick={() => setPage('preferences')}
          isFirst
        />
        <Divider />
        <SettingRow
          icon={<Database size={16} />}
          label="Storage"
          description="View storage status and remote sync"
          onClick={() => setPage('storage')}
          isLast
        />
      </Section>

      {/* Advanced section */}
      <Section title="Advanced">
        <SettingRow
          icon={<RefreshCw size={16} />}
          label="Re-Sync UTXOs"
          description="Re-sync your wallet's spendable coins"
          onClick={resyncUTXOs}
          isFirst
        />
        <Divider />
        <SettingRow
          icon={<Lock size={16} />}
          label="Lock Wallet"
          description="Immediately lock the wallet"
          onClick={handleLockWallet}
          isLast
        />
      </Section>

      {/* Danger Zone */}
      <Section title="Danger Zone">
        <SettingRow
          icon={<LogOut size={16} />}
          label="Sign Out"
          description={`Sign out of ${theme.settings.walletName} Wallet completely`}
          onClick={handleSignOutIntent}
          isFirst
          isLast
          danger
        />
      </Section>
    </motion.div>
  );

  const manageAccountsPage = (
    <motion.div
      key="manage-accounts"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full px-4 pb-4"
    >
      <SubPageHeader title="Manage Accounts" onBack={() => setPage('main')} />
      <motion.div variants={stagger} initial="initial" animate="animate" className="w-full">
        <Section title="Actions">
          <SettingRow
            icon={<Plus size={16} />}
            label="Create Account"
            description="Create a new account"
            onClick={() => setPage('create-account')}
            isFirst
          />
          <Divider />
          <SettingRow
            icon={<Download size={16} />}
            label="Restore / Import"
            description="Import or restore an existing account"
            onClick={() => setPage('restore-account')}
          />
          <Divider />
          <SettingRow
            icon={<Pencil size={16} />}
            label="Edit Account"
            description="Edit an existing account"
            onClick={() => setPage('account-list')}
            isLast
          />
        </Section>
      </motion.div>
    </motion.div>
  );

  const connectedAppsPage = (
    <motion.div
      key="connected-apps"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full px-4 pb-4"
    >
      <SubPageHeader title="Connected Apps" onBack={() => setPage('main')} />
      {connectedApps.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-12 gap-3"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(161,255,139,0.1)' }}
          >
            <Globe size={22} color="#A1FF8B" />
          </div>
          <p className="text-sm" style={{ color: '#98A2B3' }}>
            No apps connected
          </p>
        </motion.div>
      ) : (
        <motion.div variants={stagger} initial="initial" animate="animate" className="w-full space-y-2">
          {connectedApps.map((app, idx) => (
            <motion.div
              key={app.domain + idx}
              variants={rowVariant}
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{
                backgroundColor: '#17191E',
                border: '1px solid rgba(152,162,179,0.12)',
              }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {app.icon ? (
                  <img src={app.icon} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" alt={app.domain} />
                ) : (
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(161,255,139,0.1)' }}
                  >
                    <Globe size={16} color="#A1FF8B" />
                  </div>
                )}
                <p className="text-sm font-semibold truncate" style={{ color: '#FFFFFF' }}>
                  {app.domain}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.88 }}
                onClick={() => handleRemoveDomain(app.domain)}
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ml-3"
                style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}
              >
                <X size={14} color="#ef4444" />
              </motion.button>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );

  const exportKeysAsQrCodePage = (
    <motion.div
      key="export-keys-qr"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full px-4 pb-4"
    >
      <SubPageHeader title="Keys as QR Code" onBack={() => setPage('main')} />
      {shouldVisibleExportedKeys ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div
            className="p-4 rounded-2xl"
            style={{
              backgroundColor: '#17191E',
              border: '1px solid rgba(152,162,179,0.15)',
            }}
          >
            <QrCode address={exportKeysQrData} />
          </div>
          <p className="text-xs text-center" style={{ color: '#98A2B3' }}>
            This QR code will disappear in 10 seconds.
          </p>
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-8">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: 'rgba(239,68,68,0.12)' }}
          >
            <QrCodeIcon size={22} color="#ef4444" />
          </div>
          <p className="text-sm" style={{ color: '#98A2B3' }}>
            Timed out. Please try again.
          </p>
        </div>
      )}
    </motion.div>
  );

  const exportKeyOptionsPage = (
    <motion.div
      key="export-keys-options"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full px-4 pb-4"
    >
      <SubPageHeader title="Export Keys" onBack={() => setPage('main')} />
      <motion.div variants={stagger} initial="initial" animate="animate" className="w-full">
        <Section title="Backup Options">
          <motion.div variants={rowVariant}>
            {masterBackupEventText ? (
              <div className="px-4 py-3" style={{ backgroundColor: '#17191E' }}>
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(161,255,139,0.1)' }}
                  >
                    <HardDrive size={16} color="#A1FF8B" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
                      Master Backup
                    </p>
                    <p className="text-xs" style={{ color: '#98A2B3' }}>
                      {masterBackupEventText}
                    </p>
                  </div>
                </div>
                {masterBackupProgress > 0 && (
                  <ProgressBar
                    completed={masterBackupProgress}
                    bgColor={theme.color.component.progressBar}
                    baseBgColor={theme.color.component.progressBarTrack}
                    height="8px"
                  />
                )}
                <p className="text-xs mt-2 font-semibold" style={{ color: '#ef4444' }}>
                  DO NOT CLOSE WALLET OR CHANGE TABS DURING THIS PROCESS!
                </p>
              </div>
            ) : (
              <SettingRow
                icon={<HardDrive size={16} />}
                label="Master Backup"
                description="Download all wallet data for all accounts"
                onClick={handleMasterBackupIntent}
                isFirst
              />
            )}
          </motion.div>
          <Show when={!masterBackupEventText}>
            <Divider />
            <SettingRow
              icon={<Download size={16} />}
              label="Download Keys"
              description="Download seed, private, and public keys as JSON"
              onClick={handleExportKeysIntent}
            />
            <Divider />
            <SettingRow
              icon={<QrCodeIcon size={16} />}
              label="Export as QR Code"
              description="Display private keys as QR code for mobile import"
              onClick={handleExportKeysAsQrCodeIntent}
              isLast
            />
          </Show>
          {masterBackupEventText && <div className="rounded-b-xl overflow-hidden" />}
        </Section>
      </motion.div>
    </motion.div>
  );

  const preferencesPage = (
    <motion.div
      key="preferences"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full px-4 pb-4"
    >
      <SubPageHeader title="Preferences" onBack={() => setPage('main')} />
      <motion.div variants={stagger} initial="initial" animate="animate" className="w-full">
        <Section title="Profile">
          <SettingRow
            icon={<UserCircle size={16} />}
            label="Social Profile"
            description="Set your display name and avatar"
            onClick={() => setPage('social-profile')}
            isFirst
            isLast
          />
        </Section>
        <Section title="Security">
          <SettingRow
            icon={<KeyRound size={16} />}
            label="Require Password"
            description="Require a password for sending assets"
            right={
              <ToggleSwitch
                theme={theme}
                on={isPasswordRequired}
                onChange={() => handleUpdatePasswordRequirement(!isPasswordRequired)}
              />
            }
            isFirst
            isLast
          />
        </Section>
        <Section title="Transaction Limits">
          <SettingRow
            icon={<Zap size={16} />}
            label="Auto-Approve Limit"
            description="Transactions at or below this BSV amount will be auto-approved"
            right={
              <Input
                theme={theme}
                placeholder={String(noApprovalLimit)}
                type="number"
                onChange={(e) => handleUpdateApprovalLimit(Number(e.target.value))}
                value={noApprovalLimit}
                style={{ width: '5rem', margin: 0 }}
              />
            }
            isFirst
          />
          <Divider />
          <SettingRow
            icon={<Gauge size={16} />}
            label="Custom Fee Rate"
            description="Default: 100 sat/kb"
            right={
              <Input
                theme={theme}
                placeholder={String(customFeeRate)}
                type="number"
                onChange={(e) => handleUpdateCustomFeeRate(Number(e.target.value))}
                value={customFeeRate}
                style={{ width: '5rem', margin: 0 }}
              />
            }
            isLast
          />
        </Section>
      </motion.div>
    </motion.div>
  );

  const socialProfilePage = (
    <motion.div
      key="social-profile"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full px-4 pb-4"
    >
      <SubPageHeader title="Social Profile" onBack={() => setPage('preferences')} />

      {/* Avatar preview */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05 }}
        className="flex flex-col items-center mb-6"
      >
        <div
          className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center"
          style={{
            background: enteredSocialAvatar ? undefined : 'linear-gradient(135deg, #A1FF8B, #34D399)',
            border: '2px solid rgba(161,255,139,0.3)',
          }}
        >
          {enteredSocialAvatar ? (
            <img src={enteredSocialAvatar} className="w-full h-full object-cover" alt="Avatar" />
          ) : (
            <UserCircle size={32} color="#010101" />
          )}
        </div>
        <p className="text-sm font-semibold mt-2" style={{ color: '#FFFFFF' }}>
          {enteredSocialDisplayName || 'Your Name'}
        </p>
      </motion.div>

      <motion.div variants={stagger} initial="initial" animate="animate" className="w-full space-y-4">
        <motion.div variants={rowVariant}>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#98A2B3' }}>
            Display Name
          </label>
          <Input
            theme={theme}
            placeholder="Display Name"
            type="text"
            onChange={(e) => setEnteredSocialDisplayName(e.target.value)}
            value={enteredSocialDisplayName}
          />
        </motion.div>
        <motion.div variants={rowVariant}>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#98A2B3' }}>
            Avatar URL
          </label>
          <Input
            theme={theme}
            placeholder="https://..."
            type="text"
            onChange={(e) => setEnteredSocialAvatar(e.target.value)}
            value={enteredSocialAvatar}
          />
        </motion.div>
        <motion.div variants={rowVariant}>
          <Button
            theme={theme}
            type="primary"
            label="Save"
            style={{ marginTop: '0.5rem' }}
            onClick={handleSocialProfileSave}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );

  const accountList = (
    <motion.div
      key="account-list"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full px-4 pb-4"
    >
      <SubPageHeader title="Edit Account" onBack={() => setPage('manage-accounts')} />
      <motion.div variants={stagger} initial="initial" animate="animate" className="w-full space-y-2">
        {chromeStorageService.getAllAccounts().map((account) => (
          <motion.div
            key={account.addresses.identityAddress}
            variants={rowVariant}
            whileTap={{ scale: 0.99 }}
            onClick={() => {
              setSelectedAccountIdentityAddress(account.addresses.identityAddress);
              setEnteredAccountName(account.name);
              setEnteredAccountIcon(account.icon);
              setPage('edit-account');
            }}
            className="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-colors duration-150 bg-[#17191E] hover:bg-[#1f2128]"
            style={{
              border: '1px solid rgba(152,162,179,0.12)',
            }}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <img
                src={account.icon || activeCircle}
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                alt={account.name}
              />
              <p className="text-sm font-semibold truncate" style={{ color: '#FFFFFF' }}>
                {account.name}
              </p>
            </div>
            <ChevronRight size={16} color="#98A2B3" className="flex-shrink-0 ml-2" />
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );

  const editAccount = (
    <motion.div
      key="edit-account"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full px-4 pb-4"
    >
      <SubPageHeader
        title="Edit Account"
        onBack={() => {
          setSelectedAccountIdentityAddress(undefined);
          setPage('account-list');
        }}
      />

      <motion.div variants={stagger} initial="initial" animate="animate" className="w-full space-y-4">
        <motion.div variants={rowVariant}>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#98A2B3' }}>
            Account Label
          </label>
          <Input
            theme={theme}
            placeholder="Account Label"
            type="text"
            onChange={(e) => setEnteredAccountName(e.target.value)}
            value={enteredAccountName}
          />
        </motion.div>
        <motion.div variants={rowVariant}>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#98A2B3' }}>
            Icon URL
          </label>
          <Input
            theme={theme}
            placeholder="https://..."
            type="text"
            onChange={(e) => setEnteredAccountIcon(e.target.value)}
            value={enteredAccountIcon}
          />
        </motion.div>
        <motion.div variants={rowVariant} className="flex flex-col gap-2">
          <Button
            theme={theme}
            type="primary"
            label="Save"
            style={{ marginTop: '0.25rem' }}
            onClick={handleAccountEditSave}
          />
          <Button theme={theme} type="warn" label="Delete Account" onClick={handleDeleteAccountIntent} />
        </motion.div>
      </motion.div>
    </motion.div>
  );

  return (
    <Show
      when={!showSpeedBump}
      whenFalseContent={
        <SpeedBump
          theme={theme}
          message={speedBumpMessage}
          onCancel={handleCancel}
          onConfirm={(password?: string) => handleSpeedBumpConfirm(password)}
          showSpeedBump={showSpeedBump}
          withPassword={
            decisionType === 'delete-account' ||
            decisionType === 'export-keys' ||
            decisionType === 'export-keys-qr-code' ||
            decisionType === 'export-master-backup'
          }
        />
      }
    >
      <div
        className="flex flex-col items-center w-full overflow-x-hidden"
        style={{
          backgroundColor: '#010101',
          minHeight: '100%',
          height: 'calc(75%)',
          overflowY: 'auto',
        }}
      >
        <TopNav />

        {/* Page spacer for fixed TopNav */}
        <div className="h-14 w-full flex-shrink-0" />

        {/* Page transitions */}
        <AnimatePresence mode="wait">
          {page === 'main' && mainPage}

          {page === 'manage-accounts' && manageAccountsPage}

          {page === 'create-account' && (
            <motion.div
              key="create-account"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full px-4 pb-4 pt-3"
            >
              <SubPageHeader title="Create Account" onBack={() => setPage('manage-accounts')} />
              <CreateAccount onNavigateBack={() => setPage('manage-accounts')} />
            </motion.div>
          )}

          {page === 'restore-account' && (
            <motion.div
              key="restore-account"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full px-4 pb-4 pt-1"
            >
              <SubPageHeader title="Restore / Import" onBack={() => setPage('manage-accounts')} />
              <RestoreAccount onNavigateBack={(p: SettingsPage) => setPage(p)} />
            </motion.div>
          )}

          {page === 'import-wif' && (
            <motion.div
              key="import-wif"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full px-4 pb-4 pt-1"
            >
              <SubPageHeader title="Import Key" onBack={() => setPage('restore-account')} />
              <ImportAccount onNavigateBack={() => setPage('restore-account')} />
            </motion.div>
          )}

          {page === 'account-list' && accountList}

          {page === 'edit-account' && editAccount}

          {page === 'connected-apps' && connectedAppsPage}

          {page === 'preferences' && preferencesPage}

          {page === 'social-profile' && socialProfilePage}

          {page === 'permissions' && (
            <motion.div
              key="permissions"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full"
            >
              <PermissionsManager onBack={() => setPage('main')} />
            </motion.div>
          )}

          {page === 'storage' && (
            <motion.div
              key="storage"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full"
            >
              <StorageStatus onBack={() => setPage('main')} />
            </motion.div>
          )}

          {page === 'export-keys-options' && exportKeyOptionsPage}

          {page === 'export-keys-qr' && exportKeysAsQrCodePage}
        </AnimatePresence>
      </div>
    </Show>
  );
};
