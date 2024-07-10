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
  const [duration, setDuration] = useState<number>(SNACKBAR_TIMEOUT);
  const [snackBarType, setSnackBarType] = useState<SnackbarType | null>(null);

  const addSnackbar = (msg: string, type: SnackbarType, dur?: number) => {
    setMessage(msg);
    setSnackBarType(type);
    setDuration(dur || SNACKBAR_TIMEOUT);

    setTimeout(() => {
      setMessage(null);
      setSnackBarType(null);
      setDuration(SNACKBAR_TIMEOUT);
    }, dur || SNACKBAR_TIMEOUT);
  };

  return (
    <SnackbarContext.Provider value={{ message, snackBarType, addSnackbar }}>
      {message && <Snackbar theme={theme} message={message} type={snackBarType} duration={duration} />}
      {children}
    </SnackbarContext.Provider>
  );
};
