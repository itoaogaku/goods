# グッズ販売管理ダッシュボード

Notionデータベースに蓄積された2025年3月以降の販売データを、月別売上・商品別ランキング・未発送件数などとして可視化するNext.js製のダッシュボードです。API（Route Handlers）とフロントエンドが1つのNext.jsアプリにまとまっており、Vercelへそのままデプロイできます。

データのNotionへの移行は `../migration` のCLIツールを使用してください。

## 構成

- `app/api/sales/summary/route.ts` — 月別売上集計・商品別ランキング・KPIを返すエンドポイント
- `app/api/sales/list/route.ts` — 検索・フィルタ・ページネーション対応の販売データ一覧エンドポイント
- `app/page.tsx` — ダッシュボード画面（KPIカード・売上推移グラフ・商品別ランキング・データ一覧テーブル）
- `lib/notion.ts` — Notion APIクライアントとクエリ・集計ロジック
- `components/ui/` — shadcn/ui相当の共通UIコンポーネント（Radix UI + Tailwind CSSで実装）
- `components/dashboard/` — ダッシュボード専用コンポーネント

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local を編集
npm run dev
```

### 環境変数

| 変数名 | 必須 | 説明 |
| --- | --- | --- |
| `NOTION_API_KEY` | ✅ | Notion Internal Integration のトークン |
| `NOTION_DATABASE_ID` | ✅ | 販売データベースのID |
| `NOTION_DATA_SOURCE_ID` | - | 指定するとデータベースIDからの解決をスキップします |
| `SALES_DATA_SINCE` | - | 集計対象の開始日（デフォルト `2025-03-01`） |
| `ALLOWED_ORIGIN` | - | APIへのブラウザアクセスを許可するオリジン（カンマ区切りで複数指定可）。未設定時は `*` |

APIキー・データベースIDはサーバーサイド（Route Handlers内）でのみ使用され、クライアントに送信されることはありません。

## Vercelへのデプロイ

1. このリポジトリをVercelにインポート
2. **Root Directory** を `web` に設定（モノレポ構成のため）
3. 上記の環境変数をVercelのプロジェクト設定 → Environment Variables に登録
4. デプロイ

フロントエンドとAPIが同一オリジンで動作するため、通常は `ALLOWED_ORIGIN` の設定は不要です。APIを別ドメイン・別Vercelプロジェクトのフロントエンドから呼び出す場合のみ設定してください。

## 動作確認

```bash
npm run lint
npm run build
```
