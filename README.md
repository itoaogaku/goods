# goods

青学駅伝グッズの販売データをWixからNotionへ移行し、売上ダッシュボードとして可視化するためのプロジェクトです。

## 構成

| ディレクトリ | 役割 |
| --- | --- |
| [`migration/`](./migration) | Wixの注文データ（CSVエクスポート or eコマースREST API）をNotionデータベースへ移行するCLIツール（Node.js / TypeScript） |
| [`web/`](./web) | Notionのデータを集計するAPI（Route Handlers）とダッシュボード画面を持つNext.jsアプリ。Vercelへデプロイ |

## データフロー

```
Wix Stores（注文データ）
   │  CSVエクスポート or eコマースREST API
   ▼
migration/ (CLI)  ──▶  Notion データベース（販売データ）
                            │
                            ▼
                    web/ Next.js API (app/api/sales/*)
                            │
                            ▼
                    web/ ダッシュボード画面（Vercel）
```

## はじめに

1. `migration/README.md` の手順でNotionデータベースを作成し、Wixの注文データを移行します
2. `web/README.md` の手順で環境変数を設定し、ダッシュボードをローカル起動またはVercelへデプロイします
