import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { createReceiptVerificationUrl } from "@/features/sales/verification/receipt-token";
import {
  customers,
  organizations,
  outlets,
  payments,
  productItems,
  productMasters,
  registers,
  saleItems,
  sales,
  users,
} from "@/db/schema";

const POINTS_PER_MM = 72 / 25.4;
const PAGE_WIDTH = 210 * POINTS_PER_MM;
const PAGE_HEIGHT = 148 * POINTS_PER_MM;

const COLORS = {
  charcoal: "2B2118",
  muted: "6D6258",
  border: "D9C7B4",
  soft: "F7EFE5",
  softer: "FCF8F2",
  accent: "B9853D",
  accentDark: "7A4E1D",
  green: "166534",
  white: "FFFFFF",
};

type SaleItemSnapshot = {
  sku?: string | null;
  barcode?: string | null;
  qrValue?: string | null;
  serialNumber?: string | null;
  productCode?: string | null;
  productName?: string | null;
  categoryName?: string | null;
  weightGram?: string | null;
  purityPercent?: string | null;
  exchangePurityPercent?: string | null;
  size?: string | null;
  color?: string | null;
  gemstone?: string | null;
  sellingAmount?: string | null;
  imageKey?: string | null;
  productImageKey?: string | null;
};

export type ReceiptCertificateData = {
  organization: {
    name: string;
    timezone: string;
    currency: string;
  };
  outlet: {
    id: string;
    code: string;
    name: string;
    address: string | null;
    phone: string | null;
  };
  register: {
    code: string;
    name: string;
  };
  cashier: {
    fullName: string;
  };
  customer: {
    fullName: string;
    phone: string | null;
  } | null;
  sale: {
    id: string;
    invoiceNumber: string;
    status: string;
    subtotalAmount: string;
    discountAmount: string;
    additionalFeeAmount: string;
    totalAmount: string;
    completedAt: Date | null;
    notes: string | null;
  };
  items: Array<{
    lineNumber: number;
    listPriceAmount: string;
    discountAmount: string;
    finalPriceAmount: string;
    snapshot: SaleItemSnapshot;
  }>;
  payments: Array<{
    method: string;
    provider: string;
    amount: string;
    providerReference: string | null;
    paidAt: Date | null;
    metadata: Record<string, unknown> | null;
  }>;
  verification: {
    token: string;
    url: string;
  };
};

function toSafeSnapshot(value: Record<string, unknown>): SaleItemSnapshot {
  const readString = (key: keyof SaleItemSnapshot) => {
    const rawValue = value[key];

    if (rawValue === null || rawValue === undefined) {
      return null;
    }

    return String(rawValue);
  };

  return {
    sku: readString("sku"),
    barcode: readString("barcode"),
    qrValue: readString("qrValue"),
    serialNumber: readString("serialNumber"),
    productCode: readString("productCode"),
    productName: readString("productName"),
    categoryName: readString("categoryName"),
    weightGram: readString("weightGram"),
    purityPercent: readString("purityPercent"),
    exchangePurityPercent: readString("exchangePurityPercent"),
    size: readString("size"),
    color: readString("color"),
    gemstone: readString("gemstone"),
    sellingAmount: readString("sellingAmount"),
    imageKey: readString("imageKey"),
    productImageKey: readString("productImageKey"),
  };
}

