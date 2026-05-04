import { useEffect, useState } from "react";

type Props = {
  value: string;
  onChange: (color: string) => void;
  label?: string;
};

export function ColorPicker({ value, onChange, label }: Props) {
  const [textValue, setTextValue] = useState(value);
  const [isValidColor, setIsValidColor] = useState(true);
  const [currentValidColor, setCurrentValidColor] = useState(value);

  // 外部からのvalue変更に追従する
  useEffect(() => {
    setTextValue(value);
    setCurrentValidColor(value);
    setIsValidColor(true);
  }, [value]);

  const validateColor = (color: string): boolean => {
    const hexRegex = /^#([0-9A-F]{3}){1,2}$/i;
    return hexRegex.test(color);
  };

  const handleColorChange = (color: string) => {
    onChange(color);
    setTextValue(color);
    setCurrentValidColor(color);
    setIsValidColor(true);
  };

  const handleTextChange = (value: string) => {
    setTextValue(value);

    if (validateColor(value)) {
      setIsValidColor(true);
      setCurrentValidColor(value);
      onChange(value);
    } else {
      setIsValidColor(false);
    }
  };

  return (
    <div className="space-y-3">
      {label && (
        // biome-ignore lint/a11y/noLabelWithoutControl: 許容
        <label className="block font-medium text-sm text-white">{label}</label>
      )}

      <div className="flex items-center gap-4">
        {/* Native color picker */}
        <div className="relative">
          <input
            type="color"
            value={currentValidColor}
            onChange={(e) => handleColorChange(e.target.value)}
            className="h-12 w-16 cursor-pointer rounded-lg border border-gray-600 bg-transparent"
            style={{
              backgroundColor: currentValidColor,
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-lg border border-gray-600"
            style={{
              backgroundColor: currentValidColor,
            }}
          />
        </div>

        {/* Text input for color code */}
        <div className="flex-1">
          <input
            type="text"
            value={textValue}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="#000000"
            className={`h-12 w-full rounded-lg border px-4 font-mono text-sm ${
              isValidColor
                ? "border-gray-600 bg-[#333333] text-white placeholder:text-gray-500"
                : "border-red-500 bg-red-900/20 text-red-300 placeholder:text-red-400"
            }`}
          />
          {!isValidColor && (
            <p className="mt-1 text-red-400 text-xs">
              無効なカラーコードです（例: #FF0000）
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
