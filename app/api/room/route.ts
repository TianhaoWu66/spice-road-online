import { env } from "cloudflare:workers";
import { addPlayer, applyGameAction, createLobby, GameAction, GameState, startGame } from "../../../lib/game";

const schemaSql = `CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
)`;

async function ensureSchema() {
  if (!env.DB) throw new Error("共享房间数据库尚未连接");
  await env.DB.prepare(schemaSql).run();
}

function cleanCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function publicState(state: GameState) {
  return { ...state, players: state.players.map(({ token: _token, ...player }) => player) };
}

async function loadRoom(code: string) {
  const row = await env.DB.prepare("SELECT state, version FROM rooms WHERE code = ?").bind(code).first<{ state: string; version: number }>();
  if (!row) throw new Error("找不到这个房间");
  return { state: JSON.parse(row.state) as GameState, version: row.version };
}

async function saveRoom(code: string, state: GameState, version: number) {
  const result = await env.DB.prepare("UPDATE rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?")
    .bind(JSON.stringify(state), Date.now(), code, version).run();
  if (!result.meta.changes) throw new Error("房间刚刚发生了变化，请重试");
  return version + 1;
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const code = cleanCode(new URL(request.url).searchParams.get("code"));
    const room = await loadRoom(code);
    return Response.json({ code, version: room.version, state: publicState(room.state) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取房间失败" }, { status: 404 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as {
      command?: "create" | "join" | "start" | "action";
      code?: string; name?: string; token?: string; maxPlayers?: number;
      action?: GameAction;
    };
    const name = String(body.name ?? "").trim().slice(0, 12);
    const token = String(body.token ?? "");

    if (body.command === "create") {
      if (!name) throw new Error("请输入昵称");
      const maxPlayers = Math.min(5, Math.max(2, Number(body.maxPlayers) || 5));
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomCode();
        const state = createLobby(name, maxPlayers, token || crypto.randomUUID());
        const result = await env.DB.prepare("INSERT OR IGNORE INTO rooms (code, state, version, updated_at) VALUES (?, ?, 1, ?)")
          .bind(code, JSON.stringify(state), Date.now()).run();
        if (result.meta.changes) return Response.json({ code, version: 1, token: state.players[0].token, state: publicState(state) });
      }
      throw new Error("暂时无法创建房间，请重试");
    }

    const code = cleanCode(body.code);
    const room = await loadRoom(code);
    if (body.command === "join") {
      if (!name) throw new Error("请输入昵称");
      const joinToken = token || crypto.randomUUID();
      const existing = room.state.players.find((p) => p.token === joinToken);
      if (!existing) addPlayer(room.state, name, joinToken);
      const version = existing ? room.version : await saveRoom(code, room.state, room.version);
      return Response.json({ code, version, token: joinToken, state: publicState(room.state) });
    }

    const player = room.state.players.find((p) => p.token === token);
    if (!player) throw new Error("玩家身份已失效，请重新加入");
    if (body.command === "start") {
      if (player.id !== room.state.hostId) throw new Error("只有房主可以开始");
      startGame(room.state);
    } else if (body.command === "action" && body.action) {
      applyGameAction(room.state, player.id, body.action);
    } else {
      throw new Error("未知操作");
    }
    const version = await saveRoom(code, room.state, room.version);
    return Response.json({ code, version, state: publicState(room.state) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "操作失败" }, { status: 400 });
  }
}
