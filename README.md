# 全国マーケティング旅（Cloudflare Workers ＋ D1 ＋ Hono）

都道府県の地図で「行った（赤）」「次に行く（青）」を見せるサイトです。
ログインした人だけが、編集画面で県の色を切り替えられます。

## フォルダの中身

```
marketing-trip-app/
├── wrangler.toml          (Workers の設定：D1 の接続など)
├── package.json           (使うツールとコマンド)
├── schema.sql             (D1 のテーブルと初期データ)
├── .dev.vars.example      (ローカル用の秘密の文字列の見本)
├── src/
│   ├── index.js           (Hono：ログイン・地図の色のAPI)
│   └── auth.js            (パスワードのハッシュ化・ログイン用トークン)
├── scripts/
│   └── create-user.mjs    (ログインできるユーザーを登録する)
└── public/                (画面)
    ├── index.html         (トップ画面　 → /)
    ├── login.html         (ログイン画面 → /login)
    ├── admin.html         (編集画面　　 → /admin)
    ├── style.css
    └── js/                (地図の描画・各画面の動き)
```

## API

| URL | 内容 | ログイン |
|---|---|---|
| `GET /api/map` | 地図の色 | 不要 |
| `POST /api/login` | ログイン（`{ username, password }`） | — |
| `POST /api/logout` | ログアウト | — |
| `GET /api/me` | ログイン中のユーザー | 必要 |
| `POST /api/state` | 県の色を切り替え（`{ prefecture_id, status }`） | 必要 |

## はじめての準備（ローカル）

Node.js（20以上）が入ったパソコンで、このフォルダを開いて順に実行します。

```bash
# 1. ツールを入れる
npm install

# 2. Cloudflare にログイン（ブラウザが開きます）
npx wrangler login

# 3. D1 データベースを作成
npx wrangler d1 create my-auth-db
```

画面に表示される `database_id` を、`wrangler.toml` の `database_id = "xxxx-xxxx-xxxx-xxxx"` に入れます。
`name` も Cloudflare 上の Worker の名前に合わせてください（今は `db-test3`）。

```bash
# 4. テーブルを作る（ローカル用）
npm run db:init

# 5. ローカル用の秘密の文字列を用意
cp .dev.vars.example .dev.vars
#    .dev.vars を開いて JWT_SECRET を長いランダムな文字列にする
#    （作り方の例： node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"）

# 6. ログインできるユーザーを登録（ローカル用）
npm run user:add -- yamada 好きなパスワード

# 7. 起動
npm run dev
```

ブラウザで次を開いて確認します。

- トップ画面：http://localhost:8787/
- ログイン画面：http://localhost:8787/login
- 編集画面：http://localhost:8787/admin

## 本番に出す

```bash
# テーブルを本番の D1 に作る
npm run db:init:remote

# 本番用の秘密の文字列（ローカルとは別の値にする）
npx wrangler secret put JWT_SECRET

# 本番にユーザーを登録
npm run user:add -- yamada 好きなパスワード --remote

# デプロイ
npm run deploy
```

GitHub から自動でデプロイしている場合は、`npm run deploy` の代わりに push します。
このフォルダの中身がリポジトリの一番上に来るように置くか、Cloudflare の Worker の
「設定」→「ビルド」でルートディレクトリをこのフォルダ名にしてください。
`JWT_SECRET` はデプロイしても消えないので、最初に1回設定すれば大丈夫です。

## よくある操作

```bash
# パスワードを変える（同じユーザー名でもう一度登録）
npm run user:add -- yamada 新しいパスワード --remote

# 「行った」の色そのものを変える
npx wrangler d1 execute my-auth-db --remote --command "UPDATE statuses SET color = '#e60033' WHERE code = 'visited'"

# 色を変えた記録を見る
npx wrangler d1 execute my-auth-db --remote --command "SELECT * FROM state_history ORDER BY changed_at DESC LIMIT 20"
```

## しくみ（安全のための工夫）

- パスワードは PBKDF2 でハッシュ化して保存し、元のパスワードは D1 に残りません
- ログイン状態は署名つきトークンを **HttpOnly クッキー**に入れて管理します。
  JavaScript から読めないため、`localStorage` に保存するより盗まれにくくなります
- トークンの有効期限は7日です。ログアウトでクッキーを消します
- ユーザー名とパスワードのどちらが違っても、同じメッセージを返します
- 色の切り替えは、別のサイトからの送信を受け付けません
- 以前の Cloudflare Access の設定（`ACCESS_TEAM_DOMAIN` など）は使いません
