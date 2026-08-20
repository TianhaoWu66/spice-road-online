export type Spice = 0 | 1 | 2 | 3;
export type Spices = [number, number, number, number];
export type BotDifficulty = "easy" | "normal" | "hard";

export type MerchantCard =
  | { id: string; type: "produce"; gain: Spices }
  | { id: string; type: "upgrade"; amount: number }
  | { id: string; type: "trade"; cost: Spices; gain: Spices };

export type OrderCard = { id: string; cost: Spices; points: number };
export type MarketSlot = { cardId: string; bonus: Spices };
export type ActionEvent = {
  id: number;
  playerId: string;
  playerName: string;
  playerColor: string;
  playerAvatar?: string;
  type: "PLAY" | "ACQUIRE" | "CLAIM" | "REST";
  cardId?: string;
  orderId?: string;
  times?: number;
  upgradeCount?: number;
  upgrades?: Spice[];
};
export const CHAT_PHRASES = ["老叟戏顽童", "神之一手", "你的计谋被我识破了"] as const;
export type ChatPhrase = typeof CHAT_PHRASES[number];
export type ChatEvent = {
  id: number;
  playerId: string;
  playerName: string;
  playerColor: string;
  phrase: ChatPhrase;
};

export type Player = {
  id: string;
  token?: string;
  name: string;
  color: string;
  avatar?: string;
  accountId?: string;
  spices: Spices;
  hand: string[];
  played: string[];
  orders: string[];
  gold: number;
  silver: number;
  isBot?: boolean;
  botDifficulty?: BotDifficulty;
};

export type GameState = {
  status: "lobby" | "playing" | "finished";
  maxPlayers: number;
  hostId: string;
  players: Player[];
  merchantDeck: string[];
  orderDeck: string[];
  merchantMarket: MarketSlot[];
  orderMarket: string[];
  goldSupply: number;
  silverSupply: number;
  currentPlayer: number;
  round: number;
  finalRound: boolean;
  winnerIds: string[];
  log: string[];
  actionEvents?: ActionEvent[];
  nextActionEventId?: number;
  chatEvents?: ChatEvent[];
  nextChatEventId?: number;
  pendingDiscard?: { playerId: string; count: number };
};

export type GameAction =
  | { type: "REST" }
  | { type: "PLAY"; cardId: string; upgrades?: Spice[]; times?: number }
  | { type: "ACQUIRE"; marketIndex: number; payment: Spices }
  | { type: "CLAIM"; orderIndex: number }
  | { type: "DISCARD"; spices: Spices };

export const SPICE_NAMES = ["姜黄", "藏红花", "小豆蔻", "肉桂"];
export const PLAYER_COLORS = ["#e6a23c", "#df6b57", "#5f9b76", "#5f7dad", "#8b6bb1"];
export const zeroSpices = (): Spices => [0, 0, 0, 0];
const s = (a = 0, b = 0, c = 0, d = 0): Spices => [a, b, c, d];

