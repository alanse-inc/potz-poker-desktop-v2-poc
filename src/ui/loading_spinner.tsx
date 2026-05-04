export function LoadingSpinner({
  size = "large",
}: {
  size?: "small" | "medium" | "large";
}) {
  const sizeClasses = {
    small: "h-8 w-8 border-2",
    medium: "h-12 w-12 border-[3px]",
    large: "h-16 w-16 border-4",
  };

  return (
    <div className="flex items-center justify-center">
      <div
        className={`animate-spin rounded-full border-gray-600 border-t-white ${sizeClasses[size]}`}
      />
    </div>
  );
}
