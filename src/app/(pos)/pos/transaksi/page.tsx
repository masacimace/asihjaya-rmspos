import Link from "next/link";
import {
  Clock3,
  FileText,
  Package,
  Printer,
  ReceiptText,
  Search,
  ShoppingBag,
  Store,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import type {
  PosTransactionDetailData,
  PosTransactionListItem,
  PosTransactionRange,
} from "@/features/pos/contracts";
import { reprintPosReceiptCertificateAction } from "@/app/actions/pos";
import { PrintJobAutoRefresh } from "@/components/pos/print-job-auto-refresh";
import {
  getPosTransactionDetailData,
  getPosTransactionListData,
} from "@/features/pos/queries";
import { requirePermission } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const runtime = "nodejs";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PosTransactionFeedbackType = "success" | "error" | "info";

const rangeLabels: Record<PosTransactionRange, string> = {
  today: "Hari ini",
  "7d": "7 hari",
  "30d": "30 hari",
  all: "Semua",
};

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash",
  qris_manual: "QRIS",
  qris_gateway: "QRIS Gateway",
  debit_card: "Debit",
  credit_card: "Credit",
  bank_transfer: "Transfer",
  other: "Lainnya",
};

const hardwareJobStatusLabels: Record<string, string> = {
  pending: "Menunggu",
  claimed: "Diambil agent",
  printing: "Printing",
  completed: "Selesai",
  failed: "Gagal",
  cancelled: "Dibatalkan",
};

const activeHardwareJobStatuses = new Set(["pending", "claimed", "printing"]);

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

function normalizeRange(value?: string): PosTransactionRange {
  if (value === "7d" || value === "30d" || value === "all") {
    return value;
  }

  return "today";
}

function normalizeFeedbackType(value?: string): PosTransactionFeedbackType {
  if (value === "success" || value === "error") {
    return value;
  }

  return "info";
}

function buildTransactionsHref({
  query,
  range,
  detailId,
  shiftId,
}: {
  query: string;
  range: PosTransactionRange;
  detailId?: string | null;
  shiftId?: string | null;
}) {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  if (range !== "today") {
    params.set("range", range);
  }

  if (detailId) {
    params.set("detail", detailId);
  }

  if (shiftId) {
    params.set("shift", shiftId);
  }

  const queryString = params.toString();

  return `/pos/transaksi${queryString ? `?${queryString}` : ""}`;
}

function formatMoney(value: string | number | null) {
  const parsedValue = typeof value === "number" ? value : Number(value ?? 0);

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(parsedValue) ? parsedValue : 0);
}

function formatTransactionDate(value: Date | null) {
  if (!value) {
    return "Belum selesai";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function formatShiftOpenedAt(value: Date | null) {
  if (!value) {
    return "Data shift tidak ditemukan";
  }

  return `Dibuka ${new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(value)}`;
}

function formatItemSpec(value: string | null, suffix: string) {
  if (!value) {
    return null;
  }

  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return `${new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 3,
  }).format(parsedValue)} ${suffix}`;
}

function getPaymentMethodSummary(transaction: PosTransactionListItem) {
  if (transaction.payments.length === 0) {
    return "Belum ada payment";
  }

  return transaction.payments
    .map((payment) => paymentMethodLabels[payment.method] ?? payment.method)
    .join(" + ");
}

function getPaymentStatusLabel(
  transaction: Pick<PosTransactionListItem, "paymentStatus">,
) {
  if (transaction.paymentStatus === "paid") {
    return "Lunas";
  }

  if (transaction.paymentStatus === "partial") {
    return "Sebagian";
  }

  return "Belum lunas";
}

function SummaryCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-[var(--muted)]">{title}</p>
          <p className="mt-2 truncate text-md font-semibold text-neutral-950 sm:text-sm">
            {value}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{helper}</p>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          {icon}
        </div>
      </div>
    </article>
  );
}

function PaymentStatusPill({
  transaction,
}: {
  transaction: Pick<PosTransactionListItem, "paymentStatus">;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        transaction.paymentStatus === "paid"
          ? "bg-emerald-50 text-emerald-700"
          : transaction.paymentStatus === "partial"
            ? "bg-amber-50 text-amber-700"
            : "bg-neutral-100 text-neutral-600",
      )}
    >
      {getPaymentStatusLabel(transaction)}
    </span>
  );
}

function HardwareJobStatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        status === "completed"
          ? "bg-emerald-50 text-emerald-700"
          : status === "failed" || status === "cancelled"
            ? "bg-red-50 text-red-700"
            : "bg-amber-50 text-amber-700",
      )}
    >
      {hardwareJobStatusLabels[status] ?? status}
    </span>
  );
}

function TransactionItemsPreview({
  transaction,
}: {
  transaction: PosTransactionListItem;
}) {
  const previewItems = transaction.items.slice(0, 3);
  const hiddenCount = Math.max(
    transaction.items.length - previewItems.length,
    0,
  );

  if (transaction.items.length === 0) {
    return (
      <span className="text-xs text-[var(--muted)]">Item belum terbaca</span>
    );
  }

  return (
    <div className="space-y-1">
      {previewItems.map((item) => (
        <p
          key={item.productItemId}
          className="truncate text-xs text-neutral-700"
        >
          <span className="font-semibold text-neutral-900">{item.sku}</span> ·{" "}
          {item.productName}
        </p>
      ))}
      {hiddenCount > 0 ? (
        <p className="text-xs text-[var(--muted)]">+{hiddenCount} item lain</p>
      ) : null}
    </div>
  );
}

function TransactionFeedbackNotice({
  type,
  message,
}: {
  type: PosTransactionFeedbackType;
  message: string;
}) {
  return (
    <section
      className={cn(
        "mt-5 rounded-2xl border p-4 text-sm leading-6",
        type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : type === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      {message}
    </section>
  );
}

function TransactionCard({
  transaction,
  detailHref,
  isSelected,
}: {
  transaction: PosTransactionListItem;
  detailHref: string;
  isSelected: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-2xl border bg-white p-4 sm:hidden",
        isSelected
          ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]"
          : "border-[var(--border)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-neutral-950">
            {transaction.invoiceNumber}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {formatTransactionDate(
              transaction.completedAt ?? transaction.createdAt,
            )}
          </p>
        </div>
        <PaymentStatusPill transaction={transaction} />
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="text-[var(--muted)]">Customer</span>
          <span className="min-w-0 text-right">
            <span className="block truncate font-medium text-neutral-900">
              {transaction.customerName ?? "Customer umum"}
            </span>
            {transaction.customerCode ? (
              <span className="mt-0.5 block truncate text-xs font-medium text-[var(--accent)]">
                {transaction.customerCode}
              </span>
            ) : null}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[var(--muted)]">Total</span>
          <span className="font-semibold text-neutral-950">
            {formatMoney(transaction.totalAmount)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[var(--muted)]">Payment</span>
          <span className="truncate font-medium text-neutral-900">
            {getPaymentMethodSummary(transaction)}
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-neutral-50 p-3">
        <TransactionItemsPreview transaction={transaction} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={detailHref}
          className={cn(
            "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition hover:bg-neutral-50",
            isSelected
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-[var(--border)] text-neutral-700",
          )}
        >
          <Package className="size-3.5" />
          Detail
        </Link>
        <a
          href={`/api/sales/${transaction.id}/receipt-certificate`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
        >
          <FileText className="size-3.5" />
          Lihat Invoice
        </a>
      </div>
    </article>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <h3 className="font-semibold text-neutral-950">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function TransactionDetailPanel({
  detail,
  closeHref,
  reprintReturnHref,
}: {
  detail: PosTransactionDetailData;
  closeHref: string;
  reprintReturnHref: string;
}) {
  const hasActivePrintJob = detail.hardwareJobs.some((job) =>
    activeHardwareJobStatuses.has(job.status),
  );

  return (
    <section
      id="detail-transaksi"
      className="mt-5 overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-sm"
    >
      <div className="flex flex-col gap-4 border-b border-[var(--border)] bg-neutral-50 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">
            Detail Transaksi
          </p>
          <h2 className="mt-2 text-xl font-semibold text-neutral-950">
            {detail.invoiceNumber}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatTransactionDate(detail.completedAt ?? detail.createdAt)} ·{" "}
            {detail.registerName} · {detail.cashierName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PaymentStatusPill transaction={detail} />
          <a
            href={`/api/sales/${detail.id}/receipt-certificate`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
          >
            <FileText className="size-3.5" />
            Lihat Invoice
          </a>
          <Link
            href={closeHref}
            className="grid size-10 place-items-center rounded-xl border border-[var(--border)] bg-white text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-950"
            aria-label="Tutup detail transaksi"
          >
            <X className="size-4" />
          </Link>
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-5">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Subtotal"
              value={formatMoney(detail.subtotalAmount)}
              helper="Nilai item sebelum penyesuaian."
              icon={<ShoppingBag className="size-5" />}
            />
            <SummaryCard
              title="Diskon"
              value={formatMoney(detail.discountAmount)}
              helper={detail.discountReason ?? "Tidak ada alasan diskon."}
              icon={<ReceiptText className="size-5" />}
            />
            <SummaryCard
              title="Total"
              value={formatMoney(detail.totalAmount)}
              helper="Total final transaksi."
              icon={<WalletCards className="size-5" />}
            />
            <SummaryCard
              title="Terbayar"
              value={formatMoney(detail.paidAmount)}
              helper={getPaymentStatusLabel(detail)}
              icon={<Clock3 className="size-5" />}
            />
          </div>

          <DetailSection title="Item Terjual">
            <div className="space-y-3">
              {detail.items.map((item) => {
                const specs = [
                  formatItemSpec(item.weightGram, "gr"),
                  item.exchangePurityPercent
                    ? `Kadar ${formatItemSpec(item.exchangePurityPercent, "%")}`
                    : item.purityPercent
                      ? `Kadar ${formatItemSpec(item.purityPercent, "%")}`
                      : null,
                  item.size ? `Uk. ${item.size}` : null,
                  item.color,
                  item.gemstone,
                ].filter((spec): spec is string => Boolean(spec));

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-[var(--border)] p-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-neutral-950">
                          {item.productName}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {item.sku} · {item.barcode}
                          {item.serialNumber
                            ? ` · SN ${item.serialNumber}`
                            : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-[10px] font-semibold text-[var(--accent)]">
                            {item.categoryName}
                          </span>
                          {specs.map((spec) => (
                            <span
                              key={spec}
                              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] font-medium text-neutral-700"
                            >
                              {spec}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-sm font-semibold text-neutral-950">
                          {formatMoney(item.finalPriceAmount)}
                        </p>
                        {Number(item.discountAmount) > 0 ? (
                          <p className="mt-1 text-xs text-red-600">
                            Diskon {formatMoney(item.discountAmount)}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Harga list {formatMoney(item.listPriceAmount)}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </DetailSection>

          <DetailSection title="Payment">
            <div className="space-y-3">
              {detail.payments.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  Belum ada payment.
                </p>
              ) : (
                detail.payments.map((payment) => (
                  <article
                    key={payment.id}
                    className="rounded-2xl border border-[var(--border)] p-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-neutral-950">
                          {paymentMethodLabels[payment.method] ??
                            payment.method}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {payment.provider}
                          {payment.providerReference
                            ? ` · Ref ${payment.providerReference}`
                            : ""}
                        </p>
                        {payment.note ? (
                          <p className="mt-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                            {payment.note}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-sm font-semibold text-neutral-950">
                          {formatMoney(payment.amount)}
                        </p>
                        {payment.receivedAmount ? (
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            Diterima {formatMoney(payment.receivedAmount)}
                          </p>
                        ) : null}
                        {payment.changeAmount ? (
                          <p className="mt-1 text-xs text-emerald-700">
                            Kembalian {formatMoney(payment.changeAmount)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </DetailSection>
        </div>

        <aside className="space-y-4">
          <DetailSection title="Customer">
            <div className="flex items-start gap-3">
              <UserRound className="mt-0.5 size-5 shrink-0 text-[var(--accent)]" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-neutral-950">
                  {detail.customer?.name ?? "Customer umum"}
                </p>
                {detail.customer ? (
                  <div className="mt-2 space-y-1 text-xs leading-5 text-[var(--muted)]">
                    <p>Kode: {detail.customer.code}</p>
                    {detail.customer.phone ? (
                      <p>Telepon: {detail.customer.phone}</p>
                    ) : null}
                    {detail.customer.email ? (
                      <p>Email: {detail.customer.email}</p>
                    ) : null}
                    {detail.customer.address ? (
                      <p>Alamat: {detail.customer.address}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                    Transaksi ini belum dikaitkan ke data pelanggan.
                  </p>
                )}
              </div>
            </div>
          </DetailSection>

          <DetailSection title="Dokumen & Print Job">
            <div className="space-y-3">
              <a
                href={`/api/sales/${detail.id}/receipt-certificate`}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
              >
                <FileText className="size-4" />
                Lihat Invoice
              </a>

              <form action={reprintPosReceiptCertificateAction}>
                <input type="hidden" name="saleId" value={detail.id} />
                <input
                  type="hidden"
                  name="returnTo"
                  value={reprintReturnHref}
                />
                <button
                  type="submit"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold !text-white transition hover:bg-black/80"
                >
                  <Printer className="size-4" />
                  Cetak Ulang Invoice
                </button>
              </form>

              <PrintJobAutoRefresh enabled={hasActivePrintJob} />

              {detail.hardwareJobs.length === 0 ? (
                <p className="rounded-2xl bg-neutral-50 p-3 text-xs leading-5 text-[var(--muted)]">
                  Belum ada hardware job yang terhubung ke transaksi ini.
                </p>
              ) : (
                detail.hardwareJobs.map((job) => (
                  <article
                    key={job.id}
                    className="rounded-2xl border border-[var(--border)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-semibold text-neutral-950">
                          <Printer className="size-4 text-[var(--accent)]" />
                          {job.jobType}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {job.deviceType} · attempt {job.attempts}/
                          {job.maxAttempts}
                        </p>
                      </div>
                      <HardwareJobStatusPill status={job.status} />
                    </div>
                    {job.error ? (
                      <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                        {job.error}
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </DetailSection>

          <DetailSection title="Meta Operasional">
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs uppercase text-[var(--muted)]">Outlet</p>
                <p className="mt-1 font-medium text-neutral-950">
                  {detail.outletName}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[var(--muted)]">
                  Register
                </p>
                <p className="mt-1 font-medium text-neutral-950">
                  {detail.registerName}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[var(--muted)]">Cashier</p>
                <p className="mt-1 font-medium text-neutral-950">
                  {detail.cashierName}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[var(--muted)]">Shift</p>
                <p className="mt-1 font-medium text-neutral-950">
                  {formatShiftOpenedAt(detail.shiftOpenedAt)}
                </p>
              </div>
              {detail.notes ? (
                <div>
                  <p className="text-xs uppercase text-[var(--muted)]">
                    Catatan
                  </p>
                  <p className="mt-1 rounded-xl bg-neutral-50 p-3 text-neutral-700">
                    {detail.notes}
                  </p>
                </div>
              ) : null}
            </div>
          </DetailSection>
        </aside>
      </div>
    </section>
  );
}

export default async function PosTransactionsPage({ searchParams }: PageProps) {
  const auth = await requirePermission("pos.access");
  const resolvedSearchParams = (await searchParams) ?? {};
  const query = getSearchParam(resolvedSearchParams, "q")?.trim() ?? "";
  const range = normalizeRange(getSearchParam(resolvedSearchParams, "range"));
  const detailId = getSearchParam(resolvedSearchParams, "detail")?.trim() ?? "";
  const shiftId = getSearchParam(resolvedSearchParams, "shift")?.trim() ?? "";
  const feedbackMessage =
    getSearchParam(resolvedSearchParams, "feedbackMessage")?.trim() ?? "";
  const feedbackType = normalizeFeedbackType(
    getSearchParam(resolvedSearchParams, "feedbackType"),
  );
  const primaryOutlet =
    auth.outlets.find((outlet) => outlet.isPrimary) ?? auth.outlets[0];

  const [data, selectedTransactionDetail] = await Promise.all([
    getPosTransactionListData({
      organizationId: auth.organization.id,
      outletId: primaryOutlet?.id,
      query,
      range,
      shiftId,
    }),
    detailId
      ? getPosTransactionDetailData({
          organizationId: auth.organization.id,
          outletId: primaryOutlet?.id,
          saleId: detailId,
        })
      : Promise.resolve(null),
  ]);
  const detailCloseHref = buildTransactionsHref({
    query: data.query,
    range: data.range,
    shiftId: data.shiftId,
  });
  const detailCurrentHref = buildTransactionsHref({
    query: data.query,
    range: data.range,
    detailId,
    shiftId: data.shiftId,
  });
  const isOutletOnline = data.outlet?.hardwareStatus === "online";

  return (
    <main className="p-4 pb-32 sm:p-6 lg:pb-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-[var(--muted)]">Aplikasi POS</p>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-950">
              Daftar Transaksi
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Daftar transaksi real dari outlet aktif untuk cek invoice,
              customer, item, payment, dan buka ulang dokumen A5.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <Store className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase text-[var(--muted)]">
                    Outlet
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      isOutletOnline
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        isOutletOnline ? "bg-emerald-500" : "bg-red-500",
                      )}
                    />
                    {isOutletOnline ? "Online" : "Offline"}
                  </span>
                </div>
                <p className="mt-1 truncate font-semibold text-neutral-950">
                  {data.outlet?.name ?? "Outlet belum tersedia"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            title="Transaksi tampil"
            value={String(data.summary.totalTransactions)}
            helper={`Filter: ${rangeLabels[data.range]}`}
            icon={<ReceiptText className="size-5" />}
          />
          <SummaryCard
            title="Total nilai"
            value={formatMoney(data.summary.totalAmount)}
            helper="Akumulasi transaksi yang sedang ditampilkan."
            icon={<WalletCards className="size-5" />}
          />
          <SummaryCard
            title="Item terjual"
            value={String(data.summary.totalItems)}
            helper="Jumlah item fisik pada transaksi tampil."
            icon={<ShoppingBag className="size-5" />}
          />
        </div>

        <section className="mt-5 rounded-2xl border border-[var(--border)] bg-white p-4">
          <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <label className="flex h-11 min-w-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-3">
              <Search className="size-4 shrink-0 text-neutral-400" />
              <input
                type="search"
                name="q"
                defaultValue={data.query}
                placeholder="Cari invoice, customer, SKU, barcode, nama item..."
                className="min-w-0 flex-1 bg-transparent text-sm text-neutral-950 outline-none placeholder:text-neutral-400"
              />
              {data.shiftId ? (
                <input type="hidden" name="shift" value={data.shiftId} />
              ) : null}
            </label>

            <div className="flex flex-wrap gap-2">
              {(Object.keys(rangeLabels) as PosTransactionRange[]).map(
                (rangeValue) => (
                  <button
                    key={rangeValue}
                    type="submit"
                    name="range"
                    value={rangeValue}
                    className={cn(
                      "h-10 rounded-xl px-3 text-xs font-semibold transition",
                      data.range === rangeValue
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[var(--border)] bg-white text-neutral-700 hover:bg-neutral-50",
                    )}
                  >
                    {rangeLabels[rangeValue]}
                  </button>
                ),
              )}
            </div>
          </form>

          {data.query ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Search aktif: <span className="font-semibold">{data.query}</span>.
              Kosongkan kolom pencarian lalu submit untuk kembali melihat semua
              transaksi pada rentang ini.
            </p>
          ) : null}

          {data.shiftId ? (
            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
              Filter shift aktif sedang digunakan.{" "}
              <Link
                href={buildTransactionsHref({
                  query: data.query,
                  range: data.range,
                })}
                className="font-semibold text-[var(--accent)] hover:underline"
              >
                Hapus filter shift
              </Link>
            </p>
          ) : null}
        </section>

        {feedbackMessage ? (
          <TransactionFeedbackNotice
            type={feedbackType}
            message={feedbackMessage}
          />
        ) : null}

        {selectedTransactionDetail ? (
          <TransactionDetailPanel
            detail={selectedTransactionDetail}
            closeHref={detailCloseHref}
            reprintReturnHref={detailCurrentHref}
          />
        ) : detailId ? (
          <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
            Detail transaksi tidak ditemukan untuk outlet aktif ini, atau
            transaksi sudah tidak termasuk status completed.
          </section>
        ) : null}

        {data.transactions.length === 0 ? (
          <section className="mt-5 grid min-h-72 place-items-center rounded-2xl border border-dashed border-[var(--border)] bg-white p-8 text-center">
            <div>
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <ReceiptText className="size-7" />
              </div>
              <h2 className="mt-4 font-semibold text-neutral-950">
                Transaksi belum ditemukan
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                Belum ada transaksi completed untuk filter ini. Coba ubah
                rentang waktu atau kata kunci pencarian.
              </p>
            </div>
          </section>
        ) : (
          <>
            <div className="mt-5 space-y-3 sm:hidden">
              {data.transactions.map((transaction) => (
                <TransactionCard
                  key={transaction.id}
                  transaction={transaction}
                  detailHref={buildTransactionsHref({
                    query: data.query,
                    range: data.range,
                    detailId: transaction.id,
                    shiftId: data.shiftId,
                  })}
                  isSelected={transaction.id === detailId}
                />
              ))}
            </div>

            <section className="mt-5 hidden overflow-hidden rounded-2xl border border-[var(--border)] bg-white sm:block">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 !font-medium">Invoice</th>
                      <th className="px-4 py-3 !font-medium">Customer</th>
                      <th className="px-4 py-3 !font-medium">Item</th>
                      <th className="px-4 py-3 !font-medium">Payment</th>
                      <th className="px-4 py-3 text-right !font-medium">
                        Total
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {data.transactions.map((transaction) => {
                      const isSelected = transaction.id === detailId;

                      return (
                        <tr
                          key={transaction.id}
                          className={cn(
                            "align-top",
                            isSelected && "bg-[var(--accent-soft)]/30",
                          )}
                        >
                          <td className="px-4 py-4">
                            <p className="font-semibold text-neutral-950">
                              {transaction.invoiceNumber}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {formatTransactionDate(
                                transaction.completedAt ??
                                  transaction.createdAt,
                              )}
                            </p>
                            <p className="mt-1 text-xs text-[var(--muted)]">
                              {transaction.registerName} ·{" "}
                              {transaction.cashierName}
                            </p>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-start gap-2">
                              <UserRound className="mt-0.5 size-4 shrink-0 text-neutral-400" />
                              <div className="min-w-0">
                                <p className="font-medium text-neutral-900">
                                  {transaction.customerName ?? "Customer umum"}
                                </p>
                                {transaction.customerCode ? (
                                  <p className="mt-1 text-xs font-medium text-[var(--accent)]">
                                    {transaction.customerCode}
                                  </p>
                                ) : null}
                                {transaction.customerPhone ? (
                                  <p className="mt-1 text-xs text-[var(--muted)]">
                                    {transaction.customerPhone}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="max-w-[280px] px-4 py-4">
                            <TransactionItemsPreview
                              transaction={transaction}
                            />
                          </td>
                          <td className="px-4 py-4">
                            <PaymentStatusPill transaction={transaction} />
                            <p className="mt-2 text-xs text-[var(--muted)]">
                              {getPaymentMethodSummary(transaction)}
                            </p>
                            <p className="mt-1 text-xs font-medium text-neutral-800">
                              Paid {formatMoney(transaction.paidAmount)}
                            </p>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <p className="font-semibold text-neutral-950">
                              {formatMoney(transaction.totalAmount)}
                            </p>
                            {Number(transaction.discountAmount) > 0 ? (
                              <p className="mt-1 text-xs text-red-600">
                                Diskon {formatMoney(transaction.discountAmount)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="inline-flex flex-col gap-2">
                              <Link
                                href={buildTransactionsHref({
                                  query: data.query,
                                  range: data.range,
                                  detailId: transaction.id,
                                  shiftId: data.shiftId,
                                })}
                                className={cn(
                                  "inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition",
                                  isSelected
                                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                    : "border border-[var(--border)] text-neutral-700 hover:bg-neutral-50",
                                )}
                              >
                                <Package className="size-3.5" />
                                Detail
                              </Link>
                              <a
                                href={`/api/sales/${transaction.id}/receipt-certificate`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
                              >
                                <FileText className="size-3.5" />
                                Lihat Invoice
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
