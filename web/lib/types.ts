export type OrderStatus = "未発送" | "発送済" | "キャンセル" | "返金";

export type Ledger = "acc" | "trackteam";

/** Physical/organizational stock location. ACC owns 水上村 and 町田; 陸上部 is its own ledger's single location. */
export type Location = "水上村" | "町田" | "陸上部" | "購買会";

export type EventType =
  | "発注" // purchase order placed — does NOT affect stock until received
  | "入庫" // new stock registered (finished goods received)
  | "通常販売" // normal-price sale (Wix or manual)
  | "関係者価格販売" // insider/staff discounted sale
  | "プレゼント" // gift, no revenue
  | "拠点間移動" // transfer between locations within the same ledger
  | "陸上部卸し" // ACC ledger only — wholesale from ACC to 陸上部
  | "購買会卸し" // 陸上部 ledger only — wholesale from 陸上部 to 購買会 (10%マージン差引後の額を記録)
  | "棚卸調整" // stock count correction, signed quantity — its own column in 現在庫, NOT folded into the real 在庫 balance
  | "送料" // shipping fee collected on an order (Wix sync only) — no stock impact
  | "経費"; // a business expense (rent, supplies, ...) — no stock impact

export type PurchaseOrderStatus = "発注済み" | "一部納品" | "納品完了" | "キャンセル";

/**
 * One row in a ledger's Notion database. Every inventory or sales change —
 * a Wix order line, a manual sale, a stock-in, a transfer, an adjustment,
 * a purchase order — is one InventoryEvent, distinguished by eventType.
 */
export interface InventoryEvent {
  pageId: string;
  transactionId: string;
  lineId: string;
  eventType: EventType;
  occurredAt: string; // ISO date string
  location: Location;
  /** Only set for 拠点間移動: the location stock moved into. */
  destinationLocation: Location | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  memo: string;
  status: OrderStatus;
  /** Wix sync only (billingInfo's name) — empty for manual entries. */
  customerName: string;
  /** 発注 only, below. */
  poStatus: PurchaseOrderStatus | null;
  receivedQuantity: number;
  /**
   * サイズ変更・個数変更などの手動修正で 商品名/数量/単価/備考 を上書きする前の
   * 値。この取引がまだ一度も手動編集されていなければ null。編集の1回目でだけ
   * 記録され、以後の再編集では上書きされない（元に戻すボタンが常に本当の
   * 最初の値に戻せるように）。Wixの自動同期は ステータス/顧客名 しか書き込まない
   * ので、ここでの手動修正が後続の同期で上書きされることはない。
   */
  originalValues: { productName: string; quantity: number; unitPrice: number; memo: string } | null;
}

export interface MonthlyStat {
  month: string; // "2025-03"
  revenue: number;
  quantity: number;
}

export interface ProductRankingEntry {
  productName: string;
  quantity: number;
  revenue: number;
}

export interface SalesSummary {
  rangeStart: string;
  /** Inclusive end date (YYYY-MM-DD) of the requested period, or null when unbounded (up to now). */
  rangeEnd: string | null;
  generatedAt: string;
  kpi: {
    currentMonthRevenue: number;
    cumulativeRevenue: number;
    totalQuantity: number;
    pendingCount: number;
    /** Cumulative 送料 (shipping fee) collected since rangeStart, tracked separately from product revenue. */
    shippingRevenue: number;
    /** Cumulative 経費 rows plus 入庫's own cost (単価) since rangeStart. */
    expenseTotal: number;
    /** cumulativeRevenue + shippingRevenue - expenseTotal. */
    netProfit: number;
  };
  monthlyStats: MonthlyStat[];
  productRanking: ProductRankingEntry[];
}