export const CARD_CATALOG_READY = true;
export const MERCHANT_CARDS: Record<string, MerchantCard> = {
  "start-gain": { id: "start-gain", type: "produce", gain: s(2, 0, 0, 0) },
  "start-up": { id: "start-up", type: "upgrade", amount: 2 },
  m001: { id: "m001", type: "trade", cost: s(0, 0, 1, 0), gain: s(1, 2, 0, 0) },
  m002: { id: "m002", type: "trade", cost: s(0, 3, 0, 0), gain: s(0, 0, 3, 0) },
  m003: { id: "m003", type: "trade", cost: s(0, 0, 1, 0), gain: s(4, 1, 0, 0) },
  m004: { id: "m004", type: "trade", cost: s(0, 0, 0, 1), gain: s(2, 2, 0, 0) },
  m005: { id: "m005", type: "trade", cost: s(4, 0, 0, 0), gain: s(0, 0, 1, 1) },
  m006: { id: "m006", type: "trade", cost: s(0, 2, 0, 0), gain: s(2, 0, 0, 1) },
  m007: { id: "m007", type: "trade", cost: s(2, 0, 0, 0), gain: s(0, 0, 1, 0) },
  m008: { id: "m008", type: "produce", gain: s(3, 0, 0, 0) },
  m009: { id: "m009", type: "produce", gain: s(0, 0, 0, 1) },
  m010: { id: "m010", type: "trade", cost: s(0, 3, 0, 0), gain: s(1, 0, 1, 1) },
  m011: { id: "m011", type: "trade", cost: s(0, 0, 2, 0), gain: s(2, 3, 0, 0) },
  m012: { id: "m012", type: "trade", cost: s(0, 2, 0, 0), gain: s(3, 0, 1, 0) },
  m013: { id: "m013", type: "trade", cost: s(0, 0, 2, 0), gain: s(2, 1, 0, 1) },
  m014: { id: "m014", type: "produce", gain: s(0, 0, 1, 0) },
  m015: { id: "m015", type: "produce", gain: s(0, 2, 0, 0) },
  m016: { id: "m016", type: "trade", cost: s(0, 0, 2, 0), gain: s(0, 0, 0, 2) },
  m017: { id: "m017", type: "trade", cost: s(0, 0, 0, 2), gain: s(0, 3, 2, 0) },
  m018: { id: "m018", type: "trade", cost: s(3, 0, 0, 0), gain: s(0, 0, 0, 1) },
  m019: { id: "m019", type: "produce", gain: s(2, 1, 0, 0) },
  m020: { id: "m020", type: "trade", cost: s(1, 1, 0, 0), gain: s(0, 0, 0, 1) },
  m021: { id: "m021", type: "trade", cost: s(3, 0, 0, 0), gain: s(0, 3, 0, 0) },
  m022: { id: "m022", type: "trade", cost: s(0, 0, 0, 1), gain: s(0, 3, 0, 0) },
  m023: { id: "m023", type: "trade", cost: s(0, 0, 2, 0), gain: s(0, 2, 0, 1) },
  m024: { id: "m024", type: "trade", cost: s(0, 0, 3, 0), gain: s(0, 0, 0, 3) },
  m025: { id: "m025", type: "trade", cost: s(4, 0, 0, 0), gain: s(0, 0, 2, 0) },
  m026: { id: "m026", type: "trade", cost: s(0, 3, 0, 0), gain: s(0, 0, 0, 2) },
  m027: { id: "m027", type: "upgrade", amount: 3 },
  m028: { id: "m028", type: "trade", cost: s(0, 0, 0, 1), gain: s(0, 0, 2, 0) },
  m029: { id: "m029", type: "trade", cost: s(0, 2, 0, 0), gain: s(0, 0, 2, 0) },
  m030: { id: "m030", type: "trade", cost: s(0, 0, 0, 2), gain: s(1, 1, 3, 0) },
  m031: { id: "m031", type: "trade", cost: s(0, 3, 0, 0), gain: s(2, 0, 2, 0) },
  m032: { id: "m032", type: "produce", gain: s(1, 1, 0, 0) },
  m033: { id: "m033", type: "trade", cost: s(0, 1, 0, 0), gain: s(3, 0, 0, 0) },
  m034: { id: "m034", type: "trade", cost: s(3, 0, 0, 0), gain: s(0, 1, 1, 0) },
  m035: { id: "m035", type: "trade", cost: s(0, 0, 0, 1), gain: s(1, 1, 1, 0) },
  m036: { id: "m036", type: "trade", cost: s(2, 0, 1, 0), gain: s(0, 0, 0, 2) },
  m037: { id: "m037", type: "produce", gain: s(4, 0, 0, 0) },
  m038: { id: "m038", type: "trade", cost: s(0, 0, 0, 1), gain: s(3, 0, 1, 0) },
  m039: { id: "m039", type: "trade", cost: s(2, 0, 0, 0), gain: s(0, 2, 0, 0) },
  m040: { id: "m040", type: "trade", cost: s(5, 0, 0, 0), gain: s(0, 0, 0, 2) },
  m041: { id: "m041", type: "trade", cost: s(0, 0, 1, 0), gain: s(0, 2, 0, 0) },
  m042: { id: "m042", type: "produce", gain: s(1, 0, 1, 0) },
};
const ORDER_CARD_DATA: Array<[string, Spices, number]> = [
  ["o001", s(1, 1, 1, 1), 12],
  ["o002", s(0, 2, 2, 0), 10],
  ["o003", s(0, 5, 0, 0), 10],
  ["o004", s(3, 1, 1, 1), 14],
  ["o005", s(0, 2, 0, 3), 16],
  ["o006", s(3, 0, 2, 0), 9],
  ["o007", s(1, 0, 2, 1), 12],
  ["o008", s(0, 2, 2, 2), 19],
  ["o009", s(3, 2, 0, 0), 7],
  ["o010", s(0, 0, 4, 0), 12],
  ["o011", s(2, 1, 0, 1), 9],
  ["o012", s(2, 0, 0, 2), 10],
  ["o013", s(0, 0, 5, 0), 15],
  ["o014", s(0, 2, 1, 1), 12],
  ["o015", s(1, 1, 1, 3), 20],
  ["o016", s(2, 3, 0, 0), 8],
  ["o017", s(0, 0, 0, 4), 16],
  ["o018", s(2, 0, 3, 0), 11],
  ["o019", s(0, 4, 0, 0), 8],
  ["o020", s(0, 0, 0, 5), 20],
  ["o021", s(2, 0, 0, 3), 14],
  ["o022", s(0, 0, 2, 2), 14],
  ["o023", s(0, 0, 2, 3), 18],
  ["o024", s(0, 0, 3, 2), 17],
  ["o025", s(0, 2, 3, 0), 13],
  ["o026", s(3, 0, 0, 2), 11],
  ["o027", s(2, 2, 0, 2), 13],
  ["o028", s(1, 1, 3, 1), 18],
  ["o029", s(0, 3, 0, 2), 14],
  ["o030", s(0, 2, 0, 2), 12],
  ["o031", s(2, 2, 0, 0), 6],
  ["o032", s(2, 2, 2, 0), 13],
  ["o033", s(2, 0, 2, 0), 8],
  ["o034", s(1, 3, 1, 1), 16],
  ["o035", s(0, 3, 2, 0), 12],
  ["o036", s(2, 0, 2, 2), 17],
];
export const ORDER_CARDS: Record<string, OrderCard> = Object.fromEntries(
  ORDER_CARD_DATA.map(([id, cost, points]) => [id, { id, cost, points }]),
);

