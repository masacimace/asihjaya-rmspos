import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  Clock3,
  FileText,
  PlayCircle,
  ReceiptText,
  ShoppingBag,
  Store,
  UserRound,
  WalletCards,
} from "lucide-react";

import { ShiftClosePanel } from "@/components/pos/shift-close-panel";
import type { PosShiftOverviewData } from "@/features/pos/contracts";
import { getPosShiftOverviewData } from "@/features/pos/queries";
import { requirePermission } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const runtime = "nodejs";

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash",
  qris_manual: "QRIS",
  qris_gateway: "QRIS Gateway",
  debit_card: "Debit",
  credit_card: "Credit",
  bank_transfer: "Transfer",
  other: "Lainnya",
};

const paymentStatusLabels: Record<"paid" | "partial" | "pending", string> = {
  paid: "Lunas",
  partial: "Sebagian",
  pending: "Belum lunas",
};

function formatMoney(value: string | number | null) {
  const parsedValue = typeof value === "number" ? value : Number(value ?? 0);

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(parsedValue) ? parsedValue : 0);
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
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

function formatPaymentMethods(methods: string[]) {
  if (methods.length === 0) {
    return "Belum ada payment";
  }

  return methods
    .map((method) => paymentMethodLabels[method] ?? method)
    .join(" + ");
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function getPaymentStatusLabel(status: "paid" | "partial" | "pending") {
  return paymentStatusLabels[status] ?? status;
}

function getPaymentShare(amount: number, totalAmount: number) {
  if (totalAmount <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (amount / totalAmount) * 100));
}

function buildShiftTransactionDetailHref(
  shiftId: string,
  transactionId: string,
) {
  const params = new URLSearchParams({
    range: "all",
    shift: shiftId,
    detail: transactionId,
  });

  return `/pos/transaksi?${params.toString()}`;
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
          <p className="mt-2 truncate text-xl font-semibold tracking-tight text-neutral-950">
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

function PaymentStatusBadge({
  status,
}: {
  status: "paid" | "partial" | "pending";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        status === "paid"
          ? "bg-emerald-50 text-emerald-700"
          : status === "partial"
            ? "bg-amber-50 text-amber-700"
            : "bg-neutral-100 text-neutral-600",
      )}
    >
      {getPaymentStatusLabel(status)}
    </span>
  );
}

