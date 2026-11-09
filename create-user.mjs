/**
 * ログインできるユーザーを D1 に登録します（同じユーザー名ならパスワードを変更）。
 *
 *   ローカル： npm run user:add -- <ユーザー名> <パスワード>
 *   本番　　： npm run user:add -- <ユーザー名> <パスワード> --remote
 *
 * パスワードはここでハッシュ化してから送るので、D1 には元のパスワードは残りません。
 */
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const DB_NAME = "my-auth-db";
const ITERATIONS = 100000; // src/auth.js の PBKDF2_ITERATIONS と同じ

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const [username, password] = args.filter((a) => a !== "--remote");

if (!username || !password) {
  console.error("使い方： npm run user:add -- <ユーザー名> <パスワード> [--remote]");
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
  `ON CONFLICT (username) DO UPDATE SET password_hash = excluded.password_hash;\n`;

const dir = mkdtempSync(join(tmpdir(), "user-"));
const file = join(dir, "user.sql");
writeFileSync(file, sql);
try {
  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(cmd, ["wrangler", "d1", "execute", DB_NAME, `--file=${file}`, remote ? "--remote" : "--local"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  console.log(`\n「${username}」を${remote ? "本番" : "ローカル"}のデータベースに登録しました。`);
} finally {
  unlinkSync(file);
}
