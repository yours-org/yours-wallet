import styled from "styled-components";
import { DescText, HeaderText } from "../components/Reusable";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { BackButton } from "../components/BackButton";
import { useNavigate } from "react-router-dom";
import { getKeys } from "../utils/keys";
import { useState } from "react";
import { useSnackbar } from "../hooks/useSnackbar";
import { storage } from "../utils/storage";
import { encrypt } from "../utils/crypto";
import { colors } from "../colors";
import { PandaHead } from "../components/PandaHead";

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

const SeedContainer = styled.div`
  display: flex;
  justify-content: space-between;
  width: 75%;
  margin: 0.5rem 0;
`;

const Column = styled.div`
  display: flex;
  flex-direction: column;
`;

const SeedPill = styled.div`
  display: flex;
  align-items: center;
  background-color: ${colors.darkNavy};
  padding: 0.1rem 0 0.1rem 1rem;
  border-radius: 1rem;
  color: ${colors.white};
  font-size: 0.85rem;
  margin: 0.25rem;
  width: 6rem;
`;

export const CreateWallet = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [step, setStep] = useState(1);
  const [seedWords, setSeedWords] = useState<string[]>([]);

  const { addSnackbar } = useSnackbar();

  const handleCopyToClipboard = () => {
    // Logic to copy the seed words to clipboard goes here
    navigator.clipboard.writeText(seedWords.join(" ")).then(() => {
      addSnackbar("Copied!", "info");
    });
  };

  const handleKeyGeneration = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      addSnackbar("The password must be at least 8 characters", "error");
      return;
    }

    if (password !== passwordConfirm) {
      addSnackbar("The passwords do not match", "error");
      return;
    }
    const keys = getKeys();
    setSeedWords(keys.mnemonic.split(" "));
    const encryptedKeys = encrypt(JSON.stringify(keys), password);
    storage.set({ encryptedKeys });

    setStep(2);

    // storage.get("encryptedKeys", (result) => {
    //   console.log("Value currently is " + result.encryptedKeys);

    //   const d = decrypt(result.encryptedKeys, password);
    //   console.log(JSON.parse(d));
    // });
  };

  const passwordStep = (
    <>
      <BackButton onClick={() => navigate("/")} />
      <Content>
        <HeaderText>Create a password</HeaderText>
        <DescText>This is used to unlock your wallet.</DescText>
        <FormContainer onSubmit={handleKeyGeneration}>
          <Input
            placeholder="Password"
            type="password"
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            placeholder="Confirm Password"
            type="password"
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
          <DescText style={{ margin: "3rem 0 1rem" }}>
            Make sure you are in a safe place and no one is watching.
          </DescText>
          <Button type="primary" label="Generate Seed" />
        </FormContainer>
      </Content>
    </>
  );

  const seedWordsList = (words: string[]) => (
    <SeedContainer>
      <Column>
        {words.slice(0, 6).map((word, index) => (
          <SeedPill key={index}>
            {index + 1}. {word}
          </SeedPill>
        ))}
      </Column>
      <Column>
        {words.slice(6).map((word, index) => (
          <SeedPill key={index + 6}>
            {index + 7}. {word}
          </SeedPill>
        ))}
      </Column>
    </SeedContainer>
  );

  const copySeedStep = (
    <>
      <BackButton onClick={() => setStep(1)} />
      <Content>
        <HeaderText>Your recovery phrase</HeaderText>
        <DescText style={{ marginBottom: "1rem" }}>
          Safely store your seed phrase. This is the only way you can recover
          your account.
        </DescText>
        {seedWordsList(seedWords)}
        <Button
          type="secondary"
          label="Copy to clipboard"
          onClick={handleCopyToClipboard}
        />
        <Button type="primary" label="Next" onClick={() => setStep(3)} />
      </Content>
    </>
  );

  const successStep = (
    <>
      <Content>
        <PandaHead />
        <HeaderText>Success!</HeaderText>
        <DescText style={{ marginBottom: "1rem" }}>
          Your Panda Wallet is ready to go.
        </DescText>
        <Button type="primary" label="Enter" onClick={() => "do something"} />
      </Content>
    </>
  );

  return step === 1 ? passwordStep : step === 2 ? copySeedStep : successStep;
};
