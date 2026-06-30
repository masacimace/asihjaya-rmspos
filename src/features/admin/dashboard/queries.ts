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
  AdminDashboardOperationalAlert,
  AdminDashboardRecentActivity,
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

function createTrendSkeleton(now: Date): AdminDashboardTrendPoint[] {
  return Array.from({ length: 7 }, (_, index) => {
    const start = getJakartaDayStartUtc(now, index - 6);

    return {
      dateKey: getJakartaDateKey(start),
      label: getJakartaShortDateLabel(start),
      revenue: 0,
      transactionCount: 0,
      itemSold: 0,
    };
  });
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

function createEmptyDashboard(): AdminDashboardData {
  return {
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
    trend: createTrendSkeleton(new Date()),
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
): Promise<AdminDashboardData> {
  const outletIds = auth.outlets.map((outlet) => outlet.id);

  if (outletIds.length === 0) {
    return createEmptyDashboard();
  }

  const now = new Date();
  const todayStart = getJakartaDayStartUtc(now);
  const tomorrowStart = getJakartaDayStartUtc(now, 1);
  const yesterdayStart = getJakartaDayStartUtc(now, -1);
  const trendStart = getJakartaDayStartUtc(now, -6);
  const topProductStart = getJakartaDayStartUtc(now, -29);
  const staleAgentCutoff = new Date(now.getTime() - 5 * 60 * 1000);
  const localDaySql = sql<string>`to_char(${sales.completedAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`;

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
          gte(sales.completedAt, todayStart),
          lt(sales.completedAt, tomorrowStart),
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
          gte(sales.completedAt, yesterdayStart),
          lt(sales.completedAt, todayStart),
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
          gte(sales.completedAt, todayStart),
          lt(sales.completedAt, tomorrowStart),
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
          gte(sales.completedAt, yesterdayStart),
          lt(sales.completedAt, todayStart),
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
          gte(hardwareJobs.createdAt, todayStart),
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
        day: localDaySql,
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
          lt(sales.completedAt, tomorrowStart),
        ),
      )
      .groupBy(localDaySql)
      .orderBy(localDaySql),

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
          gte(sales.completedAt, topProductStart),
          lt(sales.completedAt, tomorrowStart),
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
      row.day,
      {
        revenue: toNumber(row.revenue),
        transactionCount: Number(row.transactionCount ?? 0),
      },
    ]),
  );

  const trend = createTrendSkeleton(now).map((point) => {
    const row = trendByDate.get(point.dateKey);

    return {
      ...point,
      revenue: row?.revenue ?? 0,
      transactionCount: row?.transactionCount ?? 0,
    };
  });

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
      title: `${failedHardwareJobsToday} print job gagal hari ini`,
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
    })),
    recentTransactions: recentTransactionRows.map((row) => ({
      ...row,
      totalAmount: toNumber(row.totalAmount),
    })),
    operationalAlerts: operationalAlerts.slice(0, 5),
    recentActivities,
  };
}
