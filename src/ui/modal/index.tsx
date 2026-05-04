type Props = {
  children: React.ReactNode;
};

export const Modal = ({ children }: Props) => {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 py-10 backdrop-blur-sm">
      <div className="rounded-xl border border-white bg-black-deep p-4">
        {children}
      </div>
    </div>
  );
};
