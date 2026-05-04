import { Toaster } from "react-hot-toast";

export function Snackbar() {
  return (
    <Toaster
      toastOptions={{
        style: {
          background: "var(--color-primary)",
          color: "var(--color-black)",
          width: "400px",
          height: "45px",
          textAlign: "center",
          fontSize: "14px",
          fontWeight: "bold",
        },
        error: {
          style: {
            background: "var(--color-red-500)",
            color: "var(--color-white)",
            width: "auto",
            height: "auto",
          },
          duration: 5000,
        },
      }}
    />
  );
}
