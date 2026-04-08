import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Copy, Check, CheckCircle } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { Show } from '../../components/Show';
import { useBottomMenu } from '../../hooks/useBottomMenu';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { sleep } from '../../utils/sleep';
import { useServiceContext } from '../../hooks/useServiceContext';
import { ToggleSwitch } from '../../components/ToggleSwitch';
import { NetWork } from 'yours-wallet-provider';
import { useNavigate } from 'react-router-dom';
import { YoursIcon } from '../../components/YoursIcon';
import { saveAccountDataToChromeStorage } from '../../utils/chromeStorageHelpers';

export type CreateAccountProps = {
  onNavigateBack: () => void;
  newWallet?: boolean;
};

const TOTAL_STEPS = 3;

const stepVariants = {
  enter: { opacity: 0, x: 24 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

export const CreateAccount = ({ onNavigateBack, newWallet = false }: CreateAccountProps) => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { addSnackbar } = useSnackbar();
  const [network, setNetwork] = useState<NetWork>(NetWork.Mainnet);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [step, setStep] = useState(1);
  const [seedWords, setSeedWords] = useState<string[]>([]);
  const [identityAddress, setIdentityAddress] = useState('');
  const { hideMenu, showMenu } = useBottomMenu();
  const [loading, setLoading] = useState(false);
  const { keysService, chromeStorageService } = useServiceContext();
  const [accountName, setAccountName] = useState('');
  const [iconURL, setIconURL] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    newWallet && hideMenu();
    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu, newWallet]);

  const handleKeyGeneration = async (event?: React.FormEvent<HTMLFormElement>) => {
    try {
      event && event.preventDefault();
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

      const keys = await keysService.generateSeedAndStoreEncrypted(password, newWallet, network);

      if (!keys?.mnemonic) {
        addSnackbar('An error occurred while creating the wallet!', 'error');
        return;
      }
      setSeedWords(keys.mnemonic.split(' '));

      if (!keys.identityAddress) {
        addSnackbar('An error occurred while getting the identity address!', 'error');
        return;
      }
      setIdentityAddress(keys.identityAddress);
      await saveAccountDataToChromeStorage(chromeStorageService, accountName, iconURL);
      setStep(2);
    } catch (error) {
      console.log(error);
      addSnackbar('An error occurred while creating the account! Make sure your password is correct.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(seedWords.join(' ').trim()).then(() => {
      setCopied(true);
      addSnackbar('Copied!', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const accentLeft = theme.color.component.primaryButtonLeftGradient;
  const accentRight = theme.color.component.primaryButtonRightGradient;
  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const row = theme.color.global.row;
  const bg = theme.color.global.walletBackground;

  // Step progress dots
  const StepIndicator = () => (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            width: step === i + 1 ? 24 : 8,
            opacity: step > i + 1 ? 0.4 : step === i + 1 ? 1 : 0.25,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="h-1.5 rounded-full"
          style={{
            background: step >= i + 1 ? `linear-gradient(90deg, ${accentLeft}, ${accentRight})` : gray + '40',
          }}
        />
      ))}
    </div>
  );

  const BackArrow = ({ onClick }: { onClick: () => void }) => (
    <motion.button
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className="self-start ml-3 mb-3 flex items-center justify-center w-8 h-8 rounded-full border-0 outline-none cursor-pointer"
      style={{ background: '#17191E', color: gray }}
    >
      <ArrowLeft size={16} />
    </motion.button>
  );

  const passwordStep = (
    <div className="flex flex-col items-center w-full">
      <BackArrow onClick={() => (newWallet ? navigate('/') : onNavigateBack())} />
      <StepIndicator />
      <h2 className="text-xl font-bold mb-1 text-center" style={{ color: contrast }}>
        {newWallet ? 'Create password' : 'New Account'}
      </h2>
      <p className="text-xs mb-5 text-center" style={{ color: gray }}>
        {newWallet ? 'This will be used to unlock your wallet.' : 'Enter your existing password.'}
      </p>

      <form onSubmit={handleKeyGeneration} className="flex flex-col items-center w-full gap-0">
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
            placeholder="Confirm password"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
        </Show>

        {/* Network toggle */}
        <div className="flex items-center w-[87%] mt-3 mb-5 gap-3">
          <ToggleSwitch
            theme={theme}
            on={network === NetWork.Testnet}
            onChange={() => setNetwork(network === NetWork.Mainnet ? NetWork.Testnet : NetWork.Mainnet)}
          />
          <span className="text-xs text-left" style={{ color: gray }}>
            {network === NetWork.Testnet ? 'Turn off for mainnet account' : 'Turn on for testnet account'}
          </span>
        </div>

        <Button
          theme={theme}
          type="primary"
          label={newWallet ? 'Generate Seed' : 'Create New Account'}
          disabled={loading}
          isSubmit
        />
      </form>
    </div>
  );

  const copySeedStep = (
    <div className="flex flex-col items-center w-full">
      <StepIndicator />
      <h2 className="text-xl font-bold mb-1 text-center" style={{ color: contrast }}>
        Your recovery phrase
      </h2>
      <p className="text-xs mb-4 text-center px-4" style={{ color: gray }}>
        Safely write down and store your seed phrase in a safe place.
      </p>

      {/* Word grid */}
      <div className="w-[87%] rounded-xl border p-4 mb-1" style={{ backgroundColor: row, borderColor: gray + '30' }}>
        <div className="grid grid-cols-3 gap-x-3 gap-y-2">
          {seedWords.map((word, i) => (
            <div key={i} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5" style={{ backgroundColor: bg }}>
              <span className="text-[10px] font-mono w-4 shrink-0 text-right" style={{ color: gray }}>
                {i + 1}
              </span>
              <span className="text-xs font-semibold truncate" style={{ color: contrast }}>
                {word}
              </span>
            </div>
          ))}
        </div>

        {/* Copy row */}
        <motion.button
          whileHover={{ opacity: 0.8 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleCopyToClipboard}
          className="flex items-center gap-2 mt-4 mx-auto"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <AnimatePresence mode="wait">
            {copied ? (
              <motion.span
                key="check"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Check size={14} style={{ color: accentLeft }} />
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Copy size={14} style={{ color: accentLeft }} />
              </motion.span>
            )}
          </AnimatePresence>
          <span className="text-xs font-medium underline underline-offset-2" style={{ color: accentLeft }}>
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </span>
        </motion.button>
      </div>

      <p className="text-[10px] mt-2 mb-4 text-center px-6" style={{ color: gray + 'bb' }}>
        Make sure you are in a safe place and no one is watching.
      </p>

      <Button
        theme={theme}
        type="primary"
        label="Next"
        onClick={async () => {
          setSeedWords([]);
          await chromeStorageService.switchAccount(identityAddress);
          setStep(3);
        }}
      />
    </div>
  );

  const successStep = (
    <div className="flex flex-col items-center w-full">
      <StepIndicator />
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
        className="mb-5 mt-2"
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
        Wallet Ready!
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.33 }}
        className="text-sm mb-6 text-center"
        style={{ color: gray }}
      >
        Your wallet is set up and ready to use.
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
    <Show when={!loading} whenFalseContent={<PageLoader theme={theme} message="Generating keys..." />}>
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
              {passwordStep}
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
              {copySeedStep}
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
  );
};
