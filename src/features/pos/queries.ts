import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import {
  cashMovements,
  customers,
  hardwareAgents,
  hardwareJobs,
  outlets,
  payments,
  posHeldCartItems,
  posHeldCarts,
  productCategories,
  productItems,
  productMasters,
  registers,
  saleItems,
  sales,
  shifts,
  users,
} from "@/db/schema";
import {
  POS_INITIAL_ITEM_LIMIT,
  type PosAvailableItem,
  type PosCustomerOption,
  type PosCustomerListData,
  type PosHeldCartItem,
  type PosHeldCartListData,
  type PosInitialData,
  type PosScanLookupResult,
  type PosShiftOverviewData,
  type PosTransactionDetailData,
  type PosTransactionListData,
  type PosTransactionRange,
} from "@/features/pos/contracts";

type ScannedPosItemRow = PosAvailableItem & {
  isActive: boolean;
  availability: "draft" | "available" | "reserved" | "sold";
  condition: "good" | "damaged" | "lost" | "returned";
  locationState: "outlet" | "warehouse" | "in_transit" | "customer" | "repair";
  productStatus: "draft" | "active" | "inactive";
  categoryIsActive: boolean;
};

const itemAvailabilityLabels: Record<
  ScannedPosItemRow["availability"],
  string
> = {
  draft: "masih draft",
  available: "tersedia",
  reserved: "sedang di-reserve",
  sold: "sudah terjual",
};

const itemConditionLabels: Record<ScannedPosItemRow["condition"], string> = {
  good: "baik",
  damaged: "rusak",
  lost: "hilang",
  returned: "retur",
};

const itemLocationLabels: Record<ScannedPosItemRow["locationState"], string> = {
  outlet: "outlet",
  warehouse: "gudang",
  in_transit: "dalam pengiriman",
  customer: "customer",
  repair: "perbaikan",
};

function mapScannedRowToAvailableItem(
  row: ScannedPosItemRow,
): PosAvailableItem {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    qrValue: row.qrValue,
    serialNumber: row.serialNumber,
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    weightGram: row.weightGram,
    purityPercent: row.purityPercent,
    exchangePurityPercent: row.exchangePurityPercent,
    size: row.size,
    color: row.color,
    gemstone: row.gemstone,
    sellingAmount: row.sellingAmount,
    imageKey: row.imageKey,
    productImageKey: row.productImageKey,
    outletId: row.outletId,
    outletCode: row.outletCode,
    outletName: row.outletName,
  };
}

function activeHeldItemNotExistsCondition() {
  return sql`not exists (
    select 1
    from ${posHeldCartItems}
    where ${posHeldCartItems.productItemId} = ${productItems.id}
      and ${posHeldCartItems.isActive} = true
  )`;
}

type HeldCartItemRow = PosHeldCartItem & {
  heldCartId: string;
};

function mapHeldCartItemRow(row: HeldCartItemRow): PosHeldCartItem {
  return {
    id: row.id,
    sku: row.sku,
    barcode: row.barcode,
    qrValue: row.qrValue,
    serialNumber: row.serialNumber,
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    weightGram: row.weightGram,
    purityPercent: row.purityPercent,
    exchangePurityPercent: row.exchangePurityPercent,
    size: row.size,
    color: row.color,
    gemstone: row.gemstone,
    sellingAmount: row.sellingAmount,
    imageKey: row.imageKey,
    productImageKey: row.productImageKey,
    outletId: row.outletId,
    outletCode: row.outletCode,
    outletName: row.outletName,
    lineNumber: row.lineNumber,
    listPriceAmount: row.listPriceAmount,
    discountAmount: row.discountAmount,
    finalPriceAmount: row.finalPriceAmount,
  };
}

function parseAmount(amount: string | null) {
  if (!amount) {
    return 0;
  }

  const parsedAmount = Number(amount);

  return Number.isFinite(parsedAmount) ? parsedAmount : 0;
}

function getScannedItemUnavailableMessage({
  row,
  outletId,
}: {
  row: ScannedPosItemRow;
  outletId: string;
}) {
  if (!row.isActive) {
    return `${row.sku} tidak aktif atau sudah diarsipkan.`;
  }

  if (row.productStatus !== "active") {
    return `${row.sku} belum bisa dijual karena produk master belum aktif.`;
  }

  if (!row.categoryIsActive) {
    return `${row.sku} belum bisa dijual karena kategori produk tidak aktif.`;
  }

  if (row.outletId !== outletId) {
    return `${row.sku} berada di ${row.outletName ?? "outlet lain"}, bukan outlet aktif POS ini.`;
  }

  if (row.availability !== "available") {
    return `${row.sku} tidak tersedia untuk dijual karena status item ${itemAvailabilityLabels[row.availability]}.`;
  }

  if (row.condition !== "good") {
    return `${row.sku} tidak bisa dijual karena kondisi item ${itemConditionLabels[row.condition]}.`;
  }

  if (row.locationState !== "outlet") {
    return `${row.sku} tidak berada di area jual outlet karena lokasi item ${itemLocationLabels[row.locationState]}.`;
  }

  if (parseAmount(row.sellingAmount) <= 0) {
    return `${row.sku} belum memiliki harga jual. Lengkapi harga sebelum transaksi.`;
  }

  return `${row.sku} belum memenuhi syarat untuk masuk transaksi POS.`;
}

export async function getPosInitialData({
  organizationId,
  outletId,
}: {
  organizationId: string;
  outletId?: string | null;
}): Promise<PosInitialData> {
  if (!outletId) {
    return {
      context: {
        outlet: null,
        register: null,
        activeShift: null,
      },
      categories: [],
      items: [],
      customers: [],
    };
  }

  const outletRows = await db
    .select({
      id: outlets.id,
      code: outlets.code,
      name: outlets.name,
    })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, outletId),
        eq(outlets.organizationId, organizationId),
        eq(outlets.isActive, true),
      ),
    )
    .limit(1);

  const outlet = outletRows[0] ?? null;

  if (!outlet) {
    return {
      context: {
        outlet: null,
        register: null,
        activeShift: null,
      },
      categories: [],
      items: [],
      customers: [],
    };
  }

  const [registerRows, categoryRows, itemRows, customerRows] =
    await Promise.all([
      db
        .select({
          id: registers.id,
          code: registers.code,
          name: registers.name,
          isHardwareHub: registers.isHardwareHub,
        })
        .from(registers)
        .where(
          and(eq(registers.outletId, outlet.id), eq(registers.isActive, true)),
        )
        .orderBy(desc(registers.isHardwareHub), asc(registers.name))
        .limit(1),

      db
        .select({
          id: productCategories.id,
          code: productCategories.code,
          name: productCategories.name,
          totalAvailableItems: count(productItems.id),
        })
        .from(productCategories)
        .leftJoin(
          productMasters,
          and(
            eq(productMasters.categoryId, productCategories.id),
            eq(productMasters.organizationId, organizationId),
            eq(productMasters.status, "active"),
          ),
        )
        .leftJoin(
          productItems,
          and(
            eq(productItems.productMasterId, productMasters.id),
            eq(productItems.organizationId, organizationId),
            eq(productItems.currentOutletId, outlet.id),
            eq(productItems.isActive, true),
            eq(productItems.availability, "available"),
            eq(productItems.condition, "good"),
            eq(productItems.locationState, "outlet"),
            activeHeldItemNotExistsCondition(),
          ),
        )
        .where(
          and(
            eq(productCategories.organizationId, organizationId),
            eq(productCategories.isActive, true),
          ),
        )
        .groupBy(
          productCategories.id,
          productCategories.code,
          productCategories.name,
          productCategories.displayOrder,
        )
        .orderBy(
          asc(productCategories.displayOrder),
          asc(productCategories.name),
        ),

      db
        .select({
          id: productItems.id,
          sku: productItems.sku,
          barcode: productItems.barcode,
          qrValue: productItems.qrValue,
          serialNumber: productItems.serialNumber,
          weightGram: productItems.weightGram,
          purityPercent: productItems.purityPercent,
          exchangePurityPercent: productItems.exchangePurityPercent,
          size: productItems.size,
          color: productItems.color,
          gemstone: productItems.gemstone,
          sellingAmount: productItems.sellingAmount,
          imageKey: productItems.imageKey,
          productImageKey: productMasters.imageKey,
          productId: productMasters.id,
          productCode: productMasters.code,
          productName: productMasters.name,
          categoryId: productCategories.id,
          categoryName: productCategories.name,
          outletId: outlets.id,
          outletCode: outlets.code,
          outletName: outlets.name,
        })
        .from(productItems)
        .innerJoin(
          productMasters,
          eq(productItems.productMasterId, productMasters.id),
        )
        .innerJoin(
          productCategories,
          eq(productMasters.categoryId, productCategories.id),
        )
        .leftJoin(outlets, eq(productItems.currentOutletId, outlets.id))
        .where(
          and(
            eq(productItems.organizationId, organizationId),
            eq(productItems.currentOutletId, outlet.id),
            eq(productItems.isActive, true),
            eq(productItems.availability, "available"),
            eq(productItems.condition, "good"),
            eq(productItems.locationState, "outlet"),
            eq(productMasters.status, "active"),
            eq(productCategories.isActive, true),
            activeHeldItemNotExistsCondition(),
          ),
        )
        .orderBy(desc(productItems.updatedAt), asc(productItems.sku))
        .limit(POS_INITIAL_ITEM_LIMIT),

      db
        .select({
          id: customers.id,
          customerCode: customers.customerCode,
          fullName: customers.fullName,
          phone: customers.phone,
          email: customers.email,
        })
        .from(customers)
        .where(
          and(
            eq(customers.organizationId, organizationId),
            eq(customers.isActive, true),
          ),
        )
        .orderBy(asc(customers.fullName), desc(customers.createdAt))
        .limit(80),
    ]);

  const register = registerRows[0] ?? null;

  const activeShiftRows = register
    ? await db
        .select({
          id: shifts.id,
          status: shifts.status,
          openedAt: shifts.openedAt,
          openedByName: users.fullName,
          openingCash: shifts.openingCash,
          expectedCash: shifts.expectedCash,
        })
        .from(shifts)
        .leftJoin(users, eq(shifts.openedBy, users.id))
        .where(
          and(
            eq(shifts.outletId, outlet.id),
            eq(shifts.registerId, register.id),
            eq(shifts.status, "open"),
          ),
        )
        .orderBy(desc(shifts.openedAt))
        .limit(1)
    : [];

  return {
    context: {
      outlet,
      register,
      activeShift: activeShiftRows[0] ?? null,
    },
    categories: categoryRows.map((category) => ({
      ...category,
      totalAvailableItems: Number(category.totalAvailableItems),
    })),
    items: itemRows,
    customers: customerRows satisfies PosCustomerOption[],
  } satisfies PosInitialData;
}

