import { PropsWithChildren } from 'react';

export type ShowProps = PropsWithChildren<{
  /** If true, will show children of the component.  If false, children of component will be hidden */
  when: boolean;
  /** Content to be shown in the event that when is false. If not passed in, nothing will be shown */
  whenFalseContent?: JSX.Element;
}>;

/**
 * Utility component to selectively show/hide content
 * @param props
 * @returns
 */
export const Show = (props: ShowProps): JSX.Element | null => {
  const { when, whenFalseContent, children } = props;
  return when ? <>{children}</> : (whenFalseContent ?? null);
};
