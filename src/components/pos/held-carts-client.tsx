"use client";

import {
  LoaderCircle,
  Package,
  Pause,
  ReceiptText,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import {
  cancelPosHeldCartAction,
  resumePosHeldCartAction,
} from "@/app/actions/pos";
import type {
  PosHeldCartItem,
  PosHeldCartListData,
  PosHeldCartListItem,
  PosHeldCartSummary,
} from "@/features/pos/contracts";
import { cn } from "@/lib/utils";

const POS_ACTIVE_CART_STORAGE_KEY = "asihjaya:pos-workspace-active-cart";
const POS_PENDING_HELD_CART_RESUME_STORAGE_KEY =
  "asihjaya:pos-workspace-pending-held-cart-resume";

type HeldCartsClientProps = {
  data: PosHeldCartListData;
};

type FeedbackState = {
  type: "success" | "error" | "info";
  message: string;
  showPosLink?: boolean;
} | null;

type PendingResumeState = {
  version: 1;
  heldCart: PosHeldCartSummary;
  items: PosHeldCartItem[];
  updatedAt: string;
};

function formatMoney(value: string | number | null) {
  const parsedValue = typeof value === "number" ? value : Number(value ?? 0);

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(parsedValue) ? parsedValue : 0);
}

function formatDateTime(value: Date | string | null) {
  if (!value) {
    return "Waktu tidak diketahui";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Waktu tidak diketahui";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function getCustomerLabel(heldCart: PosHeldCartListItem) {
  if (heldCart.customer) {
    return heldCart.customer.fullName;
  }

  return heldCart.title?.trim() || "Walk-in customer";
}

function getCustomerDetail(heldCart: PosHeldCartListItem) {
  if (!heldCart.customer) {
    return heldCart.note?.trim() || "Customer belum dipilih saat hold dibuat.";
  }

  return [
    heldCart.customer.customerCode,
    heldCart.customer.phone,
    heldCart.customer.email,
  ]
    .filter(Boolean)
    .join(" · ");
}

function getStoredActiveCartItemCount() {
  if (typeof window === "undefined") {
    return 0;
  }

  try {
    const rawValue = window.sessionStorage.getItem(POS_ACTIVE_CART_STORAGE_KEY);

    if (!rawValue) {
      return 0;
    }

    const parsedValue = JSON.parse(rawValue) as unknown;

    if (
      !parsedValue ||
      typeof parsedValue !== "object" ||
      !("items" in parsedValue) ||
      !Array.isArray(parsedValue.items)
    ) {
      return 0;
    }

    return parsedValue.items.length;
  } catch {
    window.sessionStorage.removeItem(POS_ACTIVE_CART_STORAGE_KEY);
    return 0;
  }
}

function savePendingResumeState({
  heldCart,
  items,
}: {
  heldCart: PosHeldCartSummary;
  items: PosHeldCartItem[];
}) {
  if (typeof window === "undefined") {
    return;
  }

  const state: PendingResumeState = {
    version: 1,
    heldCart,
    items,
    updatedAt: new Date().toISOString(),
  };

  window.sessionStorage.setItem(
    POS_PENDING_HELD_CART_RESUME_STORAGE_KEY,
    JSON.stringify(state),
  );
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
  icon: ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
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

function OutletBadge({ data }: { data: PosHeldCartListData }) {
  const isOnline = data.outlet?.hardwareStatus === "online";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm">
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Store className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-neutral-950">
            {data.outlet?.name ?? "Outlet belum tersedia"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Register: {data.register?.name ?? "belum tersedia"} · Hardware{" "}
            <span className={isOnline ? "text-emerald-700" : "text-amber-700"}>
              {isOnline ? "online" : "offline/stale"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Feedback({ feedback, onClose }: { feedback: FeedbackState; onClose: () => void }) {
  if (!feedback) {
    return null;
  }

  return (
    <div
      className={cn(
        "mb-4 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm leading-6",
        feedback.type === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : feedback.type === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-800",
      )}
    >
      <div>
        <p>{feedback.message}</p>
        {feedback.showPosLink ? (
          <Link
            href="/pos"
            className="mt-2 inline-flex font-semibold text-current underline underline-offset-4"
          >
            Buka POS untuk kosongkan cart
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        aria-label="Tutup pesan"
        onClick={onClose}
        className="grid size-6 shrink-0 place-items-center rounded-lg text-current/60 hover:bg-white/60 hover:text-current"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function HeldCartCard({
  heldCart,
  pendingActionId,
  onResume,
  onCancel,
}: {
  heldCart: PosHeldCartListItem;
  pendingActionId: string | null;
  onResume: (heldCart: PosHeldCartListItem) => void;
  onCancel: (heldCart: PosHeldCartListItem) => void;
}) {
  const isPending = pendingActionId === heldCart.id;
  const firstItems = heldCart.items.slice(0, 4);
  const remainingItemsCount = Math.max(heldCart.items.length - firstItems.length, 0);

  return (
    <article className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="border-b border-[var(--border)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                {heldCart.holdNumber}
              </span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600">
                {heldCart.itemCount} item
              </span>
            </div>

            <h2 className="mt-3 truncate text-lg font-semibold tracking-tight text-neutral-950">
              {getCustomerLabel(heldCart)}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
              {getCustomerDetail(heldCart)}
            </p>
            {heldCart.title && heldCart.customer ? (
              <p className="mt-2 text-xs font-medium text-neutral-700">
                Catatan singkat: {heldCart.title}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 text-left sm:text-right">
            <p className="text-xs text-[var(--muted)]">Total sementara</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-neutral-950">
              {formatMoney(heldCart.totalAmount)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-xs leading-5 text-[var(--muted)] sm:grid-cols-3">
          <div className="rounded-2xl bg-neutral-50 px-3 py-2">
            <span className="block font-semibold text-neutral-800">Ditahan</span>
            {formatDateTime(heldCart.createdAt)}
          </div>
          <div className="rounded-2xl bg-neutral-50 px-3 py-2">
            <span className="block font-semibold text-neutral-800">Kasir</span>
            {heldCart.heldBy.fullName}
          </div>
          <div className="rounded-2xl bg-neutral-50 px-3 py-2">
            <span className="block font-semibold text-neutral-800">Status</span>
            Item terkunci aktif
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="space-y-2">
          {firstItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 rounded-2xl bg-neutral-50 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-neutral-950">
                  {item.lineNumber}. {item.productName}
                </p>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">
                  {item.sku} · {item.barcode}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-neutral-950">
                {formatMoney(item.finalPriceAmount)}
              </span>
            </div>
          ))}
        </div>

        {remainingItemsCount > 0 ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            +{remainingItemsCount} item lainnya
          </p>
        ) : null}

        {heldCart.note ? (
          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            {heldCart.note}
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <p className="text-xs leading-5 text-[var(--muted)]">
            Resume akan mengembalikan item ke cart POS dan melepas lock hold ini.
          </p>
          <button
            type="button"
            onClick={() => onCancel(heldCart)}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
          >
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Batalkan
          </button>
          <button
            type="button"
            onClick={() => onResume(heldCart)}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent)]/90 disabled:cursor-wait disabled:opacity-60"
          >
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ReceiptText className="size-4" />
            )}
            Resume
          </button>
        </div>
      </div>
    </article>
  );
}

export function HeldCartsClient({ data }: HeldCartsClientProps) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasHeldCarts = data.heldCarts.length > 0;
  function handleResume(heldCart: PosHeldCartListItem) {
    const activeCartItemCount = getStoredActiveCartItemCount();

    if (activeCartItemCount > 0) {
      setFeedback({
        type: "error",
        message: `Cart POS masih berisi ${activeCartItemCount} item. Kosongkan atau reset cart dulu sebelum resume hold ${heldCart.holdNumber}.`,
        showPosLink: true,
      });
      return;
    }

    setFeedback(null);
    setPendingActionId(heldCart.id);

    startTransition(async () => {
      const result = await resumePosHeldCartAction({ heldCartId: heldCart.id });

      if (result.status === "error") {
        setPendingActionId(null);
        setFeedback({ type: "error", message: result.message });
        return;
      }

      savePendingResumeState({
        heldCart: result.heldCart,
        items: result.items ?? [],
      });

      window.sessionStorage.removeItem(POS_ACTIVE_CART_STORAGE_KEY);
      router.push("/pos");
    });
  }

  function handleCancel(heldCart: PosHeldCartListItem) {
    const confirmed = window.confirm(
      `Batalkan hold ${heldCart.holdNumber}? Item akan dilepas dan kembali tersedia di POS.`,
    );

    if (!confirmed) {
      return;
    }

    setFeedback(null);
    setPendingActionId(heldCart.id);

    startTransition(async () => {
      const result = await cancelPosHeldCartAction({
        heldCartId: heldCart.id,
        reason: "Dibatalkan dari halaman POS Ditahan.",
      });

      setPendingActionId(null);

      if (result.status === "error") {
        setFeedback({ type: "error", message: result.message });
        return;
      }

      setFeedback({ type: "success", message: result.message });
      router.refresh();
    });
  }

  return (
    <main className="p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--accent)]">
              <Pause className="size-4" />
              POS Hold Cart
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
              Transaksi Ditahan
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Kelola cart yang ditahan. Item di hold aktif terkunci dan tidak
              muncul di katalog POS sampai di-resume atau dibatalkan.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/pos"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
            >
              Kembali ke POS
            </Link>
          </div>
        </div>

        <Feedback feedback={feedback} onClose={() => setFeedback(null)} />


        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            title="Hold aktif"
            value={`${data.summary.totalHeldCarts}`}
            helper="Cart yang masih menunggu resume/cancel."
            icon={<Pause className="size-5" />}
          />
          <SummaryCard
            title="Item terkunci"
            value={`${data.summary.totalItems}`}
            helper="Item fisik yang tidak tampil di katalog POS."
            icon={<Package className="size-5" />}
          />
          <SummaryCard
            title="Total sementara"
            value={formatMoney(data.summary.totalAmount)}
            helper="Estimasi nilai transaksi yang sedang ditahan."
            icon={<ReceiptText className="size-5" />}
          />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <form
            action="/pos/ditahan"
            className="rounded-2xl border border-[var(--border)] bg-white p-3"
          >
            <label className="flex h-11 items-center gap-3 rounded-xl border border-[var(--border)] bg-neutral-50 px-3 focus-within:border-[var(--accent)] focus-within:bg-white focus-within:ring-4 focus-within:ring-[var(--accent-soft)]">
              <Search className="size-4 shrink-0 text-neutral-400" />
              <input
                name="q"
                defaultValue={data.query}
                placeholder="Cari hold number, customer, SKU, barcode..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
              />
              {data.query ? (
                <Link
                  href="/pos/ditahan"
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label="Reset pencarian"
                >
                  <X className="size-4" />
                </Link>
              ) : null}
            </label>
          </form>

          <OutletBadge data={data} />
        </div>

        {!data.outlet || !data.register ? (
          <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
            <h2 className="font-semibold text-neutral-950">
              Outlet/register belum siap
            </h2>
            <p className="mt-2 text-sm leading-6">
              Halaman transaksi ditahan membutuhkan outlet dan register aktif.
              Hubungi admin untuk mengecek pengaturan POS.
            </p>
          </section>
        ) : hasHeldCarts ? (
          <section className="mt-5 space-y-4">
            {data.heldCarts.map((heldCart) => (
              <HeldCartCard
                key={heldCart.id}
                heldCart={heldCart}
                pendingActionId={isPending ? pendingActionId : null}
                onResume={handleResume}
                onCancel={handleCancel}
              />
            ))}
          </section>
        ) : (
          <section className="mt-5 rounded-3xl border border-dashed border-[var(--border)] bg-white p-8 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Pause className="size-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-neutral-950">
              Belum ada transaksi ditahan
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
              Hold cart akan muncul di sini setelah kasir menahan transaksi dari
              halaman POS. Item yang ditahan akan terkunci sampai di-resume atau
              dibatalkan.
            </p>
            {data.query ? (
              <Link
                href="/pos/ditahan"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50"
              >
                Reset pencarian
              </Link>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
