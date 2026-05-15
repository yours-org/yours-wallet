import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle, ChevronRight, Upload } from 'lucide-react';
import relayXLogo from '../../assets/relayx.svg';
import twetchLogo from '../../assets/twetch.svg';
import yoursWhiteLogo from '../../assets/logos/white-logo.png';
import otherWallet from '../../assets/other-wallet.svg';
import wifWallet from '../../assets/wif-wallet.svg';
import masterWallet from '../../assets/master-wallet.svg';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { Show } from '../../components/Show';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { WalletRow } from '../../components/WalletRow';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { sleep } from '../../utils/sleep';
import { useServiceContext } from '../../hooks/useServiceContext';
import { SupportedWalletImports } from '../../services/types/keys.types';
import { SettingsPage } from '../Settings';
import { YoursIcon } from '../../components/YoursIcon';
import { saveAccountDataToChromeStorage } from '../../utils/chromeStorageHelpers';

export type RestoreAccountProps = {
  onNavigateBack: (page: SettingsPage) => void;
  newWallet?: boolean;
};

const stepVariants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

export const RestoreAccount = ({ onNavigateBack, newWallet = false }: RestoreAccountProps) => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [step, setStep] = useState(1);
  const [seedWords, setSeedWords] = useState<string>('');
  const { addSnackbar } = useSnackbar();
  const { hideMenu, showMenu } = useBottomMenu();
  const [loading, setLoading] = useState(false);
  const [isExpertImport, setIsExpertImport] = useState(false);
  const [importWallet, setImportWallet] = useState<SupportedWalletImports | undefined>();
  const [walletDerivation, setWalletDerivation] = useState<string | null>(null);
  const [ordDerivation, setOrdDerivation] = useState<string | null>(null);
  const [identityDerivation, setIdentityDerivation] = useState<string | null>(null);
  const { keysService, chromeStorageService } = useServiceContext();
  const [accountName, setAccountName] = useState('');
  const [iconURL, setIconURL] = useState('');
  const hiddenYoursFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    newWallet && hideMenu();
    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu, newWallet]);

  const handleExpertToggle = () => setIsExpertImport(!isExpertImport);

  const handleYoursJsonUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/json') {
      addSnackbar('Please upload a JSON file.', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const jsonData = JSON.parse(text);
        if (!jsonData.mnemonic) {
          addSnackbar('No seed phrase found in file.', 'error');
          return;
        }
        setSeedWords(jsonData.mnemonic);
        if (jsonData.payDerivationPath) setWalletDerivation(jsonData.payDerivationPath);
        if (jsonData.ordDerivationPath) setOrdDerivation(jsonData.ordDerivationPath);
        if (jsonData.identityDerivationPath) setIdentityDerivation(jsonData.identityDerivationPath);
        setStep(3);
      } catch {
        addSnackbar('Error parsing JSON file!', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleRestore = async (event: React.FormEvent<HTMLFormElement>) => {
    try {
      event.preventDefault();
      setLoading(true);
      if (password.length < 8) {
        addSnackbar(newWallet ? 'The password must be at least 8 characters!' : 'Invalid Password!', 'error');
        return;
      }

      if (newWallet && password !== passwordConfirm) {
        addSnackbar('The passwords do not match!', 'error');
        return;
      }

      await sleep(50);
      const keys = await keysService.generateSeedAndStoreEncrypted(
        password,
        newWallet,
        seedWords,
        walletDerivation,
        ordDerivation,
        identityDerivation,
        importWallet,
      );
      if (!keys?.mnemonic) {
        addSnackbar('An error occurred while creating the account! Make sure your password is correct.', 'error');
        return;
      }

      const chromeObject = await chromeStorageService.getAndSetStorage();
      if (!chromeObject?.accounts) throw new Error('No accounts found!');
      const objKeys = Object.keys(chromeObject.accounts);
      if (!objKeys) throw new Error('Object identity address not found');
      await chromeStorageService.switchAccount(keys.identityAddress);
      await saveAccountDataToChromeStorage(chromeStorageService, accountName, iconURL);

      setStep(4);
    } catch (error) {
      console.log(error);
      addSnackbar('An error occurred while restoring the account!', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleWalletSelection = (wallet?: SupportedWalletImports) => {
    setImportWallet(wallet);
    if (wallet === 'wif') {
      newWallet ? navigate('/import-wallet') : onNavigateBack('import-wif');
      return;
    }
    if (newWallet && wallet === 'master') {
      navigate('/master-restore');
      return;
    }
    setStep(2);
  };

  const getRestoreTitle = () => {
    return importWallet === 'yours'
      ? `Restore ${theme.settings.walletName} wallet`
      : importWallet === 'panda'
        ? 'Restore Panda wallet'
        : importWallet === 'relayx'
          ? 'Restore Relay wallet'
          : importWallet === 'twetch'
            ? 'Restore Twetch wallet'
            : 'Restore wallet';
  };

  const getRestoreDescription = () => {
    return importWallet
      ? 'Enter your seed phrase'
      : 'Enter a seed phrase and use custom derivation paths to import a wallet from anywhere!';
  };

  const accentLeft = theme.color.component.primaryButtonLeftGradient;
  const accentRight = theme.color.component.primaryButtonRightGradient;
  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const row = theme.color.global.row;
  const bg = theme.color.global.walletBackground;

  // Wallet option rows
  type WalletDef = { id: SupportedWalletImports | undefined; label: string; logo: React.ReactNode };
  const walletOptions: WalletDef[] = [
    {
      id: 'yours',
      label: theme.settings.walletName,
      logo: (
        <div
          className="flex items-center justify-center rounded-lg"
          style={{ backgroundColor: '#000', width: '2.25rem', height: '2.25rem', padding: '0.35rem' }}
        >
          <img src={yoursWhiteLogo} alt="Yours" style={{ width: '1rem', height: 'auto' }} />
        </div>
      ),
    },
    {
      id: 'relayx',
      label: 'RelayX',
      logo: <img src={relayXLogo} alt="RelayX" style={{ width: 'auto', height: '2.25rem' }} />,
    },
    {
      id: 'twetch',
      label: 'Twetch',
      logo: <img src={twetchLogo} alt="Twetch" style={{ width: 'auto', height: '2.25rem' }} />,
    },
    {
      id: 'wif',
      label: 'Restore with private key',
      logo: <img src={wifWallet} alt="WIF" style={{ width: 'auto', height: '2.25rem' }} />,
    },
    ...(newWallet
      ? [
          {
            id: 'master' as SupportedWalletImports,
            label: 'Restore from master backup',
            logo: (
              <div
                className="flex items-center justify-center rounded-lg"
                style={{ backgroundColor: '#000', width: '2.25rem', height: '2.25rem', padding: '0.35rem' }}
              >
                <img src={masterWallet} alt="Master" style={{ width: '1.25rem' }} />
              </div>
            ),
          },
        ]
      : []),
    {
      id: 'other',
      label: 'Other',
      logo: <img src={otherWallet} alt="Other" style={{ width: 'auto', height: '2.25rem' }} />,
    },
  ];

  const PageHeader = ({ title, onClick }: { title: string; onClick: () => void }) => (
    <div className="flex w-full items-center gap-3 px-4 pb-4 pt-4 sticky top-0 z-10" style={{ backgroundColor: bg }}>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={onClick}
        className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 border-0 outline-none cursor-pointer"
        style={{ background: '#17191E' }}
      >
        <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
      </motion.button>
      <span className="text-base font-bold" style={{ color: '#FFFFFF' }}>
        {title}
      </span>
    </div>
  );

  /** Back button + title + wallet icon for sub-steps. Rendered inside each step so it animates with the content. */
  const SubStepHeader = ({ title, onBack }: { title: string; onBack: () => void }) => (
    <>
      <div className="flex w-full items-center gap-3 px-4 pb-4 pt-4 sticky top-0 z-10" style={{ backgroundColor: bg }}>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 border-0 outline-none cursor-pointer"
          style={{ background: '#17191E' }}
        >
          <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
        </motion.button>
        <span className="text-base font-bold" style={{ color: '#FFFFFF' }}>
          {title}
        </span>
      </div>
      {newWallet && (
        <div
          className="flex items-center justify-center rounded-2xl mb-4 mt-2"
          style={{ width: '4.5rem', height: '4.5rem', backgroundColor: '#17191E' }}
        >
          {importWallet === 'relayx' ? (
            <img src={relayXLogo} alt="RelayX" style={{ width: 'auto', height: '2.5rem' }} />
          ) : importWallet === 'twetch' ? (
            <img src={twetchLogo} alt="Twetch" style={{ width: 'auto', height: '2.5rem' }} />
          ) : importWallet === 'wif' ? (
            <img src={wifWallet} alt="WIF" style={{ width: 'auto', height: '2.5rem' }} />
          ) : importWallet === 'other' ? (
            <img src={otherWallet} alt="Other" style={{ width: 'auto', height: '2.5rem' }} />
          ) : (
            <img src={yoursWhiteLogo} alt="Yours" style={{ width: '1.75rem', height: 'auto' }} />
          )}
        </div>
      )}
    </>
  );

  const selectImportWallet = (
    <div className="flex flex-col items-center w-full pb-20">
      <PageHeader
        title="Restore a Wallet"
        onClick={() => (newWallet ? navigate('/') : onNavigateBack('manage-accounts'))}
      />
      <p className="text-xs mb-4 text-center px-4" style={{ color: gray }}>
        Select the wallet you'd like to restore from
      </p>

      <div className="w-full flex flex-col gap-2.5 mb-3">
        {walletOptions.map((opt) =>
          opt.id ? (
            <WalletRow
              key={opt.id}
              onClick={() => handleWalletSelection(opt.id)}
              element={
                <div className="flex items-center gap-3 w-full">
                  {opt.logo}
                  <span className="text-sm font-semibold flex-1" style={{ color: contrast }}>
                    {opt.label}
                  </span>
                  <ChevronRight size={16} style={{ color: gray }} />
                </div>
              }
            />
          ) : null,
        )}
      </div>
    </div>
  );

  const enterSeedStep = (
    <div className="flex flex-col items-center w-full pb-20">
      <SubStepHeader title={getRestoreTitle()} onBack={() => setStep(1)} />
      <p className="text-xs mb-4 text-center px-4" style={{ color: gray }}>
        {getRestoreDescription()}
      </p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setStep(3);
        }}
        className="flex flex-col items-center w-full"
      >
        <div className="w-[87%] mb-2">
          <textarea
            placeholder="Enter secret recovery words"
            onChange={(e) => setSeedWords(e.target.value)}
            rows={isExpertImport ? 3 : 4}
            className="w-full rounded-xl border text-sm outline-none resize-none px-4 py-3 transition-all duration-200"
            style={{
              backgroundColor: row,
              borderColor: gray + '40',
              color: contrast,
              fontFamily: "'Inter', Arial, Helvetica, sans-serif",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = accentLeft + '80';
              e.currentTarget.style.boxShadow = `0 0 0 2px ${accentLeft}30`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = gray + '40';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        <Show when={isExpertImport}>
          <Input
            theme={theme}
            placeholder="Wallet Derivation ex. m/44'/236'/0'/0/0"
            type="text"
            value={walletDerivation ?? ''}
            onChange={(e) => setWalletDerivation(e.target.value)}
            style={{ margin: '0.1rem', width: '85%' }}
          />
          <Input
            theme={theme}
            placeholder="Ordinal Derivation ex. m/44'/236'/1'/0/0"
            type="text"
            value={ordDerivation ?? ''}
            onChange={(e) => setOrdDerivation(e.target.value)}
            style={{ margin: '0.1rem', width: '85%' }}
          />
          <Input
            theme={theme}
            placeholder="Identity Derivation ex. m/0'/236'/0'/0/0"
            type="text"
            value={identityDerivation ?? ''}
            onChange={(e) => setIdentityDerivation(e.target.value)}
            style={{ margin: '0.1rem 0 0.5rem', width: '85%' }}
          />
        </Show>

        <Show when={importWallet === 'other'}>
          <div className="flex items-center w-[87%] my-2 gap-3">
            <ToggleSwitch theme={theme} on={isExpertImport} onChange={handleExpertToggle} />
            <span className="text-xs text-left" style={{ color: gray }}>
              Use custom derivations
            </span>
          </div>
        </Show>

        <p className="text-xs text-center my-3 px-4" style={{ color: gray + 'bb' }}>
          Make sure you are in a safe place and no one is watching.
        </p>

        <Button theme={theme} type="primary" label="Next" isSubmit />
      </form>

      {/* Yours JSON upload — extracts seed and derivation paths from key backup */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        onClick={() => hiddenYoursFileInput.current?.click()}
        className="flex items-center justify-center gap-2 w-[87%] h-9 rounded-xl border text-sm font-semibold mt-2"
        style={{
          borderColor: gray + '40',
          color: contrast,
          background: row,
        }}
      >
        <Upload size={14} style={{ color: accentLeft }} />
        Upload Yours JSON
      </motion.button>

      <input
        type="file"
        ref={hiddenYoursFileInput}
        onChange={handleYoursJsonUpload}
        style={{ display: 'none' }}
        accept="application/json"
      />
    </div>
  );

  const passwordStep = (
    <div className="flex flex-col items-center w-full pb-20">
      <SubStepHeader title={newWallet ? 'Create Password' : 'Import Account'} onBack={() => setStep(2)} />
      <p className="text-xs mb-4 text-center" style={{ color: gray }}>
        {newWallet ? 'This will be used to unlock your wallet.' : 'Enter your existing password.'}
      </p>

      <form onSubmit={handleRestore} className="flex flex-col items-center w-full">
        <Input
          theme={theme}
          placeholder="Account Name"
          type="text"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
        />
        <Input
          theme={theme}
          placeholder="Icon URL"
          type="text"
          value={iconURL}
          onChange={(e) => setIconURL(e.target.value)}
        />
        <Input
          theme={theme}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Show when={newWallet}>
          <Input
            theme={theme}
            placeholder="Confirm Password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
        </Show>
        <div className="mt-3 w-full">
          <Button theme={theme} type="primary" label="Finish" disabled={loading} isSubmit />
        </div>
      </form>
    </div>
  );

  const successStep = (
    <div className="flex flex-col items-center w-full">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
        className="mb-5 mt-4"
      >
        <CheckCircle size={56} style={{ color: accentLeft }} strokeWidth={1.5} />
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="text-2xl font-bold mb-2 text-center"
        style={{ color: contrast }}
      >
        Wallet Restored!
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.33 }}
        className="text-sm mb-6 text-center"
        style={{ color: gray }}
      >
        Your wallet has been successfully restored.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42 }}
        className="w-full"
      >
        <Button
          theme={theme}
          type="primary"
          label="Enter"
          onClick={() => {
            window.location.reload();
          }}
        />
      </motion.div>
    </div>
  );

  return (
    <Show when={!loading} whenFalseContent={<PageLoader theme={theme} message="Restoring..." />}>
      <div className="flex flex-col items-center w-full px-2 pt-4 pb-4">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="w-full"
            >
              {selectImportWallet}
            </motion.div>
          )}
          {step === 2 && (
            <motion.div
              key="step2"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="w-full"
            >
              {enterSeedStep}
            </motion.div>
          )}
          {step === 3 && (
            <motion.div
              key="step3"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="w-full"
            >
              {passwordStep}
            </motion.div>
          )}
          {step === 4 && (
            <motion.div
              key="step4"
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="w-full"
            >
              {successStep}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Show>
  );
};