const shuffle = <T,>(values: T[]) => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export function createLobby(hostName: string, maxPlayers: number, token: string, profile?: { accountId?: string; avatar?: string }): GameState {
  const host: Player = {
    id: crypto.randomUUID(), token, name: hostName, color: PLAYER_COLORS[0], avatar: profile?.avatar, accountId: profile?.accountId,
    spices: zeroSpices(), hand: [], played: [], orders: [], gold: 0, silver: 0,
  };
  return {
    status: "lobby", maxPlayers, hostId: host.id, players: [host], merchantDeck: [],
    orderDeck: [], merchantMarket: [], orderMarket: [], goldSupply: 0, silverSupply: 0,
    currentPlayer: 0, round: 1, finalRound: false, winnerIds: [], log: [`${hostName} 创建了商队`],
    actionEvents: [], nextActionEventId: 1,
    chatEvents: [], nextChatEventId: 1,
  };
}

export function addPlayer(state: GameState, name: string, token: string, profile?: { accountId?: string; avatar?: string }): GameState {
  if (state.status !== "lobby") throw new Error("游戏已经开始");
  if (state.players.length >= state.maxPlayers) throw new Error("房间已满");
  if (state.players.some((p) => p.name === name)) throw new Error("这个昵称已被使用");
  state.players.push({
    id: crypto.randomUUID(), token, name, color: PLAYER_COLORS[state.players.length], avatar: profile?.avatar, accountId: profile?.accountId,
    spices: zeroSpices(), hand: [], played: [], orders: [], gold: 0, silver: 0,
  });
  state.log.push(`${name} 加入了商队`);
  return state;
}

const BOT_NAMES: Record<BotDifficulty, string[]> = {
  easy: ["学徒商人", "沙丘新手", "小骆驼"],
  normal: ["丝路商人", "绿洲行家", "香料掌柜"],
  hard: ["商路大师", "王庭巨贾", "沙海智者"],
};

