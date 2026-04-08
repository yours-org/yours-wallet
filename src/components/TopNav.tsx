import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Copy, Github, Check } from 'lucide-react';
import logo from '../assets/logos/horizontal-logo.png';
import { useTheme } from '../hooks/useTheme';
import activeCircle from '../assets/active-circle.png';
import { truncate } from '../utils/format';
import { useSnackbar } from '../hooks/useSnackbar';
import { useServiceContext } from '../hooks/useServiceContext';
import { useNavigate } from 'react-router-dom';
import { useBottomMenu } from '../hooks/useBottomMenu';

export const TopNav = () => {
  const { theme } = useTheme();
  const { chromeStorageService, wallet } = useServiceContext();
  const { handleSelect } = useBottomMenu();
  const navigate = useNavigate();
  const { addSnackbar } = useSnackbar();
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const toggleRef = useRef<HTMLDivElement | null>(null);
  const accountObj = chromeStorageService.getCurrentAccountObject();

  const handleCopyToClipboard = (bsvAddress: string) => {
    navigator.clipboard.writeText(bsvAddress).then(() => {
      setCopiedAddress(bsvAddress);
      addSnackbar('Copied!', 'success');
      setTimeout(() => setCopiedAddress(null), 2000);
    });
  };

  const handleSwitchAccount = async (identityAddress: string) => {
    wallet?.close();
    await chromeStorageService.switchAccount(identityAddress);
    setDropdownVisible(false);
    navigate('/bsv-wallet?reload=true');
  };

  const toggleDropdown = (event: React.MouseEvent) => {
    event.stopPropagation();
    setDropdownVisible((prev) => !prev);
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (
      dropdownRef.current &&
      !dropdownRef.current.contains(event.target as Node) &&
      toggleRef.current &&
      !toggleRef.current.contains(event.target as Node)
    ) {
      setDropdownVisible(false);
    }
  };

  useEffect(() => {
    if (dropdownVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownVisible]);

  return (
    <div
      className="flex items-center justify-between fixed top-0 w-full z-10 px-4 h-14"
      style={{ backgroundColor: theme.color.global.walletBackground }}
    >
      {/* Left: Logo + account switcher */}
      <div className="flex items-center gap-2 relative">
        <img src={logo} className="w-24 object-contain" alt="Yours Wallet" />

        <span style={{ color: theme.color.global.gray }} className="text-sm select-none">
          /
        </span>

        {/* Account avatar */}
        <img
          src={accountObj.account?.icon ?? activeCircle}
          className="w-5 h-5 rounded-full object-cover"
          alt="Account"
        />

        {/* Account name + chevron toggle */}
        <div ref={toggleRef} className="flex items-center gap-1 cursor-pointer select-none" onClick={toggleDropdown}>
          <span className="text-xs font-medium truncate max-w-[100px]" style={{ color: theme.color.global.contrast }}>
            {accountObj.account?.name ?? truncate(accountObj.account?.addresses.identityAddress ?? '', 5, 4)}
          </span>
          <motion.div animate={{ rotate: dropdownVisible ? 180 : 0 }} transition={{ duration: 0.2, ease: 'easeInOut' }}>
            <ChevronDown size={14} color={theme.color.global.gray} />
          </motion.div>
        </div>

        {/* Dropdown */}
        <AnimatePresence>
          {dropdownVisible && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="absolute top-9 left-0 z-20 min-w-[220px] max-h-72 overflow-y-auto rounded-xl border"
              style={{
                backgroundColor: theme.color.global.row + 'f0',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderColor: theme.color.global.gray + '30',
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              {chromeStorageService.getAllAccounts().map((account) => (
                <motion.div
                  key={account.addresses.identityAddress}
                  whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                  className="flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors"
                  onClick={() => handleSwitchAccount(account.addresses.identityAddress)}
                >
                  <div className="flex items-center gap-2.5">
                    <img src={account.icon} className="w-6 h-6 rounded-full object-cover" alt={account.name} />
                    <span className="text-sm font-semibold" style={{ color: theme.color.global.contrast }}>
                      {account.name}
                    </span>
                  </div>
                  {account.primaryAddress && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono" style={{ color: theme.color.global.gray }}>
                        {truncate(account.primaryAddress, 3, 3)}
                      </span>
                      <button
                        className="p-1 rounded-md transition-colors hover:bg-white/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyToClipboard(account.primaryAddress!);
                        }}
                      >
                        {copiedAddress === account.primaryAddress ? (
                          <Check size={12} color="#A1FF8B" />
                        ) : (
                          <Copy size={12} color={theme.color.global.gray} />
                        )}
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Divider */}
              <div className="mx-3 h-px" style={{ backgroundColor: theme.color.global.gray + '25' }} />

              {/* Add new account */}
              <motion.div
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                onClick={() => handleSelect('settings', 'manage-accounts')}
              >
                <span className="text-sm font-semibold" style={{ color: theme.color.global.gray }}>
                  + Add New Account
                </span>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: GitHub */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        className="p-2 rounded-lg transition-colors hover:bg-white/5"
        onClick={() => window.open(theme.settings.repo, '_blank')}
      >
        <Github size={18} color={theme.color.global.gray} />
      </motion.button>
    </div>
  );
};
