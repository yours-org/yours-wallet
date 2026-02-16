import React, { useRef, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PageLoader } from '../../components/PageLoader';
import { FormContainer, HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useServiceContext } from '../../hooks/useServiceContext';
import { restoreMasterFromZip } from '../../utils/masterImporter';
import { useNavigate } from 'react-router-dom';
import { YoursIcon } from '../../components/YoursIcon';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

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

  const handleRestore = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFile || !password) return;

    try {
      setLoading(true);
      setPasswordError(false);
      await restoreMasterFromZip(chromeStorageService, handleProgress, selectedFile, password);
      addSnackbar('Wallet restored successfully!', 'success');
      // Reload to pick up the restored and initialized wallet
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

  return (
    <Show
      when={!loading}
      whenFalseContent={<PageLoader theme={theme} message={loaderMessage} showProgressBar barProgress={progress} />}
    >
      <Content>
        <YoursIcon width="4rem" />
        <HeaderText theme={theme}>Restore from Backup</HeaderText>

        <Show
          when={!selectedFile}
          whenFalseContent={
            <>
              <Text theme={theme} style={{ marginBottom: '0.5rem' }}>
                Selected: {selectedFile?.name}
              </Text>
              <Text theme={theme} style={{ marginBottom: '1rem' }}>
                Enter your wallet password to restore.
              </Text>
              <FormContainer onSubmit={handleRestore}>
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
                <Button theme={theme} type="primary" label="Restore Wallet" disabled={!password} isSubmit />
              </FormContainer>
            </>
          }
        >
          <Text theme={theme} style={{ marginBottom: '1rem' }}>
            Upload your backup ZIP file to restore your wallet.
          </Text>
          <Button theme={theme} type="primary" onClick={handleZipUploadClick} label="Select Backup File" />
          <input
            type="file"
            ref={hiddenFileInput}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            accept=".zip,application/zip"
          />
        </Show>

        <Button theme={theme} type="secondary" label="Go back" onClick={handleBack} />
      </Content>
    </Show>
  );
};
