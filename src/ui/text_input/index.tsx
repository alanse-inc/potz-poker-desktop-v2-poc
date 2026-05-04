type Props = {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onEnterPress?: () => void;
};

export function TextInput({
  placeholder,
  value,
  onChange,
  onEnterPress,
}: Props) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnterPress) {
      onEnterPress();
    }
  };

  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      className="h-24 w-full rounded-full border border-black bg-black-darkest px-8 font-bold text-lg text-white placeholder:text-gray-700"
    />
  );
}
