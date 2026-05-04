import { fromPromise, type ResultAsync } from "neverthrow";
import {
  createDefaultGameSettings,
  type PersistedGameSettings,
} from "../domain/table_name";

export type { PersistedGameSettings };
export { createDefaultGameSettings };

export interface GameSettingsGatewayBoundary {
  get(): ResultAsync<PersistedGameSettings | null, Error>;
  save(settings: PersistedGameSettings): ResultAsync<void, Error>;
  clear(): ResultAsync<void, Error>;
}

const STORE_FILE = "game_settings.json";
const STORE_KEY = "gameSettings";

export class TauriGameSettingsGateway implements GameSettingsGatewayBoundary {
  get(): ResultAsync<PersistedGameSettings | null, Error> {
    return fromPromise(
      (async () => {
        const { Store } = await import("@tauri-apps/plugin-store");
        const store = await Store.load(STORE_FILE);
        const raw = await store.get<PersistedGameSettings>(STORE_KEY);
        return raw ?? null;
      })(),
      (e) => (e instanceof Error ? e : new Error(String(e))),
    );
  }

  save(settings: PersistedGameSettings): ResultAsync<void, Error> {
    return fromPromise(
      (async () => {
        const { Store } = await import("@tauri-apps/plugin-store");
        const store = await Store.load(STORE_FILE);
        await store.set(STORE_KEY, settings);
        await store.save();
      })(),
      (e) => (e instanceof Error ? e : new Error(String(e))),
    );
  }

  clear(): ResultAsync<void, Error> {
    return fromPromise(
      (async () => {
        const { Store } = await import("@tauri-apps/plugin-store");
        const store = await Store.load(STORE_FILE);
        await store.delete(STORE_KEY);
        await store.save();
      })(),
      (e) => (e instanceof Error ? e : new Error(String(e))),
    );
  }
}
