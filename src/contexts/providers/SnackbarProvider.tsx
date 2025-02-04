import { ReactNode, useState } from 'react';
import { Snackbar } from '../../components/Snackbar';
import { useTheme } from '../../hooks/useTheme';
import { SNACKBAR_TIMEOUT } from '../../utils/constants';
import { SnackbarContext, SnackbarType } from '../SnackbarContext';

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
