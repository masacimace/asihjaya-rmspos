import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  approvals,
  auditLogs,
  customers,
  hardwareAgents,
  hardwareJobs,
  outlets,
  payments,
  posHeldCarts,
  productItems,
  productMasters,
  registers,
  saleItems,
  sales,
  shifts,
  users,
} from "@/db/schema";
import type { AuthContext } from "@/lib/auth/session";
import type {
  AdminDashboardActivityKind,
  AdminDashboardData,
  AdminDashboardPeriod,
  AdminDashboardPeriodRange,
  AdminDashboardTrendGranularity,
  AdminDashboardOperationalAlert,
  AdminDashboardRecentActivity,
  AdminDashboardTopProductItem,
  AdminDashboardTrendPoint,
} from "./contracts";

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

function getJakartaDateParts(date: Date) {
  const shiftedDate = new Date(date.getTime() + JAKARTA_OFFSET_MS);

  return {
    year: shiftedDate.getUTCFullYear(),
    month: shiftedDate.getUTCMonth(),
    day: shiftedDate.getUTCDate(),
  };
}

function getJakartaDayStartUtc(date: Date, dayOffset = 0) {
  const parts = getJakartaDateParts(date);

  return new Date(
    Date.UTC(parts.year, parts.month, parts.day + dayOffset) -
      JAKARTA_OFFSET_MS,
  );
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addUtcHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function getJakartaMonthStartUtc(date: Date, monthOffset = 0) {
  const parts = getJakartaDateParts(date);

  return new Date(
    Date.UTC(parts.year, parts.month + monthOffset, 1) - JAKARTA_OFFSET_MS,
  );
}

function getJakartaHourStartUtc(date: Date) {
  const shiftedDate = new Date(date.getTime() + JAKARTA_OFFSET_MS);

  return new Date(
    Date.UTC(
      shiftedDate.getUTCFullYear(),
      shiftedDate.getUTCMonth(),
      shiftedDate.getUTCDate(),
      shiftedDate.getUTCHours(),
    ) - JAKARTA_OFFSET_MS,
  );
}

export const ADMIN_DASHBOARD_PERIOD_OPTIONS: Array<{
  value: AdminDashboardPeriodRange;
  label: string;
}> = [
  { value: "today", label: "Hari ini" },
  { value: "yesterday", label: "Kemarin" },
  { value: "last7", label: "7 hari terakhir" },
  { value: "last30", label: "30 hari terakhir" },
  { value: "thisMonth", label: "Bulan ini" },
];

export function parseAdminDashboardPeriodRange(
  value: string | string[] | undefined,
): AdminDashboardPeriodRange {
  const range = Array.isArray(value) ? value[0] : value;

  if (
    range === "yesterday" ||
    range === "last7" ||
    range === "last30" ||
    range === "thisMonth"
  ) {
    return range;
  }

  return "today";
}

function createPeriodMetadata({
  range,
  now,
}: {
  range: AdminDashboardPeriodRange;
  now: Date;
}): AdminDashboardPeriod & {
  previousStart: Date;
  previousEnd: Date;
  trendStart: Date;
  trendEnd: Date;
} {
  const todayStart = getJakartaDayStartUtc(now);
  const tomorrowStart = getJakartaDayStartUtc(now, 1);

  if (range === "yesterday") {
    const currentStart = getJakartaDayStartUtc(now, -1);
    const currentEnd = todayStart;

    return {
      range,
      label: "Kemarin",
      description: "Ringkasan operasional toko untuk hari kemarin.",
      comparisonLabel: "dari hari sebelumnya",
      chartDescription: "Penjualan bersih per hari selama tujuh hari sampai kemarin.",
      chartGranularity: "day",
      chartBucketLabel: "Per hari",
      topProductsDescription: "Berdasarkan penjualan kemarin.",
      currentStart,
      currentEnd,
      previousStart: getJakartaDayStartUtc(now, -2),
      previousEnd: currentStart,
      trendStart: addUtcDays(currentStart, -6),
      trendEnd: currentEnd,
    };
  }

  if (range === "last7") {
    const currentStart = getJakartaDayStartUtc(now, -6);
    const currentEnd = tomorrowStart;

    return {
      range,
      label: "7 hari terakhir",
      description: "Ringkasan operasional toko untuk tujuh hari terakhir.",
      comparisonLabel: "dari 7 hari sebelumnya",
      chartDescription: "Penjualan bersih per hari selama tujuh hari terakhir.",
      chartGranularity: "day",
      chartBucketLabel: "Per hari",
      topProductsDescription: "Berdasarkan 7 hari terakhir.",
      currentStart,
      currentEnd,
      previousStart: addUtcDays(currentStart, -7),
      previousEnd: currentStart,
      trendStart: currentStart,
      trendEnd: currentEnd,
    };
  }

  if (range === "last30") {
    const currentStart = getJakartaDayStartUtc(now, -29);
    const currentEnd = tomorrowStart;

    return {
      range,
      label: "30 hari terakhir",
      description: "Ringkasan operasional toko untuk tiga puluh hari terakhir.",
      comparisonLabel: "dari 30 hari sebelumnya",
      chartDescription: "Penjualan bersih per hari selama tiga puluh hari terakhir.",
      chartGranularity: "day",
      chartBucketLabel: "Per hari",
      topProductsDescription: "Berdasarkan 30 hari terakhir.",
      currentStart,
      currentEnd,
      previousStart: addUtcDays(currentStart, -30),
      previousEnd: currentStart,
      trendStart: currentStart,
      trendEnd: currentEnd,
    };
  }

  if (range === "thisMonth") {
    const currentStart = getJakartaMonthStartUtc(now);
    const currentEnd = tomorrowStart;
    const currentDurationMs = currentEnd.getTime() - currentStart.getTime();

    return {
      range,
      label: "Bulan ini",
      description: "Ringkasan operasional toko untuk bulan berjalan.",
      comparisonLabel: "dari periode sebelumnya",
      chartDescription: "Penjualan bersih per hari selama bulan berjalan.",
      chartGranularity: "day",
      chartBucketLabel: "Per hari",
      topProductsDescription: "Berdasarkan bulan ini.",
      currentStart,
      currentEnd,
      previousStart: new Date(currentStart.getTime() - currentDurationMs),
      previousEnd: currentStart,
      trendStart: currentStart,
      trendEnd: currentEnd,
    };
  }

  const currentStart = todayStart;
  const currentEnd = tomorrowStart;
  const nextCurrentHour = addUtcHours(getJakartaHourStartUtc(now), 1);

  return {
    range: "today",
    label: "Hari ini",
    description: "Ringkasan operasional toko hari ini berdasarkan data transaksi, stok, shift, dan hardware terbaru.",
    comparisonLabel: "dari kemarin",
    chartDescription: "Penjualan bersih per jam hari ini.",
    chartGranularity: "hour",
    chartBucketLabel: "Per jam",
    topProductsDescription: "Berdasarkan penjualan hari ini.",
    currentStart,
    currentEnd,
    previousStart: getJakartaDayStartUtc(now, -1),
    previousEnd: currentStart,
    trendStart: currentStart,
    trendEnd: nextCurrentHour > currentEnd ? currentEnd : nextCurrentHour,
  };
}

function getJakartaDateKey(date: Date) {
  const parts = getJakartaDateParts(date);

  return [
    parts.year,
    String(parts.month + 1).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

function getJakartaShortDateLabel(date: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function getJakartaHourKey(date: Date) {
  const shiftedDate = new Date(date.getTime() + JAKARTA_OFFSET_MS);

  return [
    shiftedDate.getUTCFullYear(),
    String(shiftedDate.getUTCMonth() + 1).padStart(2, "0"),
    String(shiftedDate.getUTCDate()).padStart(2, "0"),
    String(shiftedDate.getUTCHours()).padStart(2, "0"),
  ].join("-");
}

function getJakartaHourLabel(date: Date) {
  const shiftedDate = new Date(date.getTime() + JAKARTA_OFFSET_MS);

  return `${String(shiftedDate.getUTCHours()).padStart(2, "0")}.00`;
}

function createTrendSkeleton({
  start,
  end,
  granularity,
}: {
  start: Date;
  end: Date;
  granularity: AdminDashboardTrendGranularity;
}): AdminDashboardTrendPoint[] {
  const points: AdminDashboardTrendPoint[] = [];
  const increment = granularity === "hour" ? addUtcHours : addUtcDays;
  const maxPoints = granularity === "hour" ? 24 : 31;

  for (let cursor = start; cursor < end && points.length < maxPoints; cursor = increment(cursor, 1)) {
    points.push({
      dateKey:
        granularity === "hour"
          ? getJakartaHourKey(cursor)
          : getJakartaDateKey(cursor),
      label:
        granularity === "hour"
          ? getJakartaHourLabel(cursor)
          : getJakartaShortDateLabel(cursor),
      revenue: 0,
      transactionCount: 0,
      itemSold: 0,
    });
  }

  return points;
}

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function getTimeLabel(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function getActivityKind(action: string): AdminDashboardActivityKind {
  if (action.startsWith("sale.")) return "sale";
  if (action.startsWith("customer.")) return "customer";
  if (action.startsWith("product_item.")) return "inventory";
  if (action.startsWith("product_master.") || action.startsWith("product_category.")) {
    return "product";
  }
  if (action.startsWith("shift.")) return "shift";
  if (action.startsWith("pos.held_cart.")) return "hold_cart";
  if (action.startsWith("staff.") || action.startsWith("role.") || action.startsWith("outlet.") || action.startsWith("register.")) {
    return "administration";
  }
  if (action.startsWith("approval.")) return "approval";

  return "system";
}

function createActivityTitle(action: string) {
  const labels: Record<string, string> = {
    "sale.completed": "Transaksi baru berhasil",
    "customer.create": "Pelanggan baru ditambahkan",
    "product_item.create": "Item produk ditambahkan",
    "product_item.update": "Item produk diperbarui",
    "product_item.activate": "Item produk diaktifkan",
    "product_master.create": "Master product ditambahkan",
    "product_master.update": "Master product diperbarui",
    "product_category.create": "Kategori produk ditambahkan",
    "product_category.update": "Kategori produk diperbarui",
    "pos.held_cart.create": "Transaksi ditahan",
    "pos.held_cart.resume": "Transaksi hold di-resume",
    "pos.held_cart.cancel": "Transaksi hold dibatalkan",
    "shift.open": "Shift kasir dibuka",
    "shift.close": "Shift kasir ditutup",
    "staff.create": "Staff baru ditambahkan",
    "staff.profile_update": "Profil staff diperbarui",
    "staff.access_update": "Akses staff diperbarui",
    "role.create": "Role baru ditambahkan",
    "role.update": "Role diperbarui",
    "outlet.create": "Outlet baru ditambahkan",
    "outlet.update": "Outlet diperbarui",
    "register.create": "Register baru ditambahkan",
    "register.update": "Register diperbarui",
  };

  return labels[action] ?? "Aktivitas sistem tercatat";
}

function createActivityDescription({
  action,
  afterData,
  createdAt,
}: {
  action: string;
  afterData: Record<string, unknown>;
  createdAt: Date;
}) {
  const timeLabel = getTimeLabel(createdAt);

  if (action === "sale.completed") {
    return `${readString(afterData.invoiceNumber) ?? "Invoice"} · ${timeLabel}`;
  }

  if (action === "customer.create") {
    return `${readString(afterData.fullName) ?? readString(afterData.customerName) ?? "Customer"} · ${timeLabel}`;
  }

  if (action.startsWith("product_item.")) {
    return `${readString(afterData.sku) ?? readString(afterData.barcode) ?? "Item"} · ${timeLabel}`;
  }

  if (action.startsWith("product_master.")) {
    return `${readString(afterData.name) ?? readString(afterData.productName) ?? "Product"} · ${timeLabel}`;
  }

  if (action.startsWith("shift.")) {
    return `${readString(afterData.registerCode) ?? readString(afterData.registerName) ?? "Register"} · ${timeLabel}`;
  }

  if (action.startsWith("pos.held_cart.")) {
    return `${readString(afterData.holdNumber) ?? "Hold cart"} · ${timeLabel}`;
  }

  return `${readString(afterData.entityName) ?? "Data operasional"} · ${timeLabel}`;
}

function createEmptyDashboard(
  period: AdminDashboardPeriod & { trendStart?: Date; trendEnd?: Date },
): AdminDashboardData {
  return {
    period,
    summary: {
      revenue: { current: 0, previous: 0 },
      transactionCount: { current: 0, previous: 0 },
      itemSold: { current: 0, previous: 0 },
      averageTransaction: { current: 0, previous: 0 },
      availableStock: 0,
      activeHeldCarts: 0,
      activeShifts: 0,
      failedHardwareJobsToday: 0,
    },
    trend: createTrendSkeleton({
      start: period.trendStart ?? period.currentStart,
      end: period.trendEnd ?? period.currentEnd,
      granularity: period.chartGranularity,
    }),
    topProducts: [],
    recentTransactions: [],
    operationalAlerts: [
      {
        id: "no-outlet-access",
        title: "Belum ada outlet aktif",
        description: "Atur akses outlet staff terlebih dahulu untuk melihat dashboard operasional.",
        href: "/admin/administrasi/staff",
        tone: "warning",
      },
    ],
    recentActivities: [],
  };
}

export async function getAdminDashboardData(
  auth: AuthContext,
  range: AdminDashboardPeriodRange = "today",
): Promise<AdminDashboardData> {
  const outletIds = auth.outlets.map((outlet) => outlet.id);
  const now = new Date();
  const period = createPeriodMetadata({ range, now });

  if (outletIds.length === 0) {
    return createEmptyDashboard(period);
  }

  const currentStart = period.currentStart;
  const currentEnd = period.currentEnd;
  const previousStart = period.previousStart;
  const previousEnd = period.previousEnd;
  const trendStart = period.trendStart;
  const trendEnd = period.trendEnd;
  const staleAgentCutoff = new Date(now.getTime() - 5 * 60 * 1000);
  const trendBucketSql =
    period.chartGranularity === "hour"
      ? sql<string>`to_char(${sales.completedAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD-HH24')`
      : sql<string>`to_char(${sales.completedAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`;

  const [
    todaySalesRows,
    yesterdaySalesRows,
    todayItemRows,
    yesterdayItemRows,
    inventoryRows,
    heldCartRows,
    activeShiftRows,
    failedHardwareJobRows,
    pendingApprovalRows,
    pendingPaymentRows,
    offlineAgentRows,
    itemsWithoutPriceRows,
    trendRows,
    topProductRows,
    recentTransactionRows,
    auditRows,
  ] = await Promise.all([
    db
      .select({
        revenue: sql<number>`coalesce(sum(${sales.totalAmount}), 0)`.mapWith(Number),
        transactionCount: count(),
      })
      .from(sales)
      .where(
        and(
          eq(sales.organizationId, auth.organization.id),
          inArray(sales.outletId, outletIds),
          eq(sales.status, "completed"),
          gte(sales.completedAt, currentStart),
          lt(sales.completedAt, currentEnd),
        ),
      ),

    db
      .select({
        revenue: sql<number>`coalesce(sum(${sales.totalAmount}), 0)`.mapWith(Number),
        transactionCount: count(),
      })
      .from(sales)
      .where(
        and(
          eq(sales.organizationId, auth.organization.id),
          inArray(sales.outletId, outletIds),
          eq(sales.status, "completed"),
          gte(sales.completedAt, previousStart),
          lt(sales.completedAt, previousEnd),
        ),
      ),

    db
      .select({ itemSold: count() })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(
        and(
          eq(sales.organizationId, auth.organization.id),
          inArray(sales.outletId, outletIds),
          eq(sales.status, "completed"),
          gte(sales.completedAt, currentStart),
          lt(sales.completedAt, currentEnd),
        ),
      ),

    db
      .select({ itemSold: count() })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .where(
        and(
          eq(sales.organizationId, auth.organization.id),
          inArray(sales.outletId, outletIds),
          eq(sales.status, "completed"),
          gte(sales.completedAt, previousStart),
          lt(sales.completedAt, previousEnd),
        ),
      ),

    db
      .select({ availableStock: count() })
      .from(productItems)
      .where(
        and(
          eq(productItems.organizationId, auth.organization.id),
          inArray(productItems.currentOutletId, outletIds),
          eq(productItems.isActive, true),
          eq(productItems.availability, "available"),
          eq(productItems.condition, "good"),
          eq(productItems.locationState, "outlet"),
        ),
      ),

    db
      .select({ activeHeldCarts: count() })
      .from(posHeldCarts)
      .where(
        and(
          eq(posHeldCarts.organizationId, auth.organization.id),
          inArray(posHeldCarts.outletId, outletIds),
          eq(posHeldCarts.status, "active"),
        ),
      ),

    db
      .select({
        id: shifts.id,
        openedAt: shifts.openedAt,
        outletName: outlets.name,
        registerName: registers.name,
        openedByName: users.fullName,
      })
      .from(shifts)
      .innerJoin(outlets, eq(shifts.outletId, outlets.id))
      .innerJoin(registers, eq(shifts.registerId, registers.id))
      .leftJoin(users, eq(shifts.openedBy, users.id))
      .where(and(inArray(shifts.outletId, outletIds), eq(shifts.status, "open")))
      .orderBy(desc(shifts.openedAt)),

    db
      .select({ failedHardwareJobsToday: count() })
      .from(hardwareJobs)
      .where(
        and(
          eq(hardwareJobs.organizationId, auth.organization.id),
          inArray(hardwareJobs.outletId, outletIds),
          eq(hardwareJobs.status, "failed"),
          gte(hardwareJobs.createdAt, currentStart),
          lt(hardwareJobs.createdAt, currentEnd),
        ),
      ),

    db
      .select({ pendingApprovals: count() })
      .from(approvals)
      .where(
        and(
          eq(approvals.organizationId, auth.organization.id),
          or(isNull(approvals.outletId), inArray(approvals.outletId, outletIds)),
          eq(approvals.status, "pending"),
        ),
      ),

    db
      .select({ pendingPayments: count() })
      .from(payments)
      .innerJoin(sales, eq(payments.saleId, sales.id))
      .where(
        and(
          eq(sales.organizationId, auth.organization.id),
          inArray(sales.outletId, outletIds),
          eq(payments.status, "pending"),
        ),
      ),

    db
      .select({ offlineAgents: count() })
      .from(hardwareAgents)
      .where(
        and(
          eq(hardwareAgents.organizationId, auth.organization.id),
          inArray(hardwareAgents.outletId, outletIds),
          eq(hardwareAgents.isActive, true),
          or(
            eq(hardwareAgents.status, "offline"),
            isNull(hardwareAgents.lastSeenAt),
            lt(hardwareAgents.lastSeenAt, staleAgentCutoff),
          ),
        ),
      ),

    db
      .select({ itemsWithoutPrice: count() })
      .from(productItems)
      .where(
        and(
          eq(productItems.organizationId, auth.organization.id),
          inArray(productItems.currentOutletId, outletIds),
          eq(productItems.isActive, true),
          eq(productItems.availability, "available"),
          or(isNull(productItems.sellingAmount), sql`${productItems.sellingAmount} <= 0`),
        ),
      ),

    db
      .select({
        bucket: trendBucketSql,
        revenue: sql<number>`coalesce(sum(${sales.totalAmount}), 0)`.mapWith(Number),
        transactionCount: count(),
      })
      .from(sales)
      .where(
        and(
          eq(sales.organizationId, auth.organization.id),
          inArray(sales.outletId, outletIds),
          eq(sales.status, "completed"),
          gte(sales.completedAt, trendStart),
          lt(sales.completedAt, trendEnd),
        ),
      )
      .groupBy(trendBucketSql)
      .orderBy(trendBucketSql),

    db
      .select({
        productId: productMasters.id,
        productName: productMasters.name,
        itemSold: count(),
        revenue: sql<number>`coalesce(sum(${saleItems.finalPriceAmount}), 0)`.mapWith(Number),
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(productItems, eq(saleItems.productItemId, productItems.id))
      .innerJoin(productMasters, eq(productItems.productMasterId, productMasters.id))
      .where(
        and(
          eq(sales.organizationId, auth.organization.id),
          inArray(sales.outletId, outletIds),
          eq(sales.status, "completed"),
          gte(sales.completedAt, currentStart),
          lt(sales.completedAt, currentEnd),
        ),
      )
      .groupBy(productMasters.id, productMasters.name)
      .orderBy(desc(sql`coalesce(sum(${saleItems.finalPriceAmount}), 0)`))
      .limit(4),

    db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        customerName: customers.fullName,
        totalAmount: sales.totalAmount,
        status: sales.status,
        completedAt: sales.completedAt,
        createdAt: sales.createdAt,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(
        and(
          eq(sales.organizationId, auth.organization.id),
          inArray(sales.outletId, outletIds),
          gte(sales.createdAt, currentStart),
          lt(sales.createdAt, currentEnd),
        ),
      )
      .orderBy(desc(sales.createdAt))
      .limit(5),

    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        afterData: auditLogs.afterData,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.organizationId, auth.organization.id),
          or(isNull(auditLogs.outletId), inArray(auditLogs.outletId, outletIds)),
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(5),
  ]);

  const todaySales = todaySalesRows[0];
  const yesterdaySales = yesterdaySalesRows[0];
  const todayRevenue = toNumber(todaySales?.revenue);
  const yesterdayRevenue = toNumber(yesterdaySales?.revenue);
  const todayTransactionCount = Number(todaySales?.transactionCount ?? 0);
  const yesterdayTransactionCount = Number(yesterdaySales?.transactionCount ?? 0);
  const todayItemSold = Number(todayItemRows[0]?.itemSold ?? 0);
  const yesterdayItemSold = Number(yesterdayItemRows[0]?.itemSold ?? 0);
  const todayAverageTransaction =
    todayTransactionCount > 0 ? Math.round(todayRevenue / todayTransactionCount) : 0;
  const yesterdayAverageTransaction =
    yesterdayTransactionCount > 0
      ? Math.round(yesterdayRevenue / yesterdayTransactionCount)
      : 0;

  const trendByDate = new Map<string, { revenue: number; transactionCount: number }>(
    trendRows.map((row) => [
      row.bucket,
      {
        revenue: toNumber(row.revenue),
        transactionCount: Number(row.transactionCount ?? 0),
      },
    ]),
  );

  const trend = createTrendSkeleton({
    start: trendStart,
    end: trendEnd,
    granularity: period.chartGranularity,
  }).map((point) => {
    const row = trendByDate.get(point.dateKey);

    return {
      ...point,
      revenue: row?.revenue ?? 0,
      transactionCount: row?.transactionCount ?? 0,
    };
  });

  const topProductIds = topProductRows.map((row) => row.productId);
  const topProductItemRows =
    topProductIds.length > 0
      ? await db
          .select({
            productId: productMasters.id,
            itemId: productItems.id,
            sku: productItems.sku,
            barcode: productItems.barcode,
            itemName: sql<string>`coalesce(
              ${productItems.displayName},
              ${productMasters.name},
              ${productItems.sku}
            )`,
            itemSold: count(),
            revenue: sql<number>`coalesce(sum(${saleItems.finalPriceAmount}), 0)`.mapWith(
              Number,
            ),
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .innerJoin(
            productItems,
            eq(saleItems.productItemId, productItems.id),
          )
          .innerJoin(
            productMasters,
            eq(productItems.productMasterId, productMasters.id),
          )
          .where(
            and(
              eq(sales.organizationId, auth.organization.id),
              inArray(sales.outletId, outletIds),
              inArray(productMasters.id, topProductIds),
              eq(sales.status, "completed"),
              gte(sales.completedAt, currentStart),
              lt(sales.completedAt, currentEnd),
            ),
          )
          .groupBy(
            productMasters.id,
            productItems.id,
            productItems.sku,
            productItems.barcode,
            productItems.displayName,
            productMasters.name,
          )
          .orderBy(desc(sql`coalesce(sum(${saleItems.finalPriceAmount}), 0)`))
          .limit(80)
      : [];

  const topProductItemsByProductId = new Map<
    string,
    AdminDashboardTopProductItem[]
  >();

  for (const row of topProductItemRows) {
    const productItemsForMaster =
      topProductItemsByProductId.get(row.productId) ?? [];

    productItemsForMaster.push({
      itemId: row.itemId,
      sku: row.sku,
      barcode: row.barcode,
      itemName: row.itemName,
      itemSold: Number(row.itemSold ?? 0),
      revenue: toNumber(row.revenue),
    });

    topProductItemsByProductId.set(row.productId, productItemsForMaster);
  }

  const operationalAlerts: AdminDashboardOperationalAlert[] = [];
  const failedHardwareJobsToday = Number(
    failedHardwareJobRows[0]?.failedHardwareJobsToday ?? 0,
  );
  const pendingApprovals = Number(pendingApprovalRows[0]?.pendingApprovals ?? 0);
  const pendingPayments = Number(pendingPaymentRows[0]?.pendingPayments ?? 0);
  const offlineAgents = Number(offlineAgentRows[0]?.offlineAgents ?? 0);
  const itemsWithoutPrice = Number(itemsWithoutPriceRows[0]?.itemsWithoutPrice ?? 0);
  const activeShifts = activeShiftRows.length;
  const activeHeldCarts = Number(heldCartRows[0]?.activeHeldCarts ?? 0);

  if (pendingPayments > 0) {
    operationalAlerts.push({
      id: "pending-payments",
      title: `${pendingPayments} pembayaran menunggu`,
      description: "Ada pembayaran transaksi yang belum terverifikasi.",
      href: "/admin/penjualan",
      tone: "warning",
    });
  }

  if (failedHardwareJobsToday > 0) {
    operationalAlerts.push({
      id: "failed-hardware-jobs",
      title: `${failedHardwareJobsToday} print job gagal pada periode ini`,
      description: "Cek Hardware Hub dan retry job yang gagal.",
      href: "/admin/operasional/hardware",
      tone: "danger",
    });
  }

  if (pendingApprovals > 0) {
    operationalAlerts.push({
      id: "pending-approvals",
      title: `${pendingApprovals} persetujuan menunggu`,
      description: "Ada request operasional yang perlu ditinjau.",
      href: "/admin/operasional/approval",
      tone: "danger",
    });
  }

  if (activeShifts > 0) {
    const latestShift = activeShiftRows[0];

    operationalAlerts.push({
      id: "active-shifts",
      title: `${activeShifts} shift kasir masih aktif`,
      description: latestShift
        ? `${latestShift.outletName} / ${latestShift.registerName} dibuka ${getTimeLabel(latestShift.openedAt)} oleh ${latestShift.openedByName ?? "staff"}.`
        : "Ada shift kasir yang masih berjalan.",
      href: "/admin/operasional/shift",
      tone: "neutral",
    });
  }

  if (activeHeldCarts > 0) {
    operationalAlerts.push({
      id: "active-held-carts",
      title: `${activeHeldCarts} transaksi tertahan`,
      description: "Ada cart POS yang masih dalam status hold.",
      href: "/pos/transaksi",
      tone: "warning",
    });
  }

  if (itemsWithoutPrice > 0) {
    operationalAlerts.push({
      id: "items-without-price",
      title: `${itemsWithoutPrice} item tersedia belum punya harga`,
      description: "Lengkapi harga jual sebelum item masuk transaksi POS.",
      href: "/admin/inventaris",
      tone: "warning",
    });
  }

  if (offlineAgents > 0) {
    operationalAlerts.push({
      id: "offline-hardware-agents",
      title: `${offlineAgents} Hardware Hub offline`,
      description: "Periksa Mini PC, koneksi internet, atau agent printer outlet.",
      href: "/admin/operasional/hardware",
      tone: "danger",
    });
  }

  if (operationalAlerts.length === 0) {
    operationalAlerts.push({
      id: "all-clear",
      title: "Operasional terlihat normal",
      description: "Belum ada payment pending, approval, atau print job gagal.",
      href: "/admin/operasional",
      tone: "success",
    });
  }

  const recentActivities: AdminDashboardRecentActivity[] = auditRows.map((row) => {
    const afterData = toRecord(row.afterData);

    return {
      id: row.id,
      title: createActivityTitle(row.action),
      description: createActivityDescription({
        action: row.action,
        afterData,
        createdAt: row.createdAt,
      }),
      value: row.action === "sale.completed" ? readNumber(afterData.totalAmount) : null,
      kind: getActivityKind(row.action),
      createdAt: row.createdAt,
    };
  });

  return {
    period,
    summary: {
      revenue: {
        current: todayRevenue,
        previous: yesterdayRevenue,
      },
      transactionCount: {
        current: todayTransactionCount,
        previous: yesterdayTransactionCount,
      },
      itemSold: {
        current: todayItemSold,
        previous: yesterdayItemSold,
      },
      averageTransaction: {
        current: todayAverageTransaction,
        previous: yesterdayAverageTransaction,
      },
      availableStock: Number(inventoryRows[0]?.availableStock ?? 0),
      activeHeldCarts,
      activeShifts,
      failedHardwareJobsToday,
    },
    trend,
    topProducts: topProductRows.map((row, index) => ({
      rank: index + 1,
      productId: row.productId,
      productName: row.productName,
      itemSold: Number(row.itemSold ?? 0),
      revenue: toNumber(row.revenue),
      items: topProductItemsByProductId.get(row.productId) ?? [],
    })),
    recentTransactions: recentTransactionRows.map((row) => ({
      ...row,
      totalAmount: toNumber(row.totalAmount),
    })),
    operationalAlerts: operationalAlerts.slice(0, 5),
    recentActivities,
  };
}
