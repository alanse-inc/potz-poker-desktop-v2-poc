import { err, ok, type Result } from "neverthrow";
import { apiFetch } from "./fetch";
import type { HandContext } from "./mappers/board_to_hand_request";

export async function fetchHandContext(): Promise<Result<HandContext, Error>> {
  try {
    const resp = await apiFetch("/api/hand-context");
    if (!resp.ok) {
      return err(new Error(`fetchHandContext failed: HTTP ${resp.status}`));
    }
    const data = await resp.json();
    if (!data.value) {
      return err(new Error("fetchHandContext: data.value is missing"));
    }
    return ok(data.value as HandContext);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
