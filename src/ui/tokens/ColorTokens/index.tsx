type ColorGroup = {
  name: string;
  colors: {
    name: string;
    description?: string;
  }[];
};

const colorGroups: ColorGroup[] = [
  {
    name: "ライム系",
    colors: [
      { name: "--color-lime-50" },
      { name: "--color-lime-100" },
      { name: "--color-lime-200" },
      { name: "--color-lime-300" },
      { name: "--color-lime-400" },
      {
        name: "--color-lime-500",
        description: "バージョン1の Primary",
      },
      { name: "--color-lime-600" },
      { name: "--color-lime-700" },
      { name: "--color-lime-800" },
      { name: "--color-lime-900" },
    ],
  },
  {
    name: "ブルー系",
    colors: [
      { name: "--color-blue-50" },
      { name: "--color-blue-100" },
      { name: "--color-blue-200" },
      { name: "--color-blue-300" },
      { name: "--color-blue-400" },
      {
        name: "--color-blue-500",
        description: "バージョン1の light-blue",
      },
      { name: "--color-blue-600" },
      { name: "--color-blue-700" },
      { name: "--color-blue-800" },
      {
        name: "--color-blue-900",
        description: "バージョン1の black-blue",
      },
    ],
  },
  {
    name: "グレー系",
    colors: [
      { name: "--color-white" },
      { name: "--color-gray-50" },
      { name: "--color-gray-100" },
      { name: "--color-gray-200" },
      { name: "--color-gray-300" },
      { name: "--color-gray-400" },
      { name: "--color-gray-500" },
      { name: "--color-gray-600" },
      { name: "--color-gray-700" },
      { name: "--color-gray-800" },
      { name: "--color-gray-900" },
      { name: "--color-black" },
    ],
  },
  {
    name: "レッド系",
    colors: [
      { name: "--color-red-50" },
      { name: "--color-red-100" },
      { name: "--color-red-200" },
      { name: "--color-red-300" },
      { name: "--color-red-400" },
      { name: "--color-red-500" },
      { name: "--color-red-600" },
      { name: "--color-red-700" },
      { name: "--color-red-800" },
      { name: "--color-red-900" },
    ],
  },
  {
    name: "透明色",
    colors: [
      { name: "--color-black-gradient-1" },
      { name: "--color-black-gradient-2" },
      { name: "--color-black-gradient-3" },
      { name: "--color-black-gradient-4" },
      { name: "--color-black-gradient-5" },
      { name: "--color-black-gradient-6" },
      { name: "--color-black-gradient-7" },
      { name: "--color-black-gradient-8" },
      { name: "--color-black-gradient-9" },
      { name: "--color-black-gradient-10" },
    ],
  },
];

export const ColorTokens = () => {
  return (
    <div className="space-y-8">
      {colorGroups.map((group) => (
        <div key={group.name} className="space-y-4">
          <h2 className="font-bold text-xl">{group.name}</h2>
          <div className="grid grid-cols-1 gap-4">
            {group.colors.map((color) => (
              <div
                key={color.name}
                className="flex items-center space-x-4 rounded border p-4"
              >
                <div
                  className="h-16 w-16 rounded border"
                  style={{ backgroundColor: `var(${color.name})` }}
                />
                <div>
                  <div className="font-mono">{color.name}</div>
                  <div
                    className="text-gray-600"
                    style={{ color: `var(${color.name})` }}
                  >
                    ■ サンプルテキスト
                  </div>
                  {color.description && (
                    <div className="text-gray-500 text-sm">
                      {color.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