export async function lookupPosItemByScanValue({
  organizationId,
  outletId,
  scanValue,
}: {
  organizationId: string;
  outletId: string;
  scanValue: string;
}): Promise<PosScanLookupResult> {
  const normalizedScanValue = scanValue.trim();

  if (!normalizedScanValue) {
    return {
      status: "invalid",
      message: "Masukkan barcode, QR value, serial number, atau SKU item.",
    };
  }

  if (normalizedScanValue.length > 220) {
    return {
      status: "invalid",
      message: "Kode hasil scan terlalu panjang dan tidak valid.",
    };
  }

  const rows = await db
    .select({
      id: productItems.id,
      sku: productItems.sku,
      barcode: productItems.barcode,
      qrValue: productItems.qrValue,
      serialNumber: productItems.serialNumber,
      weightGram: productItems.weightGram,
      purityPercent: productItems.purityPercent,
      exchangePurityPercent: productItems.exchangePurityPercent,
      size: productItems.size,
      color: productItems.color,
      gemstone: productItems.gemstone,
      sellingAmount: productItems.sellingAmount,
      imageKey: productItems.imageKey,
      productImageKey: productMasters.imageKey,
      productId: productMasters.id,
      productCode: productMasters.code,
      productName: productMasters.name,
      categoryId: productCategories.id,
      categoryName: productCategories.name,
      outletId: outlets.id,
      outletCode: outlets.code,
      outletName: outlets.name,
      isActive: productItems.isActive,
      availability: productItems.availability,
      condition: productItems.condition,
      locationState: productItems.locationState,
      productStatus: productMasters.status,
      categoryIsActive: productCategories.isActive,
    })
    .from(productItems)
    .innerJoin(
      productMasters,
      eq(productItems.productMasterId, productMasters.id),
    )
    .innerJoin(
      productCategories,
      eq(productMasters.categoryId, productCategories.id),
    )
    .leftJoin(outlets, eq(productItems.currentOutletId, outlets.id))
    .where(
      and(
        eq(productItems.organizationId, organizationId),
        or(
          eq(productItems.barcode, normalizedScanValue),
          eq(productItems.sku, normalizedScanValue),
          eq(productItems.qrValue, normalizedScanValue),
          eq(productItems.serialNumber, normalizedScanValue),
        ),
      ),
    )
    .limit(1);

  const row = rows[0];

  if (!row) {
    return {
      status: "not_found",
      message: `${normalizedScanValue} tidak ditemukan di inventory Asihjaya.`,
    };
  }

  const [activeHold] = await db
    .select({
      holdNumber: posHeldCarts.holdNumber,
      title: posHeldCarts.title,
    })
    .from(posHeldCartItems)
    .innerJoin(posHeldCarts, eq(posHeldCartItems.heldCartId, posHeldCarts.id))
    .where(
      and(
        eq(posHeldCartItems.productItemId, row.id),
        eq(posHeldCartItems.isActive, true),
        eq(posHeldCarts.organizationId, organizationId),
        eq(posHeldCarts.outletId, outletId),
        eq(posHeldCarts.status, "active"),
      ),
    )
    .limit(1);

  if (activeHold) {
    return {
      status: "unavailable",
      message: `${row.sku} sedang ditahan di ${activeHold.holdNumber}${activeHold.title ? ` (${activeHold.title})` : ""}. Resume atau batalkan hold tersebut sebelum menjual item ini.`,
    };
  }

  const isAvailableForPos =
    row.isActive &&
    row.productStatus === "active" &&
    row.categoryIsActive &&
    row.outletId === outletId &&
    row.availability === "available" &&
    row.condition === "good" &&
    row.locationState === "outlet" &&
    parseAmount(row.sellingAmount) > 0;

  if (!isAvailableForPos) {
    return {
      status: "unavailable",
      message: getScannedItemUnavailableMessage({ row, outletId }),
    };
  }

  return {
    status: "found",
    item: mapScannedRowToAvailableItem(row),
    message: `${row.sku} ditemukan dan siap ditambahkan ke keranjang.`,
  };
}

const HARDWARE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
const HARDWARE_STALE_WINDOW_MS = 10 * 60 * 1000;

export type PosShellStatus = {
  outletName: string;
  registerName: string | null;
  shift: {
    status: "open" | "closed" | "not_configured";
    openedAt: Date | null;
    openingCash: string | null;
    expectedCash: string | null;
    label: string;
  };
  hardware: {
    status: "online" | "stale" | "offline" | "disabled" | "not_configured";
    label: string;
    agentName: string | null;
    lastSeenAt: Date | null;
    hasConfigWarnings: boolean;
  };
};

function readConfigWarnings(value: unknown) {
  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const warnings = record.config_warnings;

  return Array.isArray(warnings)
    ? warnings.filter(
        (warning): warning is string => typeof warning === "string",
      )
    : [];
}

