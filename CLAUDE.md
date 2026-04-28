# CLAUDE.md

このリポジトリで作業する Claude Code 向けのプロジェクトガイドです。

## プロジェクト概要

大田市場花き事業協同組合の **組合員連絡先登録フォーム**。
組合員が買参番号・店名・代表者氏名・電話番号・メールアドレスを登録すると、指定された Google スプレッドシートの「組合員連絡先」タブに **買参番号をキーとした Upsert** で書き込まれる。

- 公開URL: `https://member.jigyokyo.com/`(GitHub Pages + 独自ドメイン)
- バックエンド: Google Apps Script **スタンドアロン** Web App
- 書き込み先: スプレッドシートID指定で `openById()` で開く外部スプレッドシート(後述)
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
GAS スタンドアロン Web App (script.google.com/macros/s/.../exec)
   │  doPost(e) → JSON.parse(e.postData.contents)
   │  必須項目チェック → LockService.waitLock(10000)
   │  SpreadsheetApp.openById(SPREADSHEET_ID) で対象シートを開く
   │  「組合員連絡先」タブを取得/新規作成
   │  買参番号で既存行を線形探索 → 一致すれば setValues で上書き、なければ appendRow
   ▼
Google スプレッドシート (ID: 14u979d9...AyEOQ)
   ├─ 「組合員連絡先」タブ        ← このGASがUpsertで操作
   │   列: タイムスタンプ / 買参番号 / 店名 / 代表者氏名 / 電話番号 / メールアドレス
   └─ 「フォームの回答」タブ等    ← 別のGoogleフォームが連携。本GASは触らない
```

## 書き込み先スプレッドシート

`gas/Code.gs` 冒頭の定数で指定:

```js
const SPREADSHEET_ID = '14u979d9GilWEBkWx8vik2nzGQiNedK5tALuZkkAyEOQ';
const SHEET_NAME = '組合員連絡先';
```

- **このGASはスタンドアロン**(スプレッドシートに bound されていない)。`getActiveSpreadsheet()` を使うと `null` を返すので、必ず `openById()` で明示的に開く。
- 同じスプレッドシートには **別の Google フォームが連携した「フォームの回答」タブ等が存在する**。本GASは **`SHEET_NAME` で指定した「組合員連絡先」タブのみ** を読み書きするので、フォーム回答タブには影響しない。
- 「組合員連絡先」タブは初回POST時に `insertSheet` で自動作成される(ヘッダー行も自動挿入)。
- **書き込み先のスプレッドシートを変更したい場合** は `SPREADSHEET_ID` 定数を新しいIDに書き換えて `clasp push -f` → デプロイ更新の手順を踏む。

### 権限要件 (重要)

`appsscript.json` の `executeAs: USER_DEPLOYING` により、Web App は **デプロイした Google アカウント** の権限で実行される。

- 上記 `SPREADSHEET_ID` のスプレッドシートに対して、**デプロイ者(組合アカウント)が「編集者」権限以上を保有している必要がある**。
- 編集権限がない場合、`openById()` で `Exception: 権限がありません` 系のエラーが発生し、フォーム送信が常に「通信エラー」になる。
- 別アカウントで再デプロイした場合は、そのアカウントにも編集権限を付与すること。
- 初回デプロイ時または `openById` を新規追加した直後は、GAS の認可画面で **追加スコープ(外部スプレッドシートへのアクセス)** を承認するダイアログが出る場合がある。承認しないと実行されない。

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
clasp push -f   # コードを GAS プロジェクトに反映 (-f は対話確認スキップ)
```

> **`-f` を付ける理由**: clasp v3.x はマニフェスト変更がある場合などに対話確認を求める仕様。非対話実行(CI や Claude Code 経由)で `-f` 無しだと `Skipping push.` と表示されて反映されない。手元から実行する場合も `-f` を付けておくと挙動が安定する。

その後ブラウザで Apps Script を開き:

1. 右上「**デプロイ**」→「**デプロイを管理**」
2. 既存のデプロイ行の **鉛筆マーク**(編集)をクリック
3. バージョンを **「新しいバージョン」** に切り替え → 「デプロイ」

❌ **「新しいデプロイ」を選ばない**。新規デプロイにすると Web App の URL が変わり、`script.js` の `GAS_URL` をすべて書き換える必要が出る。

## 既知の制約

- **CORS**: GAS Web App は `OPTIONS` プリフライトに応答できない。そのため `Content-Type: text/plain` で送信(application/json にすると preflight が走り失敗する)。
- **公開設定**: `appsscript.json` で `ANYONE_ANONYMOUS` / `USER_DEPLOYING`。誰でも POST 可能(認証なし)。スパム/連投対策は未実装。
- **Upsert の挙動**: 同じ買参番号で再送すると **タイムスタンプ含めて全列上書き**。修正前の値や登録履歴は残らない。
- **排他制御**: `LockService.getScriptLock().waitLock(10000)` で Upsert 本体を保護(commit `6aeb8c9` で導入)。同時書き込みは直列化され、10秒以内にロック取得できない場合は「混雑しています」を返す。
- **線形探索**: 買参番号は 2 列目を頭から走査。組合員数が増えても問題にはなりにくいが、数千行以上を想定するなら見直し。
- **バリデーション**: クライアント側のみ。GAS 側は必須チェックのみで、メール形式・電話番号形式は未検証。

## バリデーション仕様(2026/04/28更新)

### メールアドレス検証(クライアント側)