export async function getReceiptCertificateData({
  saleId,
  organizationId,
}: {
  saleId: string;
  organizationId: string;
}): Promise<ReceiptCertificateData | null> {
  const saleRows = await db
    .select({
      organizationName: organizations.name,
      organizationTimezone: organizations.timezone,
      organizationCurrency: organizations.currency,
      outletId: outlets.id,
      outletCode: outlets.code,
      outletName: outlets.name,
      outletAddress: outlets.address,
      outletPhone: outlets.phone,
      registerCode: registers.code,
      registerName: registers.name,
      cashierFullName: users.fullName,
      customerFullName: customers.fullName,
      customerPhone: customers.phone,
      saleId: sales.id,
      invoiceNumber: sales.invoiceNumber,
      saleStatus: sales.status,
      subtotalAmount: sales.subtotalAmount,
      discountAmount: sales.discountAmount,
      additionalFeeAmount: sales.additionalFeeAmount,
      totalAmount: sales.totalAmount,
      completedAt: sales.completedAt,
      notes: sales.notes,
    })
    .from(sales)
    .innerJoin(organizations, eq(sales.organizationId, organizations.id))
    .innerJoin(outlets, eq(sales.outletId, outlets.id))
    .innerJoin(registers, eq(sales.registerId, registers.id))
    .innerJoin(users, eq(sales.cashierId, users.id))
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(eq(sales.id, saleId))
    .limit(1);

  const sale = saleRows[0];

  if (!sale || sale.saleStatus !== "completed") {
    return null;
  }

  const organizationMatches = sale.organizationName && organizationId;

  if (!organizationMatches) {
    return null;
  }

  const saleOrganizationRows = await db
    .select({ organizationId: sales.organizationId })
    .from(sales)
    .where(eq(sales.id, saleId))
    .limit(1);

  if (saleOrganizationRows[0]?.organizationId !== organizationId) {
    return null;
  }

  const itemRows = await db
    .select({
      lineNumber: saleItems.lineNumber,
      listPriceAmount: saleItems.listPriceAmount,
      discountAmount: saleItems.discountAmount,
      finalPriceAmount: saleItems.finalPriceAmount,
      snapshot: saleItems.snapshot,
      itemImageKey: productItems.imageKey,
      productImageKey: productMasters.imageKey,
    })
    .from(saleItems)
    .innerJoin(productItems, eq(saleItems.productItemId, productItems.id))
    .innerJoin(productMasters, eq(productItems.productMasterId, productMasters.id))
    .where(eq(saleItems.saleId, saleId))
    .orderBy(asc(saleItems.lineNumber));

  const paymentRows = await db
    .select({
      method: payments.method,
      provider: payments.provider,
      amount: payments.amount,
      providerReference: payments.providerReference,
      paidAt: payments.paidAt,
      metadata: payments.metadata,
    })
    .from(payments)
    .where(eq(payments.saleId, saleId))
    .orderBy(asc(payments.createdAt));

  return {
    organization: {
      name: sale.organizationName,
      timezone: sale.organizationTimezone,
      currency: sale.organizationCurrency,
    },
    outlet: {
      id: sale.outletId,
      code: sale.outletCode,
      name: sale.outletName,
      address: sale.outletAddress,
      phone: sale.outletPhone,
    },
    register: {
      code: sale.registerCode,
      name: sale.registerName,
    },
    cashier: {
      fullName: sale.cashierFullName,
    },
    customer: sale.customerFullName
      ? {
          fullName: sale.customerFullName,
          phone: sale.customerPhone,
        }
      : null,
    sale: {
      id: sale.saleId,
      invoiceNumber: sale.invoiceNumber,
      status: sale.saleStatus,
      subtotalAmount: sale.subtotalAmount,
      discountAmount: sale.discountAmount,
      additionalFeeAmount: sale.additionalFeeAmount,
      totalAmount: sale.totalAmount,
      completedAt: sale.completedAt,
      notes: sale.notes,
    },
    items: itemRows.map((item) => {
      const snapshot = toSafeSnapshot(item.snapshot);

      return {
        lineNumber: item.lineNumber,
        listPriceAmount: item.listPriceAmount,
        discountAmount: item.discountAmount,
        finalPriceAmount: item.finalPriceAmount,
        snapshot: {
          ...snapshot,
          imageKey: snapshot.imageKey ?? item.itemImageKey,
          productImageKey: snapshot.productImageKey ?? item.productImageKey,
        },
      };
    }),
    payments: paymentRows.map((payment) => ({
      method: payment.method,
      provider: payment.provider,
      amount: payment.amount,
      providerReference: payment.providerReference,
      paidAt: payment.paidAt,
      metadata: payment.metadata ?? null,
    })),
    verification: createReceiptVerificationUrl(sale.saleId),
  };
}

function escapePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function hexToRgb(hexColor: string) {
  const normalizedHex = hexColor.replace("#", "");

  return {
    r: Number.parseInt(normalizedHex.slice(0, 2), 16) / 255,
    g: Number.parseInt(normalizedHex.slice(2, 4), 16) / 255,
    b: Number.parseInt(normalizedHex.slice(4, 6), 16) / 255,
  };
}

