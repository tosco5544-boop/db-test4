/**
 * 全国マーケティング旅 — Cloudflare Workers（Hono）
 *
 *  GET  /api/map     … 地図の色（だれでも見られる。トップ画面が使う）
 *  POST /api/login   … ログイン { username, password } → ログイン用クッキーを発行
 *  POST /api/logout  … ログアウト
 *  GET  /api/me      … ログイン中のユーザー
 *  POST /api/state   … 県の色を切り替える { prefecture_id, status }（ログインが必要）
 *
 *  画面
 *  GET  /        … トップ画面（index.html）
 *  GET  /login   … ログイン画面（login.html）
 *  GET  /admin   … 編集画面（admin.html）※ログインしていなければ /login へ
 *
 * 画面ファイルはすべてこの Worker に組み込んで返すので、フォルダは不要です。
 *
 * 必要な設定
 *  - wrangler.toml の [[d1_databases]]（binding = "DB"）
 *  - シークレット JWT_SECRET（ダッシュボードの「設定」→「変数とシークレット」）
 */
import { Hono } from "hono";
import {
  verifyPassword, DUMMY_HASH, signToken, verifyToken,
  readCookie, sessionCookie, clearCookie, SESSION_COOKIE, SESSION_DAYS,
} from "./auth.js";

// 画面ファイル（.html は文字列として組み込まれます）
import indexPage from "./index.html";
import loginPage from "./login.html";
import adminPage from "./admin.html";
import stylePart from "./style.html";
import mapScriptPart from "./map-script.html";

const app = new Hono();

/* ---------- 共通 ---------- */
function secretOf(c) {
  const s = c.env.JWT_SECRET;
  if (!s || s.length < 16) throw new HttpError(500, "JWT_SECRET が設定されていません（16文字以上）");
  return s;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "サーバーでエラーが起きました" }, 500);
});

// ログインしているユーザーを取り出す（していなければ 401）
async function requireUser(c) {
  const token = readCookie(c.req.header("Cookie"), SESSION_COOKIE);
  const payload = token ? await verifyToken(token, secretOf(c)) : null;
  if (!payload) throw new HttpError(401, "ログインしてください");
  const user = await c.env.DB.prepare("SELECT id, username FROM users WHERE id = ?").bind(payload.sub).first();
  if (!user) throw new HttpError(401, "ログインしてください");
  return user;
}

// 別のサイトからの書き込みを防ぐ（ブラウザが付ける Origin を確認）
function checkOrigin(c) {
  const origin = c.req.header("Origin");
  if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, "このサイト以外からは操作できません");
}

/* ---------- 地図 ---------- */
async function getMap(env) {
  const [statuses, states] = await env.DB.batch([
    env.DB.prepare("SELECT code, label, color, sort_order, counts_as_visited FROM statuses ORDER BY sort_order"),
    env.DB.prepare(
      "SELECT ps.prefecture_id AS id, s.code AS status, ps.updated_at FROM prefecture_states ps JOIN statuses s ON s.id = ps.status_id"
    ),
  ]);
  const map = {};
  let updated = null;
  for (const r of states.results) {
    map[r.id] = r.status;
    if (!updated || r.updated_at > updated) updated = r.updated_at;
  }
  return {
    updated, // UTC（例：2026-11-09 05:12:00）
    statuses: statuses.results.map((s) => ({ ...s, counts_as_visited: !!s.counts_as_visited })),
    states: map,
  };
}

app.get("/api/map", async (c) => {
  return c.json(await getMap(c.env), 200, { "Cache-Control": "no-store" });
});

/* ---------- ログイン ---------- */
app.post("/api/login", async (c) => {
  checkOrigin(c);
  let body;
  try { body = await c.req.json(); } catch { throw new HttpError(400, "送られてきた内容を読み取れませんでした"); }
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) throw new HttpError(400, "ユーザー名とパスワードを入力してください");

  // 1. D1 からユーザーを検索
  const user = await c.env.DB.prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .bind(username).first();

  // 2. パスワードの検証（ユーザーがいないときもダミーで同じ処理をして、時間差で見抜かれないようにする）
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, "ユーザー名かパスワードが違います");

  // 3. 成功：署名つきトークンを HttpOnly クッキーに入れる（JavaScript からは読めないので盗まれにくい）
  const now = Math.floor(Date.now() / 1000);
  const token = await signToken({ sub: user.id, name: user.username, iat: now, exp: now + SESSION_DAYS * 86400 }, secretOf(c));
  return c.json({ success: true, username: user.username }, 200, { "Set-Cookie": sessionCookie(token, c.req.url) });
});

app.post("/api/logout", (c) => {
  return c.json({ success: true }, 200, { "Set-Cookie": clearCookie(c.req.url) });
});

app.get("/api/me", async (c) => {
  const user = await requireUser(c);
  return c.json({ id: user.id, username: user.username }, 200, { "Cache-Control": "no-store" });
});

/* ---------- 色の切り替え ---------- */
app.post("/api/state", async (c) => {
  checkOrigin(c);
  const user = await requireUser(c);
  let body;
  try { body = await c.req.json(); } catch { throw new HttpError(400, "送られてきた内容を読み取れませんでした"); }

  const pid = Number(body.prefecture_id);
  if (!Number.isInteger(pid) || pid < 1 || pid > 47) throw new HttpError(400, "都道府県コードは1〜47で指定してください");
  const status = await c.env.DB.prepare("SELECT id FROM statuses WHERE code = ?").bind(String(body.status || "")).first();
  if (!status) throw new HttpError(400, "その色の種類は登録されていません");

  const current = await c.env.DB.prepare("SELECT status_id FROM prefecture_states WHERE prefecture_id = ?").bind(pid).first();
  if (!current || current.status_id !== status.id) {
    // 履歴の記録と変更をまとめて実行（どちらかが失敗したら両方取り消し）
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO state_history (prefecture_id, from_status_id, to_status_id, changed_by) VALUES (?1, ?2, ?3, ?4)"
      ).bind(pid, current ? current.status_id : null, status.id, user.id),
      c.env.DB.prepare(
        "INSERT INTO prefecture_states (prefecture_id, status_id, updated_at, updated_by) VALUES (?1, ?2, datetime('now'), ?3) " +
        "ON CONFLICT (prefecture_id) DO UPDATE SET status_id = excluded.status_id, updated_at = excluded.updated_at, updated_by = excluded.updated_by"
      ).bind(pid, status.id, user.id),
    ]);
  }
  return c.json(await getMap(c.env));
});

/* ---------- 画面 ---------- */
function page(html) {
  return html.replace("<!--STYLE-->", () => stylePart).replace("<!--MAP_SCRIPT-->", () => mapScriptPart);
}
function htmlResponse(c, html) {
  return c.body(page(html), 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
}

async function isLoggedIn(c) {
  try { await requireUser(c); return true; } catch { return false; }
}

app.get("/", (c) => htmlResponse(c, indexPage));
app.get("/index.html", (c) => c.redirect("/", 301));
app.get("/login", async (c) => (await isLoggedIn(c)) ? c.redirect("/admin", 302) : htmlResponse(c, loginPage));
app.get("/admin", async (c) => (await isLoggedIn(c)) ? htmlResponse(c, adminPage) : c.redirect("/login", 302));
app.get("/login.html", (c) => c.redirect("/login", 301));
app.get("/admin.html", (c) => c.redirect("/admin", 301));

app.all("/api/*", (c) => c.json({ error: "見つかりません" }, 404));
app.all("*", (c) => c.text("ページが見つかりません", 404));

export default app;
