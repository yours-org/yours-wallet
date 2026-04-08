export type IconButtonProps = {
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
  icon: string;
};

export const IconButton = (props: IconButtonProps) => {
  const { onClick, icon } = props;
  return <img src={icon} onClick={onClick} className="w-5 h-5 cursor-pointer" />;
};
