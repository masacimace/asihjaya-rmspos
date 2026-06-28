import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Info,
  Mail,
  MapPin,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Store,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";

import { createPosCustomerAction } from "@/app/actions/pos";
import type {
  PosCustomerListData,
  PosCustomerListItem,
} from "@/features/pos/contracts";
import { getPosCustomerListData } from "@/features/pos/queries";
import { requirePermission } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const runtime = "nodejs";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type PosCustomerFeedbackType = "success" | "error" | "info";

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

function normalizeFeedbackType(value?: string): PosCustomerFeedbackType {
  if (value === "success" || value === "error") {
    return value;
  }

  return "info";
}

function buildCustomersHref({ query }: { query?: string | null }) {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  const queryString = params.toString();

  return `/pos/pelanggan${queryString ? `?${queryString}` : ""}`;
}

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
    return "Belum ada transaksi";
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

function formatCustomerCode(
  customer: Pick<PosCustomerListItem, "customerCode">,
) {
  return customer.customerCode?.trim() || "Tanpa kode";
}

function buildTransactionsHref(customer: PosCustomerListItem) {
  const params = new URLSearchParams({
    range: "all",
    q: customer.customerCode || customer.fullName,
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
          <p className="mt-2 truncate text-xl font-semibold text-neutral-950">
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

function OutletBadge({ data }: { data: PosCustomerListData }) {
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

function CustomerContactInfo({ customer }: { customer: PosCustomerListItem }) {
  return (
    <div className="mt-3 space-y-1.5 text-xs leading-5 text-[var(--muted)]">
      {customer.phone ? (
        <p className="flex min-w-0 items-center gap-2">
          <Phone className="size-3.5 shrink-0" />
          <span className="truncate">{customer.phone}</span>
        </p>
      ) : null}
      {customer.email ? (
        <p className="flex min-w-0 items-center gap-2">
          <Mail className="size-3.5 shrink-0" />
          <span className="truncate">{customer.email}</span>
        </p>
      ) : null}
      {customer.address ? (
        <p className="flex min-w-0 items-center gap-2">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{customer.address}</span>
        </p>
      ) : null}
      {!customer.phone && !customer.email && !customer.address ? (
        <p>Kontak belum dilengkapi.</p>
      ) : null}
    </div>
  );
}

function CustomerFeedbackNotice({
  type,
  message,
}: {
  type: PosCustomerFeedbackType;
  message: string;
}) {
  const icon =
    type === "success" ? (
      <CheckCircle2 className="size-4" />
    ) : type === "error" ? (
      <AlertCircle className="size-4" />
    ) : (
      <Info className="size-4" />
    );

  return (
    <section
      className={cn(
        "mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6",
        type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : type === "error"
            ? "border-red-200 bg-red-50 text-red-800"
            : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      <div className="mt-0.5 shrink-0">{icon}</div>
      <p>{message}</p>
    </section>
  );
}

function QuickCreateCustomerForm({ returnTo }: { returnTo: string }) {
  return (
    <section className="mt-5 rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-neutral-950">
            Tambah Customer Cepat
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--muted)]">
            Buat data pelanggan dari POS. Kode customer akan dibuat otomatis dan
            customer langsung muncul di daftar pelanggan.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
          <Plus className="size-3.5" />
          Quick create
        </div>
      </div>

      <form action={createPosCustomerAction} className="mt-4 grid gap-3">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="grid gap-3 lg:grid-cols-3">
          <label className="grid gap-1.5 text-sm lg:col-span-1">
            <span className="text-xs font-semibold uppercase text-[var(--muted)]">
              Nama Customer
            </span>
            <input
              name="fullName"
              required
              maxLength={180}
              placeholder="Contoh: Siti Aminah"
              className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-semibold uppercase text-[var(--muted)]">
              Nomor HP
            </span>
            <input
              name="phone"
              maxLength={32}
              inputMode="tel"
              placeholder="08xxxxxxxxxx"
              className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-semibold uppercase text-[var(--muted)]">
              Email
            </span>
            <input
              name="email"
              type="email"
              maxLength={254}
              placeholder="customer@email.com"
              className="h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)]"
            />
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-semibold uppercase text-[var(--muted)]">
              Alamat
            </span>
            <textarea
              name="address"
              rows={3}
              maxLength={1000}
              placeholder="Alamat customer jika tersedia"
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)]"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-xs font-semibold uppercase text-[var(--muted)]">
              Catatan
            </span>
            <textarea
              name="notes"
              rows={3}
              maxLength={500}
              placeholder="Catatan opsional untuk kasir"
              className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)]"
            />
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--muted)]">
            Minimal isi nama customer. Nomor HP atau email membantu menghindari
            data customer dobel.
          </p>
          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
          >
            <Plus className="size-4" />
            Simpan Customer
          </button>
        </div>
      </form>
    </section>
  );
}

