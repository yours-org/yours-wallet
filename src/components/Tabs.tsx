import React, { Component, ReactNode, useState } from "react";
import styled from "styled-components";
import { PropsWithChildren } from "react";
import { ColorThemeProps, Theme } from "../theme";

export type TabPanelProps = PropsWithChildren<{
  label: string;
  theme: Theme;
}>;

const TabPanel = (props: TabPanelProps) => (
  <TabContent role="tabpanel" tabIndex={0}>
    {props.children}
  </TabContent>
);

const TabContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: calc(100%);
`;

const TabsWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const TabButton = styled.button<ColorThemeProps & { selected: boolean }>`
  flex: 1;
  height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  cursor: default;
  background: transparent;
  outline: none;
  transition: border-color 0.2s ease-in;
  border: none;
  border-bottom: 0.1rem solid ${(props) => (props.selected ? "blue" : "#fff")};
  &:hover,
  &:focus,
  &:active {
    border-bottom: 0.1rem solid ${(props) => (props.selected ? "blue" : "#eee")};
  }
`;

const TabList = styled.div<ColorThemeProps & { breakPoint: string }>`
  display: flex;
  flex-direction: row;
  width: 100%;
  @media (max-width: ${(props) => props.breakPoint}) {
    flex-direction: column;
    & > div,
    & > div > button {
      width: 100%;
    }
  }
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: calc(100% - 3.75rem - 2.75rem);
`;

export type TabsProps = PropsWithChildren<{
  theme: Theme;
  tabBreak: string;
}>;

const TabsComponent = (props: TabsProps) => {
  const [tabIndex, selectTab] = useState(0);

  const { children, tabBreak } = props;

  return (
    <TabsWrapper>
      <TabList theme={props.theme} breakPoint={tabBreak} role="tablist">
        {React.Children.map(children, (child, index) => {
          if (!React.isValidElement(child)) return;

          const { label } = child.props;
          return (
            <TabButton
              theme={props.theme}
              role="tab"
              selected={tabIndex === index}
              aria-selected={tabIndex === index ? "true" : "false"}
              onClick={() => selectTab(index)}
            >
              {label}
            </TabButton>
          );
        })}
      </TabList>

      <Content>
        {React.Children.map(children, (comp, index) =>
          tabIndex === index ? comp : undefined
        )}
      </Content>
    </TabsWrapper>
  );
};

export const Tabs = Object.assign(TabsComponent, { Panel: TabPanel });

export default Tabs;
