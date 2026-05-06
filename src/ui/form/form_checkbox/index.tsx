import { useId } from "react";

type Props = {
  text: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
};

export function FormCheckbox({
  text,
  checked,
  disabled = false,
  onChange,
}: Props) {
  const id = useId();
  // div
  const opacity = disabled ? "opacity-50" : "";
  // input
  const cursor = disabled ? "cursor-not-allowed" : "cursor-pointer";
  const hover = disabled ? "" : "hover:border-gray-800";

  return (
    <div
      className={`flex h-12 w-full items-center justify-between rounded-md border-1 border-gray-800 bg-black-deep px-10 ${opacity}`}
    >
      <label htmlFor={id} className={`text-white ${cursor}`}>
        {text}
      </label>
      <div className="relative flex h-full items-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className={`peer h-6 w-6 appearance-none rounded-xs border-2 border-gray-300 checked:border-0 checked:bg-lime-500 ${hover} ${cursor}`}
        />

        {checked && (
          <svg
            className="pointer-events-none absolute top-1/2 left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-pointer"
            viewBox="0 0 24 24"
            fill="none"
            stroke="black"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-labelledby="checkmarkTitle"
          >
            <title id="checkmark">Checkmark</title>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
    </div>
  );
}
