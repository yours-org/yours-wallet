import styled from "styled-components";
import { colors } from "../colors";

export const HeaderText = styled.h1`
  font-size: 1.75rem;
  color: ${colors.white};
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 600;
  margin: 0.25rem 0;
  text-align: center;
`;

export const Text = styled.p`
  font-size: 0.9rem;
  color: ${colors.white + "90"};
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 400;
  margin: 0.5rem 0 2rem 0;
  text-align: center;
  width: 80%;
`;

export const ConfirmContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

export const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
`;

export const ButtonContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  margin: 1rem 0 2.5rem 0;
`;

export const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: calc(100% - 3.75rem);
`;

export const ReceiveContent = styled(MainContent)`
  justify-content: center;
  width: 100%;
  height: calc(100% - 3.75rem);
`;
