import { fromPromise, type ResultAsync } from "neverthrow";

export type Preferences = {
  lastSelectedSessionId: string | null;
  lastSelectedDeckIds: string[];
};

export const DEFAULT_PREFERENCES: Preferences = {
  lastSelectedSessionId: null,
  lastSelectedDeckIds: [],
};

export interface PreferencesGatewayBoundary {
  get(): ResultAsync<Preferences, Error>;
  save(preferences: Preferences): ResultAsync<void, Error>;
}

const STORE_FILE = "preferences.json";
const STORE_KEY = "preferences";

export class TauriPreferencesGateway implements PreferencesGatewayBoundary {
  get(): ResultAsync<Preferences, Error> {
    return fromPromise(
      (async () => {
        const { Store } = await import("@tauri-apps/plugin-store");
        const store = await Store.load(STORE_FILE);
        const raw = await store.get<Preferences>(STORE_KEY);
        return raw ?? DEFAULT_PREFERENCES;
      })(),
      (e) => (e instanceof Error ? e : new Error(String(e))),
    );
  }

  save(preferences: Preferences): ResultAsync<void, Error> {
    return fromPromise(
      (async () => {
        const { Store } = await import("@tauri-apps/plugin-store");
        const store = await Store.load(STORE_FILE);
        await store.set(STORE_KEY, preferences);
        await store.save();
      })(),
      (e) => (e instanceof Error ? e : new Error(String(e))),
    );
  }
}