function getHardwareStatus({
  agent,
  now,
}: {
  agent: {
    name: string;
    status: "online" | "offline" | "disabled";
    isActive: boolean;
    lastSeenAt: Date | null;
    capabilities: Record<string, unknown> | null;
  } | null;
  now: Date;
}): PosShellStatus["hardware"] {
  if (!agent) {
    return {
      status: "not_configured",
      label: "Hardware Hub belum dibuat",
      agentName: null,
      lastSeenAt: null,
      hasConfigWarnings: false,
    };
  }

  const hasConfigWarnings = readConfigWarnings(agent.capabilities).length > 0;

  if (!agent.isActive || agent.status === "disabled") {
    return {
      status: "disabled",
      label: "Hardware Hub nonaktif",
      agentName: agent.name,
      lastSeenAt: agent.lastSeenAt,
      hasConfigWarnings,
    };
  }

  if (!agent.lastSeenAt) {
    return {
      status: "offline",
      label: "Hardware Hub offline",
      agentName: agent.name,
      lastSeenAt: null,
      hasConfigWarnings,
    };
  }

  const diffMs = now.getTime() - agent.lastSeenAt.getTime();

  if (agent.status === "online" && diffMs <= HARDWARE_ONLINE_WINDOW_MS) {
    return {
      status: hasConfigWarnings ? "stale" : "online",
      label: hasConfigWarnings ? "Hardware perlu cek" : "Hardware Hub online",
      agentName: agent.name,
      lastSeenAt: agent.lastSeenAt,
      hasConfigWarnings,
    };
  }

  if (diffMs <= HARDWARE_STALE_WINDOW_MS) {
    return {
      status: "stale",
      label: "Hardware perlu cek",
      agentName: agent.name,
      lastSeenAt: agent.lastSeenAt,
      hasConfigWarnings,
    };
  }

  return {
    status: "offline",
    label: "Hardware Hub offline",
    agentName: agent.name,
    lastSeenAt: agent.lastSeenAt,
    hasConfigWarnings,
  };
}

function getOutletHardwareBadgeStatus(
  agent: {
    status: "online" | "offline" | "disabled";
    isActive: boolean;
    lastSeenAt: Date | null;
  } | null,
  now: Date,
): "online" | "offline" {
  if (!agent?.isActive || agent.status !== "online" || !agent.lastSeenAt) {
    return "offline";
  }

  const diffMs = now.getTime() - agent.lastSeenAt.getTime();

  return diffMs <= HARDWARE_ONLINE_WINDOW_MS ? "online" : "offline";
}

export async function getPosShellStatus({
  organizationId,
  outletId,
}: {
  organizationId: string;
  outletId?: string | null;
}): Promise<PosShellStatus> {
  const emptyStatus: PosShellStatus = {
    outletName: "Outlet belum dipilih",
    registerName: null,
    shift: {
      status: "not_configured",
      openedAt: null,
      openingCash: null,
      expectedCash: null,
      label: "Outlet belum dipilih",
    },
    hardware: {
      status: "not_configured",
      label: "Hardware Hub belum dicek",
      agentName: null,
      lastSeenAt: null,
      hasConfigWarnings: false,
    },
  };

  if (!outletId) {
    return emptyStatus;
  }

  const outletRows = await db
    .select({
      id: outlets.id,
      name: outlets.name,
    })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, outletId),
        eq(outlets.organizationId, organizationId),
        eq(outlets.isActive, true),
      ),
    )
    .limit(1);

  const outlet = outletRows[0] ?? null;

  if (!outlet) {
    return emptyStatus;
  }

  const registerRows = await db
    .select({
      id: registers.id,
      name: registers.name,
    })
    .from(registers)
    .where(and(eq(registers.outletId, outlet.id), eq(registers.isActive, true)))
    .orderBy(desc(registers.isHardwareHub), asc(registers.name))
    .limit(1);

  const register = registerRows[0] ?? null;

  if (!register) {
    return {
      outletName: outlet.name,
      registerName: null,
      shift: {
        status: "not_configured",
        openedAt: null,
        openingCash: null,
        expectedCash: null,
        label: "Register belum tersedia",
      },
      hardware: {
        status: "not_configured",
        label: "Register belum tersedia",
        agentName: null,
        lastSeenAt: null,
        hasConfigWarnings: false,
      },
    };
  }

  const [activeShiftRows, agentRows] = await Promise.all([
    db
      .select({
        id: shifts.id,
        openedAt: shifts.openedAt,
        openingCash: shifts.openingCash,
        expectedCash: shifts.expectedCash,
      })
      .from(shifts)
      .where(
        and(
          eq(shifts.outletId, outlet.id),
          eq(shifts.registerId, register.id),
          eq(shifts.status, "open"),
        ),
      )
      .orderBy(desc(shifts.openedAt))
      .limit(1),

    db
      .select({
        name: hardwareAgents.name,
        status: hardwareAgents.status,
        isActive: hardwareAgents.isActive,
        lastSeenAt: hardwareAgents.lastSeenAt,
        capabilities: hardwareAgents.capabilities,
      })
      .from(hardwareAgents)
      .where(
        and(
          eq(hardwareAgents.organizationId, organizationId),
          eq(hardwareAgents.outletId, outlet.id),
          eq(hardwareAgents.registerId, register.id),
        ),
      )
      .orderBy(desc(hardwareAgents.lastSeenAt), desc(hardwareAgents.updatedAt))
      .limit(1),
  ]);

  const activeShift = activeShiftRows[0] ?? null;

  return {
    outletName: outlet.name,
    registerName: register.name,
    shift: activeShift
      ? {
          status: "open",
          openedAt: activeShift.openedAt,
          openingCash: activeShift.openingCash,
          expectedCash: activeShift.expectedCash,
          label: "Shift aktif",
        }
      : {
          status: "closed",
          openedAt: null,
          openingCash: null,
          expectedCash: null,
          label: "Shift belum aktif",
        },
    hardware: getHardwareStatus({
      agent: agentRows[0] ?? null,
      now: new Date(),
    }),
  };
}

const POS_TRANSACTION_LIST_LIMIT = 50;
const POS_CUSTOMER_LIST_LIMIT = 80;

