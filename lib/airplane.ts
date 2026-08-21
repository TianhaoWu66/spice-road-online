import {
  addBot, addPlayer, applyGameAction, BotDifficulty, ChatPhrase, createLobby, GameAction, GameState,
  removeBot, resolveAfkTurns, runBotTurns, sendChat, startGame,
} from "./game";

export type RoomResponse = { code: string; version: number; token?: string; playerId?: string; state: GameState; error?: string };

type WireMessage =
  | { type: "request"; id: string; body: Record<string, unknown> }
  | { type: "response"; id: string; ok: boolean; data?: RoomResponse; error?: string }
  | { type: "state"; version: number; state: GameState };

const SIGNAL_PREFIX_COMPRESSED = "SR3:";
const SIGNAL_PREFIX_PLAIN = "SR2:";
const RTC_CONFIG: RTCConfiguration = { iceServers: [] };

function publicState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => {
      const publicPlayer = { ...player };
      delete publicPlayer.token;
      delete publicPlayer.accountId;
      return publicPlayer;
    }),
  };
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

const EMPTY_STATE = { players: [], status: "lobby", log: [] } as unknown as GameState;

function slimSdp(sdp: string): string {
  return sdp
    .split(/\r?\n/)
    .filter((line) => {
      if (!line.trim()) return false;
      return !(
        line.startsWith("a=extmap-allow-mixed") ||
        line.startsWith("a=msid-semantic") ||
        line.startsWith("a=ice-options") ||
        line.startsWith("a=ssrc:") ||
        line.startsWith("a=msid:") ||
        line.startsWith("a=rtpmap:") ||
        line.startsWith("a=rtcp:")
      );
    })
    .join("\r\n") + "\r\n";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function compressText(text: string): Promise<string | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("deflate"));
    const buffer = await new Response(stream).arrayBuffer();
    return bytesToBase64(new Uint8Array(buffer));
  } catch {
    return null;
  }
}

async function decompressText(encoded: string): Promise<string> {
  const stream = new Blob([base64ToBytes(encoded)]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Response(stream).text();
}

export async function encodeSignal(payload: unknown): Promise<string> {
  const json = JSON.stringify(payload);
  const plain = btoa(json);
  const compressed = await compressText(json);
  if (compressed && compressed.length < plain.length) return SIGNAL_PREFIX_COMPRESSED + compressed;
  return SIGNAL_PREFIX_PLAIN + plain;
}

export async function decodeSignal(code: string): Promise<{ kind: "offer" | "answer"; code?: string; sdp: string }> {
  const text = code.trim();
  let payload: { kind: "offer" | "answer"; code?: string; sdp: string };
  if (text.startsWith(SIGNAL_PREFIX_COMPRESSED)) {
    payload = JSON.parse(await decompressText(text.slice(SIGNAL_PREFIX_COMPRESSED.length))) as typeof payload;
  } else if (text.startsWith(SIGNAL_PREFIX_PLAIN)) {
    payload = JSON.parse(atob(text.slice(SIGNAL_PREFIX_PLAIN.length))) as typeof payload;
  } else {
    throw new Error("邀请码格式不正确");
  }
  if (!payload.sdp) throw new Error("邀请码缺少连接信息");
  return { ...payload, sdp: payload.sdp };
}

function setupChannel(channel: RTCDataChannel, onMessage: (message: WireMessage) => void, onOpen?: () => void, onClose?: () => void) {
  channel.binaryType = "arraybuffer";
  channel.onmessage = (event) => {
    try {
      onMessage(JSON.parse(String(event.data)) as WireMessage);
    } catch {
      // 忽略无法解析的消息
    }
  };
  if (onOpen) channel.onopen = onOpen;
  if (onClose) channel.onclose = onClose;
}

async function waitForGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2500);
    const onState = () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onState);
  });
}

/**
 * 离线联机房主端：本机浏览器直接运行游戏引擎，通过 WebRTC 数据通道
 * 与各加入者通信。加入者只发送请求，房主统一裁决并广播最新状态。
 */
export class AirplaneHost {
  readonly code = randomCode();
  readonly token: string;
  readonly playerId: string;
  private state: GameState;
  private version = 1;
  private peers = new Map<RTCDataChannel, true>();
  private pendingOffer: { pc: RTCPeerConnection; channel: RTCDataChannel } | null = null;
  private pending = new Map<string, (response: RoomResponse) => void>();
  private stateListeners = new Set<(state: GameState, version: number) => void>();
  private peerListeners = new Set<(count: number) => void>();
  private afkTimer: ReturnType<typeof setInterval> | null = null;

