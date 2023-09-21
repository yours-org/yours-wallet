import styled from "styled-components";
import { colors } from "../../colors";
import { Button } from "../../components/Button";
import { PandaHead } from "../../components/PandaHead";
import { useNavigate } from "react-router-dom";
import { Text } from "../../components/Reusable";
import { storage } from "../../utils/storage";
import { useEffect, useState } from "react";
import { useBottomMenu } from "../../hooks/useBottomMenu";
import gihubIcon from "../../assets/github.svg";

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

const TitleText = styled.h1`
  font-size: 2rem;
  color: ${colors.white};
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 600;
  margin: 0.25rem 0;
  text-align: center;
`;

const GithubIcon = styled.img`
  width: 1.5rem;
  height: 1.5rem;
  position: absolute;
  bottom: 1.5rem;
  cursor: pointer;
`;

export const Start = () => {
  const navigate = useNavigate();
  const [showStart, setShowStart] = useState(false);
  const { hideMenu, showMenu } = useBottomMenu();

  useEffect(() => {
    hideMenu();

    return () => {
      showMenu();
    };
  }, [hideMenu, showMenu]);

  // If the encrypted keys are present, take the user to the wallet page.
  useEffect(() => {
    storage.get("encryptedKeys", (result) => {
      if (result?.encryptedKeys) {
        setShowStart(false);
        navigate("/bsv-wallet");
        return;
      }
      setShowStart(true);
    });
  }, [navigate]);

  return (
    <>
      {showStart ? (
        <Content>
          <PandaHead animated />
          <TitleText>Panda Wallet</TitleText>
          <Text style={{ marginBottom: "3rem" }}>
            A non-custodial and open-source wallet for BSV and 1Sat Ordinals.
          </Text>
          <Button
            type="primary"
            label="Create New Wallet"
            onClick={() => navigate("/create-wallet")}
          />
          <Button
            type="secondary"
            label="Restore Wallet"
            onClick={() => navigate("/restore-wallet")}
          />
          <GithubIcon
            src={gihubIcon}
            onClick={() =>
              window.open(
                "https://github.com/Panda-Wallet/panda-wallet",
                "_blank"
              )
            }
          />
        </Content>
      ) : (
        <></>
      )}
    </>
  );
};
