export type AdminDashboardPeriodRange =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth";

export type AdminDashboardTrendGranularity = "hour" | "day";

export type AdminDashboardPeriod = {
  range: AdminDashboardPeriodRange;
  label: string;
  description: string;
  comparisonLabel: string;
  chartDescription: string;
  chartGranularity: AdminDashboardTrendGranularity;
  chartBucketLabel: string;
  topProductsDescription: string;
  currentStart: Date;
  currentEnd: Date;
};

export type DashboardComparisonMetric = {
  current: number;
  previous: number;
};

export type AdminDashboardSummary = {
  revenue: DashboardComparisonMetric;
  transactionCount: DashboardComparisonMetric;
  itemSold: DashboardComparisonMetric;
  averageTransaction: DashboardComparisonMetric;
  availableStock: number;
  activeHeldCarts: number;
  activeShifts: number;
  failedHardwareJobsToday: number;
};

export type AdminDashboardTrendPoint = {
  dateKey: string;
  label: string;
  revenue: number;
  transactionCount: number;
  itemSold: number;
};

export type AdminDashboardTopProductItem = {
  itemId: string;
  sku: string;
  barcode: string;
  itemName: string;
  itemSold: number;
  revenue: number;
};

export type AdminDashboardTopProduct = {
  rank: number;
  productId: string;
  productName: string;
  itemSold: number;
  revenue: number;
  items: AdminDashboardTopProductItem[];
};

export type AdminDashboardSaleStatus =
  | "draft"
  | "awaiting_payment"
  | "completed"
  | "cancelled"
  | "voided"
  | "partially_refunded"
  | "refunded";

export type AdminDashboardRecentTransaction = {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  totalAmount: number;
  status: AdminDashboardSaleStatus;
  completedAt: Date | null;
  createdAt: Date;
};

export type AdminDashboardAlertTone = "success" | "neutral" | "warning" | "danger";

export type AdminDashboardOperationalAlert = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: AdminDashboardAlertTone;
};

export type AdminDashboardActivityKind =
  | "sale"
  | "customer"
  | "inventory"
  | "product"
  | "shift"
  | "hold_cart"
  | "administration"
  | "approval"
  | "system";

export type AdminDashboardRecentActivity = {
  id: string;
  title: string;
  description: string;
  value: number | null;
  kind: AdminDashboardActivityKind;
  createdAt: Date;
};

export type AdminDashboardData = {
  period: AdminDashboardPeriod;
  summary: AdminDashboardSummary;
  trend: AdminDashboardTrendPoint[];
  topProducts: AdminDashboardTopProduct[];
  recentTransactions: AdminDashboardRecentTransaction[];
  operationalAlerts: AdminDashboardOperationalAlert[];
  recentActivities: AdminDashboardRecentActivity[];
};
