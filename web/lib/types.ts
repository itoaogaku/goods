export type OrderStatus = "未発送" | "発送済" | "キャンセル" | "返金";

export interface SaleRecord {
  pageId: string;
  orderId: string;
  lineId: string;
  soldAt: string; // ISO date string
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: OrderStatus;
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
  generatedAt: string;
  kpi: {
    currentMonthRevenue: number;
    cumulativeRevenue: number;
    totalQuantity: number;
    pendingCount: number;
  };
  monthlyStats: MonthlyStat[];
  productRanking: ProductRankingEntry[];
}

export interface SalesListResponse {
  records: SaleRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}
