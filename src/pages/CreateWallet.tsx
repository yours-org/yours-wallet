import styled from "styled-components";
import { DescText, HeaderText } from "../components/Reusable";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { BackButton } from "../components/BackButton";
import { useNavigate } from "react-router-dom";
import { generateKeys } from "../utils/keys";
import { encrypt } from "../utils/crypto";
import { useState } from "react";
import { useSnackbar } from "../hooks/useSnackbar";
import { storage } from "../utils/storage";

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

export const CreateWallet = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const { addSnackbar } = useSnackbar();

  const handleKeyGeneration = () => {
    if (password !== passwordConfirm) {
      addSnackbar("The passwords do not match!", "error");
      return;
    }
    const keys = generateKeys();
    const encryptedKeys = encrypt(JSON.stringify(keys), password);
    storage.set({ encryptedKeys });

    storage.get("encryptedKeys", (result) => {
      console.log("Value currently is " + result.encryptedKeys);
    });
  };

  return (
    <>
      <BackButton onClick={() => navigate("/")} />
      <Content>
        <HeaderText>Create a password</HeaderText>
        <DescText>This is used to unlock your wallet</DescText>
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
          Make sure you are in a safe place and no one is watching
        </DescText>
        <Button
          type="primary"
          label="Generate Seed"
          onClick={handleKeyGeneration}
        />
      </Content>
    </>
  );
};