function formatRgb(hexColor: string) {
  const { r, g, b } = hexToRgb(hexColor);

  return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`;
}

function formatAmount(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "Rp 0";
  }

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value: Date | null, timezone: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(value);
}

function formatDate(value: Date | null, timezone: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeZone: timezone,
  }).format(value);
}

function getPaymentLabel(method: string) {
  const labels: Record<string, string> = {
    cash: "Cash",
    qris_manual: "QRIS Manual",
    debit_card: "Debit EDC",
    credit_card: "Credit EDC",
    bank_transfer: "Transfer Bank",
    qris_gateway: "QRIS Gateway",
    other: "Lainnya",
  };

  return labels[method] ?? method;
}

function truncate(value: string | null | undefined, maxLength: number) {
  const normalizedValue = String(value ?? "").trim();

  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, Math.max(0, maxLength - 3))}...`;
}

function splitText(value: string, maxChars: number, maxLines = 2) {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxChars) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word.length > maxChars ? word.slice(0, maxChars) : word;

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[lines.length - 1] = truncate(lines[lines.length - 1], maxChars);
  }

  return lines.length > 0 ? lines : ["-"];
}

class PdfPageBuilder {
  private commands: string[] = [];

  rect({
    x,
    y,
    width,
    height,
    fill,
    stroke,
    lineWidth = 1,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    fill?: string;
    stroke?: string;
    lineWidth?: number;
  }) {
    this.commands.push("q");

    if (fill) {
      this.commands.push(`${formatRgb(fill)} rg`);
    }

    if (stroke) {
      this.commands.push(`${formatRgb(stroke)} RG`);
      this.commands.push(`${lineWidth} w`);
    }

    this.commands.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re`);

    if (fill && stroke) {
      this.commands.push("B");
    } else if (fill) {
      this.commands.push("f");
    } else {
      this.commands.push("S");
    }

    this.commands.push("Q");
  }

  line({
    x1,
    y1,
    x2,
    y2,
    color = COLORS.border,
    lineWidth = 1,
  }: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    color?: string;
    lineWidth?: number;
  }) {
    this.commands.push("q");
    this.commands.push(`${formatRgb(color)} RG`);
    this.commands.push(`${lineWidth} w`);
    this.commands.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m`);
    this.commands.push(`${x2.toFixed(2)} ${y2.toFixed(2)} l`);
    this.commands.push("S");
    this.commands.push("Q");
  }

  text({
    value,
    x,
    y,
    size = 10,
    font = "F1",
    color = COLORS.charcoal,
  }: {
    value: string;
    x: number;
    y: number;
    size?: number;
    font?: "F1" | "F2";
    color?: string;
  }) {
    this.commands.push("BT");
    this.commands.push(`/${font} ${size} Tf`);
    this.commands.push(`${formatRgb(color)} rg`);
    this.commands.push(`${x.toFixed(2)} ${y.toFixed(2)} Td`);
    this.commands.push(`(${escapePdfText(value)}) Tj`);
    this.commands.push("ET");
  }

  rightText({
    value,
    rightX,
    y,
    size = 10,
    font = "F1",
    color = COLORS.charcoal,
  }: {
    value: string;
    rightX: number;
    y: number;
    size?: number;
    font?: "F1" | "F2";
    color?: string;
  }) {
    const approximateWidth = value.length * size * 0.48;

    this.text({
      value,
      x: rightX - approximateWidth,
      y,
      size,
      font,
      color,
    });
  }

  getContent() {
    return this.commands.join("\n");
  }
}

