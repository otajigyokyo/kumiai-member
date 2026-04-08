# 組合員連絡先登録フォーム

大田市場花き事業協同組合の組合員向け連絡先登録Webフォームです。  
Google Apps Script (GAS) + Google スプレッドシートでデータを管理します。

## 構成

| ファイル | 説明 |
|---|---|
| `index.html` | フロントエンド（登録フォーム） |
| `style.css` | スタイルシート |
| `script.js` | フォームバリデーション・送信処理 |
| `gas/Code.gs` | GAS バックエンド |
| `gas/appsscript.json` | GAS プロジェクト設定 |

## セットアップ手順

### 1. GAS プロジェクトの作成

```bash
cd gas
clasp create --type webapp --title "組合員連絡先登録" --rootDir .
clasp push
```

### 2. デプロイ

1. [Google Apps Script](https://script.google.com/) でプロジェクトを開く
2. 「デプロイ」→「新しいデプロイ」→ 種類: **ウェブアプリ**
3. アクセスできるユーザー: **全員** を選択しデプロイ
4. 表示されたURLをコピー

### 3. フロントエンドの設定

`script.js` の `GAS_URL` をデプロイURLに差し替えます。

```js
const GAS_URL = 'https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec';
```

### 4. ホスティング

`index.html`, `style.css`, `script.js` を GitHub Pages 等で公開します。

## 機能

- 買参番号・店名・代表者氏名・電話番号・メールアドレスを登録
- 同じ買参番号で再登録すると既存データを上書き更新
- バリデーション（必須チェック・形式チェック）
- レスポンシブ対応
