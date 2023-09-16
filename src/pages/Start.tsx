import styled from "styled-components";
import { colors } from "../colors";
import { Button } from "../components/Button";
import { PandaHead } from "../components/PandaHead";
import { useNavigate } from "react-router-dom";
import { DescText } from "../components/Reusable";

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

export const Start = () => {
  const navigate = useNavigate();
  return (
    <>
      <Content>
        <PandaHead animated />
        <TitleText>Panda Wallet</TitleText>
        <DescText style={{ marginBottom: "5rem" }}>
          A non-custodial and open-source wallet for BSV and 1Sat Ordinals.
        </DescText>
        <Button
          type="primary"
          label="Create New Wallet"
          onClick={() => navigate("/create-wallet")}
        />
        <Button
          type="secondary"
          label="Restore Wallet"
          onClick={() => console.log("import wallet")}
        />
      </Content>
    </>
  );
};
