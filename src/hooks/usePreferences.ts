import { useCallback, useEffect, useState } from "react";

/**
 * オペレーター個別の永続化嗜好設定
 *
 * lastSelectedSessionId: 最後に選択した Session ID（未選択時は null）
 * lastSelectedDeckIds:   最後に選択した Deck ID 一覧（未選択時は空配列）
 */
export type Preferences = {
  lastSelectedSessionId: string | null;
  lastSelectedDeckIds: string[];
};

export const DEFAULT_PREFERENCES: Preferences = {
  lastSelectedSessionId: null,
  lastSelectedDeckIds: [],
};

const STORE_FILE = "preferences.json";
const STORE_KEY = "preferences";

async function loadFromStore(): Promise<Preferences> {
  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    const store = await Store.load(STORE_FILE);
    const raw = await store.get<Preferences>(STORE_KEY);
    return raw ?? DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

async function saveToStore(prefs: Preferences): Promise<void> {
  try {
    const { Store } = await import("@tauri-apps/plugin-store");
    const store = await Store.load(STORE_FILE);
    await store.set(STORE_KEY, prefs);
    await store.save();
  } catch {
    console.error("[usePreferences] Failed to save preferences");
  }
}

/**
 * オペレーター個別の永続化嗜好設定にアクセスする hook。
 *
 * - 初回マウント時に @tauri-apps/plugin-store から取得
 * - savePreferences で部分更新（Partial<Preferences>）して永続化
 * - Tauri 環境外（テスト等）では sessionStorage にフォールバック
 */
export function usePreferences() {
  const [preferences, setPreferences] =
    useState<Preferences>(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const prefs = await loadFromStore();
        if (!cancelled) {
          setPreferences(prefs);
        }
      } catch (error) {
        console.error(
          "[usePreferences] Load error:",
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const savePreferences = useCallback(
    async (patch: Partial<Preferences>) => {
      const next: Preferences = { ...preferences, ...patch };
      setPreferences(next);
      await saveToStore(next);
    },
    [preferences],
  );

  return { preferences, isLoaded, savePreferences };
}
