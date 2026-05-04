type Props = {
  text: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
};

export function Switch({ text, checked, disabled, onChange }: Props) {
  return (
    <div
      className={`flex h-14 flex-col items-center gap-1.5 ${disabled ? "opacity-50" : ""}`}
    >
      <span className="font-bold text-sm text-white">{text}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => (disabled ? undefined : onChange(!checked))}
        className={`relative inline-flex w-12 rounded-full border-2 border-white p-1 ${checked ? "bg-white" : "bg-black"} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full shadow-sm transition-transform ${
            checked ? "translate-x-6 bg-gray-500" : "bg-white"
          }`}
        />
      </button>
    </div>
  );
}