  constructor(name: string, maxPlayers: number, avatar?: string) {
    const hostToken = crypto.randomUUID();
    const lobby = createLobby(name, Math.min(5, Math.max(2, maxPlayers)), hostToken, avatar ? { avatar } : undefined);
    this.state = lobby;
    this.token = hostToken;
    this.playerId = lobby.players[0].id;
    this.afkTimer = setInterval(() => this.resolveAfkAndBroadcast(), 2000);
  }

  get playerCount() {
    return this.state.players.length;
  }

  get maxPlayers() {
    return this.state.maxPlayers;
  }

  dispose() {
    if (this.afkTimer) clearInterval(this.afkTimer);
    for (const channel of this.peers.keys()) {
      try { channel.close(); } catch { /* 忽略 */ }
    }
  }

  onState(listener: (state: GameState, version: number) => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onPeers(listener: (count: number) => void) {
    this.peerListeners.add(listener);
    return () => this.peerListeners.delete(listener);
  }

  /** 生成一份新邀请（每次一个加入者），返回用于二维码/粘贴的邀请码。 */
  async createInvite(): Promise<string> {
    if (this.pendingOffer) throw new Error("已有待连接的邀请，请先让该玩家扫码加入");
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const channel = pc.createDataChannel("spice", { ordered: true });
    setupChannel(
      channel,
      (message) => this.handlePeerMessage(channel, message),
      () => {
        this.peers.set(channel, true);
        this.notifyPeers();
      },
      () => {
        this.peers.delete(channel);
        this.notifyPeers();
      },
    );
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForGathering(pc);
    this.pendingOffer = { pc, channel };
    return encodeSignal({ kind: "offer", code: this.code, sdp: slimSdp(pc.localDescription!.sdp) });
  }

  /** 房主扫描/粘贴加入者回执，完成连接。 */
  async acceptAnswer(signal: string): Promise<void> {
    if (!this.pendingOffer) throw new Error("没有等待回执的邀请，请先生成邀请码");
    const payload = await decodeSignal(signal);
    if (payload.kind !== "answer") throw new Error("这不是加入者回执");
    const { pc } = this.pendingOffer;
    this.pendingOffer = null;
    await pc.setRemoteDescription({ type: "answer", sdp: payload.sdp });
  }

  private notifyPeers() {
    const count = this.peers.size;
    this.peerListeners.forEach((listener) => listener(count));
  }

  private resolveAfkAndBroadcast() {
    const before = JSON.stringify(this.state);
    resolveAfkTurns(this.state, Date.now());
    if (JSON.stringify(this.state) !== before) {
      this.version += 1;
      this.broadcast();
      this.emitState();
    }
  }

  private emitState() {
    const state = publicState(this.state);
    this.stateListeners.forEach((listener) => listener(state, this.version));
  }

  private broadcast() {
    const message: WireMessage = { type: "state", version: this.version, state: publicState(this.state) };
    const text = JSON.stringify(message);
    for (const channel of this.peers.keys()) {
      if (channel.readyState === "open") {
        try { channel.send(text); } catch { /* 忽略发送失败 */ }
      }
    }
    this.emitState();
  }

  private handlePeerMessage(channel: RTCDataChannel, message: WireMessage) {
    if (message.type === "request") {
      try {
        const data = this.handleCommand(message.body);
        const response: WireMessage = { type: "response", id: message.id, ok: true, data };
        if (channel.readyState === "open") channel.send(JSON.stringify(response));
      } catch (error) {
        const response: WireMessage = { type: "response", id: message.id, ok: false, error: error instanceof Error ? error.message : "操作失败" };
        if (channel.readyState === "open") channel.send(JSON.stringify(response));
      }
    }
  }

  /** 房主本机与加入者共用的命令入口，与线上房间接口语义一致。 */
  request(body: Record<string, unknown>): RoomResponse {
    try {
      return this.handleCommand(body);
    } catch (error) {
      return { code: this.code, version: this.version, state: publicState(this.state), error: error instanceof Error ? error.message : "操作失败" };
    }
  }

  private handleCommand(body: Record<string, unknown>): RoomResponse {
    const command = String(body.command ?? "");
    const name = String(body.name ?? "").trim().slice(0, 12);
    const token = String(body.token ?? "");

    if (command === "__refresh") {
      resolveAfkTurns(this.state, Date.now());
      return this.respond();
    }
    if (command === "create") {
      if (!name && !this.state.players[0]) throw new Error("请输入昵称");
      return this.respond(this.token, this.playerId);
    }
    if (command === "join") {
      if (!name) throw new Error("请输入昵称");
      const joinToken = token || crypto.randomUUID();
      const existing = this.state.players.find((player) => player.token === joinToken);
      if (!existing) addPlayer(this.state, name, joinToken);
      else existing.name = name;
      const joined = existing ?? this.state.players.at(-1)!;
      this.version += 1;
      this.broadcast();
      return this.respond(joined.token, joined.id);
    }

    const player = this.state.players.find((candidate) => candidate.token === token);
    if (!player) throw new Error("玩家身份已失效，请重新加入");

    if (command === "addBot") {
      if (player.id !== this.state.hostId) throw new Error("只有房主可以添加人机");
      addBot(this.state, body.difficulty as BotDifficulty ?? "normal");
    } else if (command === "removeBot") {
      if (player.id !== this.state.hostId) throw new Error("只有房主可以移除人机");
      removeBot(this.state, String(body.botId ?? ""));
    } else if (command === "start") {
      if (player.id !== this.state.hostId) throw new Error("只有房主可以开始");
      startGame(this.state);
      runBotTurns(this.state);
    } else if (command === "action" && body.action) {
      applyGameAction(this.state, player.id, body.action as GameAction);
      runBotTurns(this.state);
    } else if (command === "chat" && body.phrase) {
      sendChat(this.state, player.id, body.phrase as ChatPhrase);
    } else {
      throw new Error("未知操作");
    }
    this.version += 1;
    this.broadcast();
    return this.respond(player.token, player.id);
  }

  private respond(token?: string, playerId?: string): RoomResponse {
    return { code: this.code, version: this.version, token, playerId, state: publicState(this.state) };
  }
}

/**
 * 离线联机加入者端：连接到房主，发送请求并接收状态广播。
 */
export class AirplaneGuest {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private code = "";
  private pending = new Map<string, (response: RoomResponse) => void>();
  private stateListeners = new Set<(state: GameState, version: number) => void>();
  private openListeners = new Set<() => void>();
  private closed = false;

