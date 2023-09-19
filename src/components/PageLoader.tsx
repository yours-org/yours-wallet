import styled, { keyframes } from "styled-components";
import { colors } from "../colors";
import { Text } from "./Reusable";

const spin = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

export const LoaderContainer = styled.div`
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: center;
  height: 100%;
  width: 100%;
  top: 0;
  left: 0;
  z-index: 9999;
`;

export const Loader = styled.div`
  border: 0.5rem solid ${colors.white + "50"};
  border-top: 0.5rem solid ${colors.seaFoam};
  border-radius: 50%;
  width: 2rem;
  height: 2rem;
  animation: ${spin} 1s linear infinite;
`;

export type PageLoaderProps = {
  message?: string;
};

export const PageLoader = (props: PageLoaderProps) => {
  const { message } = props;
  return (
    <LoaderContainer>
      <Text style={{ fontSize: "1rem", color: colors.white }}>{message}</Text>
      <Loader />
    </LoaderContainer>
  );
};
