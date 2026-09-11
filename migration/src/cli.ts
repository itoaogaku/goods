#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { DEFAULT_COLUMN_MAP, parseWixOrdersCsv, type CsvColumnMap } from "./source-csv.js";
import { fetchWixOrders } from "./source-wix-api.js";
import { migrateOrderLines } from "./migrate.js";
import { backfillAccDefaults, getDataSourceId } from "./notion.js";
import type { Location, OrderLine } from "./types.js";

const program = new Command();

program
  .name("wix-to-notion")
  .description("Wix Storesの販売データをNotionデータベースへ移行します")
  .version("1.0.0");

program
  .command("csv <file>")
  .description("Wixからエクスポートした注文CSVファイルを読み込んで移行します")
  .option("--dry-run", "Notionへの書き込みを行わず、件数のみ確認します", false)
  .option("--col-order-id <name>", "注文番号の列名", DEFAULT_COLUMN_MAP.orderId)
  .option("--col-order-date <name>", "注文日時の列名", DEFAULT_COLUMN_MAP.orderDate)
  .option("--col-product-name <name>", "商品名の列名", DEFAULT_COLUMN_MAP.productName)
  .option("--col-quantity <name>", "数量の列名", DEFAULT_COLUMN_MAP.quantity)
  .option("--col-unit-price <name>", "単価の列名", DEFAULT_COLUMN_MAP.unitPrice)
  .option("--col-status <name>", "発送ステータスの列名", DEFAULT_COLUMN_MAP.status)
  .option("--since <date>", "この日付(YYYY-MM-DD)以降のデータのみ移行します", "2025-03-01")
  .option("--location <name>", "在庫拠点（Wixの注文は全件この拠点から発送された扱いにします）", "水上村")
  .action(async (file: string, opts) => {
    const columnMap: CsvColumnMap = {
      orderId: opts.colOrderId,
      orderDate: opts.colOrderDate,
      productName: opts.colProductName,
      quantity: opts.colQuantity,
      unitPrice: opts.colUnitPrice,
      status: opts.colStatus,
    };

    const { lines, invalidRows } = parseWixOrdersCsv(file, columnMap, opts.location as Location);

    if (invalidRows.length > 0) {
      console.warn(`\n[警告] ${invalidRows.length} 行を解析できずスキップしました:`);
      for (const row of invalidRows.slice(0, 20)) {
        console.warn(`  - ${row.rowNumber}行目: ${row.reason}`);
      }
      if (invalidRows.length > 20) {
        console.warn(`  ...他 ${invalidRows.length - 20} 件`);
      }
    }

    const filtered = filterSince(lines, opts.since);
    await runMigration(filtered, opts.dryRun);
  });

program
  .command("wix-api")
  .description("Wix eコマース REST API から直接注文データを取得して移行します")
  .option("--dry-run", "Notionへの書き込みを行わず、件数のみ確認します", false)
  .option("--since <date>", "この日付(YYYY-MM-DD)以降のデータのみ移行します", "2025-03-01")
  .option("--location <name>", "在庫拠点（Wixの注文は全件この拠点から発送された扱いにします）", "水上村")
  .action(async (opts) => {
    const apiKey = process.env.WIX_API_KEY;
    const siteId = process.env.WIX_SITE_ID;
    if (!apiKey || !siteId) {
      console.error("環境変数 WIX_API_KEY と WIX_SITE_ID を設定してください");
      process.exitCode = 1;
      return;
    }

    const lines = await fetchWixOrders({
      apiKey,
      siteId,
      since: opts.since,
      location: opts.location as Location,
    });
    await runMigration(lines, opts.dryRun);
  });

program
  .command("backfill")
  .description(
    "既存データベースの行に 種別=通常販売・拠点=水上村 のデフォルト値を補完します（旧バージョンで移行済みの行がある場合に使用）"
  )
  .action(async () => {
    const dataSourceId = await getDataSourceId();
    const updated = await backfillAccDefaults(dataSourceId);
    console.log(`${updated} 件の行に 種別/拠点 のデフォルト値を設定しました`);
  });

function filterSince(lines: OrderLine[], since: string): OrderLine[] {
  return lines.filter((line) => line.soldAt >= since);
}

async function runMigration(lines: OrderLine[], dryRun: boolean): Promise<void> {
  console.log(`\n${lines.length} 件の明細を処理します${dryRun ? "（ドライラン）" : ""}...\n`);

  const result = await migrateOrderLines(lines, {
    dryRun,
    onProgress: (done, total) => {
      process.stdout.write(`\r進捗: ${done}/${total}`);
    },
  });

  console.log("\n\n--- 移行結果 ---");
  console.log(`読み込み件数: ${result.totalRead}`);
  console.log(`新規登録: ${result.created}`);
  console.log(`重複スキップ: ${result.skippedDuplicate}`);
  console.log(`失敗: ${result.failed}`);

  if (result.errors.length > 0) {
    console.log("\nエラー詳細:");
    for (const error of result.errors.slice(0, 20)) {
      console.log(`  - ${error.lineId}: ${error.message}`);
    }
    process.exitCode = 1;
  }
}

program.parseAsync(process.argv);
