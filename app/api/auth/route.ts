import {
  createAccount, createAccountSession, deleteAccountSession, expiredSessionCookie, getAccountFromRequest,
  normalizeUsername, sessionCookie, updateAccountAvatar, validateRegistration, verifyAccount,
} from "../../../lib/accounts";

export async function GET(request: Request) {
  try {
    return Response.json({ user: await getAccountFromRequest(request) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取账号失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: "register" | "login" | "logout" | "avatar"; username?: string; password?: string; nickname?: string; avatar?: string };
    if (body.action === "register") {
      const username = normalizeUsername(body.username);
      const password = String(body.password ?? "");
      const nickname = String(body.nickname ?? "").trim().slice(0, 12);
      validateRegistration(username, password, nickname);
      const user = await createAccount(username, password, nickname);
      const token = await createAccountSession(user.id);
      return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(token, request) } });
    }
    if (body.action === "login") {
      const user = await verifyAccount(normalizeUsername(body.username), String(body.password ?? ""));
      const token = await createAccountSession(user.id);
      return Response.json({ user }, { headers: { "Set-Cookie": sessionCookie(token, request) } });
    }
    if (body.action === "logout") {
      await deleteAccountSession(request);
      return Response.json({ user: null }, { headers: { "Set-Cookie": expiredSessionCookie(request) } });
    }
    if (body.action === "avatar") {
      const user = await getAccountFromRequest(request);
      if (!user) throw new Error("请先登录账号");
      const avatar = await updateAccountAvatar(user.id, body.avatar);
      return Response.json({ user: { ...user, avatar } });
    }
    throw new Error("未知账号操作");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "账号操作失败" }, { status: 400 });
  }
}