export function addBot(state: GameState, difficulty: BotDifficulty): GameState {
  if (state.status !== "lobby") throw new Error("游戏已经开始");
  if (state.players.length >= state.maxPlayers) throw new Error("房间已满");
  if (!(["easy", "normal", "hard"] as string[]).includes(difficulty)) throw new Error("人机难度无效");
  const usedNames = new Set(state.players.map((player) => player.name));
  const baseName = BOT_NAMES[difficulty].find((candidate) => !usedNames.has(candidate)) ?? BOT_NAMES[difficulty][0];
  let name = baseName;
  let suffix = 2;
  while (usedNames.has(name)) name = `${baseName}${suffix++}`;
  state.players.push({
    id: crypto.randomUUID(), name, color: PLAYER_COLORS[state.players.length],
    avatar: "🤖",
    spices: zeroSpices(), hand: [], played: [], orders: [], gold: 0, silver: 0,
    isBot: true, botDifficulty: difficulty,
  });
  state.log.push(`${name}（人机）加入了商队`);
  return state;
}

export function removeBot(state: GameState, botId: string): GameState {
  if (state.status !== "lobby") throw new Error("游戏已经开始");
  const index = state.players.findIndex((player) => player.id === botId && player.isBot);
  if (index < 0) throw new Error("找不到这个人机玩家");
  const [bot] = state.players.splice(index, 1);
  state.players.forEach((player, playerIndex) => { player.color = PLAYER_COLORS[playerIndex]; });
  state.log.push(`${bot.name} 离开了商队`);
  return state;
}

export function startGame(state: GameState): GameState {
  if (state.status !== "lobby") throw new Error("游戏已经开始");
  if (state.players.length < 2) throw new Error("至少需要两名玩家");
  if (!CARD_CATALOG_READY || !Object.keys(MERCHANT_CARDS).length || !Object.keys(ORDER_CARDS).length) throw new Error("卡牌库正在整理，暂时不能开始游戏");
  const merchantDeck = shuffle(Object.keys(MERCHANT_CARDS).filter((id) => !id.startsWith("start")));
  const orderDeck = shuffle(Object.keys(ORDER_CARDS));
  state.players.forEach((p, index) => {
    p.hand = ["start-gain", "start-up"];
    p.spices = index === 0 ? s(3) : index < 3 ? s(4) : s(3, 1);
  });
  state.merchantMarket = merchantDeck.splice(0, 6).map((cardId) => ({ cardId, bonus: zeroSpices() }));
  state.orderMarket = orderDeck.splice(0, 5);
  state.merchantDeck = merchantDeck;
  state.orderDeck = orderDeck;
  state.goldSupply = state.players.length * 2;
  state.silverSupply = state.players.length * 2;
  state.status = "playing";
  state.log.push("商路开启，第一轮开始");
  return state;
}

const total = (v: Spices) => v.reduce((a, b) => a + b, 0);
export const canAfford = (have: Spices, cost: Spices, times = 1) => cost.every((n, i) => have[i] >= n * times);
const add = (target: Spices, values: Spices, factor = 1) => values.forEach((n, i) => { target[i] += n * factor; });
const pay = (target: Spices, values: Spices, factor = 1) => values.forEach((n, i) => { target[i] -= n * factor; });

function autoDiscard(player: Player, state?: GameState) {
  let excess = total(player.spices) - 10;
  let tiers: Spice[] = [0, 1, 2, 3];
  if (player.isBot && state?.orderMarket.length) {
    const target = state.orderMarket.map((orderId) => ORDER_CARDS[orderId]).sort((a, b) => {
      const progress = (order: OrderCard) => order.cost.reduce((sum, count, tier) => sum + Math.min(count, player.spices[tier]) * 3 - Math.max(0, count - player.spices[tier]) * 2, 0);
      return progress(b) - progress(a);
    })[0];
    tiers = [0, 1, 2, 3].sort((a, b) => {
      const surplusA = player.spices[a] - target.cost[a];
      const surplusB = player.spices[b] - target.cost[b];
      return surplusB - surplusA || b - a;
    }) as Spice[];
  }
  for (const tier of tiers) {
    if (excess <= 0) break;
    const removed = Math.min(player.spices[tier], excess);
    player.spices[tier] -= removed;
    excess -= removed;
  }
}

export function scorePlayer(player: Player) {
  return player.orders.reduce((sum, id) => sum + (ORDER_CARDS[id]?.points ?? 0), 0)
    + player.gold * 3 + player.silver + player.spices[1] + player.spices[2] + player.spices[3];
}

