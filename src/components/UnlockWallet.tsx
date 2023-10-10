import { FormContainer, HeaderText } from "./Reusable";
import { Button } from "./Button";
import { ColorThemeProps } from "../theme";
import { styled } from "styled-components";
import { Input } from "./Input";
import { useState } from "react";
import { useKeys } from "../hooks/useKeys";
import { storage } from "../utils/storage";
import { PandaHead } from "./PandaHead";
import { sleep } from "../utils/sleep";
import { useTheme } from "../hooks/useTheme";

const Container = styled.div<ColorThemeProps>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  width: 22.5rem;
  height: 33.75rem;
  margin: 0;
  background-color: ${({ theme }) => theme.darkAccent};
  color: ${({ theme }) => theme.white};
  z-index: 100;
`;

export type UnlockWalletProps = {
  onUnlock: () => void;
};

export const UnlockWallet = (props: UnlockWalletProps) => {
  const { onUnlock } = props;
  const { theme } = useTheme();
  const [password, setPassword] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);

  const { verifyPassword } = useKeys();

  const handleUnlock = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsProcessing(true);
    await sleep(25);
    const isVerified = await verifyPassword(password);
    if (isVerified) {
      setVerificationFailed(false);
      const timestamp = Date.now();
      storage.set({ lastActiveTime: timestamp });
      onUnlock();
    } else {
      setVerificationFailed(true);
      setPassword("");
      setTimeout(() => {
        setVerificationFailed(false);
        setIsProcessing(false);
      }, 900);
    }
  };

  return (
    <Container theme={theme}>
      <PandaHead animated width="4rem" />
      <HeaderText theme={theme}>Unlock Wallet</HeaderText>
      <FormContainer onSubmit={handleUnlock}>
        <Input
          theme={theme}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ marginBottom: "2rem" }}
          shake={verificationFailed ? "true" : "false"}
        />
        <Button
          theme={theme}
          type="primary"
          label={isProcessing ? "Unlocking..." : "Unlock"}
          disabled={isProcessing}
          isSubmit
        />
      </FormContainer>
    </Container>
  );
};