export interface EventListResponse {
  records: InventoryEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface StockBalanceEntry {
  productName: string;
  location: Location;
  quantity: number;
  /** Cumulative 入庫 quantity only (not netted against sales/adjustments), for reference alongside the net `quantity`. */
  purchasedQuantity: number;
  /** This product's earliest 入庫 date across all locations, or null if it has never been stocked in. */
  firstStockInDate: string | null;
  /** Cumulative 棚卸調整 (signed), for reference alongside the net `quantity` — same idea as `purchasedQuantity`, it does NOT change how `quantity` itself is computed (棚卸調整 is already folded into `quantity`). */
  adjustmentQuantity: number;
}

/** This row's effect on one product's stock, and the running balance right after it. */
export interface CustomerMatrixCell {
  /** Signed change from this row: negative for a sale, positive for a 入庫 stock-in. */
  delta: number;
  /** Running stock balance for this product immediately after this row, scoped to the requested location. */
  balance: number;
}

/** One order's, 入庫's, 拠点間移動's, or 棚卸調整's row in the customer×商品 pivot table (see /api/[ledger]/customer-matrix). */
export interface CustomerMatrixRow {
  transactionId: string;
  customerName: string;
  orderDate: string;
  /** "order" rows have a customerName; stock-in/transfer/adjustment rows generally don't. */
  rowKind: "order" | "stock-in" | "transfer" | "adjustment";
  /** Keyed by productName — only products actually touched by this row are present. */
  products: Record<string, CustomerMatrixCell>;
  productRevenue: number;
  shippingRevenue: number;
  total: number;
  memo: string;
}

export interface CustomerMatrixResponse {
  /** Every distinct productName across all rows, in display column order. */
  columns: string[];
  rows: CustomerMatrixRow[];
}

/**
 * One product's row in the 料金表一覧 (price list). 商品名/定価 are kept in
 * sync automatically from Wix's product catalog; 原価/関係者価格/陸上部卸値/
 * 購買会卸値 have no Wix equivalent and are entered by hand in this app.
 */
export interface ProductPriceEntry {
  pageId: string;
  wixProductId: string;
  productName: string;
  listPrice: number;
  costPrice: number | null;
  insiderPrice: number | null;
  wholesalePrice: number | null;
  coopWholesalePrice: number | null;
  /** ACC（水上村・町田）と陸上部（陸上部・購買会）、全拠点合計の現在庫数。 */
  totalStock: number;
}

/**
 * One product's row in the 分析 tab's 商品別回収率ランキング table (see
 * /api/[ledger]/analytics). 常に全期間の累計で計算し、分析タブの期間絞り込み
 * の影響は受けない（在庫・売上確認表と同じ考え方 — 仕入れコストは全期間で
 * 一度きり発生するものなので、期間で切ると意味がなくなる）。
 */
export interface ProductRecoveryRate {
  productName: string;
  /** 全期間累計の仕入れ個数（入庫、全拠点合計）。 */
  purchasedQuantity: number;
  /** 料金表一覧の原価（単価）。未入力の商品は null。 */
  unitCost: number | null;
  /** unitCost × purchasedQuantity（仕入れコスト）。unitCostがnullなら null。 */
  purchaseCost: number | null;
  /** 全期間累計の販売数量（全拠点合計）。 */
  quantitySold: number;
  /** 全期間累計の売上（全拠点合計）。 */
  revenue: number;
  /** revenue ÷ purchaseCost × 100。purchaseCostがnullまたは0なら null。 */
  recoveryPercent: number | null;
}

/** One slice of the 分析 tab's 拠点別/種別別売上構成 breakdown. */
export interface RevenueBreakdownEntry {
  label: string;
  revenue: number;
  quantity: number;
}

/** One product's row in the 分析 tab's 在庫回転率 table — how soon it's projected to run out at its recent selling pace. */
export interface StockTurnoverEntry {
  productName: string;
  currentStock: number;
  /** 直近90日の平均販売数を30日換算した月あたり販売数の目安。 */
  avgMonthlySold: number;
  /** currentStock ÷ 1日あたり平均販売数。在庫が無いか直近の販売が無ければ null。 */
  estimatedDaysRemaining: number | null;
}

/** One 種別（通常販売/関係者価格販売/プレゼント/卸し）の、ある拠点における累計数量・金額。 */
export interface SalesBreakdownCategory {
  eventType: EventType;
  quantity: number;
  amount: number;
}

/** ある商品・ある拠点の、種別ごとの販売内訳と現在庫。在庫・売上確認表の1セル分。 */
export interface LocationSalesBreakdown {
  location: Location;
  breakdown: SalesBreakdownCategory[];
  totalQuantity: number;
  totalAmount: number;
  stock: number;
}

/**
 * 分析タブの「在庫・売上確認表」の1商品分の行。仕入れ数＋棚卸調整－全拠点の
 * 販売数－全拠点の在庫数が0になるか（ズレがないか）を確認するための表で、
 * 拠点が2つ以上ある台帳（ACC・陸上部）でのみ意味を持つ（1拠点の台帳では空配列）。
 * 全期間の累計で計算し、分析タブの期間絞り込みの影響は受けない。
 */
export interface StockReconciliationEntry {
  productName: string;
  /** 全拠点合計の累計仕入れ数（入庫）。 */
  purchasedQuantity: number;
  /** 全拠点合計の累計棚卸調整（符号付き）。 */
  adjustmentQuantity: number;
  locations: LocationSalesBreakdown[];
  /** purchasedQuantity + adjustmentQuantity − 全拠点の販売数合計 − 全拠点の在庫数合計。0以外ならズレ。 */
  discrepancy: number;
}

export interface AnalyticsResponse {
  rangeStart: string;
  rangeEnd: string | null;
  productRecovery: ProductRecoveryRate[];
  revenueByLocation: RevenueBreakdownEntry[];
  revenueByEventType: RevenueBreakdownEntry[];
  /** Always computed from the most recent 90 days, independent of rangeStart/rangeEnd above. */
  stockTurnover: StockTurnoverEntry[];
  /** Always computed from full history, independent of rangeStart/rangeEnd above. Empty when this ledger has only one location. */
  stockReconciliation: StockReconciliationEntry[];
}
