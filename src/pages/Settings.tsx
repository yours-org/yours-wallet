import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserCircle,
  Shield,
  Key,
  Lock,
  LogOut,
  Database,
  Gauge,
  ChevronLeft,
  ChevronRight,
  Download,
  QrCode as QrCodeIcon,
  HardDrive,
  Pencil,
  Plus,
  Fingerprint,
  Loader2,
  Copy,
  Check,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Minus,
} from 'lucide-react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { QrCode } from '../components/QrCode';
import { Show } from '../components/Show';
import { SpeedBump } from '../components/SpeedBump';
import { TopNav } from '../components/TopNav';
import { useBottomMenu } from '../hooks/useBottomMenu';
import { useIdentity, resolveImageUrl } from '../hooks/useIdentity';
import { useTheme } from '../hooks/useTheme';
import { useServiceContext } from '../hooks/useServiceContext';
import { YoursEventName } from '../inject';
import { sendMessage } from '../utils/chromeHelpers';
import { FEE_PER_KB } from '../utils/constants';
import { ChromeStorageObject } from '../services/types/chromeStorage.types';
import { AvatarPicker } from '../components/AvatarPicker';
import { CreateAccount } from './onboarding/CreateAccount';
import { RestoreAccount } from './onboarding/RestoreAccount';
import { ImportAccount } from './onboarding/ImportAccount';
import { MasterBackupProgressEvent, streamDataToZip } from '../utils/masterExporter';
import { useSnackbar } from '../hooks/useSnackbar';
import { PermissionsManager } from './PermissionsManager';
import { StorageStatus } from './StorageStatus';
import { YoursIcon } from '../components/YoursIcon';
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
  | 'identity'
  | 'export-keys-options'
  | 'export-keys-qr'
  | 'storage'
  | 'permissions';

