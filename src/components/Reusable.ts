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

export const DescText = styled.p`
  font-size: 0.9rem;
  color: ${colors.white + "90"};
  font-family: Arial, Helvetica, sans-serif;
  font-weight: 400;
  margin: 0.5rem 0 2rem 0;
  text-align: center;
  width: 80%;
`;
