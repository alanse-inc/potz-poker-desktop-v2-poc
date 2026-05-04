import { useState } from "react";

interface CustomLoginFormProps {
  onLogin: (username: string, password: string) => Promise<void>;
  isLoading?: boolean;
  error?: string;
}

export function CustomLoginForm({
  onLogin,
  isLoading = false,
  error,
}: CustomLoginFormProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState("");

  const isFormValid = username.trim().length >= 3 && password.trim().length > 0;
  const hasError = validationError || error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    if (!username.trim()) {
      setValidationError("ユーザー名を入力してください");
      return;
    }
    if (!password.trim()) {
      setValidationError("パスワードを入力してください");
      return;
    }
    if (username.trim().length < 3) {
      setValidationError("ユーザー名は3文字以上で入力してください");
      return;
    }

    try {
      await onLogin(username.trim(), password);
    } catch (_err) {
      // エラーは親コンポーネントで処理される
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <div className="w-full max-w-md rounded-lg p-6">
        <div className="mb-8 text-center">
          <h1
            className="text-center font-bold text-2xl text-white leading-none tracking-normal"
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 700,
              fontSize: "24px",
              lineHeight: "100%",
              letterSpacing: "0%",
            }}
          >
            WELCOME POTZ!
          </h1>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label
              className="mb-2 block font-medium text-gray-300 text-sm"
              htmlFor="username"
            >
              ID
            </label>
            <input
              autoComplete="username"
              className={`block w-full rounded-md border bg-[#4F4F4F] px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-1 disabled:opacity-50 ${
                hasError
                  ? "border-[#FF483B] focus:border-[#FF483B] focus:ring-[#FF483B]"
                  : "border-gray-600 focus:border-[#CAFF33] focus:ring-[#CAFF33]"
              }`}
              disabled={isLoading}
              id="username"
              onChange={(e) => setUsername(e.target.value)}
              placeholder="yourID"
              type="text"
              value={username}
            />
          </div>

          <div>
            <label
              className="mb-2 block font-medium text-gray-300 text-sm"
              htmlFor="password"
            >
              PASS WORD
            </label>
            <div className="relative">
              <input
                autoComplete="current-password"
                className={`block w-full rounded-md border bg-[#4F4F4F] px-3 py-2 pr-10 text-white placeholder-gray-400 focus:outline-none focus:ring-1 disabled:opacity-50 ${
                  hasError
                    ? "border-[#FF483B] focus:border-[#FF483B] focus:ring-[#FF483B]"
                    : "border-gray-600 focus:border-[#CAFF33] focus:ring-[#CAFF33]"
                }`}
                disabled={isLoading}
                id="password"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={
                  showPassword ? "パスワードを非表示" : "パスワードを表示"
                }
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-200 disabled:opacity-50"
                disabled={isLoading}
                onClick={() => setShowPassword((prev) => !prev)}
                type="button"
              >
                {showPassword ? (
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {(validationError || error) && (
            <div className="rounded-md border border-[#FF483B]/30 bg-[#FF483B]/20 p-3">
              <p className="text-[#FF483B] text-sm">
                {validationError || error}
              </p>
            </div>
          )}

          <div className="flex justify-center pt-4">
            <button
              className={`h-[50px] w-60 rounded-full px-4 py-2 font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed ${
                isFormValid && !isLoading
                  ? "bg-[#CAFF33] text-[#262626] hover:bg-[#CAFF33]"
                  : "bg-[#333333] text-[#4F4F4F]"
              }`}
              disabled={isLoading || !isFormValid}
              type="submit"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div
                    className={`mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent ${
                      isFormValid ? "border-[#262626]" : "border-[#4F4F4F]"
                    }`}
                  />
                  LOADING...
                </div>
              ) : (
                "LOGIN"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
