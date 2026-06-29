import { eq } from "drizzle-orm";

import { db } from "@/db";
import { sales } from "@/db/schema";
import { getReceiptCertificateData, type ReceiptCertificateData } from "@/features/sales/documents/receipt-certificate";
import { verifyReceiptVerificationToken } from "@/features/sales/verification/receipt-token";

export type PublicReceiptVerificationData =
  | {
      status: "valid";
      token: string;
      sale: {
        id: string;
        invoiceNumber: string;
        status: string;
        completedAt: Date | null;
        totalAmount: string;
      };
      outlet: {
        name: string;
        code: string;
        phone: string | null;
      };
      customer: {
        name: string;
        phone: string | null;
      } | null;
      items: Array<{
        lineNumber: number;
        productName: string;
        productCode: string;
        categoryName: string | null;
        weightGram: string | null;
        purityPercent: string | null;
        exchangePurityPercent: string | null;
        imageKey: string | null;
      }>;
      totalItems: number;
      paymentSummary: string;
    }
  | {
      status: "invalid";
      message: string;
    };

function maskName(value: string | null | undefined) {
  const name = value?.trim();

  if (!name) {
    return "Pelanggan Umum";
  }

  const words = name.split(/\s+/).filter(Boolean);

  return words
    .map((word) => {
      if (word.length <= 2) {
        return `${word[0] ?? ""}*`;
      }

      return `${word[0]}${"*".repeat(Math.min(word.length - 2, 4))}${word[word.length - 1]}`;
    })
    .join(" ");
}

function maskPhone(value: string | null | undefined) {
  const phone = value?.replace(/\D/g, "") ?? "";

  if (phone.length < 7) {
    return value ? "***" : null;
  }

  return `${phone.slice(0, 4)}${"*".repeat(Math.max(phone.length - 8, 3))}${phone.slice(-4)}`;
}

function getPaymentSummary(methods: string[]) {
  if (methods.length === 0) {
    return "Pembayaran tercatat";
  }

  const methodLabels: Record<string, string> = {
    bank_transfer: "Transfer",
    cash: "Cash",
    credit_card: "Credit Card",
    debit_card: "Debit Card",
    qris_manual: "QRIS",
    qris_gateway: "QRIS",
  };

  return Array.from(new Set(methods))
    .map((method) => methodLabels[method] ?? method.replaceAll("_", " "))
    .join(" + ");
}

function readProductCode(item: ReceiptCertificateData["items"][number]) {
  return (
    item.snapshot.barcode ??
    item.snapshot.qrValue ??
    item.snapshot.serialNumber ??
    item.snapshot.sku ??
    item.snapshot.productCode ??
    "-"
  );
}

export async function getPublicReceiptVerificationData(
  token: string,
): Promise<PublicReceiptVerificationData> {
  const parsedToken = verifyReceiptVerificationToken(token);

  if (!parsedToken) {
    return {
      status: "invalid",
      message: "Kode verifikasi nota tidak valid atau sudah berubah.",
    };
  }

  const [saleRow] = await db
    .select({
      id: sales.id,
      organizationId: sales.organizationId,
    })
    .from(sales)
    .where(eq(sales.id, parsedToken.saleId))
    .limit(1);

  if (!saleRow) {
    return {
      status: "invalid",
      message: "Nota tidak ditemukan di sistem Asihjaya.",
    };
  }

  const receiptData = await getReceiptCertificateData({
    saleId: saleRow.id,
    organizationId: saleRow.organizationId,
  });

  if (!receiptData) {
    return {
      status: "invalid",
      message: "Nota belum valid, sudah dibatalkan, atau tidak dapat diverifikasi.",
    };
  }

  return {
    status: "valid",
    token,
    sale: {
      id: receiptData.sale.id,
      invoiceNumber: receiptData.sale.invoiceNumber,
      status: receiptData.sale.status,
      completedAt: receiptData.sale.completedAt,
      totalAmount: receiptData.sale.totalAmount,
    },
    outlet: {
      name: receiptData.outlet.name,
      code: receiptData.outlet.code,
      phone: receiptData.outlet.phone,
    },
    customer: receiptData.customer
      ? {
          name: maskName(receiptData.customer.fullName),
          phone: maskPhone(receiptData.customer.phone),
        }
      : null,
    items: receiptData.items.map((item) => ({
      lineNumber: item.lineNumber,
      productName: item.snapshot.productName ?? item.snapshot.productCode ?? "Item Perhiasan",
      productCode: readProductCode(item),
      categoryName: item.snapshot.categoryName ?? null,
      weightGram: item.snapshot.weightGram ?? null,
      purityPercent: item.snapshot.purityPercent ?? null,
      exchangePurityPercent: item.snapshot.exchangePurityPercent ?? null,
      imageKey: item.snapshot.imageKey ?? item.snapshot.productImageKey ?? null,
    })),
    totalItems: receiptData.items.length,
    paymentSummary: getPaymentSummary(receiptData.payments.map((payment) => payment.method)),
  };
}

export function getPublicVerificationImageUrl({
  imageKey,
  token,
}: {
  imageKey: string | null;
  token: string;
}) {
  if (!imageKey) {
    return null;
  }

  const normalizedKey = imageKey
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/v/${encodeURIComponent(token)}/image/${normalizedKey}`;
}
