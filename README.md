# 香料商路 · Spice Road

在线香料贸易桌游：招募商人、转换香料、抢先完成高分订单。**浏览器联机，2–5 人**，支持人机、真人录音语音、挂机代管、中途上车，以及**离线同屏**与**热点断网联机**。

🌐 在线试玩：https://xiangliaoshiji.pythonanywhere.com/

---

## ✨ 功能特性

- **联机对战**：房间码加入，2–5 人，约 20 分钟一局
- **离线游戏（飞机模式）**：无需网络，可对战人机或 2–5 人同屏轮流（含交接屏防偷看）
- **热点联机（WebRTC）**：无外网多设备联机，扫码 / 邀请码配对，房主浏览器承载对局
- **账号系统**：注册 / 登录 / 游客模式，支持自定义头像
- **人机对手**：简单 / 普通 / 困难 三档 AI（本地同屏带思考延迟）
- **语音快捷聊**：真人录音语音包（无录音时回退浏览器 TTS）
- **挂机代管**：轮到某玩家 40 秒无操作，AI 自动代打；玩家回来自动恢复
- **中途加入**：游戏开始后，新玩家可加入并直接接替 AI 席位
- **三国杀式环桌布局**：自己底部、对手环绕棋盘，实时分数（加分绿色 +N 跳动）
- **多主题**：羊皮纸 / 夜市 / 青瓷 三种卡面风格

## 🗓️ 更新日志

### 2026-08-21
- 📡 **热点房主模式**：WebRTC 点对点，无外网多设备联机；扫码 / 邀请码配对，房主浏览器跑权威引擎
- 📷 **页面内扫码**：玩家扫房主邀请码、房主扫玩家应答码（Chrome/Edge 直接调摄像头）
- 🀄 **三国杀式环桌布局**：自己底部、对手环绕棋盘，方便观察对手局势
- 📊 **对手实时分数**：24px 大分数 + 加分时绿色 +N 跳动
- 🔊 对手香料/金币更清晰、语音气泡与语音按钮高对比优化
- 🖥️ **全屏适配**：高度=视口、无页面滚动条，棋盘/手牌区自适应
- 🐛 修复同屏交接在人机存在时消失的问题；人机回合增加约 1 秒思考延迟
- 🐛 修复落地页「加入热点房」文字不可见（浅色卡片对比度）

### 2026-08-20
- ✈️ **离线游戏（飞机模式）** + PWA 离线缓存（Service Worker + manifest）
- 🎤 真人录音语音包（3 句替换浏览器 TTS）

## 🧱 技术栈

| 部分 | 技术 |
| --- | --- |
| 前端 | React 19 + Next.js（原版）/ Vite 静态构建（部署版）+ Tailwind CSS |
| 游戏引擎 | TypeScript（`lib/game.ts`，纯逻辑，前后端共用） |
| 原版后端 | Cloudflare Workers + D1（`app/api`、`db/`、`drizzle/`） |
| 部署版后端 | PythonAnywhere + Flask + SQLite（`pythonanywhere/`） |

## 📁 目录结构

```
app/                    前端页面（游戏主界面 game.tsx）
lib/                    游戏引擎与账号逻辑（TS 源码）
pythonanywhere/         PythonAnywhere 部署版（Flask + SQLite + 静态前端 + 测试）
  ├─ app.py             Flask 应用（API + 静态托管）
  ├─ game.py            游戏引擎 Python 移植版
  ├─ accounts.py        账号 / 会话
  └─ frontend/          Vite 静态前端构建源
db/  drizzle/           D1 数据库 schema 与迁移
```

## 🚀 本地运行

```bash
# 部署版（PythonAnywhere 同款）
cd pythonanywhere
pip install flask
python app.py            # http://127.0.0.1:5000

# 重建静态前端（改动前端后需要）
npx vite build --config pythonanywhere/frontend/vite.config.ts
```

## ✅ 测试

```bash
python pythonanywhere/test_api.py      # API 契约（46 项）
python pythonanywhere/test_engine.py   # 游戏引擎（45 项，含完整对局）
```

## 🤝 如何参与共创

- 发现 Bug / 有新想法 → 提 [Issue](../../issues)
- 直接改代码 → 提 [Pull Request](../../pulls)
- 想贡献的方向：
  - **卡牌库**：`lib/game.ts` 的 `MERCHANT_CARDS` / `ORDER_CARDS`
  - **语音包**：把录音放到 `pythonanywhere/frontend/public/audio/`，并在 `app/game.tsx` 的 `CHAT_AUDIO` 加一行映射
  - **新主题 / 界面**：`app/globals.css` 与 `app/game.tsx` 的 `ThemeSwitcher`
  - **人机 AI**：`lib/game.ts` 的 `chooseBotAction` / `actionScore`
  - **规则平衡**：开局香料、订单分值、金币/银币机制

## 📦 部署（PythonAnywhere）

详见 [`pythonanywhere/README.md`](pythonanywhere/README.md)：上传 → 建 Web 应用（Python 3.12）→ 配置 WSGI → 完成。

> 原仓库基于 [vinext-starter](https://github.com/cloudflare/vinext)，部署版为 Flask + SQLite 重写，API 契约与原版一致。