type DecisionType =
  | 'sign-out'
  | 'export-master-backup'
  | 'export-keys'
  | 'export-keys-qr-code'
  | 'delete-account'
  | 'inscribe-avatar'
  | 'save-profile';

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
  const { chromeStorageService, keysService, lockWallet, wallet, apiContext } = useServiceContext();
  const [page, setPage] = useState<SettingsPage>(() => {
    if (query === 'manage-accounts') return 'manage-accounts';
    if (query === 'create-account') return 'create-account';
    if (query === 'restore-account') return 'restore-account';
    if (query === 'storage') return 'storage';
    return 'main';
  });
  const [speedBumpMessage, setSpeedBumpMessage] = useState('');
  const [decisionType, setDecisionType] = useState<DecisionType | undefined>();
  const identity = useIdentity(apiContext, chromeStorageService);
  const [exportKeysQrData, setExportKeysAsQrData] = useState('');
  const [shouldVisibleExportedKeys, setShouldVisibleExportedKeys] = useState(false);
  const [enteredName, setEnteredName] = useState(identity.profile.name);
  const [enteredImage, setEnteredImage] = useState(identity.profile.image);
  const [enteredDescription, setEnteredDescription] = useState(identity.profile.description);
  const [enteredAccountName, setEnteredAccountName] = useState('');
  const [enteredAccountIcon, setEnteredAccountIcon] = useState('');
  const [copiedBapId, setCopiedBapId] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [pendingAvatar, setPendingAvatar] = useState<{ base64: string; mimeType: string; byteSize: number } | null>(
    null,
  );
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [masterBackupProgress, setMasterBackupProgress] = useState(0);
  const [masterBackupEventText, setMasterBackupEventText] = useState('');
  const [backupInProgress, setBackupInProgress] = useState(false);
  const [backupAccounts, setBackupAccounts] = useState<
    Array<{ name: string; icon: string; status: 'pending' | 'active' | 'done' }>
  >([]);
  const [backupDone, setBackupDone] = useState(false);
  const [backupError, setBackupError] = useState('');
  const currentAccount = chromeStorageService.getCurrentAccountObject();
  const [customFeeRate, setCustomFeeRate] = useState(currentAccount.account?.settings.customFeeRate ?? FEE_PER_KB);
  const [lockTimeout, setLockTimeout] = useState(currentAccount.account?.settings.lockTimeout ?? 10);
  const [selectedAccountIdentityAddress, setSelectedAccountIdentityAddress] = useState<string | undefined>();

  // React to query deep-links (e.g. clicking "+ Add New Account" in the TopNav
  // wallet switcher while already on the Settings page).
  useEffect(() => {
    if (query === 'manage-accounts') setPage('manage-accounts');
    else if (query === 'create-account') setPage('create-account');
    else if (query === 'restore-account') setPage('restore-account');
    else if (query === 'storage') setPage('storage');
  }, [query]);

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
    const accountCount = chromeStorageService.getAllAccounts().length;
    setDecisionType('export-master-backup');
    setSpeedBumpMessage(
      `This will back up ALL ${accountCount} account${accountCount === 1 ? '' : 's'} in your wallet — keys, transactions, and settings. Make sure you are in a safe place.`,
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

  const handleAvatarUpload = async (file: File) => {
    setShowAvatarPicker(false);
    // Show local preview immediately
    setAvatarPreview(URL.createObjectURL(file));
    // Prepare the image (resize) and show cost confirmation
    try {
      const prepared = await identity.prepareAvatar(file);
      setPendingAvatar(prepared);
      const estimatedSats = prepared.byteSize + 200;
      setDecisionType('inscribe-avatar');
      setSpeedBumpMessage(
        `Inscribing your avatar will cost approximately ${estimatedSats.toLocaleString()} sats. Proceed?`,
      );
      setShowSpeedBump(true);
    } catch {
      addSnackbar('Failed to process image', 'error');
      setAvatarPreview(null);
    }
  };

  const handleAvatarSelectExisting = (url: string) => {
    setShowAvatarPicker(false);
    setEnteredImage(url);
    setAvatarPreview(null);
  };

  const handleConfirmAvatarInscribe = async () => {
    if (!pendingAvatar) return;
    setAvatarUploading(true);
    const res = await identity.inscribeAvatar(pendingAvatar.base64, pendingAvatar.mimeType);
    setAvatarUploading(false);
    setPendingAvatar(null);
    if (res.error) {
      addSnackbar(res.error, 'error');
      setAvatarPreview(null);
    } else if (res.url) {
      setEnteredImage(res.url);
      addSnackbar('Avatar inscribed on-chain', 'success');
    }
  };

  const handleSaveProfileIntent = () => {
    setDecisionType('save-profile');
    setSpeedBumpMessage(
      identity.isPublished
        ? 'Updating your profile will broadcast a transaction. A small fee will be deducted from your wallet.'
        : 'This will create your on-chain identity and save your profile. A small fee will be deducted from your wallet.',
    );
    setShowSpeedBump(true);
  };

  const handleSaveProfile = async () => {
    const res = await identity.saveProfile({
      name: enteredName,
      image: enteredImage,
      description: enteredDescription,
    });
    if (res.error) {
      addSnackbar(res.error, 'error');
    } else {
      addSnackbar('Profile saved on-chain', 'success');
    }
  };

  const handleCopyBapId = () => {
    if (!identity.bapId) return;
    navigator.clipboard.writeText(identity.bapId);
    setCopiedBapId(true);
    setTimeout(() => setCopiedBapId(false), 2000);
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
    if (identity.loading || identity.error) return;
    setEnteredName(identity.profile.name);
    setEnteredImage(identity.profile.image);
    setEnteredDescription(identity.profile.description);
    setAvatarPreview(null);
  }, [identity.loading, identity.error, identity.profile]);

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
      setExportKeysAsQrData('');
    }, 10000);
  };

  const signOut = async () => {
    await chromeStorageService.clear();
    wallet?.close?.();
    setDecisionType(undefined);
    sendMessage({
      action: YoursEventName.SIGNED_OUT,
    });
    setTimeout(() => window.location.reload(), 100);
  };

  const handleCancel = () => {
    setShowSpeedBump(false);
    if (decisionType === 'inscribe-avatar') {
      setAvatarPreview(null);
      setPendingAvatar(null);
    }
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

    if (decisionType === 'export-master-backup' && password) {
      const isVerified = await chromeStorageService.verifyPassword(password);
      if (!isVerified) {
        addSnackbar('Invalid password!', 'error');
        return;
      }
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
    if (decisionType === 'inscribe-avatar') {
      handleConfirmAvatarInscribe();
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }
    if (decisionType === 'save-profile') {
      handleSaveProfile();
      setDecisionType(undefined);
      setShowSpeedBump(false);
    }
  };

  const MAX_LOCK_TIMEOUT_MINUTES = 1440; // 24 hours

  const commitCustomFeeRate = useCallback(async () => {
    const rate = customFeeRate;
    if (!rate || rate < 1) {
      setCustomFeeRate(currentAccount.account?.settings.customFeeRate ?? FEE_PER_KB);
      if (rate !== undefined && rate < 1) addSnackbar('Fee rate must be at least 1 sat/kb', 'error');
      return;
    }
    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (!account || !selectedAccount) return;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccount]: {
        ...account,
        settings: { ...account.settings, customFeeRate: rate },
      },
    };
    await chromeStorageService.updateNested(key, update);
    chrome.runtime.sendMessage({ action: 'UPDATE_FEE_RATE', feeRate: rate }).catch(() => {});
  }, [customFeeRate, chromeStorageService, currentAccount, addSnackbar]);

  const commitLockTimeout = useCallback(async () => {
    let minutes = lockTimeout;
    if (!minutes || minutes < 1) {
      minutes = 10;
      setLockTimeout(minutes);
      if (lockTimeout !== undefined && lockTimeout < 1) addSnackbar('Lock timeout must be at least 1 minute', 'error');
    }
    if (minutes > MAX_LOCK_TIMEOUT_MINUTES) {
      minutes = MAX_LOCK_TIMEOUT_MINUTES;
      setLockTimeout(minutes);
    }
    const { account, selectedAccount } = chromeStorageService.getCurrentAccountObject();
    if (!account || !selectedAccount) return;
    const key: keyof ChromeStorageObject = 'accounts';
    const update: Partial<ChromeStorageObject['accounts']> = {
      [selectedAccount]: {
        ...account,
        settings: { ...account.settings, lockTimeout: minutes },
      },
    };
    await chromeStorageService.updateNested(key, update);
  }, [lockTimeout, chromeStorageService, addSnackbar]);

  const handleMasterBackup = async () => {
    // Populate overlay with all accounts
    const allAccounts = chromeStorageService.getAllAccounts();
    setBackupAccounts(allAccounts.map((a) => ({ name: a.name, icon: a.icon || '', status: 'pending' })));
    setBackupInProgress(true);
    setBackupDone(false);
    setBackupError('');
    setMasterBackupProgress(0);
    setMasterBackupEventText('Preparing backup...');

    try {
      await streamDataToZip(chromeStorageService, (e: MasterBackupProgressEvent) => {
        setMasterBackupEventText(e.message);
        const progress = e.endValue && e.value ? Math.ceil((e.value / e.endValue) * 100) : 0;
        setMasterBackupProgress(progress);

        // Update per-account status based on accountIndex
        if (e.accountIndex !== undefined && e.totalAccounts !== undefined) {
          setBackupAccounts((prev) =>
            prev.map((a, i) => ({
              ...a,
              status: i < e.accountIndex! ? 'done' : i === e.accountIndex! ? 'active' : 'pending',
            })),
          );
        }

        if (e.stage === 'complete') {
          setBackupAccounts((prev) => prev.map((a) => ({ ...a, status: 'done' })));
        }
      });
      setBackupDone(true);
      setMasterBackupEventText('Backup complete! File downloaded.');
      setMasterBackupProgress(100);
      setBackupAccounts((prev) => prev.map((a) => ({ ...a, status: 'done' })));
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setBackupError(msg);
      setMasterBackupEventText(`Backup failed: ${msg}`);
    }
  };

  const dismissBackupOverlay = () => {
    setBackupInProgress(false);
    setBackupDone(false);
    setBackupError('');
    setMasterBackupEventText('');
    setMasterBackupProgress(0);
    setBackupAccounts([]);
  };

  const handleLockWallet = async () => {
    lockWallet();
    handleSelect('bsv');
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
          icon={<Shield size={16} />}
          label="Permissions"
          description="Review and revoke connected apps and permissions"
          onClick={() => setPage('permissions')}
          isLast
        />
      </Section>

      {/* Security section */}
      <Section title="Security">
        <SettingRow
          icon={<Key size={16} />}
          label="Wallet Backup"
          description="Backup seed, download JSON, or QR code"
          onClick={() => setPage('export-keys-options')}
          isFirst
          isLast
        />
      </Section>

      {/* Preferences section */}
      <Section title="Preferences">
        <SettingRow
          icon={<Fingerprint size={16} />}
          label="Identity"
          description="On-chain BAP identity and profile"
          onClick={() => setPage('identity')}
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
              placeholder="100"
              type="number"
              onChange={(e) => setCustomFeeRate(Number(e.target.value))}
              onBlur={() => commitCustomFeeRate()}
              value={customFeeRate}
              style={{ width: '5rem', margin: 0 }}
            />
          }
        />
        <Divider />
        <SettingRow
          icon={<Lock size={16} />}
          label="Auto-Lock (min)"
          description="Lock wallet after inactivity"
          right={
            <Input
              theme={theme}
              placeholder="10"
              type="number"
              onChange={(e) => setLockTimeout(Number(e.target.value))}
              onBlur={() => commitLockTimeout()}
              value={lockTimeout}
              style={{ width: '5rem', margin: 0 }}
            />
          }
        />
      </Section>

      {/* Danger Zone */}
      <Section title="Danger Zone">
        <SettingRow
          icon={<Lock size={16} />}
          label="Lock Wallet"
          description="Immediately lock the wallet"
          onClick={handleLockWallet}
          isFirst
          isLast
        />
        <Divider />
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
      <SubPageHeader title="Wallet Backup" onBack={() => setPage('main')} />
      <motion.div variants={stagger} initial="initial" animate="animate" className="w-full space-y-4">
        {/* Remote Backup — featured card */}
        <motion.div variants={rowVariant}>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setPage('storage')}
            className="w-full rounded-xl p-4 text-left border-0 outline-none cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, rgba(161,255,139,0.08), rgba(52,211,153,0.04))',
              border: '1px solid rgba(161,255,139,0.15)',
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(161,255,139,0.12)' }}
              >
                <Database size={18} color="#A1FF8B" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
                  Remote Backup
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: '#98A2B3' }}>
                  Your wallet is automatically backed up. Manage storage, upgrade, or change providers.
                </p>
              </div>
              <ChevronRight size={16} style={{ color: '#98A2B3' }} />
            </div>
          </motion.button>
        </motion.div>

        {/* Manual backup options */}
        <Section title="Manual Backup">
          <motion.div variants={rowVariant}>
            <SettingRow
              icon={<HardDrive size={16} />}
              label="Master Backup"
              description={`Back up all ${chromeStorageService.getAllAccounts().length} account${chromeStorageService.getAllAccounts().length === 1 ? '' : 's'} — keys, transactions, and settings`}
              onClick={handleMasterBackupIntent}
              isFirst
            />
          </motion.div>
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
        </Section>
      </motion.div>
    </motion.div>
  );

  const avatarSrc = avatarPreview || (enteredImage ? resolveImageUrl(enteredImage, apiContext) : '');

  const identityPage = (
    <motion.div
      key="identity"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="w-full px-4 pb-4"
    >
      <SubPageHeader title="Identity" onBack={() => setPage('main')} />

      {identity.loading && !identity.bapId ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin" style={{ color: '#98A2B3' }} />
        </div>
      ) : (
        <motion.div variants={stagger} initial="initial" animate="animate" className="w-full space-y-3">
          {/* Intro text for first-time users */}
          {!identity.isPublished && (
            <motion.p
              variants={rowVariant}
              className="text-xs text-center"
              style={{ color: '#98A2B3', lineHeight: 1.5 }}
            >
              Set up your on-chain identity so apps and other users can recognize you. Your profile is stored
              permanently on the blockchain.
            </motion.p>
          )}

          {/* Avatar — tap to pick */}
          <motion.div variants={rowVariant} className="flex flex-col items-center">
            <button
              onClick={() => setShowAvatarPicker(true)}
              className="relative cursor-pointer group"
              disabled={avatarUploading}
            >
              <div
                className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center"
                style={{
                  background: avatarSrc ? undefined : 'linear-gradient(135deg, #A1FF8B, #34D399)',
                  border: '2px solid rgba(161,255,139,0.3)',
                }}
              >
                {avatarSrc ? (
                  <img src={avatarSrc} className="w-full h-full object-cover" alt="Avatar" />
                ) : (
                  <UserCircle size={36} color="#010101" />
                )}
                {avatarUploading && (
                  <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/60">
                    <Loader2 size={20} className="animate-spin" style={{ color: '#fff' }} />
                  </div>
                )}
              </div>
              <div
                className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: '#1D2939', border: '2px solid #010101' }}
              >
                <Camera size={12} style={{ color: '#D0D5DD' }} />
              </div>
            </button>
            <p className="text-[10px] mt-1.5" style={{ color: '#667085' }}>
              Tap to change
            </p>
          </motion.div>

          {/* Name */}
          <motion.div variants={rowVariant} className="w-full">
            <Input
              theme={theme}
              placeholder="Your name"
              type="text"
              onChange={(e) => setEnteredName(e.target.value)}
              value={enteredName}
            />
          </motion.div>

          {/* Bio */}
          <motion.div variants={rowVariant} className="w-full">
            <Input
              theme={theme}
              placeholder="A short bio..."
              type="text"
              onChange={(e) => setEnteredDescription(e.target.value)}
              value={enteredDescription}
            />
          </motion.div>

          {identity.error && (
            <p className="text-xs text-center" style={{ color: '#F97066' }}>
              {identity.error}
            </p>
          )}

          {/* Save */}
          <motion.div variants={rowVariant} className="w-full pb-6">
            <Button
              theme={theme}
              type="primary"
              label={identity.isPublished ? 'Update Profile' : 'Create Identity'}
              onClick={handleSaveProfile}
              loading={identity.loading}
              disabled={avatarUploading}
            />
            <p className="text-[10px] text-center mt-1.5" style={{ color: '#667085' }}>
              This will broadcast a small transaction
            </p>
          </motion.div>

          {/* BAP ID — small footer for published identities */}
          {identity.bapId && identity.isPublished && (
            <motion.div variants={rowVariant} className="flex items-center justify-center gap-1.5 pt-1">
              <Fingerprint size={10} style={{ color: '#475467' }} />
              <span
                className="text-[10px] font-mono cursor-pointer"
                style={{ color: '#475467' }}
                onClick={handleCopyBapId}
                title="Copy BAP ID"
              >
                {identity.bapId.slice(0, 10)}...{identity.bapId.slice(-6)}
              </span>
              {copiedBapId ? (
                <Check size={10} style={{ color: '#34D399' }} />
              ) : (
                <Copy size={10} style={{ color: '#475467' }} />
              )}
            </motion.div>
          )}
        </motion.div>
      )}
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
    <>
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
                className="w-full pb-4"
              >
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
                className="w-full pb-4"
              >
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
                className="w-full pb-4"
              >
                <ImportAccount onNavigateBack={() => setPage('restore-account')} />
              </motion.div>
            )}

            {page === 'account-list' && accountList}

            {page === 'edit-account' && editAccount}

            {page === 'identity' && identityPage}

            {page === 'permissions' && (
              <motion.div
                key="permissions"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="w-full px-4 pb-4"
              >
                <SubPageHeader title="Permissions" onBack={() => setPage('main')} />
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
                className="w-full px-4 pb-4"
              >
                <StorageStatus onBack={() => setPage('export-keys-options')} />
              </motion.div>
            )}

            {page === 'export-keys-options' && exportKeyOptionsPage}

            {page === 'export-keys-qr' && exportKeysAsQrCodePage}
          </AnimatePresence>
        </div>
      </Show>
      {showAvatarPicker && (
        <AvatarPicker
          theme={theme}
          apiContext={apiContext}
          onUploadNew={handleAvatarUpload}
          onSelectExisting={handleAvatarSelectExisting}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      {/* Full-screen backup overlay — locks all interaction during backup */}
      <AnimatePresence>
        {backupInProgress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6"
            style={{ backgroundColor: '#010101' }}
          >
            <YoursIcon width="3rem" />

            <h2 className="text-lg font-bold mt-4 mb-1 text-center" style={{ color: '#FFFFFF' }}>
              {backupDone ? 'Backup Complete' : backupError ? 'Backup Failed' : 'Backing Up All Accounts'}
            </h2>
            <p className="text-xs mb-5 text-center" style={{ color: '#98A2B3' }}>
              {backupDone
                ? 'Your backup file has been downloaded.'
                : backupError
                  ? backupError
                  : `Exporting wallet data for ${backupAccounts.length} account${backupAccounts.length === 1 ? '' : 's'}`}
            </p>

            {/* Per-account status list */}
            <div className="w-full max-w-xs space-y-2 mb-5">
              {backupAccounts.map((acct, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: '#17191E' }}
                >
                  <img
                    src={acct.icon || activeCircle}
                    className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                    alt={acct.name}
                  />
                  <span className="text-sm flex-1 truncate" style={{ color: '#FFFFFF' }}>
                    {acct.name}
                  </span>
                  {acct.status === 'done' && <CheckCircle2 size={16} color="#A1FF8B" />}
                  {acct.status === 'active' && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Loader2 size={16} color="#A1FF8B" />
                    </motion.div>
                  )}
                  {acct.status === 'pending' && <Minus size={16} color="#98A2B3" />}
                </div>
              ))}
            </div>

            {/* Progress bar */}
            {!backupDone && !backupError && masterBackupProgress > 0 && (
              <div className="w-full max-w-xs mb-3">
                <ProgressBar
                  completed={masterBackupProgress}
                  bgColor={theme.color.component.progressBar}
                  baseBgColor={theme.color.component.progressBarTrack}
                  height="18px"
                  labelSize="10px"
                  borderRadius="9px"
                />
              </div>
            )}

            {/* Status message */}
            {!backupDone && !backupError && (
              <p className="text-xs text-center" style={{ color: '#98A2B3' }}>
                {masterBackupEventText}
              </p>
            )}

            {/* Error icon */}
            {backupError && (
              <div className="mb-3">
                <AlertTriangle size={32} color="#ef4444" />
              </div>
            )}

            {/* Done / Error dismiss button */}
            {(backupDone || backupError) && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                whileTap={{ scale: 0.95 }}
                onClick={dismissBackupOverlay}
                className="mt-4 px-6 py-2.5 rounded-xl text-sm font-semibold border-0 cursor-pointer"
                style={{
                  background: backupError
                    ? '#ef4444'
                    : `linear-gradient(135deg, ${theme.color.component.primaryButtonLeftGradient}, ${theme.color.component.primaryButtonRightGradient})`,
                  color: backupError ? '#FFFFFF' : theme.color.component.primaryButtonText,
                }}
              >
                {backupError ? 'Close' : 'Done'}
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
