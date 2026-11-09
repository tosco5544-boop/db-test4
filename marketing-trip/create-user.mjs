/**
 * ログインできるユーザーを登録するための SQL を作ります（同じユーザー名ならパスワードを変更）。
 * パスワードはここでハッシュ化するので、D1 に元のパスワードは残りません。
 *
 * 使い方（パソコンに Node.js があれば wrangler がなくても使えます）
 *   node create-user.mjs <ユーザー名> <パスワード>
 *     → 画面に出た SQL を、D1 の「Console」に貼り付けて実行
 *
 *   node create-user.mjs <ユーザー名> <パスワード> --remote
 *     → wrangler を使って本番の D1 に直接登録（npx wrangler login 済みの場合）
 */
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const DB_NAME = "my-auth-db"; // wrangler.toml の database_name と同じ
const ITERATIONS = 100000;    // auth.js の PBKDF2_ITERATIONS と同じ

const args = process.argv.slice(2);
const mode = args.includes("--remote") ? "--remote" : args.includes("--local") ? "--local" : null;
const [username, password] = args.filter((a) => !a.startsWith("--"));

if (!username || !password) {
  console.error("使い方： node create-user.mjs <ユーザー名> <パスワード> [--remote]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("パスワードは8文字以上にしてください。");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const stored = `pbkdf2$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const sql =
  `INSERT INTO users (id, username, password_hash) VALUES (${q(randomUUID())}, ${q(username)}, ${q(stored)}) ` +
  `ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash;`;

if (!mode) {
  console.log("\n▼ 次の1行を D1 の「Console」に貼り付けて「Execute」を押してください\n");
  console.log(sql + "\n");
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "user-"));
const file = join(dir, "user.sql");
writeFileSync(file, sql + "\n");
try {
  const win = process.platform === "win32";
  execFileSync(win ? "npx.cmd" : "npx", ["wrangler", "d1", "execute", DB_NAME, `--file=${file}`, mode], { stdio: "inherit", shell: win });
  console.log(`\n「${username}」を${mode === "--remote" ? "本番" : "ローカル"}のデータベースに登録しました。`);
} finally {
  unlinkSync(file);
}
