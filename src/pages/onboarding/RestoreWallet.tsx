import styled from "styled-components";
import { ColorThemeProps } from "../../theme";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useSnackbar } from "../../hooks/useSnackbar";
import { BackButton } from "../../components/BackButton";
import { Text, HeaderText } from "../../components/Reusable";
import { Input } from "../../components/Input";
import { Button } from "../../components/Button";
import { PandaHead } from "../../components/PandaHead";
import { useKeys } from "../../hooks/useKeys";
import { useBottomMenu } from "../../hooks/useBottomMenu";
import { PageLoader } from "../../components/PageLoader";
import { Show } from "../../components/Show";
import { sleep } from "../../utils/sleep";
import { useTheme } from "../../hooks/useTheme";

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
`;

const SeedInput = styled.textarea<ColorThemeProps>`
  background-color: ${({ theme }) => theme.darkAccent};
  border-radius: 0.25rem;
  border: 1px solid ${({ theme }) => theme.white + "50"};
  width: 80%;
  height: 7rem;
  padding: 1rem;
  margin: 0.5rem;
  outline: none;
  color: ${({ theme }) => theme.white + "80"};
  resize: none;

  &::placeholder {
    color: ${({ theme }) => theme.white + "80"};
  }
`;

export const RestoreWallet = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [step, setStep] = useState(1);
  const [seedWords, setSeedWords] = useState<string>("");

  const { addSnackbar } = useSnackbar();
  const { generateSeedAndStoreEncrypted } = useKeys();
  const { hideMenu, showMenu } = useBottomMenu();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    hideMenu();

    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu]);

  const handleRestore = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    if (password.length < 8) {
      setLoading(false);
      addSnackbar("The password must be at least 8 characters!", "error");
      return;
    }

    if (password !== passwordConfirm) {
      setLoading(false);
      addSnackbar("The passwords do not match!", "error");
      return;
    }

    // Some artificial delay for the loader
    await sleep(50);
    const mnemonic = generateSeedAndStoreEncrypted(password, seedWords);
    if (!mnemonic) {
      addSnackbar("An error occurred while restoring the wallet!", "error");
      return;
    }

    setLoading(false);
    setStep(3);
  };

  const passwordStep = (
    <>
      <BackButton onClick={() => navigate("/")} />
      <Content>
        <HeaderText theme={theme}>Create a password</HeaderText>
        <Text theme={theme}>This is used to unlock your wallet.</Text>
        <FormContainer onSubmit={handleRestore}>
          <Input
            theme={theme}
            placeholder="Password"
            type="password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            theme={theme}
            placeholder="Confirm Password"
            type="password"
            onChange={(e) => setPasswordConfirm(e.target.value)}
            style={{ marginBottom: "2rem" }}
          />
          <Button theme={theme} type="primary" label="Finish" />
        </FormContainer>
      </Content>
    </>
  );

  const enterSeedStep = (
    <>
      <BackButton onClick={() => navigate("/")} />
      <Content>
        <HeaderText theme={theme}>Restore a wallet</HeaderText>
        <Text theme={theme}>
          Only input a seed phrase previously generated from Panda Wallet.
        </Text>
        <FormContainer onSubmit={() => setStep(2)}>
          <SeedInput
            theme={theme}
            placeholder="Enter secret recovery words"
            onChange={(e) => setSeedWords(e.target.value)}
          />
          <Text theme={theme} style={{ margin: "3rem 0 1rem" }}>
            Make sure you are in a safe place and no one is watching.
          </Text>
          <Button theme={theme} type="primary" label="Next" />
        </FormContainer>
      </Content>
    </>
  );

  const successStep = (
    <>
      <Content>
        <PandaHead />
        <HeaderText theme={theme}>Success!</HeaderText>
        <Text theme={theme} style={{ marginBottom: "1rem" }}>
          Your Panda Wallet has been restored.
        </Text>
        <Button
          theme={theme}
          type="primary"
          label="Enter"
          onClick={() => navigate("/bsv-wallet")}
        />
      </Content>
    </>
  );

  return (
    <>
      <Show when={loading}>
        <PageLoader theme={theme} message="Restoring Wallet..." />
      </Show>
      <Show when={!loading && step === 1}>{enterSeedStep}</Show>
      <Show when={!loading && step === 2}>{passwordStep}</Show>
      <Show when={!loading && step === 3}>{successStep}</Show>
    </>
  );
};