function buildPdfBuffer(content: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function getItemDescription(snapshot: SaleItemSnapshot) {
  const details = [
    snapshot.categoryName,
    snapshot.weightGram ? `${snapshot.weightGram} gr` : null,
    snapshot.exchangePurityPercent ? `Kadar ${snapshot.exchangePurityPercent}%` : null,
    snapshot.size ? `Size ${snapshot.size}` : null,
    snapshot.gemstone,
  ].filter(Boolean);

  return details.join(" / ");
}

export function generateReceiptCertificatePdf(data: ReceiptCertificateData) {
  const page = new PdfPageBuilder();
  const margin = 24;
  const rightMargin = PAGE_WIDTH - margin;
  const completedAt = data.sale.completedAt;

  page.rect({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, fill: COLORS.softer });
  page.rect({
    x: margin,
    y: PAGE_HEIGHT - 88,
    width: PAGE_WIDTH - margin * 2,
    height: 62,
    fill: COLORS.charcoal,
  });
  page.rect({
    x: margin,
    y: 28,
    width: PAGE_WIDTH - margin * 2,
    height: PAGE_HEIGHT - 116,
    fill: COLORS.white,
    stroke: COLORS.border,
    lineWidth: 0.75,
  });

  page.text({
    value: data.organization.name.toUpperCase(),
    x: margin + 20,
    y: PAGE_HEIGHT - 56,
    size: 21,
    font: "F2",
    color: COLORS.white,
  });
  page.text({
    value: "NOTA PEMBAYARAN & CERTIFICATE",
    x: margin + 22,
    y: PAGE_HEIGHT - 76,
    size: 8.5,
    color: COLORS.border,
  });

  page.rightText({
    value: data.sale.invoiceNumber,
    rightX: rightMargin - 36,
    y: PAGE_HEIGHT - 54,
    size: 10,
    font: "F2",
    color: COLORS.white,
  });
  page.rightText({
    value: formatDate(completedAt, data.organization.timezone),
    rightX: rightMargin - 36,
    y: PAGE_HEIGHT - 73,
    size: 8.5,
    color: COLORS.border,
  });

  const topY = PAGE_HEIGHT - 110;
  page.text({ value: "Outlet", x: margin + 16, y: topY, size: 7.5, color: COLORS.muted });
  page.text({ value: data.outlet.name, x: margin + 16, y: topY - 14, size: 10.5, font: "F2" });
  page.text({
    value: truncate(data.outlet.address ?? "Alamat outlet belum diatur", 54),
    x: margin + 16,
    y: topY - 28,
    size: 7.5,
    color: COLORS.muted,
  });

  page.text({ value: "Kasir / Register", x: 232, y: topY, size: 7.5, color: COLORS.muted });
  page.text({ value: truncate(data.cashier.fullName, 30), x: 232, y: topY - 14, size: 10.5, font: "F2" });
  page.text({
    value: `${data.register.name} (${data.register.code})`,
    x: 232,
    y: topY - 28,
    size: 7.5,
    color: COLORS.muted,
  });

  page.text({ value: "Customer", x: 410, y: topY, size: 7.5, color: COLORS.muted });
  page.text({
    value: truncate(data.customer?.fullName ?? "Walk-in Customer", 26),
    x: 410,
    y: topY - 14,
    size: 10.5,
    font: "F2",
  });
  page.text({
    value: data.customer?.phone ?? "-",
    x: 410,
    y: topY - 28,
    size: 7.5,
    color: COLORS.muted,
  });

  page.line({ x1: margin + 16, y1: topY - 42, x2: rightMargin - 16, y2: topY - 42 });

  const tableTop = topY - 62;
  page.rect({ x: margin + 16, y: tableTop - 10, width: PAGE_WIDTH - margin * 2 - 32, height: 20, fill: COLORS.soft });
  page.text({ value: "Item", x: margin + 26, y: tableTop - 3, size: 7.5, font: "F2", color: COLORS.accentDark });
  page.text({ value: "SKU / Barcode", x: 247, y: tableTop - 3, size: 7.5, font: "F2", color: COLORS.accentDark });
  page.text({ value: "Spesifikasi", x: 344, y: tableTop - 3, size: 7.5, font: "F2", color: COLORS.accentDark });
  page.rightText({ value: "Harga", rightX: rightMargin - 24, y: tableTop - 3, size: 7.5, font: "F2", color: COLORS.accentDark });

  let itemY = tableTop - 28;
  const visibleItems = data.items.slice(0, 5);

  visibleItems.forEach((item, index) => {
    const snapshot = item.snapshot;
    const productLines = splitText(snapshot.productName ?? "Produk", 28, 2);
    const description = truncate(getItemDescription(snapshot), 38);

    if (index > 0) {
      page.line({ x1: margin + 20, y1: itemY + 10, x2: rightMargin - 20, y2: itemY + 10, color: "EFE3D6", lineWidth: 0.5 });
    }

    page.text({ value: `${item.lineNumber}. ${productLines[0]}`, x: margin + 26, y: itemY, size: 8.5, font: "F2" });

    if (productLines[1]) {
      page.text({ value: productLines[1], x: margin + 37, y: itemY - 11, size: 7.5, color: COLORS.muted });
    }

    page.text({ value: truncate(snapshot.sku ?? "-", 18), x: 247, y: itemY, size: 8.5, font: "F2" });
    page.text({ value: truncate(snapshot.barcode ?? snapshot.qrValue ?? "-", 18), x: 247, y: itemY - 11, size: 7.25, color: COLORS.muted });
    page.text({ value: description || "-", x: 344, y: itemY, size: 7.5, color: COLORS.muted });
    page.rightText({ value: formatAmount(item.finalPriceAmount), rightX: rightMargin - 24, y: itemY, size: 8.5, font: "F2" });

    itemY -= 35;
  });

  if (data.items.length > visibleItems.length) {
    page.text({
      value: `+ ${data.items.length - visibleItems.length} item lainnya tercatat pada sistem.`,
      x: margin + 26,
      y: itemY + 5,
      size: 7.5,
      color: COLORS.muted,
    });
  }

  const summaryX = 374;
  const summaryY = 126;
  page.rect({ x: summaryX, y: 60, width: rightMargin - summaryX - 16, height: 76, fill: COLORS.softer, stroke: COLORS.border, lineWidth: 0.5 });
  page.text({ value: "Ringkasan", x: summaryX + 14, y: summaryY - 16, size: 8, font: "F2", color: COLORS.accentDark });
  page.text({ value: "Subtotal", x: summaryX + 14, y: summaryY - 32, size: 7.5, color: COLORS.muted });
  page.rightText({ value: formatAmount(data.sale.subtotalAmount), rightX: rightMargin - 28, y: summaryY - 32, size: 7.5 });
  page.text({ value: "Diskon", x: summaryX + 14, y: summaryY - 46, size: 7.5, color: COLORS.muted });
  page.rightText({ value: formatAmount(data.sale.discountAmount), rightX: rightMargin - 28, y: summaryY - 46, size: 7.5 });
  page.line({ x1: summaryX + 14, y1: summaryY - 56, x2: rightMargin - 28, y2: summaryY - 56, color: COLORS.border, lineWidth: 0.5 });
  page.text({ value: "TOTAL LUNAS", x: summaryX + 14, y: summaryY - 72, size: 9, font: "F2", color: COLORS.green });
  page.rightText({ value: formatAmount(data.sale.totalAmount), rightX: rightMargin - 28, y: summaryY - 72, size: 11, font: "F2", color: COLORS.green });

  const paymentY = 126;
  page.text({ value: "Pembayaran", x: margin + 16, y: paymentY - 16, size: 8, font: "F2", color: COLORS.accentDark });
  data.payments.slice(0, 4).forEach((payment, index) => {
    const y = paymentY - 32 - index * 14;
    const reference = payment.providerReference ? ` · ${truncate(payment.providerReference, 22)}` : "";
    page.text({
      value: `${getPaymentLabel(payment.method)}${reference}`,
      x: margin + 16,
      y,
      size: 7.5,
      color: COLORS.muted,
    });
    page.rightText({ value: formatAmount(payment.amount), rightX: 336, y, size: 7.5 });
  });

  page.text({ value: "Disahkan secara elektronik oleh sistem Asihjaya RMS.", x: margin + 16, y: 46, size: 7, color: COLORS.muted });
  page.text({ value: `Waktu transaksi: ${formatDateTime(completedAt, data.organization.timezone)}`, x: margin + 16, y: 34, size: 7, color: COLORS.muted });
  page.rightText({ value: "TERIMA KASIH", rightX: rightMargin - 16, y: 42, size: 9, font: "F2", color: COLORS.accentDark });
  page.rightText({ value: "Simpan nota ini sebagai bukti pembayaran dan certificate barang.", rightX: rightMargin - 16, y: 30, size: 6.5, color: COLORS.muted });

  return buildPdfBuffer(page.getContent());
}
