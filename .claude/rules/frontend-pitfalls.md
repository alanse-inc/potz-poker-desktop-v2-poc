---
paths:
  - "src/**/*.{ts,tsx}"
---

# Frontend (React / TypeScript) 落とし穴チェックリスト

このファイルは `src/` を編集するときに自動的に読み込まれるパススコープルールです。
修正・実装前に該当項目を確認すること。

## useEffect のクリーンアップと race condition

- [ ] 非同期処理には `cancelled` フラグ + クリーンアップを必ず実装する
- [ ] コンポーネントのアンマウント後に `setState` を呼ばない (`unmountedRef` で守る)

```tsx
useEffect(() => {
    let cancelled = false;
    const unmountedRef = { current: false };

    (async () => {
        const data = await fetchSomething();
        if (!cancelled) {
            setState(data);
        }
    })();

    return () => {
        cancelled = true;
    };
}, [dep]);
```

## Tauri イベントリスナー

- [ ] `listen()` の戻り値 (unlisten 関数) は非同期。`await` して cleanup で呼ぶ
- [ ] クリーンアップ漏れはメモリリークとゾンビリスナーになる

```tsx
useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen('event-name', (event) => {
        // handle event
    }).then((fn) => {
        unlisten = fn;
    });

    return () => {
        unlisten?.();
    };
}, []);
```

## popEventHistory と key 指定

- [ ] `popEventHistory` は **key を指定** して特定イベントのみ削除する
- [ ] key なしの全削除は他のコンポーネントに影響するため禁止

## SSE / WebSocket reconnect

- [ ] reconnect を管理する `generation` カウンターを使い、旧世代の応答を捨てる
- [ ] `intentionallyStopped` フラグで意図的な切断と予期しない切断を区別する
- [ ] `processNext` の `cancelled` フラグで二重起動を防ぐ

```ts
let generation = 0;

function reconnect() {
    generation++;
    const currentGen = generation;

    startStream((data) => {
        if (currentGen !== generation) return; // 旧世代の応答を無視
        handleData(data);
    });
}
```

## MediaStream

- [ ] `MediaStream` はインスタンス変数 (ref) に持つ。ローカル変数には持たない
- [ ] コンポーネントのアンマウント時に `stream.getTracks().forEach(t => t.stop())` で解放する
- [ ] 複数の consumer がいる場合は `MediaStream` を共有しない (個別に取得)

## operator_context / fetchAll

- [ ] `fetchAll` などの全件取得に `cancelled` フラグを設ける
- [ ] context の Provider がアンマウントされる前にすべての非同期処理をキャンセルする

## localStorage

- [ ] `localStorage.getItem` / `setItem` は `try/catch` でガードする (Safari プライベートモード等で例外が出る)
- [ ] JSON のパースも必ず `try/catch` で囲む

## 型安全性

- [ ] `as any` での型回避は禁止。型を正しく定義する
- [ ] `invoke` の引数は型定義ファイルと一致させる
- [ ] `undefined` / `null` の分岐を省略しない

## 検証コマンド (Frontend 側)

```sh
pnpm exec tsc --noEmit
pnpm vitest run --exclude='**/.claude/**'
pnpm biome check src/
```

biome のベースラインは 5 errors。これを超えた場合は新規発生分を修正する。
