import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CheckCircle, Upload } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { YoursIcon } from '../../components/YoursIcon';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { sleep } from '../../utils/sleep';
import { useServiceContext } from '../../hooks/useServiceContext';
import { WifKeys } from '../../services/types/keys.types';
import { useNavigate } from 'react-router-dom';
import { saveAccountDataToChromeStorage } from '../../utils/chromeStorageHelpers';

export type ImportAccountProps = {
  onNavigateBack: () => void;
  newWallet?: boolean;
};

const stepVariants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

export const ImportAccount = ({ onNavigateBack, newWallet = false }: ImportAccountProps) => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [step, setStep] = useState(1);
  const [payPk, setPayPk] = useState('');
  const [ordPk, setOrdPk] = useState('');
  const [identityPk, setIdentityPk] = useState('');
  const { addSnackbar } = useSnackbar();
  const { keysService, chromeStorageService } = useServiceContext();
  const { hideMenu, showMenu } = useBottomMenu();
  const [loading, setLoading] = useState(false);
  const [explicitlyDisableButton, setExplicitlyDisableButton] = useState(false);
  const hiddenFileInput = useRef<HTMLInputElement>(null);
  const [accountName, setAccountName] = useState('');
  const [iconURL, setIconURL] = useState('');

  useEffect(() => {
    newWallet && hideMenu();
    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu, newWallet]);

  const handleImport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setLoading(true);
      if (password.length < 8) {
        setLoading(false);
        addSnackbar(newWallet ? 'The password must be at least 8 characters!' : 'Invalid Password!', 'error');
        return;
      }

      if (newWallet && password !== passwordConfirm) {
        addSnackbar('The passwords do not match!', 'error');
        return;
      }

      if (!payPk || !ordPk) {
        addSnackbar('Both payPk and ordPk WIFs are required!', 'error');
        return;
      }

      if (!identityPk) {
        setLoading(false);
        setExplicitlyDisableButton(true);
        setExplicitlyDisableButton(false);
        setLoading(true);
      }

      await sleep(50);
      const keys = await keysService.generateKeysFromWifAndStoreEncrypted(
        password,
        {
          payPk,
          ordPk,
          identityPk,
        },
        newWallet,
      );
      if (!keys) {
        addSnackbar('An error occurred while creating the account! Make sure your password is correct.', 'error');
        return;
      }

      await chromeStorageService.switchAccount(keys.identityAddress || identityPk);
      await saveAccountDataToChromeStorage(chromeStorageService, accountName, iconURL);
      setStep(3);
    } catch (error) {
      console.log(error);
      addSnackbar('An error occurred while importing the account!', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonUploadClick = () => {
    hiddenFileInput.current?.click();
  };

  const handleFileRead = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        try {
          const jsonData = JSON.parse(text) as WifKeys;
          if (!jsonData.payPk || !jsonData.ordPk) {
            addSnackbar('Invalid 1Sat Ord Wallet format!', 'error');
            return;
          }
          if (jsonData.mnemonic) {
            addSnackbar(
              'Invalid 1Sat Ord Wallet format. File contains seed phrase. Please use a different restore method using your seed phrase!',
              'error',
              4000,
            );
            return;
          }
          setPayPk(jsonData.payPk ? jsonData.payPk : '');
          setOrdPk(jsonData.ordPk ? jsonData.ordPk : '');
          setIdentityPk(jsonData.identityPk ? jsonData.identityPk : '');
          setStep(2);
        } catch (error) {
          console.error('Error parsing JSON file', error);
          addSnackbar('Error parsing JSON file!', 'error');
          return;
        }
      };
      reader.readAsText(file);
    } else {
      console.error('Unsupported file type. Please upload a JSON file.');
      addSnackbar('Unsupported file type. Please upload a JSON file.', 'error');
    }
  };

  const accentLeft = theme.color.component.primaryButtonLeftGradient;
  const accentRight = theme.color.component.primaryButtonRightGradient;
  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const row = theme.color.global.row;
  const bg = theme.color.global.walletBackground;

  const PageHeader = ({ title, onClick }: { title: string; onClick: () => void }) => (
    <div className="flex w-full items-center gap-3 px-4 pb-4">
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

  const enterWifsStep = (
    <div className="flex flex-col items-center w-full pb-20">
      <PageHeader title="Import a WIF Wallet" onClick={() => (newWallet ? navigate('/') : onNavigateBack())} />
      <p className="text-xs mb-4 text-center px-4" style={{ color: gray }}>
        Input assets directly from your WIF private keys or import a 1Sat JSON Wallet.
      </p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setStep(2);
        }}
        className="flex flex-col items-center w-full"
      >
        <Input
          theme={theme}
          placeholder="Pay WIF private key"
          type="text"
          value={payPk}
          onChange={(e) => setPayPk(e.target.value)}
        />
        <Input
          theme={theme}
          placeholder="Ord WIF private key"
          type="text"
          value={ordPk}
          onChange={(e) => setOrdPk(e.target.value)}
        />
        <Input
          theme={theme}
          placeholder="Identity WIF private key"
          type="text"
          value={identityPk}
          onChange={(e) => setIdentityPk(e.target.value)}
        />

        <p className="text-xs text-center my-3 px-4" style={{ color: gray + 'bb' }}>
          Make sure you are in a safe place and no one is watching.
        </p>

        <Button theme={theme} type="primary" label="Next" isSubmit />
      </form>

      {/* JSON upload */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 22 }}
        onClick={handleJsonUploadClick}
        className="flex items-center justify-center gap-2 w-[87%] h-9 rounded-xl border text-sm font-semibold my-1"
        style={{
          borderColor: gray + '40',
          color: contrast,
          background: row,
        }}
        aria-label="Upload 1Sat JSON wallet file"
      >
        <Upload size={14} style={{ color: accentLeft }} />
        Upload 1Sat JSON
      </motion.button>

      <input
        type="file"
        ref={hiddenFileInput}
        onChange={handleFileRead}
        style={{ display: 'none' }}
        accept="application/json"
      />
    </div>
  );

  const passwordStep = (
    <div className="flex flex-col items-center w-full pb-20">
      <PageHeader title={newWallet ? 'Create Password' : 'Import Account'} onClick={() => setStep(1)} />
      <p className="text-xs mb-4 text-center" style={{ color: gray }}>
        {newWallet ? 'This will be used to unlock your wallet.' : 'Enter your existing password.'}
      </p>

      <form onSubmit={handleImport} className="flex flex-col items-center w-full">
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
          <Button theme={theme} type="primary" label="Finish" disabled={explicitlyDisableButton || loading} isSubmit />
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
        Wallet Imported!
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.33 }}
        className="text-sm mb-6 text-center"
        style={{ color: gray }}
      >
        Your wallet has been imported successfully.
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
    <>
      <Show when={!loading} whenFalseContent={<PageLoader theme={theme} message="Importing..." />}>
        <div className="flex flex-col items-center w-full px-2 pt-6 pb-4">
          <Show when={newWallet}>
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="mb-4"
            >
              <YoursIcon width="4rem" />
            </motion.div>
          </Show>

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
                {enterWifsStep}
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
                {passwordStep}
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
                {successStep}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Show>
    </>
  );
};