function BreakdownRow({
  label,
  amount,
  helper,
  percentage,
}: {
  label: string;
  amount: number;
  helper: string;
  percentage: number;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-950">{label}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{helper}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-neutral-950">
            {formatMoney(amount)}
          </p>
          <p className="mt-1 text-[10px] font-semibold text-[var(--muted)]">
            {formatPercent(percentage)}
          </p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-neutral-950"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function StatusBreakdownRow({
  status,
  transactionCount,
  totalAmount,
  paidAmount,
}: {
  status: "paid" | "partial" | "pending";
  transactionCount: number;
  totalAmount: number;
  paidAmount: number;
}) {
  const percentage = getPaymentShare(paidAmount, totalAmount);

  return (
    <div className="rounded-2xl border border-[var(--border)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <PaymentStatusBadge status={status} />
          <p className="mt-2 text-xs text-[var(--muted)]">
            {transactionCount} transaksi · paid {formatPercent(percentage)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-neutral-950">
            {formatMoney(totalAmount)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Terbayar {formatMoney(paidAmount)}
          </p>
        </div>
      </div>
    </div>
  );
}

function OutletBadge({ data }: { data: PosShiftOverviewData }) {
  const isOnline = data.outlet?.hardwareStatus === "online";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm">
      <div className="flex items-start gap-3">
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
                isOnline
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-neutral-100 text-neutral-600",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  isOnline ? "bg-emerald-500" : "bg-neutral-400",
                )}
              />
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
          <p className="mt-1 truncate font-semibold text-neutral-950">
            {data.outlet?.name ?? "Outlet belum tersedia"}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyShiftState({ data }: { data: PosShiftOverviewData }) {
  return (
    <section className="mt-5 grid min-h-80 place-items-center rounded-2xl border border-dashed border-[var(--border)] bg-white p-8 text-center">
      <div>
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <PlayCircle className="size-7" />
        </div>
        <h2 className="mt-4 font-semibold text-neutral-950">
          Shift POS belum aktif
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
          {data.register
            ? `Register ${data.register.name} belum memiliki shift aktif. Buka shift dari halaman POS utama untuk mulai transaksi.`
            : "Register aktif belum tersedia untuk outlet ini. Hubungi admin untuk mengecek konfigurasi register."}
        </p>
        <Link
          href="/pos"
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold !text-white transition hover:bg-black/80"
        >
          Buka POS Utama
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

export default async function PosShiftPage() {
  const auth = await requirePermission("pos.access");
  const primaryOutlet =
    auth.outlets.find((outlet) => outlet.isPrimary) ?? auth.outlets[0];
  const data = await getPosShiftOverviewData({
    organizationId: auth.organization.id,
    outletId: primaryOutlet?.id,
  });
  const activeShift = data.activeShift;
  const shiftTransactionsHref = activeShift
    ? `/pos/transaksi?range=all&shift=${activeShift.id}`
    : "/pos/transaksi";

  return (
    <main className="p-4 pb-32 sm:p-6 lg:pb-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-[var(--muted)]">Aplikasi POS</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950">
              Ringkasan Shift
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Ringkasan shift berjalan untuk kasir: modal awal, expected cash,
              payment, transaksi, dan closing shift.
            </p>
          </div>
          <OutletBadge data={data} />
        </div>

        {!activeShift ? (
          <EmptyShiftState data={data} />
        ) : (
          <>
            <section className="mt-5 overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
              <div className="flex flex-col gap-4 border-b border-[var(--border)] bg-neutral-50 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Shift Aktif
                    </span>
                    <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold text-neutral-700">
                      {data.register?.name ?? "Register belum tersedia"}
                    </span>
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight text-neutral-950">
                    Dibuka {formatDateTime(activeShift.openedAt)}
                  </h2>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                    <UserRound className="size-4" />
                    {activeShift.openedByName ?? "Staff POS"}
                  </p>
                </div>

                <Link
                  href={shiftTransactionsHref}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
                >
                  <FileText className="size-4" />
                  Lihat Transaksi Shift
                </Link>
              </div>

              <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4 xl:p-5">
                <SummaryCard
                  title="Modal Awal"
                  value={formatMoney(activeShift.openingCash)}
                  helper="Kas awal saat shift dibuka."
                  icon={<Banknote className="size-5" />}
                />
                <SummaryCard
                  title="Expected Cash"
                  value={formatMoney(activeShift.expectedCash)}
                  helper="Modal awal + cash sale + kas masuk/keluar."
                  icon={<WalletCards className="size-5" />}
                />
                <SummaryCard
                  title="Transaksi"
                  value={String(
                    activeShift.transactionSummary.totalTransactions,
                  )}
                  helper={`${activeShift.transactionSummary.totalItems} item terjual.`}
                  icon={<ReceiptText className="size-5" />}
                />
                <SummaryCard
                  title="Total Nilai"
                  value={formatMoney(
                    activeShift.transactionSummary.totalAmount,
                  )}
                  helper="Nilai transaksi completed pada shift ini."
                  icon={<Clock3 className="size-5" />}
                />
              </div>
            </section>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
              <div className="space-y-5">
                <section className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-semibold text-neutral-950">
                        Payment Shift
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        Ringkasan payment dari transaksi completed selama shift
                        berjalan.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <SummaryCard
                      title="Total Terbayar"
                      value={formatMoney(
                        activeShift.transactionSummary.paidAmount,
                      )}
                      helper="Semua payment paid."
                      icon={<WalletCards className="size-5" />}
                    />
                    <SummaryCard
                      title="Cash Payment"
                      value={formatMoney(
                        activeShift.transactionSummary.cashPaymentAmount,
                      )}
                      helper="Masuk ke expected cash."
                      icon={<Banknote className="size-5" />}
                    />
                    <SummaryCard
                      title="Non-cash"
                      value={formatMoney(
                        activeShift.transactionSummary.nonCashPaymentAmount,
                      )}
                      helper="QRIS, EDC, transfer, dan lainnya."
                      icon={<ReceiptText className="size-5" />}
                    />
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] p-3 sm:p-4">
                      <h3 className="text-sm font-semibold text-neutral-950">
                        Breakdown Metode Payment
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        Nilai payment paid per metode selama shift ini.
                      </p>

                      {activeShift.paymentMethodSummary.length === 0 ? (
                        <p className="mt-3 rounded-2xl bg-neutral-50 p-3 text-xs leading-5 text-[var(--muted)]">
                          Belum ada payment paid pada shift ini.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {activeShift.paymentMethodSummary.map((item) => (
                            <BreakdownRow
                              key={item.method}
                              label={
                                paymentMethodLabels[item.method] ?? item.method
                              }
                              amount={item.amount}
                              helper={`${item.transactionCount} transaksi · ${item.paymentCount} payment`}
                              percentage={getPaymentShare(
                                item.amount,
                                activeShift.transactionSummary.paidAmount,
                              )}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] p-3 sm:p-4">
                      <h3 className="text-sm font-semibold text-neutral-950">
                        Status Payment Transaksi
                      </h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        Kontrol cepat transaksi lunas, sebagian, atau belum
                        lunas.
                      </p>

                      <div className="mt-3 space-y-3">
                        {activeShift.paymentStatusSummary.map((item) => (
                          <StatusBreakdownRow
                            key={item.status}
                            status={item.status}
                            transactionCount={item.transactionCount}
                            totalAmount={item.totalAmount}
                            paidAmount={item.paidAmount}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
                  <div>
                    <h2 className="font-semibold text-neutral-950">
                      Analitik Transaksi Shift
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                      Ringkasan cepat untuk evaluasi performa shift berjalan.
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <SummaryCard
                      title="Item Terjual"
                      value={String(activeShift.transactionSummary.totalItems)}
                      helper="Jumlah item fisik yang terjual."
                      icon={<ShoppingBag className="size-5" />}
                    />
                    <SummaryCard
                      title="Total Diskon"
                      value={formatMoney(
                        activeShift.transactionSummary.discountAmount,
                      )}
                      helper="Akumulasi diskon transaksi shift."
                      icon={<ReceiptText className="size-5" />}
                    />
                    <SummaryCard
                      title="Rata-rata Transaksi"
                      value={formatMoney(
                        activeShift.transactionSummary.averageTransactionAmount,
                      )}
                      helper="Average transaction value."
                      icon={<Clock3 className="size-5" />}
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-semibold text-neutral-950">
                        Transaksi Terbaru
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        Transaksi completed terakhir pada shift ini.
                      </p>
                    </div>
                    <Link
                      href={shiftTransactionsHref}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
                    >
                      Lihat semua
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>

                  {data.recentTransactions.length === 0 ? (
                    <p className="mt-4 rounded-2xl bg-neutral-50 p-4 text-sm leading-6 text-[var(--muted)]">
                      Belum ada transaksi completed pada shift ini.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {data.recentTransactions.map((transaction) => (
                        <article
                          key={transaction.id}
                          className="rounded-2xl border border-[var(--border)] p-3"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-neutral-950">
                                  {transaction.invoiceNumber}
                                </p>
                                <PaymentStatusBadge
                                  status={transaction.paymentStatus}
                                />
                              </div>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {formatDateTime(transaction.completedAt)} ·{" "}
                                {transaction.customerName ?? "Customer umum"}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {transaction.totalItems} item ·{" "}
                                {formatPaymentMethods(
                                  transaction.paymentMethods,
                                )}
                              </p>
                              {Number(transaction.discountAmount) > 0 ? (
                                <p className="mt-1 text-xs text-red-600">
                                  Diskon{" "}
                                  {formatMoney(transaction.discountAmount)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 flex-col items-start gap-2 text-left sm:items-end sm:text-right">
                              <div>
                                <p className="text-sm font-semibold text-neutral-950">
                                  {formatMoney(transaction.totalAmount)}
                                </p>
                                <p className="mt-1 text-xs text-[var(--muted)]">
                                  Paid {formatMoney(transaction.paidAmount)}
                                </p>
                              </div>
                              <Link
                                href={buildShiftTransactionDetailHref(
                                  activeShift.id,
                                  transaction.id,
                                )}
                                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
                              >
                                Detail
                                <ArrowRight className="size-3.5" />
                              </Link>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-5">
                <section className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
                  <h2 className="font-semibold text-neutral-950">
                    Breakdown Cash Drawer
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    Komponen pembentuk expected cash shift.
                  </p>

                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--muted)]">Modal awal</span>
                      <span className="font-semibold text-neutral-950">
                        {formatMoney(activeShift.cashSummary.openingBalance)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--muted)]">Cash sale</span>
                      <span className="font-semibold text-neutral-950">
                        {formatMoney(activeShift.cashSummary.cashSales)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--muted)]">Kas masuk</span>
                      <span className="font-semibold text-neutral-950">
                        {formatMoney(activeShift.cashSummary.cashIn)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--muted)]">Kas keluar</span>
                      <span className="font-semibold text-red-600">
                        -{formatMoney(activeShift.cashSummary.cashOut)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[var(--muted)]">Refund cash</span>
                      <span className="font-semibold text-red-600">
                        -{formatMoney(activeShift.cashSummary.cashRefunds)}
                      </span>
                    </div>
                    <div className="border-t border-[var(--border)] pt-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-neutral-950">
                          Expected cash
                        </span>
                        <span className="font-semibold text-neutral-950">
                          {formatMoney(activeShift.cashSummary.expectedCash)}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                <ShiftClosePanel
                  shiftId={activeShift.id}
                  registerId={data.register?.id ?? ""}
                  registerName={data.register?.name ?? "Register POS"}
                  expectedCash={activeShift.expectedCash}
                />
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