function parseTransactionAmount(value: string | number | null) {
  const parsedValue = typeof value === "number" ? value : Number(value ?? 0);

  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getPaymentStatusFromAmounts(
  totalAmount: number,
  paidAmount: number,
): "paid" | "partial" | "pending" {
  if (paidAmount >= totalAmount) {
    return "paid";
  }

  if (paidAmount > 0) {
    return "partial";
  }

  return "pending";
}

function normalizeTransactionRange(range?: string | null): PosTransactionRange {
  if (range === "7d" || range === "30d" || range === "all") {
    return range;
  }

  return "today";
}

function getTransactionRangeStart(range: PosTransactionRange) {
  if (range === "all") {
    return null;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (range === "7d") {
    start.setDate(start.getDate() - 6);
  }

  if (range === "30d") {
    start.setDate(start.getDate() - 29);
  }

  return start;
}

function createEmptyPosShiftOverview(): PosShiftOverviewData {
  return {
    outlet: null,
    register: null,
    activeShift: null,
    recentTransactions: [],
  };
}

function createEmptyShiftCashSummary(openingCash = 0) {
  return {
    openingBalance: openingCash,
    cashSales: 0,
    cashIn: 0,
    cashOut: 0,
    cashRefunds: 0,
    closingAdjustments: 0,
    expectedCash: openingCash,
    movementCount: 0,
  };
}

function summarizeShiftCashMovements(
  movements: Array<{
    type: string;
    amount: string | number | null;
  }>,
  fallbackOpeningCash: string | number | null,
): NonNullable<PosShiftOverviewData["activeShift"]>["cashSummary"] {
  const fallbackOpeningCashAmount = parseTransactionAmount(fallbackOpeningCash);
  const summary = createEmptyShiftCashSummary(0);

  for (const movement of movements) {
    const amount = parseTransactionAmount(movement.amount);

    if (movement.type === "opening_balance") {
      summary.openingBalance += amount;
      continue;
    }

    if (movement.type === "cash_sale") {
      summary.cashSales += amount;
      continue;
    }

    if (movement.type === "cash_in") {
      summary.cashIn += amount;
      continue;
    }

    if (movement.type === "cash_out") {
      summary.cashOut += amount;
      continue;
    }

    if (movement.type === "cash_refund") {
      summary.cashRefunds += amount;
      continue;
    }

    if (movement.type === "closing_adjustment") {
      summary.closingAdjustments += amount;
    }
  }

  summary.movementCount = movements.length;

  if (
    summary.openingBalance === 0 &&
    !movements.some((movement) => movement.type === "opening_balance")
  ) {
    summary.openingBalance = fallbackOpeningCashAmount;
  }

  summary.expectedCash =
    summary.openingBalance +
    summary.cashSales +
    summary.cashIn +
    summary.closingAdjustments -
    summary.cashOut -
    summary.cashRefunds;

  return summary;
}

export async function getPosHeldCartListData({
  organizationId,
  outletId,
  query,
}: {
  organizationId: string;
  outletId?: string | null;
  query?: string | null;
}): Promise<PosHeldCartListData> {
  const normalizedQuery = query?.trim() ?? "";

  if (!outletId) {
    return {
      outlet: null,
      register: null,
      query: normalizedQuery,
      heldCarts: [],
      summary: {
        totalHeldCarts: 0,
        totalItems: 0,
        totalAmount: 0,
      },
    };
  }

  const outletRows = await db
    .select({
      id: outlets.id,
      code: outlets.code,
      name: outlets.name,
    })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, outletId),
        eq(outlets.organizationId, organizationId),
        eq(outlets.isActive, true),
      ),
    )
    .limit(1);

  const outlet = outletRows[0] ?? null;

  if (!outlet) {
    return {
      outlet: null,
      register: null,
      query: normalizedQuery,
      heldCarts: [],
      summary: {
        totalHeldCarts: 0,
        totalItems: 0,
        totalAmount: 0,
      },
    };
  }

  const [registerRows, hardwareAgentRows] = await Promise.all([
    db
      .select({
        id: registers.id,
        code: registers.code,
        name: registers.name,
        isHardwareHub: registers.isHardwareHub,
      })
      .from(registers)
      .where(
        and(eq(registers.outletId, outlet.id), eq(registers.isActive, true)),
      )
      .orderBy(desc(registers.isHardwareHub), asc(registers.name))
      .limit(1),

    db
      .select({
        status: hardwareAgents.status,
        isActive: hardwareAgents.isActive,
        lastSeenAt: hardwareAgents.lastSeenAt,
      })
      .from(hardwareAgents)
      .where(
        and(
          eq(hardwareAgents.organizationId, organizationId),
          eq(hardwareAgents.outletId, outlet.id),
          eq(hardwareAgents.isActive, true),
        ),
      )
      .orderBy(desc(hardwareAgents.lastSeenAt), desc(hardwareAgents.updatedAt))
      .limit(1),
  ]);

  const register = registerRows[0] ?? null;
  const outletWithHardwareStatus = {
    ...outlet,
    hardwareStatus: getOutletHardwareBadgeStatus(
      hardwareAgentRows[0] ?? null,
      new Date(),
    ),
  };

  if (!register) {
    return {
      outlet: outletWithHardwareStatus,
      register: null,
      query: normalizedQuery,
      heldCarts: [],
      summary: {
        totalHeldCarts: 0,
        totalItems: 0,
        totalAmount: 0,
      },
    };
  }

  const filters: SQL[] = [
    eq(posHeldCarts.organizationId, organizationId),
    eq(posHeldCarts.outletId, outlet.id),
    eq(posHeldCarts.registerId, register.id),
    eq(posHeldCarts.status, "active"),
  ];

  if (normalizedQuery) {
    const searchPattern = `%${normalizedQuery}%`;
    const itemHeldCartRows = await db
      .selectDistinct({
        heldCartId: posHeldCartItems.heldCartId,
      })
      .from(posHeldCartItems)
      .innerJoin(posHeldCarts, eq(posHeldCartItems.heldCartId, posHeldCarts.id))
      .innerJoin(
        productItems,
        eq(posHeldCartItems.productItemId, productItems.id),
      )
      .innerJoin(
        productMasters,
        eq(productItems.productMasterId, productMasters.id),
      )
      .where(
        and(
          eq(posHeldCarts.organizationId, organizationId),
          eq(posHeldCarts.outletId, outlet.id),
          eq(posHeldCarts.registerId, register.id),
          eq(posHeldCarts.status, "active"),
          eq(posHeldCartItems.isActive, true),
          or(
            ilike(productItems.sku, searchPattern),
            ilike(productItems.barcode, searchPattern),
            ilike(productItems.serialNumber, searchPattern),
            ilike(productMasters.code, searchPattern),
            ilike(productMasters.name, searchPattern),
          ),
        ),
      )
      .limit(80);

    const matchingHeldCartIds = itemHeldCartRows.map((row) => row.heldCartId);
    const searchCondition = or(
      ilike(posHeldCarts.holdNumber, searchPattern),
      ilike(posHeldCarts.title, searchPattern),
      ilike(posHeldCarts.note, searchPattern),
      ilike(customers.customerCode, searchPattern),
      ilike(customers.fullName, searchPattern),
      ilike(customers.phone, searchPattern),
      matchingHeldCartIds.length > 0
        ? inArray(posHeldCarts.id, matchingHeldCartIds)
        : undefined,
    );

    if (searchCondition) {
      filters.push(searchCondition);
    }
  }

  const heldCartRows = await db
    .select({
      id: posHeldCarts.id,
      holdNumber: posHeldCarts.holdNumber,
      status: posHeldCarts.status,
      title: posHeldCarts.title,
      note: posHeldCarts.note,
      itemCount: posHeldCarts.itemCount,
      subtotalAmount: posHeldCarts.subtotalAmount,
      discountAmount: posHeldCarts.discountAmount,
      totalAmount: posHeldCarts.totalAmount,
      createdAt: posHeldCarts.createdAt,
      updatedAt: posHeldCarts.updatedAt,
      shiftId: posHeldCarts.shiftId,
      registerId: posHeldCarts.registerId,
      customerId: customers.id,
      customerCode: customers.customerCode,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      customerEmail: customers.email,
      heldByUserId: users.id,
      heldByName: users.fullName,
    })
    .from(posHeldCarts)
    .leftJoin(customers, eq(posHeldCarts.customerId, customers.id))
    .innerJoin(users, eq(posHeldCarts.heldByUserId, users.id))
    .where(and(...filters))
    .orderBy(desc(posHeldCarts.createdAt))
    .limit(50);

  const heldCartIds = heldCartRows.map((heldCart) => heldCart.id);

  const heldCartItemRows: HeldCartItemRow[] =
    heldCartIds.length > 0
      ? await db
          .select({
            heldCartId: posHeldCartItems.heldCartId,
            lineNumber: posHeldCartItems.lineNumber,
            listPriceAmount: posHeldCartItems.listPriceAmount,
            discountAmount: posHeldCartItems.discountAmount,
            finalPriceAmount: posHeldCartItems.finalPriceAmount,
            id: productItems.id,
            sku: productItems.sku,
            barcode: productItems.barcode,
            qrValue: productItems.qrValue,
            serialNumber: productItems.serialNumber,
            weightGram: productItems.weightGram,
            purityPercent: productItems.purityPercent,
            exchangePurityPercent: productItems.exchangePurityPercent,
            size: productItems.size,
            color: productItems.color,
            gemstone: productItems.gemstone,
            sellingAmount: productItems.sellingAmount,
            imageKey: productItems.imageKey,
            productImageKey: productMasters.imageKey,
            productId: productMasters.id,
            productCode: productMasters.code,
            productName: productMasters.name,
            categoryId: productCategories.id,
            categoryName: productCategories.name,
            outletId: outlets.id,
            outletCode: outlets.code,
            outletName: outlets.name,
          })
          .from(posHeldCartItems)
          .innerJoin(
            productItems,
            eq(posHeldCartItems.productItemId, productItems.id),
          )
          .innerJoin(
            productMasters,
            eq(productItems.productMasterId, productMasters.id),
          )
          .innerJoin(
            productCategories,
            eq(productMasters.categoryId, productCategories.id),
          )
          .leftJoin(outlets, eq(productItems.currentOutletId, outlets.id))
          .where(
            and(
              inArray(posHeldCartItems.heldCartId, heldCartIds),
              eq(posHeldCartItems.isActive, true),
            ),
          )
          .orderBy(asc(posHeldCartItems.lineNumber))
      : [];

  const itemRowsByHeldCartId = new Map<string, PosHeldCartItem[]>();

  for (const itemRow of heldCartItemRows) {
    const currentItems = itemRowsByHeldCartId.get(itemRow.heldCartId) ?? [];
    currentItems.push(mapHeldCartItemRow(itemRow));
    itemRowsByHeldCartId.set(itemRow.heldCartId, currentItems);
  }

  const heldCarts = heldCartRows.map((heldCart) => ({
    id: heldCart.id,
    holdNumber: heldCart.holdNumber,
    status: heldCart.status,
    title: heldCart.title,
    note: heldCart.note,
    itemCount: heldCart.itemCount,
    subtotalAmount: heldCart.subtotalAmount,
    discountAmount: heldCart.discountAmount,
    totalAmount: heldCart.totalAmount,
    createdAt: heldCart.createdAt,
    updatedAt: heldCart.updatedAt,
    customer: heldCart.customerId
      ? {
          id: heldCart.customerId,
          customerCode: heldCart.customerCode,
          fullName: heldCart.customerName ?? "Customer tanpa nama",
          phone: heldCart.customerPhone,
          email: heldCart.customerEmail,
        }
      : null,
    heldBy: {
      id: heldCart.heldByUserId,
      fullName: heldCart.heldByName,
    },
    shiftId: heldCart.shiftId,
    registerId: heldCart.registerId,
    items: itemRowsByHeldCartId.get(heldCart.id) ?? [],
  }));

  return {
    outlet: outletWithHardwareStatus,
    register,
    query: normalizedQuery,
    heldCarts,
    summary: {
      totalHeldCarts: heldCarts.length,
      totalItems: heldCarts.reduce(
        (total, heldCart) => total + heldCart.itemCount,
        0,
      ),
      totalAmount: heldCarts.reduce(
        (total, heldCart) =>
          total + parseTransactionAmount(heldCart.totalAmount),
        0,
      ),
    },
  } satisfies PosHeldCartListData;
}

