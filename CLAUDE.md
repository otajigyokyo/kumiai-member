# CLAUDE.md

このリポジトリで作業する Claude Code 向けのプロジェクトガイドです。

## プロジェクト概要

大田市場花き事業協同組合の **組合員連絡先登録フォーム**。
組合員が買参番号・店名・代表者氏名・電話番号・メールアドレスを登録すると、Google スプレッドシート「組合員連絡先」に **買参番号をキーとした Upsert** で書き込まれる。

- 公開URL: `https://member.jigyokyo.com/`(GitHub Pages + 独自ドメイン)
- バックエンド: Google Apps Script Web App + Google スプレッドシート
- 履歴は残さず、同じ買参番号の登録は **上書き**(タイムスタンプも上書き)

## ファイル構成

| パス | 役割 |
|---|---|
| `index.html` | フォーム本体。買参番号/店名/氏名/電話/メールの5項目+送信ボタン+完了画面 |
| `style.css` | スタイル(緑基調、レスポンシブ、`@media (max-width: 600px)` でスマホ最適化) |
| `script.js` | クライアント側のバリデーションと `fetch` 送信。冒頭の `GAS_URL` がデプロイ先 |
| `gas/Code.gs` | GAS Web App 本体。`doPost` で Upsert、`doGet` で稼働確認 |
| `gas/appsscript.json` | GAS マニフェスト(`ANYONE_ANONYMOUS` / `USER_DEPLOYING`) |
| `README.md` | セットアップ手順(初期構築用) |
| `.gitignore` | `gas/.clasp.json` 等を除外 |
| `001.txt` | **初回構築時の作業指示書**(現在は履歴的価値のみ。Section「001.txt について」参照) |

## データフロー

```
ブラウザ (https://member.jigyokyo.com/ 経由 GitHub Pages)
   │
   │  fetch POST  Content-Type: text/plain  body=JSON文字列
   │  ※ text/plain で送ることで CORS preflight (OPTIONS) を回避
   ▼
GAS Web App (script.google.com/macros/s/.../exec)
   │  doPost(e) → JSON.parse(e.postData.contents)
   │  必須項目チェック → 「組合員連絡先」シートを取得/新規作成
   │  買参番号で既存行を線形探索 → 一致すれば setValues で上書き、なければ appendRow
   ▼
Google スプレッドシート「組合員連絡先」
   列: タイムスタンプ / 買参番号 / 店名 / 代表者氏名 / 電話番号 / メールアドレス
```

## HEADERS 定義(契約)

`gas/Code.gs` の最上部:

```js
const HEADERS = ['タイムスタンプ', '買参番号', '店名', '代表者氏名', '電話番号', 'メールアドレス'];
```

買参番号は **2列目**(`getRange(2, 2, ...)` で B 列を読んでいる)。列順を変えると Upsert ロジックも修正が必要。

## デプロイ手順

### フロントエンド (GitHub Pages)

```bash
git add -A && git commit -m "..."
git push origin master
```

`master` への push で GitHub Pages が自動反映。独自ドメイン `member.jigyokyo.com` はリポジトリ設定または `CNAME` ファイルで割り当てる。

> **注意**: 現状リポジトリ直下に `CNAME` ファイルは存在しない。GitHub の Pages 設定画面側で `member.jigyokyo.com` を登録している前提。再デプロイで設定が外れた場合は `CNAME` ファイル(`member.jigyokyo.com` の1行)をコミットすると確実。

### バックエンド (GAS) — **重要: 既存デプロイの「バージョン更新」**

```bash
cd gas
clasp push   # コードを GAS プロジェクトに反映
```

その後ブラウザで Apps Script を開き:

1. 右上「**デプロイ**」→「**デプロイを管理**」
2. 既存のデプロイ行の **鉛筆マーク**(編集)をクリック
3. バージョンを **「新しいバージョン」** に切り替え → 「デプロイ」

❌ **「新しいデプロイ」を選ばない**。新規デプロイにすると Web App の URL が変わり、`script.js` の `GAS_URL` をすべて書き換える必要が出る。

## 既知の制約

- **CORS**: GAS Web App は `OPTIONS` プリフライトに応答できない。そのため `Content-Type: text/plain` で送信(application/json にすると preflight が走り失敗する)。
- **公開設定**: `appsscript.json` で `ANYONE_ANONYMOUS` / `USER_DEPLOYING`。誰でも POST 可能(認証なし)。スパム/連投対策は未実装。
- **Upsert の挙動**: 同じ買参番号で再送すると **タイムスタンプ含めて全列上書き**。修正前の値や登録履歴は残らない。
- **排他制御なし**: `LockService` 未導入。同時に複数件の書き込みが発生するとレースコンディションで取りこぼす可能性あり。実運用での同時書き込み頻度が低い想定。
- **線形探索**: 買参番号は 2 列目を頭から走査。組合員数が増えても問題にはなりにくいが、数千行以上を想定するなら見直し。
- **バリデーション**: クライアント側のみ。GAS 側は必須チェックのみで、メール形式・電話番号形式は未検証。

## ローカル動作確認

### 静的サーバを立てる

```bash
# プロジェクトルートで
npx serve .
# または
python -m http.server 8000
```

ブラウザで `http://localhost:3000`(serve)/ `http://localhost:8000`(python) を開く。

### 本番 GAS を叩かずに動作確認する

`script.js` の冒頭にある `USE_MOCK` フラグを `true` に切り替えるだけでモック動作になる。
モック時は `fetch` を呼ばず、500ms の遅延後に `{ status: 'ok', action: 'created' }` を返す。

```js
// script.js
const USE_MOCK = true;   // ローカル確認時のみ true
```

> ⚠️ **commit 前に必ず `USE_MOCK = false` に戻すこと。**
> `true` のまま push すると本番フォームが GAS に書き込まなくなり、登録データがどこにも保存されない事故になる。

## 001.txt について

初回構築時に与えられた作業指示書(全ファイル内容と `git init` → `gh repo create` → `clasp create` の手順を含む)。
現在のファイルとほぼ同内容のため **機密情報は含まれていない** が、開発履歴として保管するなら `docs/` 等への移動も検討。
`.gitignore` 追加は不要(ただし不要なら削除しても支障なし)。