export function sendChat(state: GameState, playerId: string, phrase: ChatPhrase) {
  if (state.status !== "playing") throw new Error("只能在游戏中发送语音");
  if (!CHAT_PHRASES.includes(phrase)) throw new Error("这条语音不存在");
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error("玩家不存在");
  const events = state.chatEvents ?? [];
  const id = state.nextChatEventId ?? ((events.at(-1)?.id ?? 0) + 1);
  events.push({ id, playerId, playerName: player.name, playerColor: player.color, phrase });
  state.chatEvents = events.slice(-12);
  state.nextChatEventId = id + 1;
  return state;
}

function finishTurn(state: GameState) {
  const wasLast = state.currentPlayer === state.players.length - 1;
  if (state.finalRound && wasLast) {
    state.status = "finished";
    const scores = state.players.map(scorePlayer);
    const best = Math.max(...scores);
    state.winnerIds = state.players.filter((_, i) => scores[i] === best).map((p) => p.id);
    state.log.push("本轮结束，商路结算完成");
    return;
  }
  state.currentPlayer = (state.currentPlayer + 1) % state.players.length;
  if (wasLast) state.round += 1;
}

function recordAction(state: GameState, player: Player, event: Omit<ActionEvent, "id" | "playerId" | "playerName" | "playerColor" | "playerAvatar">) {
  const events = state.actionEvents ?? [];
  const id = state.nextActionEventId ?? ((events.at(-1)?.id ?? 0) + 1);
  events.push({ id, playerId: player.id, playerName: player.name, playerColor: player.color, playerAvatar: player.avatar, ...event });
  state.actionEvents = events.slice(-20);
  state.nextActionEventId = id + 1;
}

export function applyGameAction(state: GameState, playerId: string, action: GameAction): GameState {
  if (state.status !== "playing") throw new Error("游戏不在进行中");
  const player = state.players[state.currentPlayer];
  if (player.id !== playerId) throw new Error("还没轮到你");

  if (state.pendingDiscard) {
    if (state.pendingDiscard.playerId !== player.id || action.type !== "DISCARD") throw new Error("请先选择要放回的香料");
    const excess = total(player.spices) - 10;
    if (excess <= 0 || total(action.spices) !== excess || !canAfford(player.spices, action.spices)) throw new Error("放回的香料数量不正确");
    pay(player.spices, action.spices);
    state.pendingDiscard = undefined;
    state.log.push(`${player.name} 选择放回了 ${excess} 个香料`);
    finishTurn(state);
    return state;
  }
  if (action.type === "DISCARD") throw new Error("当前不需要放回香料");

  if (action.type === "REST") {
    if (!player.played.length) throw new Error("当前没有需要收回的牌");
    player.hand.push(...player.played);
    player.played = [];
    state.log.push(`${player.name} 休息并收回全部商人牌`);
    recordAction(state, player, { type: "REST" });
  }

  if (action.type === "PLAY") {
    if (!player.hand.includes(action.cardId)) throw new Error("这张牌不在手中");
    const card = MERCHANT_CARDS[action.cardId];
    if (!card) throw new Error("商人牌不存在");
    if (card.type === "produce") {
      add(player.spices, card.gain);
      state.log.push(`${player.name} 获得了一批香料`);
    } else if (card.type === "trade") {
      const times = Math.max(1, Math.floor(action.times ?? 1));
      if (!canAfford(player.spices, card.cost, times)) throw new Error("香料不足，无法完成交易");
      pay(player.spices, card.cost, times);
      add(player.spices, card.gain, times);
      state.log.push(`${player.name} 完成了 ${times} 次香料交易`);
    } else {
      const choices = action.upgrades ?? [];
      if (!choices.length || choices.length > card.amount) throw new Error("升级次数不正确");
      for (const tier of choices) {
        if (tier < 0 || tier > 2 || player.spices[tier] < 1) throw new Error("无法升级所选香料");
        player.spices[tier] -= 1;
        player.spices[tier + 1] += 1;
      }
      state.log.push(`${player.name} 升级了 ${choices.length} 个香料`);
    }
    recordAction(state, player, {
      type: "PLAY", cardId: action.cardId,
      times: card.type === "trade" ? Math.max(1, Math.floor(action.times ?? 1)) : undefined,
      upgradeCount: card.type === "upgrade" ? (action.upgrades?.length ?? 0) : undefined,
      upgrades: card.type === "upgrade" ? action.upgrades : undefined,
    });
    player.hand = player.hand.filter((id) => id !== action.cardId);
    player.played.push(action.cardId);
  }

  if (action.type === "ACQUIRE") {
    const index = action.marketIndex;
    if (index < 0 || index >= state.merchantMarket.length) throw new Error("市场位置无效");
    if (total(action.payment) !== index || !canAfford(player.spices, action.payment)) throw new Error("支付的香料数量不正确");
    pay(player.spices, action.payment);
    const paidTiers: Spice[] = [];
    action.payment.forEach((n, tier) => { for (let i = 0; i < n; i++) paidTiers.push(tier as Spice); });
    paidTiers.forEach((tier, slot) => { state.merchantMarket[slot].bonus[tier] += 1; });
    const selected = state.merchantMarket[index];
    player.hand.push(selected.cardId);
    add(player.spices, selected.bonus);
    state.merchantMarket.splice(index, 1);
    const next = state.merchantDeck.shift();
    if (next) state.merchantMarket.push({ cardId: next, bonus: zeroSpices() });
    state.log.push(`${player.name} 招募了一名新商人`);
    recordAction(state, player, { type: "ACQUIRE", cardId: selected.cardId });
  }

  if (action.type === "CLAIM") {
    const index = action.orderIndex;
    const orderId = state.orderMarket[index];
    const order = ORDER_CARDS[orderId];
    if (!order || !canAfford(player.spices, order.cost)) throw new Error("香料不足，无法完成订单");
    pay(player.spices, order.cost);
    player.orders.push(orderId);
    if (index === 0 && state.goldSupply > 0) { player.gold += 1; state.goldSupply -= 1; }
    else if ((index === 1 && state.goldSupply > 0 || index === 0) && state.silverSupply > 0) { player.silver += 1; state.silverSupply -= 1; }
    state.orderMarket.splice(index, 1);
    const next = state.orderDeck.shift();
    if (next) state.orderMarket.push(next);
    else if (!state.orderMarket.length) {
      state.finalRound = true;
      state.log.push("订单牌堆已经取完，本轮结束后结算");
    }
    state.log.push(`${player.name} 完成了价值 ${order.points} 分的订单`);
    recordAction(state, player, { type: "CLAIM", orderId });
    const target = state.players.length <= 3 ? 6 : 5;
    if (player.orders.length >= target) {
      state.finalRound = true;
      state.log.push(`${player.name} 触发了最后一轮`);
    }
  }

  const excess = total(player.spices) - 10;
  if (excess > 0) {
    if (player.isBot) autoDiscard(player, state);
    else {
      state.pendingDiscard = { playerId: player.id, count: excess };
      state.log.push(`${player.name} 需要选择放回 ${excess} 个香料`);
      return state;
    }
  }
  finishTurn(state);
  return state;
}