export async function getPosCustomerListData({
  organizationId,
  outletId,
  query,
}: {
  organizationId: string;
  outletId?: string | null;
  query?: string | null;
}): Promise<PosCustomerListData> {
  const normalizedQuery = query?.trim() ?? "";

  if (!outletId) {
    return {
      outlet: null,
      query: normalizedQuery,
      customers: [],
      summary: {
        totalCustomers: 0,
        customersWithTransactions: 0,
        totalTransactionAmount: 0,
      },
    };
  }

  const outletRows = await db
    .select({
      id: outlets.id,
      code: outlets.code,
      name: outlets.name,
    })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, outletId),
        eq(outlets.organizationId, organizationId),
        eq(outlets.isActive, true),
      ),
    )
    .limit(1);

  const outlet = outletRows[0] ?? null;

  if (!outlet) {
    return {
      outlet: null,
      query: normalizedQuery,
      customers: [],
      summary: {
        totalCustomers: 0,
        customersWithTransactions: 0,
        totalTransactionAmount: 0,
      },
    };
  }

  const [hardwareAgent] = await db
    .select({
      status: hardwareAgents.status,
      isActive: hardwareAgents.isActive,
      lastSeenAt: hardwareAgents.lastSeenAt,
    })
    .from(hardwareAgents)
    .where(
      and(
        eq(hardwareAgents.organizationId, organizationId),
        eq(hardwareAgents.outletId, outlet.id),
        eq(hardwareAgents.isActive, true),
      ),
    )
    .orderBy(desc(hardwareAgents.lastSeenAt), desc(hardwareAgents.updatedAt))
    .limit(1);

  const outletWithHardwareStatus = {
    ...outlet,
    hardwareStatus: getOutletHardwareBadgeStatus(
      hardwareAgent ?? null,
      new Date(),
    ),
  };

  const filters: SQL[] = [
    eq(customers.organizationId, organizationId),
    eq(customers.isActive, true),
  ];

  if (normalizedQuery) {
    const searchPattern = `%${normalizedQuery}%`;
    const searchCondition = or(
      ilike(customers.customerCode, searchPattern),
      ilike(customers.fullName, searchPattern),
      ilike(customers.phone, searchPattern),
      ilike(customers.email, searchPattern),
    );

    if (searchCondition) {
      filters.push(searchCondition);
    }
  }

  const customerRows = await db
    .select({
      id: customers.id,
      customerCode: customers.customerCode,
      fullName: customers.fullName,
      phone: customers.phone,
      email: customers.email,
      address: customers.address,
      notes: customers.notes,
      isActive: customers.isActive,
      createdAt: customers.createdAt,
    })
    .from(customers)
    .where(and(...filters))
    .orderBy(asc(customers.fullName), desc(customers.createdAt))
    .limit(POS_CUSTOMER_LIST_LIMIT);

  const customerIds = customerRows.map((customer) => customer.id);

  const saleRows =
    customerIds.length > 0
      ? await db
          .select({
            id: sales.id,
            customerId: sales.customerId,
            invoiceNumber: sales.invoiceNumber,
            totalAmount: sales.totalAmount,
            completedAt: sales.completedAt,
            createdAt: sales.createdAt,
          })
          .from(sales)
          .where(
            and(
              eq(sales.organizationId, organizationId),
              eq(sales.outletId, outlet.id),
              eq(sales.status, "completed"),
              inArray(sales.customerId, customerIds),
            ),
          )
          .orderBy(desc(sales.completedAt), desc(sales.createdAt))
      : [];

  const customerMetrics = new Map<
    string,
    {
      totalTransactions: number;
      totalAmount: number;
      lastTransaction: PosCustomerListData["customers"][number]["lastTransaction"];
    }
  >();

  for (const sale of saleRows) {
    if (!sale.customerId) {
      continue;
    }

    const current = customerMetrics.get(sale.customerId) ?? {
      totalTransactions: 0,
      totalAmount: 0,
      lastTransaction: null,
    };

    current.totalTransactions += 1;
    current.totalAmount += parseTransactionAmount(sale.totalAmount);

    const currentLastDate =
      current.lastTransaction?.completedAt?.getTime() ?? 0;
    const saleDate = (sale.completedAt ?? sale.createdAt).getTime();

    if (!current.lastTransaction || saleDate >= currentLastDate) {
      current.lastTransaction = {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        completedAt: sale.completedAt,
        totalAmount: sale.totalAmount,
      };
    }

    customerMetrics.set(sale.customerId, current);
  }

  const customerList = customerRows.map(
    (customer): PosCustomerListData["customers"][number] => {
      const metrics = customerMetrics.get(customer.id) ?? {
        totalTransactions: 0,
        totalAmount: 0,
        lastTransaction: null,
      };

      return {
        id: customer.id,
        customerCode: customer.customerCode,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        notes: customer.notes,
        isActive: customer.isActive,
        createdAt: customer.createdAt,
        totalTransactions: metrics.totalTransactions,
        totalAmount: metrics.totalAmount,
        lastTransaction: metrics.lastTransaction,
      };
    },
  );

  return {
    outlet: outletWithHardwareStatus,
    query: normalizedQuery,
    customers: customerList,
    summary: {
      totalCustomers: customerList.length,
      customersWithTransactions: customerList.filter(
        (customer) => customer.totalTransactions > 0,
      ).length,
      totalTransactionAmount: customerList.reduce(
        (total, customer) => total + customer.totalAmount,
        0,
      ),
    },
  } satisfies PosCustomerListData;
}

