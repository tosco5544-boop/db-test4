# 全国マーケティング旅

都道府県の地図で「行った（赤）」「次に行く（青）」を見せるサイトです。
ログインした人だけが、編集画面で県の色を切り替えられます。
Cloudflare Workers ＋ D1 ＋ Hono で動きます。

## ファイル（フォルダは使いません。全部リポジトリの一番上に置きます）

| ファイル | 役割 |
|---|---|
| `wrangler.toml` | Workers の設定（Worker名・D1の接続） |
| `package.json` | 使うツール（Hono・wrangler） |
| `worker.js` | 本体：API と画面を返す（Hono） |
| `auth.js` | パスワードのハッシュ化・ログイン用トークン |
| `index.html` | トップ画面（`/`） |
| `login.html` | ログイン画面（`/login`） |
| `admin.html` | 編集画面（`/admin`） |
| `style.html` | 全画面共通のデザイン |
| `map-script.html` | 地図を描く共通プログラム |
| `schema.sql` | D1 のテーブルと初期データ |
| `create-user.mjs` | ログインユーザーを登録する SQL を作る |

## データベース設計（D1：my-auth-db）

| テーブル | 役割 | 主な項目 |
|---|---|---|
| `users` | ログインできる人 | id, username, password_hash |
| `prefectures` | 都道府県（47件固定） | id（1〜47）, name, region |
| `statuses` | 色の種類 | code（visited / next / none）, label, color, counts_as_visited |
| `prefecture_states` | 各県の今の色（1県1行） | prefecture_id, status_id, updated_at, updated_by → users |
| `state_history` | 色を変えた記録 | prefecture_id, from_status_id, to_status_id, changed_at, changed_by → users |

色そのものは `statuses.color` にだけ持っています。ここを変えると全県に反映されます。

## 手順（最初から）

### 1. D1 データベースを作る
1. Cloudflare の「Storage & Databases」→「D1 SQL Database」→「Create Database」
2. 名前を `my-auth-db` にして作成
3. 作ったデータベースの「Console」に `schema.sql` の中身を全部貼り付けて「Execute」
4. 画面に出ている **データベースID**（長い英数字）を控える

確認：Console で `SELECT COUNT(*) FROM prefectures;` を実行して `47` と出れば OK。

### 2. wrangler.toml を書き換える
```toml
name = "db-test4"                 # Worker の名前
database_id = "（1-4 で控えたID）"
```

### 3. GitHub にアップロード
リポジトリの中身を一度すべて削除してから、この11ファイルを一番上にアップロードします。
Cloudflare の Worker →「設定」→「ビルド」のルートディレクトリは `/` のままで大丈夫です。

### 4. 秘密の文字列（JWT_SECRET）を設定
Worker →「設定」→「変数とシークレット」→「追加」
- 種類：シークレット
- 名前：`JWT_SECRET`
- 値：32文字以上のランダムな英数字（他人に教えない）

### 5. ログインできるユーザーを登録
パソコン（Node.js が入っているもの）で、このフォルダを開いて実行します。
```bash
node create-user.mjs yamada 好きなパスワード
```
画面に出た `INSERT INTO users …` の1行を、D1 の「Console」に貼り付けて「Execute」。
（パスワードは8文字以上。同じユーザー名でもう一度行うとパスワードの変更になります）

### 6. 確認
- `https://（サイトのURL）/api/map` … `{"updated":…` と出れば D1 につながっています
- `https://（サイトのURL）/` … トップ画面
- `https://（サイトのURL）/admin` … ログイン画面が出る → 5 のユーザーでログイン → 編集画面

## パソコンで動かす場合（任意）
```bash
npm install
npx wrangler login
npx wrangler d1 execute my-auth-db --file=./schema.sql --local
echo "JWT_SECRET=ローカル用の長いランダムな文字列" > .dev.vars
node create-user.mjs yamada 好きなパスワード --local
npm run dev        # http://localhost:8787
```

## よくある操作（D1 の Console で実行）
```sql
-- 「行った」の色を変える
UPDATE statuses SET color = '#e60033' WHERE code = 'visited';

-- 色を変えた記録を見る
SELECT h.changed_at, p.name, t.label, u.username
FROM state_history h
JOIN prefectures p ON p.id = h.prefecture_id
JOIN statuses t ON t.id = h.to_status_id
LEFT JOIN users u ON u.id = h.changed_by
ORDER BY h.changed_at DESC;
```

## 安全のための工夫
- パスワードは PBKDF2 でハッシュ化して保存（元のパスワードは残らない）
- ログイン状態は署名つきトークンを HttpOnly クッキーで管理（JavaScript から読めない）
- ログインの有効期限は7日。ユーザー名とパスワードのどちらが違っても同じメッセージ
- 編集画面はサーバー側でログインを確認し、未ログインならログイン画面へ移動
- 別のサイトからの書き込みは受け付けない
