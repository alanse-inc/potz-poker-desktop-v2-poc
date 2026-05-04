type Props = {
  children: React.ReactNode;
  scrollable?: boolean;
};

export function BasicPage({ children, scrollable = false }: Props) {
  if (scrollable) {
    return (
      <div className="relative flex h-full w-full flex-col items-center overflow-y-auto bg-black-deep">
        {children}
      </div>
    );
  }
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-black-deep">
      {children}
    </div>
  );
}
