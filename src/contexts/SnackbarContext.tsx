import { ReactNode, createContext, useState } from 'react';
import { Snackbar } from '../components/Snackbar';
import { useTheme } from '../hooks/useTheme';
import { SNACKBAR_TIMEOUT } from '../utils/constants';

export type SnackbarType = 'error' | 'info' | 'success';

type SnackbarContextType = {
  message: string | null;
  snackBarType: SnackbarType | null;
  addSnackbar: (message: string, type: SnackbarType, duration?: number) => void;
};

export const SnackbarContext = createContext<SnackbarContextType | null>(null);

interface SnackbarProviderProps {
  children: ReactNode;
}

export const SnackbarProvider = (props: SnackbarProviderProps) => {
  const { children } = props;
  const { theme } = useTheme();
  const [message, setMessage] = useState<string | null>(null);
  const [snackBarType, setSnackBarType] = useState<SnackbarType | null>(null);

  const addSnackbar = (msg: string, type: SnackbarType, duration?: number) => {
    setMessage(msg);
    setSnackBarType(type);

    setTimeout(() => {
      setMessage(null);
      setSnackBarType(null);
    }, duration || SNACKBAR_TIMEOUT);
  };

  return (
    <SnackbarContext.Provider value={{ message, snackBarType, addSnackbar }}>
      {message && <Snackbar theme={theme} message={message} type={snackBarType} />}
      {children}
    </SnackbarContext.Provider>
  );
};