export async function getPosShiftOverviewData({
  organizationId,
  outletId,
}: {
  organizationId: string;
  outletId?: string | null;
}): Promise<PosShiftOverviewData> {
  if (!outletId) {
    return createEmptyPosShiftOverview();
  }

  const outletRows = await db
    .select({
      id: outlets.id,
      code: outlets.code,
      name: outlets.name,
    })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, outletId),
        eq(outlets.organizationId, organizationId),
        eq(outlets.isActive, true),
      ),
    )
    .limit(1);

  const outlet = outletRows[0] ?? null;

  if (!outlet) {
    return createEmptyPosShiftOverview();
  }

  const [registerRows, hardwareAgentRows] = await Promise.all([
    db
      .select({
        id: registers.id,
        code: registers.code,
        name: registers.name,
        isHardwareHub: registers.isHardwareHub,
      })
      .from(registers)
      .where(
        and(eq(registers.outletId, outlet.id), eq(registers.isActive, true)),
      )
      .orderBy(desc(registers.isHardwareHub), asc(registers.name))
      .limit(1),

    db
      .select({
        status: hardwareAgents.status,
        isActive: hardwareAgents.isActive,
        lastSeenAt: hardwareAgents.lastSeenAt,
      })
      .from(hardwareAgents)
      .where(
        and(
          eq(hardwareAgents.organizationId, organizationId),
          eq(hardwareAgents.outletId, outlet.id),
          eq(hardwareAgents.isActive, true),
        ),
      )
      .orderBy(desc(hardwareAgents.lastSeenAt), desc(hardwareAgents.updatedAt))
      .limit(1),
  ]);

  const register = registerRows[0] ?? null;
  const outletWithHardwareStatus = {
    ...outlet,
    hardwareStatus: getOutletHardwareBadgeStatus(
      hardwareAgentRows[0] ?? null,
      new Date(),
    ),
  };

  if (!register) {
    return {
      outlet: outletWithHardwareStatus,
      register: null,
      activeShift: null,
      recentTransactions: [],
    };
  }

  const activeShiftRows = await db
    .select({
      id: shifts.id,
      status: shifts.status,
      openedAt: shifts.openedAt,
      openedByName: users.fullName,
      openingCash: shifts.openingCash,
      expectedCash: shifts.expectedCash,
    })
    .from(shifts)
    .leftJoin(users, eq(shifts.openedBy, users.id))
    .where(
      and(
        eq(shifts.outletId, outlet.id),
        eq(shifts.registerId, register.id),
        eq(shifts.status, "open"),
      ),
    )
    .orderBy(desc(shifts.openedAt))
    .limit(1);

  const activeShift = activeShiftRows[0] ?? null;

  if (!activeShift) {
    return {
      outlet: outletWithHardwareStatus,
      register,
      activeShift: null,
      recentTransactions: [],
    };
  }

  const [saleRows, movementRows] = await Promise.all([
    db
      .select({
        id: sales.id,
        invoiceNumber: sales.invoiceNumber,
        totalAmount: sales.totalAmount,
        discountAmount: sales.discountAmount,
        completedAt: sales.completedAt,
        customerName: customers.fullName,
      })
      .from(sales)
      .leftJoin(customers, eq(sales.customerId, customers.id))
      .where(
        and(
          eq(sales.organizationId, organizationId),
          eq(sales.outletId, outlet.id),
          eq(sales.registerId, register.id),
          eq(sales.shiftId, activeShift.id),
          eq(sales.status, "completed"),
        ),
      )
      .orderBy(desc(sales.completedAt), desc(sales.createdAt))
      .limit(50),

    db
      .select({
        type: cashMovements.type,
        amount: cashMovements.amount,
      })
      .from(cashMovements)
      .where(eq(cashMovements.shiftId, activeShift.id)),
  ]);

  const saleIds = saleRows.map((sale) => sale.id);

  const [paymentRows, itemRows] =
    saleIds.length > 0
      ? await Promise.all([
          db
            .select({
              saleId: payments.saleId,
              method: payments.method,
              amount: payments.amount,
              status: payments.status,
            })
            .from(payments)
            .where(inArray(payments.saleId, saleIds))
            .orderBy(asc(payments.createdAt)),

          db
            .select({
              saleId: saleItems.saleId,
            })
            .from(saleItems)
            .where(inArray(saleItems.saleId, saleIds)),
        ])
      : [[], []];

  const cashSummary = summarizeShiftCashMovements(
    movementRows,
    activeShift.openingCash,
  );
  const paymentsBySaleId = new Map<string, typeof paymentRows>();
  const itemCountBySaleId = new Map<string, number>();

  for (const payment of paymentRows) {
    const currentPayments = paymentsBySaleId.get(payment.saleId) ?? [];
    currentPayments.push(payment);
    paymentsBySaleId.set(payment.saleId, currentPayments);
  }

  for (const item of itemRows) {
    itemCountBySaleId.set(
      item.saleId,
      (itemCountBySaleId.get(item.saleId) ?? 0) + 1,
    );
  }

  const paidPayments = paymentRows.filter(
    (payment) => payment.status === "paid",
  );
  const cashPaymentAmount = paidPayments.reduce(
    (total, payment) =>
      total +
      (payment.method === "cash" ? parseTransactionAmount(payment.amount) : 0),
    0,
  );
  const nonCashPaymentAmount = paidPayments.reduce(
    (total, payment) =>
      total +
      (payment.method !== "cash" ? parseTransactionAmount(payment.amount) : 0),
    0,
  );
  const paidAmount = paidPayments.reduce(
    (total, payment) => total + parseTransactionAmount(payment.amount),
    0,
  );
  const totalAmount = saleRows.reduce(
    (total, sale) => total + parseTransactionAmount(sale.totalAmount),
    0,
  );
  const discountAmount = saleRows.reduce(
    (total, sale) => total + parseTransactionAmount(sale.discountAmount),
    0,
  );
  const paymentMethodMap = new Map<
    string,
    {
      method: string;
      amount: number;
      paymentCount: number;
      saleIds: Set<string>;
    }
  >();

  for (const payment of paidPayments) {
    const current = paymentMethodMap.get(payment.method) ?? {
      method: payment.method,
      amount: 0,
      paymentCount: 0,
      saleIds: new Set<string>(),
    };

    current.amount += parseTransactionAmount(payment.amount);
    current.paymentCount += 1;
    current.saleIds.add(payment.saleId);
    paymentMethodMap.set(payment.method, current);
  }

  const salePaymentTotals = new Map<string, number>();

  for (const payment of paidPayments) {
    salePaymentTotals.set(
      payment.saleId,
      (salePaymentTotals.get(payment.saleId) ?? 0) +
        parseTransactionAmount(payment.amount),
    );
  }

  const paymentStatusMap = new Map<
    "paid" | "partial" | "pending",
    {
      status: "paid" | "partial" | "pending";
      transactionCount: number;
      totalAmount: number;
      paidAmount: number;
    }
  >([
    [
      "paid",
      { status: "paid", transactionCount: 0, totalAmount: 0, paidAmount: 0 },
    ],
    [
      "partial",
      { status: "partial", transactionCount: 0, totalAmount: 0, paidAmount: 0 },
    ],
    [
      "pending",
      { status: "pending", transactionCount: 0, totalAmount: 0, paidAmount: 0 },
    ],
  ]);

  for (const sale of saleRows) {
    const saleTotalAmount = parseTransactionAmount(sale.totalAmount);
    const salePaidAmount = salePaymentTotals.get(sale.id) ?? 0;
    const salePaymentStatus = getPaymentStatusFromAmounts(
      saleTotalAmount,
      salePaidAmount,
    );
    const currentStatus = paymentStatusMap.get(salePaymentStatus);

    if (currentStatus) {
      currentStatus.transactionCount += 1;
      currentStatus.totalAmount += saleTotalAmount;
      currentStatus.paidAmount += salePaidAmount;
    }
  }

  return {
    outlet: outletWithHardwareStatus,
    register,
    activeShift: {
      id: activeShift.id,
      status: activeShift.status,
      openedAt: activeShift.openedAt,
      openedByName: activeShift.openedByName,
      openingCash: activeShift.openingCash,
      expectedCash: String(cashSummary.expectedCash),
      cashSummary,
      transactionSummary: {
        totalTransactions: saleRows.length,
        totalAmount,
        paidAmount,
        cashPaymentAmount,
        nonCashPaymentAmount,
        totalItems: itemRows.length,
        discountAmount,
        averageTransactionAmount:
          saleRows.length > 0 ? totalAmount / saleRows.length : 0,
      },
      paymentMethodSummary: Array.from(paymentMethodMap.values())
        .map((item) => ({
          method: item.method,
          amount: item.amount,
          paymentCount: item.paymentCount,
          transactionCount: item.saleIds.size,
        }))
        .sort((left, right) => right.amount - left.amount),
      paymentStatusSummary: Array.from(paymentStatusMap.values()),
    },
    recentTransactions: saleRows.slice(0, 8).map((sale) => {
      const transactionPayments = paymentsBySaleId.get(sale.id) ?? [];
      const paidTransactionPayments = transactionPayments.filter(
        (payment) => payment.status === "paid",
      );
      const paymentMethods = Array.from(
        new Set(paidTransactionPayments.map((payment) => payment.method)),
      );

      return {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        completedAt: sale.completedAt,
        customerName: sale.customerName,
        totalAmount: sale.totalAmount,
        paidAmount: paidTransactionPayments.reduce(
          (total, payment) => total + parseTransactionAmount(payment.amount),
          0,
        ),
        discountAmount: sale.discountAmount,
        paymentStatus: getPaymentStatusFromAmounts(
          parseTransactionAmount(sale.totalAmount),
          salePaymentTotals.get(sale.id) ?? 0,
        ),
        totalItems: itemCountBySaleId.get(sale.id) ?? 0,
        paymentMethods,
      };
    }),
  } satisfies PosShiftOverviewData;
}