function CustomerCard({ customer }: { customer: PosCustomerListItem }) {
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:hidden">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <UserRound className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-neutral-950">
            {customer.fullName}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {formatCustomerCode(customer)}
          </p>
        </div>
      </div>

      <CustomerContactInfo customer={customer} />

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-neutral-50 p-3 text-sm">
        <div>
          <p className="text-xs text-[var(--muted)]">Transaksi</p>
          <p className="mt-1 font-semibold text-neutral-950">
            {customer.totalTransactions}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted)]">Total nilai</p>
          <p className="mt-1 truncate font-semibold text-neutral-950">
            {formatMoney(customer.totalAmount)}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border)] p-3">
        <p className="text-xs text-[var(--muted)]">Transaksi terakhir</p>
        {customer.lastTransaction ? (
          <div className="mt-2">
            <p className="font-semibold text-neutral-950">
              {customer.lastTransaction.invoiceNumber}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {formatDateTime(customer.lastTransaction.completedAt)} ·{" "}
              {formatMoney(customer.lastTransaction.totalAmount)}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Belum ada transaksi completed di outlet aktif.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link
          href={
            customer.totalTransactions > 0
              ? buildTransactionsHref(customer)
              : "/pos/transaksi"
          }
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
        >
          <ReceiptText className="size-3.5" />
          Transaksi
        </Link>
        <Link
          href="/pos"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
        >
          <ArrowRight className="size-3.5" />
          Ke POS
        </Link>
      </div>
    </article>
  );
}

