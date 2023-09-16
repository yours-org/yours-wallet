import { ReactNode, createContext, useState } from "react";
import { Snackbar } from "../components/Snackbar";

export type SnackbarType = "error" | "info" | "success";

type SnackbarContextType = {
  message: string | null;
  snackBarType: SnackbarType | null;
  addSnackbar: (message: string, type: SnackbarType) => void;
};

export const SnackbarContext = createContext<SnackbarContextType | null>(null);

type SnackbarProviderProps = {
  children: ReactNode;
};

export const SnackbarProvider = (props: SnackbarProviderProps) => {
  const { children } = props;
  const [message, setMessage] = useState<string | null>(null);
  const [snackBarType, setSnackBarType] = useState<SnackbarType | null>(null);

  const addSnackbar = (msg: string, type: SnackbarType) => {
    setMessage(msg);
    setSnackBarType(type);

    setTimeout(() => {
      setMessage(null);
      setSnackBarType(null);
    }, 2500);
  };

  return (
    <SnackbarContext.Provider value={{ message, snackBarType, addSnackbar }}>
      {message && <Snackbar message={message} type={snackBarType} />}
      {children}
    </SnackbarContext.Provider>
  );
};
