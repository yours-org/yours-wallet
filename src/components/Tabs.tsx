import React, { PropsWithChildren } from 'react';
import styled from 'styled-components';
import { WhiteLabelTheme, Theme } from '../theme.types';

export type TabPanelProps = PropsWithChildren<{
  label: string;
  theme: Theme;
}>;

const TabPanel = (props: TabPanelProps) => (
  <TabContent role="tabpanel" tabIndex={0}>
    {props.children}
  </TabContent>
);

export const TabContent = styled.div<{ $addTopMargin?: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: ${(props) => (props.$addTopMargin ? 'calc(98% - 4rem)' : 'calc(98%)')};
  margin-top: ${(props) => (props.$addTopMargin ? '4rem' : undefined)};
`;

export const TabsWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
`;

const TabButton = styled.button<WhiteLabelTheme & { $selected: boolean; $leftButton: boolean }>`
  flex: 1;
  padding: 0.25rem 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: ${(props) => (props.$leftButton ? '1rem 0 0 1rem' : '0 1rem 1rem 0 ')};
  color: ${(props) =>
    props.$selected ? props.theme.color.component.tabSelectedText : props.theme.color.component.tabUnselectedText};
  background: ${({ theme, $selected }) =>
    $selected
      ? `linear-gradient(45deg, ${theme.color.component.tabSelectedLeftGradient}, ${theme.color.component.tabSelectedRightGradient})`
      : theme.color.component.tabUnselected};
  border: none;
  transition: background-color 0.2s ease-in-out;

  &:hover {
    background: ${(props) => props.theme.primaryHover}; /* Optional: Change color on hover */
  }
`;

export const TabList = styled.div<WhiteLabelTheme>`
  display: flex;
  flex-direction: row;
  width: 50%;
  margin-top: 5rem;
  margin-bottom: 0.5rem;
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  height: calc(100% - 7rem);
`;

export type TabsProps = PropsWithChildren<{
  theme: Theme;
  tabIndex: number;
  selectTab: React.Dispatch<React.SetStateAction<number>>;
}>;

const TabsComponent = (props: TabsProps) => {
  const { children, tabIndex, selectTab, theme } = props;

  return (
    <TabsWrapper>
      <TabList theme={theme} role="tablist">
        {React.Children.map(children, (child, index) => {
          if (!React.isValidElement(child)) return;
          const { label } = child.props;
          return (
            <TabButton
              theme={props.theme}
              role="tab"
              $leftButton={index === 0}
              $selected={tabIndex === index}
              aria-selected={tabIndex === index ? 'true' : 'false'}
              onClick={() => selectTab(index)}
            >
              {label}
            </TabButton>
          );
        })}
      </TabList>
      <Content>{React.Children.map(children, (comp, index) => (tabIndex === index ? comp : undefined))}</Content>
    </TabsWrapper>
  );
};

export const Tabs = Object.assign(TabsComponent, { Panel: TabPanel });
export default Tabs;