  async connect(offerSignal: string): Promise<string> {
    const payload = await decodeSignal(offerSignal);
    if (payload.kind !== "offer") throw new Error("请扫描房主的邀请二维码");
    this.code = payload.code ?? "";
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc.ondatachannel = (event) => this.attachChannel(event.channel);
    await this.pc.setRemoteDescription({ type: "offer", sdp: payload.sdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await waitForGathering(this.pc);
    return encodeSignal({ kind: "answer", sdp: slimSdp(this.pc.localDescription!.sdp) });
  }

  get connected() {
    return this.channel?.readyState === "open";
  }

  get roomCode() {
    return this.code;
  }

  dispose() {
    this.closed = true;
    try { this.channel?.close(); } catch { /* 忽略 */ }
    try { this.pc?.close(); } catch { /* 忽略 */ }
  }

  onOpen(listener: () => void) {
    this.openListeners.add(listener);
    return () => this.openListeners.delete(listener);
  }

  onState(listener: (state: GameState, version: number) => void) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private attachChannel(channel: RTCDataChannel) {
    this.channel = channel;
    setupChannel(
      channel,
      (message) => {
        if (message.type === "response") {
          const resolver = this.pending.get(message.id);
          if (!resolver) return;
          this.pending.delete(message.id);
          resolver(message.ok ? message.data! : { code: this.code, version: 0, state: EMPTY_STATE, error: message.error ?? "操作失败" });
        } else if (message.type === "state") {
          this.stateListeners.forEach((listener) => listener(message.state, message.version));
        }
      },
      () => this.openListeners.forEach((listener) => listener()),
      () => { /* 断开时由轮询请求的超时提示用户 */ },
    );
  }

  request(body: Record<string, unknown>): Promise<RoomResponse> {
    return new Promise((resolve, reject) => {
      if (!this.channel || this.channel.readyState !== "open") {
        reject(new Error("与房主的连接尚未建立"));
        return;
      }
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("连接超时，请检查与房主是否在同一网络"));
      }, 10_000);
      this.pending.set(id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
      try {
        this.channel.send(JSON.stringify({ type: "request", id, body } satisfies WireMessage));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("发送失败"));
      }
    });
  }
}
