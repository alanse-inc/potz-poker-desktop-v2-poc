import type React from "react";

type Props<T extends string | number> = {
  value: T;
  icon?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  isError?: boolean;
  onChange: (newValue: T) => void;
  onBlur?: () => void;
  onFocus?: () => void;
};

export function FormText<T extends string | number>({
  value,
  icon,
  placeholder,
  disabled = false,
  isError = false,
  onChange,
  onBlur,
  onFocus,
}: Props<T>) {
  const type = typeof value === "number" ? "number" : "text";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const convertedValue = type === "number" ? Number(newValue) : newValue;
    onChange(convertedValue as T);
  };

  const handleBlur = () => {
    onBlur?.();
  };

  const handleFocus = () => {
    onFocus?.();
  };

  const opacity = disabled ? "opacity-50" : "";
  const cursor = disabled ? "cursor-not-allowed" : "cursor-text";

  const paddingLeft = icon ? "pl-1" : "pl-4";
  const ringColor = isError ? "ring-red-500" : "ring-white";

  return (
    <div
      className={`flex w-full items-center ${opacity} ${cursor} rounded border border-border-gray bg-black-deep focus-within:ring-2 ${ringColor}`}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center pl-2">
          {icon}
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        placeholder={placeholder}
        disabled={disabled}
        className={`h-12 w-full rounded text-white uppercase focus:outline-none ${paddingLeft}`}
      />
    </div>
  );
}