export function describeMerchant(card: MerchantCard) {
  if (card.type === "produce") return "获取香料";
  if (card.type === "upgrade") return `升级 ${card.amount} 次`;
  return "重复交易";
}

function shuffled<T>(values: T[]) {
  return values.map((value) => ({ value, order: Math.random() }))
    .sort((a, b) => a.order - b.order).map(({ value }) => value);
}

function paymentFor(player: Player, amount: number, state: GameState, random = false): Spices {
  const payment = zeroSpices();
  const available: Spice[] = [];
  player.spices.forEach((count, tier) => {
    for (let index = 0; index < count; index++) available.push(tier as Spice);
  });
  if (random) {
    shuffled(available).slice(0, amount).forEach((tier) => { payment[tier] += 1; });
    return payment;
  }
  const desired = zeroSpices();
  state.orderMarket.forEach((orderId) => {
    const order = ORDER_CARDS[orderId];
    order.cost.forEach((count, tier) => { desired[tier] = Math.max(desired[tier], count); });
  });
  available.sort((a, b) => {
    const surplusA = player.spices[a] - desired[a];
    const surplusB = player.spices[b] - desired[b];
    return surplusB - surplusA || a - b;
  }).slice(0, amount).forEach((tier) => { payment[tier] += 1; });
  return payment;
}

function upgradeActions(cardId: string, amount: number, spices: Spices): GameAction[] {
  const result: GameAction[] = [];
  const visit = (current: Spices, choices: Spice[]) => {
    if (choices.length) result.push({ type: "PLAY", cardId, upgrades: choices });
    if (choices.length >= amount) return;
    for (let tier = 0; tier < 3; tier++) {
      if (current[tier] < 1) continue;
      const next = [...current] as Spices;
      next[tier] -= 1;
      next[tier + 1] += 1;
      visit(next, [...choices, tier as Spice]);
    }
  };
  visit([...spices] as Spices, []);
  return result;
}