- **厳格正規表現**: `/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/`
- **追加チェック**(`isValidEmailStrict`):
  - 連続ドット `..` 禁止
  - `@` の前後でドット始まり/終わり禁止
  - 全体長 254 文字以内
- **全角文字検出**(`hasFullWidth`): `/[０-９Ａ-Ｚａ-ｚ＠．]/` でマッチしたら「半角英数字で入力してください」を表示
- **検証タイミング**:
  - `blur` 時: 形式 + タイポチェック(`validateEmailField(false)`)
  - `input` 時: エラー表示と提案を非表示にする(打ち直し中はうるさくしない)
  - 送信時: `validateEmailField(true)` で再検証(blur をスキップしたケース対策。タイポ提案は出さない)

### ドメインタイポ提案

`script.js` の `EMAIL_TYPOS` テーブルにマッピングを定義し、ドメインが一致したら警告UIを表示。
ユーザーは「修正する」(置換)か「このまま使う」(警告のみ非表示)を選択できる。

現在の対応ドメイン(2026/04/28時点):

| 誤 | → | 正 |
|---|---|---|
| gmai.com / gmial.com / gmal.com / gnail.com | → | gmail.com |
| yahho.co.jp / yaho.co.jp / yahoo.co.j | → | yahoo.co.jp |
| outlok.com | → | outlook.com |
| hotmial.com | → | hotmail.com |
| icoud.com / iclud.com | → | icloud.com |
| ezweb.ne.j | → | ezweb.ne.jp |
| docomo.ne.j | → | docomo.ne.jp |
| softbnak.ne.jp | → | softbank.ne.jp |

新しいタイポを追加する場合は `script.js` の `EMAIL_TYPOS` オブジェクトに `'誤': '正'` の形で追記。

## 登録完了メール(2026/04/28追加)

Upsert 成功後、本人宛に登録内容の控えメールを `MailApp.sendEmail` で自動送信する。

### 送信タイミング

`doPost` 内で `lock.releaseLock()` の **後**、`jsonResponse(result)` を返す **前** に `sendConfirmationMail(data)` を呼ぶ。
メール送信のためにロック保持時間が伸びないようにする意図。

### 本文仕様

- 件名: `【大田市場花き事業協同組合】連絡先のご登録ありがとうございました`
- 差出人名: `大田市場花き事業協同組合`
- replyTo: `OFFICE_EMAIL` 定数(現 `info@jigyokyo.com`)
- 本文末尾に事務局連絡先(メール・電話・フォームURL)を記載

### 電話番号マスク仕様

`maskTel(tel)` 関数で、ハイフン等を除いた数字部分の **下4桁を残して他はすべて `*`** に置換。

| 入力 | 出力 |
|---|---|
| `03-1234-5678` | `***********5678` |
| `09012345678` | `*******5678` |
| `1234`(4桁以下) | `1234`(マスクしない) |

ハイフン等の記号は除去されてから集計されるため、出力は数字+`*` のみ。

### 事務局連絡先定数

`gas/Code.gs` 冒頭で定義:

```js
const OFFICE_EMAIL = 'info@jigyokyo.com';
const OFFICE_TEL = '03-5492-4065';
const FORM_URL = 'https://member.jigyokyo.com/';
```

事務局連絡先が変わったらこれらの定数を書き換えて `clasp push -f` → デプロイ更新。

### MailApp の制約

- **無料枠の送信上限: 1日100通**(コンシューマーアカウント)。`MailApp.getRemainingDailyQuota()` で残数取得可能。組合員数が100人を超えるなら一斉送信用途には注意。
- **失敗時はログのみ**: `try/catch` で `Logger.log` に記録するだけで、Upsert の成功レスポンスには影響させない(登録自体は成立しているため)。失敗ログは Apps Script の「実行数」画面から確認できる。
- **追加スコープが必要**: `MailApp.sendEmail` を使うには認可スコープ `https://www.googleapis.com/auth/script.send_mail` が必要。新規追加直後の初回実行時に認可ダイアログが出る(後述「デプロイ後の追加認可」参照)。

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

## 統合ビュー(2025/04/28追加)

スプレッドシート内に「統合ビュー」タブを作成し、以下の数式で
「フォームの回答 1」+「組合員連絡先」を統合表示している:

(A1: 買参番号 / B1: 店名/屋号 / C1: メールアドレス)
A2セルの数式:

```
=QUERY(
  {
    'フォームの回答 1'!E2:E,
    'フォームの回答 1'!D2:D,
    'フォームの回答 1'!B2:B;
    '組合員連絡先'!B2:B,
    '組合員連絡先'!C2:C,
    '組合員連絡先'!F2:F
  },
  "SELECT * WHERE Col1 IS NOT NULL ORDER BY Col1 ASC"
)
```

用途: メール一括送信の宛先リスト(C列をBCCに貼り付け)

### 注意点(過去のハマりどころ)
- タブ名「フォームの回答 1」には半角スペースが入っている(Googleフォーム自動生成の仕様)
- タブ名を間違えるとQUERY関数は #REF! になる(エラーメッセージで気付きにくい)
- 配列リテラル {} 内ではカンマ=列追加、セミコロン=行追加
- 列追加の際は配列の各要素が同じ長さ(行数)になるようにする
- WHERE句で数値列に "<> ''" を使うと #N/A になることがある。
  IS NOT NULL だけで十分

### フォームの回答 1 の列構成(2025/04/28時点)
A: タイムスタンプ / B: メールアドレス / C: 名前(担当者) /
D: 屋号(会社名) / E: 買参番号 / F: 電話番号 / G: 要望事項 /
H: 出欠(別フォームの可能性、本GASでは無視)
