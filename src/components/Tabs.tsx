import React from "react";
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
  height: calc(98%);
`;

const TabsWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const TabButton = styled.button<ColorThemeProps & { selected: boolean }>`
  flex: 1;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  margin: 0.25rem;
  cursor: pointer;
  border-top-left-radius: 0.5rem;
  border-top-right-radius: 0.5rem;
  color: ${(props) => props.theme.white};
  font-size: 1rem;
  font-weight: 500;
  background: ${(props) =>
    props.selected ? props.theme.darkAccent : props.theme.darkAccent + "60"};
  outline: none;
  transition: border-color 0.2s ease-in;
  border: none;
  border-bottom: 0.15rem solid
    ${(props) =>
      props.selected
        ? props.theme.primaryButton
        : props.theme.primaryButton + "30"};
  &:hover,
  &:focus,
  &:active {
    border-bottom: 0.15rem solid
      ${(props) =>
        props.selected
          ? props.theme.primaryButton
          : props.theme.primaryButton + "30"};
  }
`;

const TabList = styled.div<ColorThemeProps>`
  display: flex;
  flex-direction: row;
  width: 100%;
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
  tabIndex: number;
  selectTab: React.Dispatch<React.SetStateAction<number>>;
}>;

const TabsComponent = (props: TabsProps) => {
  const { children, tabIndex, selectTab } = props;

  return (
    <TabsWrapper>
      <TabList theme={props.theme} role="tablist">
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
