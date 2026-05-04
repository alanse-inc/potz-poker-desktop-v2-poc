import { useEffect, useRef, useState } from "react";

export function usePressAnimation(disabled: boolean) {
  const [isPressed, setIsPressed] = useState(false);
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    };
  }, []);

  const handlePointerDown = () => {
    if (disabled) return;
    if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    setIsPressed(true);
  };

  const handlePointerUp = () => {
    if (disabled) return;
    pressTimeoutRef.current = setTimeout(() => setIsPressed(false), 80);
  };

  const handlePointerLeave = () => {
    if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    setIsPressed(false);
  };

  const handlePointerCancel = () => {
    if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current);
    setIsPressed(false);
  };

  return {
    isPressed,
    handlePointerDown,
    handlePointerUp,
    handlePointerLeave,
    handlePointerCancel,
  };
}