export async function getPosTransactionListData({
  organizationId,
  outletId,
  query,
  range,
  shiftId,
}: {
  organizationId: string;
  outletId?: string | null;
  query?: string | null;
  range?: string | null;
  shiftId?: string | null;
}): Promise<PosTransactionListData> {
  const normalizedRange = normalizeTransactionRange(range);
  const normalizedQuery = query?.trim() ?? "";
  const normalizedShiftId = shiftId?.trim() || null;

  if (!outletId) {
    return {
      outlet: null,
      query: normalizedQuery,
      range: normalizedRange,
      shiftId: normalizedShiftId,
      transactions: [],
      summary: {
        totalTransactions: 0,
        totalAmount: 0,
        paidAmount: 0,
        totalItems: 0,
      },
    };
  }

  const outletRows = await db
    .select({
      id: outlets.id,
      code: outlets.code,
      name: outlets.name,
    })
    .from(outlets)
    .where(
      and(
        eq(outlets.id, outletId),
        eq(outlets.organizationId, organizationId),
        eq(outlets.isActive, true),
      ),
    )
    .limit(1);

  const outlet = outletRows[0] ?? null;

  if (!outlet) {
    return {
      outlet: null,
      query: normalizedQuery,
      range: normalizedRange,
      shiftId: normalizedShiftId,
      transactions: [],
      summary: {
        totalTransactions: 0,
        totalAmount: 0,
        paidAmount: 0,
        totalItems: 0,
      },
    };
  }

  const [hardwareAgent] = await db
    .select({
      status: hardwareAgents.status,
      isActive: hardwareAgents.isActive,
      lastSeenAt: hardwareAgents.lastSeenAt,
    })
    .from(hardwareAgents)
    .where(
      and(
        eq(hardwareAgents.organizationId, organizationId),
        eq(hardwareAgents.outletId, outlet.id),
        eq(hardwareAgents.isActive, true),
      ),
    )
    .orderBy(desc(hardwareAgents.lastSeenAt), desc(hardwareAgents.updatedAt))
    .limit(1);

  const outletWithHardwareStatus = {
    ...outlet,
    hardwareStatus: getOutletHardwareBadgeStatus(
      hardwareAgent ?? null,
      new Date(),
    ),
  };

  const filters: SQL[] = [
    eq(sales.organizationId, organizationId),
    eq(sales.outletId, outlet.id),
    eq(sales.status, "completed"),
  ];

  const rangeStart = getTransactionRangeStart(normalizedRange);

  if (rangeStart) {
    filters.push(gte(sales.createdAt, rangeStart));
  }

  if (normalizedShiftId) {
    filters.push(eq(sales.shiftId, normalizedShiftId));
  }

  if (normalizedQuery) {
    const searchPattern = `%${normalizedQuery}%`;
    const itemSaleRows = await db
      .selectDistinct({
        saleId: saleItems.saleId,
      })
      .from(saleItems)
      .innerJoin(sales, eq(saleItems.saleId, sales.id))
      .innerJoin(productItems, eq(saleItems.productItemId, productItems.id))
      .innerJoin(
        productMasters,
        eq(productItems.productMasterId, productMasters.id),
      )
      .where(
        and(
          eq(sales.organizationId, organizationId),
          eq(sales.outletId, outlet.id),
          or(
            ilike(productItems.sku, searchPattern),
            ilike(productItems.barcode, searchPattern),
            ilike(productItems.serialNumber, searchPattern),
            ilike(productMasters.code, searchPattern),
            ilike(productMasters.name, searchPattern),
          ),
        ),
      )
      .limit(POS_TRANSACTION_LIST_LIMIT);

    const matchingSaleIds = itemSaleRows.map((row) => row.saleId);
    const searchFilters: SQL[] = [
      ilike(sales.invoiceNumber, searchPattern),
      ilike(customers.customerCode, searchPattern),
      ilike(customers.fullName, searchPattern),
      ilike(customers.phone, searchPattern),
      ilike(customers.email, searchPattern),
    ];

    if (matchingSaleIds.length > 0) {
      searchFilters.push(inArray(sales.id, matchingSaleIds));
    }

    const searchCondition = or(...searchFilters);

    if (searchCondition) {
      filters.push(searchCondition);
    }
  }

  const saleRows = await db
    .select({
      id: sales.id,
      invoiceNumber: sales.invoiceNumber,
      status: sales.status,
      subtotalAmount: sales.subtotalAmount,
      discountAmount: sales.discountAmount,
      additionalFeeAmount: sales.additionalFeeAmount,
      totalAmount: sales.totalAmount,
      completedAt: sales.completedAt,
      createdAt: sales.createdAt,
      customerCode: customers.customerCode,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      customerEmail: customers.email,
      cashierName: users.fullName,
      registerName: registers.name,
      shiftId: sales.shiftId,
    })
    .from(sales)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .innerJoin(users, eq(sales.cashierId, users.id))
    .innerJoin(registers, eq(sales.registerId, registers.id))
    .where(and(...filters))
    .orderBy(desc(sales.completedAt), desc(sales.createdAt))
    .limit(POS_TRANSACTION_LIST_LIMIT);

  const saleIds = saleRows.map((sale) => sale.id);

  const [paymentRows, itemRows] =
    saleIds.length > 0
      ? await Promise.all([
          db
            .select({
              saleId: payments.saleId,
              method: payments.method,
              provider: payments.provider,
              amount: payments.amount,
              status: payments.status,
              providerReference: payments.providerReference,
            })
            .from(payments)
            .where(inArray(payments.saleId, saleIds))
            .orderBy(asc(payments.createdAt)),

          db
            .select({
              saleId: saleItems.saleId,
              productItemId: saleItems.productItemId,
              sku: productItems.sku,
              productName: productMasters.name,
              categoryName: productCategories.name,
              finalPriceAmount: saleItems.finalPriceAmount,
            })
            .from(saleItems)
            .innerJoin(
              productItems,
              eq(saleItems.productItemId, productItems.id),
            )
            .innerJoin(
              productMasters,
              eq(productItems.productMasterId, productMasters.id),
            )
            .innerJoin(
              productCategories,
              eq(productMasters.categoryId, productCategories.id),
            )
            .where(inArray(saleItems.saleId, saleIds))
            .orderBy(asc(saleItems.lineNumber)),
        ])
      : [[], []];

  const paymentsBySaleId = new Map<string, typeof paymentRows>();
  const itemsBySaleId = new Map<string, typeof itemRows>();

  for (const payment of paymentRows) {
    const currentPayments = paymentsBySaleId.get(payment.saleId) ?? [];
    currentPayments.push(payment);
    paymentsBySaleId.set(payment.saleId, currentPayments);
  }

  for (const item of itemRows) {
    const currentItems = itemsBySaleId.get(item.saleId) ?? [];
    currentItems.push(item);
    itemsBySaleId.set(item.saleId, currentItems);
  }

  const transactions = saleRows.map(
    (sale): PosTransactionListData["transactions"][number] => {
      const transactionPayments = paymentsBySaleId.get(sale.id) ?? [];
      const transactionItems = itemsBySaleId.get(sale.id) ?? [];
      const totalAmount = parseTransactionAmount(sale.totalAmount);
      const paidAmount = transactionPayments.reduce(
        (total, payment) =>
          payment.status === "paid"
            ? total + parseTransactionAmount(payment.amount)
            : total,
        0,
      );

      return {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        status: sale.status,
        subtotalAmount: sale.subtotalAmount,
        discountAmount: sale.discountAmount,
        additionalFeeAmount: sale.additionalFeeAmount,
        totalAmount: sale.totalAmount,
        paidAmount,
        paymentStatus:
          paidAmount >= totalAmount
            ? "paid"
            : paidAmount > 0
              ? "partial"
              : "pending",
        completedAt: sale.completedAt,
        createdAt: sale.createdAt,
        customerCode: sale.customerCode,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        customerEmail: sale.customerEmail,
        cashierName: sale.cashierName,
        registerName: sale.registerName,
        shiftId: sale.shiftId,
        totalItems: transactionItems.length,
        items: transactionItems.map((item) => ({
          productItemId: item.productItemId,
          sku: item.sku,
          productName: item.productName,
          categoryName: item.categoryName,
          finalPriceAmount: item.finalPriceAmount,
        })),
        payments: transactionPayments.map((payment) => ({
          method: payment.method,
          provider: payment.provider,
          amount: payment.amount,
          status: payment.status,
          providerReference: payment.providerReference,
        })),
      };
    },
  );

  return {
    outlet: outletWithHardwareStatus,
    query: normalizedQuery,
    range: normalizedRange,
    shiftId: normalizedShiftId,
    transactions,
    summary: {
      totalTransactions: transactions.length,
      totalAmount: transactions.reduce(
        (total, transaction) =>
          total + parseTransactionAmount(transaction.totalAmount),
        0,
      ),
      paidAmount: transactions.reduce(
        (total, transaction) => total + transaction.paidAmount,
        0,
      ),
      totalItems: transactions.reduce(
        (total, transaction) => total + transaction.totalItems,
        0,
      ),
    },
  } satisfies PosTransactionListData;
}

