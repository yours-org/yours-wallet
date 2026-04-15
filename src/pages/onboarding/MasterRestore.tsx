import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { Show } from '../../components/Show';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useServiceContext } from '../../hooks/useServiceContext';
import { restoreMasterFromZip } from '../../utils/masterImporter';
import { useNavigate } from 'react-router-dom';
import { YoursIcon } from '../../components/YoursIcon';

export const MasterRestore = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { chromeStorageService } = useServiceContext();
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const hiddenFileInput = useRef<HTMLInputElement>(null);
  const { addSnackbar } = useSnackbar();
  const [loaderMessage, setLoaderMessage] = useState('Processing...');
  const [progress, setProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleZipUploadClick = () => {
    hiddenFileInput.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/zip') {
      setSelectedFile(file);
      setPasswordError(false);
    } else {
      console.error('Unsupported file type. Please upload a ZIP file.');
      addSnackbar('Unsupported file type. Please upload a ZIP file.', 'error');
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file && file.type === 'application/zip') {
      setSelectedFile(file);
      setPasswordError(false);
    } else {
      addSnackbar('Unsupported file type. Please upload a ZIP file.', 'error');
    }
  };

  const handleRestore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFile || !password) return;

    try {
      setLoading(true);
      setPasswordError(false);
      await restoreMasterFromZip(chromeStorageService, handleProgress, selectedFile, password);
      addSnackbar('Wallet restored successfully!', 'success');
      window.location.reload();
    } catch (error) {
      console.error('Error restoring from ZIP file', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('Invalid password')) {
        setPasswordError(true);
        addSnackbar('Invalid password', 'error');
      } else {
        addSnackbar(`Error restoring: ${message}`, 'error');
      }
      setLoading(false);
    }
  };

  const handleProgress = (event: { message: string; value?: number; endValue?: number }) => {
    setLoaderMessage(event.message);
    const progressValue = event.value && event.endValue ? Math.round((event.value / event.endValue) * 100) : 0;
    setProgress(progressValue > 100 ? 100 : progressValue);
  };

  const handleBack = () => {
    if (selectedFile) {
      setSelectedFile(null);
      setPassword('');
      setPasswordError(false);
    } else {
      navigate('/restore-wallet');
    }
  };

  const accentLeft = theme.color.component.primaryButtonLeftGradient;
  const accentRight = theme.color.component.primaryButtonRightGradient;
  const contrast = theme.color.global.contrast;
  const gray = theme.color.global.gray;
  const row = theme.color.global.row;
  const bg = theme.color.global.walletBackground;

  return (
    <Show
      when={!loading}
      whenFalseContent={<PageLoader theme={theme} message={loaderMessage} showProgressBar barProgress={progress} />}
    >
      <div className="flex flex-col items-center w-full px-2 pt-4 pb-20">
        <div className="flex w-full items-center gap-3 px-2 pb-4">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleBack}
            className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 border-0 outline-none cursor-pointer"
            style={{ background: '#17191E' }}
          >
            <ArrowLeft size={16} style={{ color: '#FFFFFF' }} />
          </motion.button>
          <span className="text-base font-bold" style={{ color: '#FFFFFF' }}>
            Restore from Backup
          </span>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="mb-4"
        >
          <YoursIcon width="4rem" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl font-bold mb-1 text-center"
          style={{ color: contrast }}
        >
          Restore from Backup
        </motion.h2>

        <AnimatePresence mode="wait">
          {!selectedFile ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center w-full"
            >
              <p className="text-xs mb-5 text-center px-4" style={{ color: gray }}>
                Upload your backup ZIP file to restore your wallet.
              </p>

              {/* Drop zone */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleZipUploadClick}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center w-[87%] rounded-2xl border-2 border-dashed py-8 gap-3 cursor-pointer transition-colors duration-200"
                style={{
                  borderColor: isDragOver ? accentLeft : gray + '40',
                  backgroundColor: isDragOver ? accentLeft + '10' : row,
                  color: contrast,
                }}
                aria-label="Select or drop backup ZIP file"
              >
                <UploadCloud size={36} strokeWidth={1.5} style={{ color: isDragOver ? accentLeft : gray }} />
                <div className="text-center">
                  <p className="text-sm font-semibold" style={{ color: isDragOver ? accentLeft : contrast }}>
                    {isDragOver ? 'Drop it here' : 'Select Backup File'}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: gray }}>
                    or drag & drop a .zip file
                  </p>
                </div>
              </motion.button>

              <input
                type="file"
                ref={hiddenFileInput}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                accept=".zip,application/zip"
              />
            </motion.div>
          ) : (
            <motion.div
              key="password"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center w-full"
            >
              {/* Selected file chip */}
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3 w-[87%]"
                style={{ backgroundColor: row, borderColor: accentLeft + '40', border: '1px solid' }}
              >
                <UploadCloud size={14} style={{ color: accentLeft }} />
                <span className="text-xs font-medium truncate flex-1" style={{ color: contrast }}>
                  {selectedFile.name}
                </span>
                <motion.button
                  whileHover={{ opacity: 0.7 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    setSelectedFile(null);
                    setPassword('');
                    setPasswordError(false);
                  }}
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: gray, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ✕
                </motion.button>
              </div>

              <p className="text-xs mb-4 text-center px-4" style={{ color: gray }}>
                Enter your wallet password to restore.
              </p>

              <form onSubmit={handleRestore} className="flex flex-col items-center w-full">
                <Input
                  theme={theme}
                  placeholder="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  shake={passwordError ? 'true' : 'false'}
                  autoFocus
                  onKeyDown={(e) => e.stopPropagation()}
                />

                {/* Progress bar */}
                <AnimatePresence>
                  {progress > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="w-[87%] mt-2 mb-1"
                    >
                      <div
                        className="w-full h-1.5 rounded-full overflow-hidden"
                        style={{ backgroundColor: gray + '30' }}
                      >
                        <motion.div
                          animate={{ width: `${progress}%` }}
                          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, ${accentLeft}, ${accentRight})` }}
                        />
                      </div>
                      <p className="text-[10px] mt-1 text-center" style={{ color: gray }}>
                        {progress}%
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-3 w-full">
                  <Button theme={theme} type="primary" label="Restore Wallet" disabled={!password} isSubmit />
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Show>
  );
};