export default async function PosCustomersPage({ searchParams }: PageProps) {
  const auth = await requirePermission("pos.access");
  const resolvedSearchParams = (await searchParams) ?? {};
  const query = getSearchParam(resolvedSearchParams, "q")?.trim() ?? "";
  const feedbackMessage =
    getSearchParam(resolvedSearchParams, "feedbackMessage")?.trim() ?? "";
  const feedbackType = normalizeFeedbackType(
    getSearchParam(resolvedSearchParams, "feedbackType"),
  );
  const primaryOutlet =
    auth.outlets.find((outlet) => outlet.isPrimary) ?? auth.outlets[0];
  const data = await getPosCustomerListData({
    organizationId: auth.organization.id,
    outletId: primaryOutlet?.id,
    query,
  });
  const currentHref = buildCustomersHref({ query: data.query });

  return (
    <main className="p-4 pb-32 sm:p-6 lg:pb-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-[var(--muted)]">Aplikasi POS</p>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-950">
              Daftar Customer
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Data pelanggan real untuk cek kontak, histori transaksi outlet
              aktif, dan persiapan customer selector di checkout POS.
            </p>
          </div>
          <OutletBadge data={data} />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard
            title="Customer tampil"
            value={String(data.summary.totalCustomers)}
            helper={
              data.query
                ? `Search: ${data.query}`
                : "Customer aktif organisasi."
            }
            icon={<UsersRound className="size-5" />}
          />
          <SummaryCard
            title="Pernah transaksi"
            value={String(data.summary.customersWithTransactions)}
            helper="Customer dengan transaksi completed di outlet aktif."
            icon={<ReceiptText className="size-5" />}
          />
          <SummaryCard
            title="Total nilai"
            value={formatMoney(data.summary.totalTransactionAmount)}
            helper="Akumulasi transaksi customer yang sedang ditampilkan."
            icon={<WalletCards className="size-5" />}
          />
        </div>

        <QuickCreateCustomerForm returnTo={currentHref} />

        <section className="mt-5 rounded-2xl border border-[var(--border)] bg-white p-4">
          <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <label className="flex h-11 min-w-0 items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-3">
              <Search className="size-4 shrink-0 text-neutral-400" />
              <input
                type="search"
                name="q"
                defaultValue={data.query}
                placeholder="Cari nama, kode customer, nomor HP, email..."
                className="min-w-0 flex-1 bg-transparent text-sm text-neutral-950 outline-none placeholder:text-neutral-400"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
              >
                <Search className="size-4" />
                Cari
              </button>
              {data.query ? (
                <Link
                  href="/pos/pelanggan"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
                >
                  Reset
                </Link>
              ) : null}
            </div>
          </form>

          {data.query ? (
            <p className="mt-3 text-xs text-[var(--muted)]">
              Search aktif: <span className="font-semibold">{data.query}</span>.
              Reset pencarian untuk kembali melihat customer aktif.
            </p>
          ) : null}
        </section>

        {feedbackMessage ? (
          <CustomerFeedbackNotice
            type={feedbackType}
            message={feedbackMessage}
          />
        ) : null}

        {data.customers.length === 0 ? (
          <section className="mt-5 grid min-h-72 place-items-center rounded-2xl border border-dashed border-[var(--border)] bg-white p-8 text-center">
            <div>
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                <UsersRound className="size-7" />
              </div>
              <h2 className="mt-4 font-semibold text-neutral-950">
                Customer belum ditemukan
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                Belum ada customer aktif untuk filter ini. Coba ubah kata kunci
                pencarian atau gunakan form Tambah Customer Cepat di atas.
              </p>
            </div>
          </section>
        ) : (
          <>
            <div className="mt-5 space-y-3 sm:hidden">
              {data.customers.map((customer) => (
                <CustomerCard key={customer.id} customer={customer} />
              ))}
            </div>

            <section className="mt-5 hidden overflow-hidden rounded-2xl border border-[var(--border)] bg-white sm:block">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                  <thead className="bg-neutral-50 text-left text-xs uppercase text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 !font-medium">Customer</th>
                      <th className="px-4 py-3 !font-medium">Kontak</th>
                      <th className="px-4 py-3 !font-medium">
                        Transaksi terakhir
                      </th>
                      <th className="px-4 py-3 text-right !font-medium">
                        Total
                      </th>
                      <th className="px-4 py-3 text-right !font-medium">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {data.customers.map((customer) => (
                      <tr key={customer.id} className="align-top">
                        <td className="px-4 py-4">
                          <div className="flex items-start gap-3">
                            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                              <UserRound className="size-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-neutral-950">
                                {customer.fullName}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {formatCustomerCode(customer)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[260px] px-4 py-4">
                          <CustomerContactInfo customer={customer} />
                        </td>
                        <td className="px-4 py-4">
                          {customer.lastTransaction ? (
                            <div>
                              <p className="font-semibold text-neutral-950">
                                {customer.lastTransaction.invoiceNumber}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {formatDateTime(
                                  customer.lastTransaction.completedAt,
                                )}
                              </p>
                              <p className="mt-1 text-xs font-medium text-neutral-800">
                                {formatMoney(
                                  customer.lastTransaction.totalAmount,
                                )}
                              </p>
                            </div>
                          ) : (
                            <p className="text-sm text-[var(--muted)]">
                              Belum ada transaksi completed di outlet aktif.
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <p className="font-semibold text-neutral-950">
                            {formatMoney(customer.totalAmount)}
                          </p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {customer.totalTransactions} transaksi
                          </p>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <div className="inline-flex flex-col gap-2">
                            <Link
                              href={
                                customer.totalTransactions > 0
                                  ? buildTransactionsHref(customer)
                                  : "/pos/transaksi"
                              }
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
                            >
                              <ReceiptText className="size-3.5" />
                              Transaksi
                            </Link>
                            <Link
                              href="/pos"
                              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50"
                            >
                              <ArrowRight className="size-3.5" />
                              Ke POS
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
              Tombol pilihan customer ke checkout akan diaktifkan pada POS-R5C.
              Untuk sekarang halaman ini fokus pada data pelanggan real dan
              histori transaksi outlet aktif.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
