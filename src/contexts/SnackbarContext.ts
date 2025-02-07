import { createContext } from 'react';

export type SnackbarType = 'error' | 'info' | 'success';

type SnackbarContextType = {
  message: string | null;
  snackBarType: SnackbarType | null;
  addSnackbar: (message: string, type: SnackbarType, duration?: number) => void;
};

export const SnackbarContext = createContext<SnackbarContextType | null>(null);
