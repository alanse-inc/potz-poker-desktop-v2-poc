import type { ReactNode } from "react";

type ThemeColor = {
  name: string;
  value: string;
  description: string;
  baseToken: string;
  example: ReactNode;
};

const themeColors: ThemeColor[] = [
  {
    name: "--color-primary",
    value: "var(--color-lime-500)",
    description: "メインカラー。主要なアクションやブランドを表現する際に使用",
    baseToken: "--color-lime-500",
    example: (
      <button type="button" className="rounded bg-primary px-4 py-2 text-white">
        プライマリーボタン
      </button>
    ),
  },
  {
    name: "--color-secondary",
    value: "var(--color-blue-500)",
    description: "セカンダリーカラー。補助的なアクションやアクセントとして使用",
    baseToken: "--color-blue-500",
    example: (
      <button
        type="button"
        className="rounded bg-secondary px-4 py-2 text-white"
      >
        セカンダリーボタン
      </button>
    ),
  },
  {
    name: "--color-border-white",
    value: "var(--color-white)",
    description: "白色のボーダー",
    baseToken: "--color-white",
    example: (
      <div className="flex h-16 w-32 items-center justify-center rounded border-2 border-border-white">
        ボーダー
      </div>
    ),
  },
  {
    name: "--color-text-white",
    value: "var(--color-white)",
    description: "白色のテキスト",
    baseToken: "--color-white",
    example: <p className="text-text-white">白色テキスト</p>,
  },
  {
    name: "--color-text-black",
    value: "var(--color-black)",
    description: "黒色のテキスト",
    baseToken: "--color-black",
    example: <p className="text-text-black">黒色テキスト</p>,
  },
  {
    name: "--color-background-black",
    value: "var(--color-black)",
    description: "黒色の背景",
    baseToken: "--color-black",
    example: (
      <div className="flex h-16 w-32 items-center justify-center rounded border bg-background-black">
        背景色
      </div>
    ),
  },
  {
    name: "--color-background-light-gray",
    value: "var(--color-gray-50)",
    description: "明るいグレーの背景",
    baseToken: "--color-gray-50",
    example: (
      <div className="flex h-16 w-32 items-center justify-center rounded border bg-background-light-gray">
        背景色
      </div>
    ),
  },
  {
    name: "--color-background-gray",
    value: "var(--color-gray-800)",
    description: "グレーの背景",
    baseToken: "--color-gray-800",
    example: (
      <div className="flex h-16 w-32 items-center justify-center rounded border bg-background-gray">
        背景色
      </div>
    ),
  },
  {
    name: "--color-background-dark-gray",
    value: "var(--color-gray-900)",
    description: "暗いグレーの背景",
    baseToken: "--color-gray-900",
    example: (
      <div className="flex h-16 w-32 items-center justify-center rounded border bg-background-dark-gray">
        背景色
      </div>
    ),
  },
];

export const Theme = () => {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="font-bold text-xl">テーマカラー</h2>
        <p className="text-gray-600">
          セマンティックな意味を持つ色の定義です。実際のスタイリングではこれらの変数を使用してください。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6">
        {themeColors.map((color) => (
          <div key={color.name} className="space-y-4 rounded border p-4">
            <div className="flex items-center space-x-4">
              <div
                className="h-16 w-16 rounded border"
                style={{ backgroundColor: color.value }}
              />
              <div>
                <div className="font-mono">{color.name}</div>
                <div className="text-gray-600 text-sm">値: {color.value}</div>
                <div className="text-gray-500 text-sm">
                  ベース: {color.baseToken}
                </div>
              </div>
            </div>
            <div className="text-sm">{color.description}</div>
            <div className="rounded bg-gray-50 p-4">
              <div className="mb-2 text-gray-600 text-sm">使用例:</div>
              {/* biome-ignore lint/suspicious/noExplicitAny: React 19 ReactNode type compatibility issue */}
              {color.example as any}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
