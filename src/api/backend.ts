/**
 * Backend API クライアント
 *
 * VITE_BACKEND_API_URL 環境変数でベース URL を指定 (デフォルト: http://localhost:8080)
 * Authorization: Bearer dummy ヘッダーを常に付与する
 */

const BASE_URL =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_API_URL
    ? import.meta.env.VITE_BACKEND_API_URL
    : "http://localhost:8080";

/** API エラークラス */
export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly body: unknown,
  ) {
    super(`BackendApiError: status=${status} detail=${detail}`);
    this.name = "BackendApiError";
  }
}

async function backendFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer dummy",
      ...options.headers,
    },
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    const detail =
      body != null &&
      typeof body === "object" &&
      "detail" in body &&
      typeof (body as Record<string, unknown>).detail === "string"
        ? (body as Record<string, unknown>).detail
        : res.statusText;
    throw new BackendApiError(res.status, detail as string, body);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type GameEventResponse = {
  gameEventId: string;
  venueId: string;
  gameTableId: string;
  gameRule: "texas_holdem";
  gameFormat: "ring_game" | "tournament";
  status: "pending" | "started" | "finished";
  gameName: string;
  defaultStack: number | null;
  miniChip: number;
  smallBlind: number;
  bigBlind: number;
  anteRule: "none" | "bbante";
  blindExceptionRule: "dead_button" | "moving_forward";
  startDate: string;
  startedAt: string | null;
  finishedAt: string | null;
  startedTableId: string | null;
};

export type GameSessionResponse = {
  gameSessionId: string;
  gameEventId: string;
  gameTableId: string;
  status: "pending" | "started" | "finished";
  currentHandNumber: number;
  startedAt: string | null;
  finishedAt: string | null;
  gameName: string | null;
  texasHoldemSetting: {
    miniChip: number;
    smallBlind: number;
    bigBlind: number;
    anteRule: "none" | "bbante";
    blindExceptionRule: "dead_button" | "moving_forward";
  } | null;
};

export type GameSessionPlayerResponse = {
  gameSessionId: string;
  playerId: string;
  nickName: string;
  avatarPath: string | null;
  startHandNumber: number;
  finishedHandNumber: number | null;
  checkedInAt: string;
  checkedOutAt: string | null;
};

export type GameEventDetailResponse = GameEventResponse & {
  sessions: (GameSessionResponse & {
    players: GameSessionPlayerResponse[];
  })[];
};

export type PlayerResponse = {
  playerId: string;
  nickName: string;
  avatarUrlSmall: string | null;
  avatarUrlLarge: string | null;
};

export type GameEventListResponse = {
  data: GameEventResponse[];
  total: number;
  page: number;
  perPage: number;
};

export type UpdateGameEventRequest = {
  name?: string;
  smallBlind?: number;
  bigBlind?: number;
  tournamentBuyIn?: number;
  tournamentBuyInChip?: number;
  tournamentReBuyChip?: number;
  tournamentAddOnPrice?: number;
  tournamentAddOnChip?: number;
  tournamentReEntryChip?: number;
};

// ---------------------------------------------------------------------------
// API 関数
// ---------------------------------------------------------------------------

/** GET /health */
export function getHealth(): Promise<unknown> {
  return backendFetch<unknown>("/health");
}

/** GET /v1/game-events?venueId={id}&statuses={statuses} */
export function listGameEvents(params: {
  venueId: string;
  statuses: string;
}): Promise<GameEventResponse[]> {
  const query = new URLSearchParams({
    venueId: params.venueId,
    statuses: params.statuses,
  });
  return backendFetch<GameEventResponse[]>(`/v1/game-events?${query}`);
}

/** GET /v1/game-events/{gameEventId} */
export function getGameEventDetail(
  gameEventId: string,
): Promise<GameEventDetailResponse> {
  return backendFetch<GameEventDetailResponse>(
    `/v1/game-events/${encodeURIComponent(gameEventId)}`,
  );
}

/** GET /v1/players/{playerId} */
export function getPlayer(playerId: string): Promise<PlayerResponse> {
  return backendFetch<PlayerResponse>(
    `/v1/players/${encodeURIComponent(playerId)}`,
  );
}

/** POST /v1/game-events/{gameEventId}/sessions/{gameSessionId}/checkin */
export function checkinPlayer(params: {
  gameEventId: string;
  gameSessionId: string;
  playerId: string;
}): Promise<GameSessionPlayerResponse> {
  return backendFetch<GameSessionPlayerResponse>(
    `/v1/game-events/${encodeURIComponent(params.gameEventId)}/sessions/${encodeURIComponent(params.gameSessionId)}/checkin`,
    {
      method: "POST",
      body: JSON.stringify({ playerId: params.playerId }),
    },
  );
}

/** POST /v1/game-events/{gameEventId}/sessions/{gameSessionId}/checkout */
export function checkoutPlayer(params: {
  gameEventId: string;
  gameSessionId: string;
  playerId: string;
}): Promise<GameSessionPlayerResponse> {
  return backendFetch<GameSessionPlayerResponse>(
    `/v1/game-events/${encodeURIComponent(params.gameEventId)}/sessions/${encodeURIComponent(params.gameSessionId)}/checkout`,
    {
      method: "POST",
      body: JSON.stringify({ playerId: params.playerId }),
    },
  );
}

/** GET /v1/game_events?page=N&perPage=M — ページング付き一覧取得 */
export function listGameEventsPaginated(
  page: number,
  perPage: number,
  status?: "ONGOING" | "FINISHED",
): Promise<GameEventListResponse> {
  const params = new URLSearchParams();
  params.set("page", page.toString());
  params.set("perPage", perPage.toString());
  if (status) params.set("status", status);
  return backendFetch<GameEventListResponse>(
    `/v1/game_events?${params.toString()}`,
  );
}

/** PUT /v1/game_events/:id — セッション更新 */
export function updateGameEvent(
  id: string,
  body: UpdateGameEventRequest,
): Promise<GameEventResponse> {
  return backendFetch<GameEventResponse>(`/v1/game_events/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** POST /v1/game_events/:id/finish — セッション終了 */
export function finishGameEvent(id: string): Promise<GameEventResponse> {
  return backendFetch<GameEventResponse>(`/v1/game_events/${id}/finish`, {
    method: "POST",
  });
}

export type MeResponse = {
  playerId: string;
  nickName: string;
  email: string | null;
  role: string | null;
  avatarUrlSmall: string | null;
  avatarUrlLarge: string | null;
};

/** GET /v1/players/me */
export function getMe(): Promise<MeResponse> {
  return backendFetch<MeResponse>("/v1/players/me");
}
