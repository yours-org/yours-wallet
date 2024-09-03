import React, { useRef, useState } from 'react';
import styled from 'styled-components';
import { Button } from '../../components/Button';
import { PageLoader } from '../../components/PageLoader';
import { HeaderText, Text } from '../../components/Reusable';
import { Show } from '../../components/Show';
import { useSnackbar } from '../../hooks/useSnackbar';
import { useTheme } from '../../hooks/useTheme';
import { useServiceContext } from '../../hooks/useServiceContext';
import { restoreMasterFromZip } from '../../utils/masterImporter';
import { useBottomMenu } from '../../hooks/useBottomMenu';

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

export const MasterRestore = () => {
  const { theme } = useTheme();
  const { handleSelect } = useBottomMenu();
  const { chromeStorageService, oneSatSPV } = useServiceContext();
  const [loading, setLoading] = useState(false);
  const hiddenFileInput = useRef<HTMLInputElement>(null);
  const { addSnackbar } = useSnackbar();

  const handleZipUploadClick = () => {
    hiddenFileInput.current?.click();
  };

  const handleFileRead = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/zip') {
      try {
        setLoading(true);
        await restoreMasterFromZip(oneSatSPV, chromeStorageService, handleProgress, file);
        addSnackbar('Restoration complete!', 'success');
      } catch (error) {
        console.error('Error restoring from ZIP file', error);
        addSnackbar('Error restoring from ZIP file!', 'error');
      } finally {
        setLoading(false);
      }
    } else {
      console.error('Unsupported file type. Please upload a ZIP file.');
      addSnackbar('Unsupported file type. Please upload a ZIP file.', 'error');
    }
  };

  const handleProgress = (event: { message: string; value?: number; endValue?: number }) => {
    console.log(event.message); // You can update a UI element with this message if needed
  };

  return (
    <>
      <Show when={loading}>
        <PageLoader theme={theme} message="Restoring..." />
      </Show>
      <Show when={!loading}>
        <Content>
          <HeaderText theme={theme}>Restore from Backup</HeaderText>
          <Text theme={theme} style={{ marginBottom: '1rem' }}>
            Upload your backup ZIP file to restore your data.
          </Text>
          <Button theme={theme} type="primary" onClick={handleZipUploadClick} label="Upload ZIP" />
          <input
            type="file"
            ref={hiddenFileInput}
            onChange={handleFileRead}
            style={{ display: 'none' }}
            accept=".zip,application/zip"
          />
          <Button
            theme={theme}
            type="secondary"
            label="Go back"
            onClick={() => handleSelect('settings', 'restore-account')}
          />
        </Content>
      </Show>
    </>
  );
};