type PaymentMetadata = Record<string, unknown> | null;

function getPaymentMetadataNumber(metadata: PaymentMetadata, key: string) {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  return null;
}

function getPaymentMetadataString(metadata: PaymentMetadata, key: string) {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function getPosTransactionDetailData({
  organizationId,
  outletId,
  saleId,
}: {
  organizationId: string;
  outletId?: string | null;
  saleId?: string | null;
}): Promise<PosTransactionDetailData | null> {
  if (!outletId || !saleId) {
    return null;
  }

  const saleRows = await db
    .select({
      id: sales.id,
      invoiceNumber: sales.invoiceNumber,
      status: sales.status,
      subtotalAmount: sales.subtotalAmount,
      discountAmount: sales.discountAmount,
      discountReason: sales.discountReason,
      additionalFeeAmount: sales.additionalFeeAmount,
      totalAmount: sales.totalAmount,
      completedAt: sales.completedAt,
      createdAt: sales.createdAt,
      notes: sales.notes,
      outletName: outlets.name,
      cashierName: users.fullName,
      registerName: registers.name,
      shiftId: sales.shiftId,
      shiftOpenedAt: shifts.openedAt,
      shiftClosedAt: shifts.closedAt,
      shiftStatus: shifts.status,
      customerCode: customers.customerCode,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      customerEmail: customers.email,
      customerAddress: customers.address,
    })
    .from(sales)
    .innerJoin(outlets, eq(sales.outletId, outlets.id))
    .innerJoin(users, eq(sales.cashierId, users.id))
    .innerJoin(registers, eq(sales.registerId, registers.id))
    .leftJoin(shifts, eq(sales.shiftId, shifts.id))
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(
      and(
        eq(sales.id, saleId),
        eq(sales.organizationId, organizationId),
        eq(sales.outletId, outletId),
        eq(sales.status, "completed"),
      ),
    )
    .limit(1);

  const sale = saleRows[0] ?? null;

  if (!sale) {
    return null;
  }

  const [paymentRows, itemRows, hardwareJobRows] = await Promise.all([
    db
      .select({
        id: payments.id,
        saleId: payments.saleId,
        method: payments.method,
        provider: payments.provider,
        amount: payments.amount,
        status: payments.status,
        providerReference: payments.providerReference,
        paidAt: payments.paidAt,
        verifiedAt: payments.verifiedAt,
        metadata: payments.metadata,
      })
      .from(payments)
      .where(eq(payments.saleId, sale.id))
      .orderBy(asc(payments.createdAt)),

    db
      .select({
        id: saleItems.id,
        productItemId: saleItems.productItemId,
        lineNumber: saleItems.lineNumber,
        sku: productItems.sku,
        barcode: productItems.barcode,
        serialNumber: productItems.serialNumber,
        productName: productMasters.name,
        categoryName: productCategories.name,
        weightGram: productItems.weightGram,
        purityPercent: productItems.purityPercent,
        exchangePurityPercent: productItems.exchangePurityPercent,
        size: productItems.size,
        color: productItems.color,
        gemstone: productItems.gemstone,
        listPriceAmount: saleItems.listPriceAmount,
        discountAmount: saleItems.discountAmount,
        finalPriceAmount: saleItems.finalPriceAmount,
      })
      .from(saleItems)
      .innerJoin(productItems, eq(saleItems.productItemId, productItems.id))
      .innerJoin(
        productMasters,
        eq(productItems.productMasterId, productMasters.id),
      )
      .innerJoin(
        productCategories,
        eq(productMasters.categoryId, productCategories.id),
      )
      .where(eq(saleItems.saleId, sale.id))
      .orderBy(asc(saleItems.lineNumber)),

    db
      .select({
        id: hardwareJobs.id,
        jobType: hardwareJobs.jobType,
        deviceType: hardwareJobs.deviceType,
        status: hardwareJobs.status,
        attempts: hardwareJobs.attempts,
        maxAttempts: hardwareJobs.maxAttempts,
        error: hardwareJobs.error,
        createdAt: hardwareJobs.createdAt,
        updatedAt: hardwareJobs.updatedAt,
        completedAt: hardwareJobs.completedAt,
        failedAt: hardwareJobs.failedAt,
        cancelledAt: hardwareJobs.cancelledAt,
      })
      .from(hardwareJobs)
      .where(
        and(
          eq(hardwareJobs.organizationId, organizationId),
          eq(hardwareJobs.outletId, outletId),
          eq(hardwareJobs.sourceType, "sale"),
          eq(hardwareJobs.sourceId, sale.id),
        ),
      )
      .orderBy(desc(hardwareJobs.createdAt))
      .limit(8),
  ]);

  const totalAmount = parseTransactionAmount(sale.totalAmount);
  const paidAmount = paymentRows.reduce(
    (total, payment) =>
      payment.status === "paid"
        ? total + parseTransactionAmount(payment.amount)
        : total,
    0,
  );

  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    status: sale.status,
    subtotalAmount: sale.subtotalAmount,
    discountAmount: sale.discountAmount,
    discountReason: sale.discountReason,
    additionalFeeAmount: sale.additionalFeeAmount,
    totalAmount: sale.totalAmount,
    paidAmount,
    paymentStatus:
      paidAmount >= totalAmount
        ? "paid"
        : paidAmount > 0
          ? "partial"
          : "pending",
    completedAt: sale.completedAt,
    createdAt: sale.createdAt,
    notes: sale.notes,
    outletName: sale.outletName,
    registerName: sale.registerName,
    shiftId: sale.shiftId,
    shiftOpenedAt: sale.shiftOpenedAt,
    shiftClosedAt: sale.shiftClosedAt,
    shiftStatus: sale.shiftStatus,
    cashierName: sale.cashierName,
    customer: sale.customerCode
      ? {
          code: sale.customerCode,
          name: sale.customerName ?? "Customer tanpa nama",
          phone: sale.customerPhone,
          email: sale.customerEmail,
          address: sale.customerAddress,
        }
      : null,
    items: itemRows.map((item) => ({
      id: item.id,
      productItemId: item.productItemId,
      lineNumber: item.lineNumber,
      sku: item.sku,
      barcode: item.barcode,
      serialNumber: item.serialNumber,
      productName: item.productName,
      categoryName: item.categoryName,
      weightGram: item.weightGram,
      purityPercent: item.purityPercent,
      exchangePurityPercent: item.exchangePurityPercent,
      size: item.size,
      color: item.color,
      gemstone: item.gemstone,
      listPriceAmount: item.listPriceAmount,
      discountAmount: item.discountAmount,
      finalPriceAmount: item.finalPriceAmount,
    })),
    payments: paymentRows.map((payment) => ({
      id: payment.id,
      method: payment.method,
      provider: payment.provider,
      amount: payment.amount,
      status: payment.status,
      providerReference: payment.providerReference,
      paidAt: payment.paidAt,
      verifiedAt: payment.verifiedAt,
      receivedAmount: getPaymentMetadataNumber(
        payment.metadata,
        "receivedAmount",
      ),
      changeAmount: getPaymentMetadataNumber(payment.metadata, "changeAmount"),
      note: getPaymentMetadataString(payment.metadata, "note"),
    })),
    hardwareJobs: hardwareJobRows.map((job) => ({
      id: job.id,
      jobType: job.jobType,
      deviceType: job.deviceType,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
      failedAt: job.failedAt,
      cancelledAt: job.cancelledAt,
    })),
  } satisfies PosTransactionDetailData;
}