export function legalBotActions(state: GameState): GameAction[] {
  const player = state.players[state.currentPlayer];
  if (!player?.isBot || state.status !== "playing") return [];
  const actions: GameAction[] = [];

  state.orderMarket.forEach((orderId, orderIndex) => {
    if (canAfford(player.spices, ORDER_CARDS[orderId].cost)) actions.push({ type: "CLAIM", orderIndex });
  });
  player.hand.forEach((cardId) => {
    const card = MERCHANT_CARDS[cardId];
    if (card.type === "produce") actions.push({ type: "PLAY", cardId });
    if (card.type === "trade") {
      let maximum = 10;
      card.cost.forEach((count, tier) => { if (count) maximum = Math.min(maximum, Math.floor(player.spices[tier] / count)); });
      for (let times = 1; times <= maximum; times++) actions.push({ type: "PLAY", cardId, times });
    }
    if (card.type === "upgrade") actions.push(...upgradeActions(cardId, card.amount, player.spices));
  });
  const spiceTotal = total(player.spices);
  state.merchantMarket.forEach((_, marketIndex) => {
    if (marketIndex <= spiceTotal) actions.push({
      type: "ACQUIRE", marketIndex,
      payment: paymentFor(player, marketIndex, state, player.botDifficulty === "easy"),
    });
  });
  if (player.played.length) actions.push({ type: "REST" });
  return actions;
}

function actionScore(state: GameState, action: GameAction) {
  const actingPlayer = state.players[state.currentPlayer];
  const beforeOrders = actingPlayer.orders.length;
  const simulated = structuredClone(state);
  applyGameAction(simulated, actingPlayer.id, action);
  const player = simulated.players.find((candidate) => candidate.id === actingPlayer.id)!;
  const spiceValue = player.spices.reduce((sum, count, tier) => sum + count * (tier + 1), 0);
  const orderPotential = simulated.orderMarket.reduce((best, orderId) => {
    const order = ORDER_CARDS[orderId];
    const missing = order.cost.reduce((sum, count, tier) => sum + Math.max(0, count - player.spices[tier]), 0);
    return Math.max(best, order.points * 10 - missing * 80);
  }, 0);
  let score = scorePlayer(player) * 90 + spiceValue + orderPotential + player.hand.length * 3;
  if (player.orders.length > beforeOrders) score += 500;
  if (action.type === "ACQUIRE") {
    const card = MERCHANT_CARDS[state.merchantMarket[action.marketIndex].cardId];
    if (card.type === "upgrade") score += 45;
    if (card.type === "trade") score += 18;
    score -= action.marketIndex * 5;
  }
  if (action.type === "REST") score += player.hand.length < 2 ? 35 : 5;
  return score;
}

export function chooseBotAction(state: GameState): GameAction {
  const player = state.players[state.currentPlayer];
  const actions = legalBotActions(state);
  if (!actions.length) throw new Error("人机没有可执行的行动");
  if (player.botDifficulty === "easy") {
    const claims = actions.filter((action) => action.type === "CLAIM");
    const pool = claims.length && Math.random() < .75 ? claims : actions;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const ranked = actions.map((action) => ({ action, score: actionScore(state, action) }))
    .sort((a, b) => b.score - a.score);
  if (player.botDifficulty === "normal") {
    const shortlist = ranked.slice(0, Math.min(3, ranked.length));
    return shortlist[Math.floor(Math.random() * shortlist.length)].action;
  }
  if (ranked.length > 1 && Math.random() < .12) {
    const alternatives = ranked.slice(1, Math.min(6, ranked.length));
    return alternatives[Math.floor(Math.random() * alternatives.length)].action;
  }
  return ranked[0].action;
}

export function runBotTurns(state: GameState) {
  let turns = 0;
  while (state.status === "playing" && state.players[state.currentPlayer]?.isBot) {
    if (turns++ >= 100) throw new Error("人机回合超过安全上限");
    const bot = state.players[state.currentPlayer];
    const action = chooseBotAction(state);
    applyGameAction(state, bot.id, action);
  }
  return state;
}
