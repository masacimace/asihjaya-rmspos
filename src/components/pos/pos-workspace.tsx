"use client";

import {
  BadgePercent,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Gem,
  LoaderCircle,
  Pause,
  ScanBarcode,
  Search,
  ShoppingBag,
  StopCircle,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  closePosShiftAction,
  completePosCheckoutAction,
  holdPosCartAction,
  lookupPosScanValueAction,
  openPosShiftAction,
} from "@/app/actions/pos";
import { CameraScannerModal } from "@/components/scanner/camera-scanner-modal";
import {
  POS_INITIAL_ITEM_LIMIT,
  initialPosShiftActionState,
  type PosAvailableItem,
  type PosCategoryOption,
  type PosCheckoutActionResult,
  type PosCustomerOption,
  type PosHeldCartActionResult,
  type PosHeldCartItem,
  type PosHeldCartSummary,
  type PosManualPaymentMethod,
  type PosOperationalContext,
  type PosShiftActionState,
} from "@/features/pos/contracts";
import { cn } from "@/lib/utils";

type PosWorkspaceProps = {
  categories: PosCategoryOption[];
  items: PosAvailableItem[];
  customers: PosCustomerOption[];
  context: PosOperationalContext;
  canManageShifts: boolean;
};

type CartContentProps = {
  cartItems: PosAvailableItem[];
  subtotalAmount: number;
  totalAmount: number;
  canCheckout: boolean;
  checkoutDisabledReason: string;
  customers: PosCustomerOption[];
  selectedCustomer: PosCustomerOption | null;
  customerQuery: string;
  customerSearchResults: PosCustomerOption[];
  isCustomerSelectorOpen: boolean;
  onCustomerQueryChange: (value: string) => void;
  onCustomerInputFocus: () => void;
  onCustomerInputBlur: () => void;
  onSelectCustomer: (customer: PosCustomerOption) => void;
  onClearCustomer: () => void;
  onRemoveItem: (itemId: string) => void;
  onClearCart: () => void;
  onContinueToPayment: () => void;
  canHoldCart: boolean;
  holdCartDisabledReason: string;
  onOpenHoldDialog: () => void;
};

type PosPaymentDraft = {
  id: string;
  method: PosManualPaymentMethod;
  methodLabel: string;
  amount: number;
  receivedAmount: number | null;
  changeAmount: number;
  provider: string | null;
  reference: string | null;
  note: string | null;
};

type PaymentMethodConfig = {
  method: PosManualPaymentMethod;
  label: string;
  shortLabel: string;
  description: string;
  amountLabel: string;
  providerLabel: string | null;
  providerPlaceholder: string | null;
  referenceLabel: string | null;
  referencePlaceholder: string | null;
  requiresReference: boolean;
  allowOverpayment: boolean;
};

type PaymentContentProps = {
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  totalChangeAmount: number;
  payments: PosPaymentDraft[];
  selectedMethod: PosManualPaymentMethod;
  amountInput: string;
  providerInput: string;
  referenceInput: string;
  noteInput: string;
  paymentFeedback: string | null;
  canFinalizePayment: boolean;
  isCheckoutPending: boolean;
  onBackToCart: () => void;
  onMethodChange: (method: PosManualPaymentMethod) => void;
  onAmountInputChange: (value: string) => void;
  onProviderInputChange: (value: string) => void;
  onReferenceInputChange: (value: string) => void;
  onNoteInputChange: (value: string) => void;
  onAddPayment: () => void;
  onRemovePayment: (paymentId: string) => void;
  onResetPayments: () => void;
  onFinalizePayment: () => void;
};

type CheckoutSuccessContentProps = {
  sale: Extract<PosCheckoutActionResult, { status: "success" }>["sale"];
  onStartNewTransaction: () => void;
};

type PosPanelMode = "cart" | "payment" | "success";

type StoredPosCartState = {
  version: 1;
  items: PosAvailableItem[];
  customer: PosCustomerOption | null;
  updatedAt: string;
};

type PendingHeldCartResumeState = {
  version: 1;
  heldCart: PosHeldCartSummary;
  items: PosHeldCartItem[];
  updatedAt: string;
};

const itemBackgrounds = [
  "bg-amber-50",
  "bg-orange-50",
  "bg-yellow-50",
  "bg-rose-50",
  "bg-stone-100",
] as const;

const CART_FEEDBACK_AUTO_CLOSE_MS = 3500;
const POS_WORKSPACE_COMMAND_EVENT = "asihjaya:pos-workspace-command";
const POS_PENDING_COMMAND_STORAGE_KEY =
  "asihjaya:pos-workspace-pending-command";
const POS_ACTIVE_CART_STORAGE_KEY = "asihjaya:pos-workspace-active-cart";
const POS_PENDING_HELD_CART_RESUME_STORAGE_KEY =
  "asihjaya:pos-workspace-pending-held-cart-resume";

type PosWorkspaceCommand = {
  type: "search" | "scan";
  value: string;
};

function normalizePosWorkspaceCommand(
  value: unknown,
): PosWorkspaceCommand | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const command = value as Partial<PosWorkspaceCommand>;

  if (command.type !== "search" && command.type !== "scan") {
    return null;
  }

  if (typeof command.value !== "string") {
    return null;
  }

  const normalizedValue = command.value.trim();

  if (command.type === "scan" && !normalizedValue) {
    return null;
  }

  return {
    type: command.type,
    value: normalizedValue,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isStoredPosAvailableItem(value: unknown): value is PosAvailableItem {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sku === "string" &&
    typeof value.barcode === "string" &&
    typeof value.productId === "string" &&
    typeof value.productCode === "string" &&
    typeof value.productName === "string" &&
    typeof value.categoryId === "string" &&
    typeof value.categoryName === "string"
  );
}

function isStoredCustomer(value: unknown): value is PosCustomerOption {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.fullName === "string"
  );
}

function getStoredPosCartState(): StoredPosCartState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(POS_ACTIVE_CART_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as unknown;

    if (!isRecord(parsedValue) || !Array.isArray(parsedValue.items)) {
      return null;
    }

    const items = parsedValue.items.filter(isStoredPosAvailableItem);
    const customer = isStoredCustomer(parsedValue.customer)
      ? parsedValue.customer
      : null;

    if (items.length === 0 && !customer) {
      return null;
    }

    return {
      version: 1,
      items,
      customer,
      updatedAt:
        typeof parsedValue.updatedAt === "string"
          ? parsedValue.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    window.sessionStorage.removeItem(POS_ACTIVE_CART_STORAGE_KEY);
    return null;
  }
}

function saveStoredPosCartState({
  items,
  customer,
}: {
  items: PosAvailableItem[];
  customer: PosCustomerOption | null;
}) {
  if (typeof window === "undefined") {
    return;
  }

  if (items.length === 0 && !customer) {
    window.sessionStorage.removeItem(POS_ACTIVE_CART_STORAGE_KEY);
    return;
  }

  const state: StoredPosCartState = {
    version: 1,
    items,
    customer,
    updatedAt: new Date().toISOString(),
  };

  window.sessionStorage.setItem(
    POS_ACTIVE_CART_STORAGE_KEY,
    JSON.stringify(state),
  );
}

function getPendingHeldCartResumeState(): PendingHeldCartResumeState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      POS_PENDING_HELD_CART_RESUME_STORAGE_KEY,
    );

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as unknown;

    if (
      !isRecord(parsedValue) ||
      !isRecord(parsedValue.heldCart) ||
      !Array.isArray(parsedValue.items)
    ) {
      return null;
    }

    const heldCart = parsedValue.heldCart as PosHeldCartSummary;
    const items = parsedValue.items.filter(
      isStoredPosAvailableItem,
    ) as PosHeldCartItem[];

    if (items.length === 0 || typeof heldCart.holdNumber !== "string") {
      return null;
    }

    return {
      version: 1,
      heldCart,
      items,
      updatedAt:
        typeof parsedValue.updatedAt === "string"
          ? parsedValue.updatedAt
          : new Date().toISOString(),
    };
  } catch {
    window.sessionStorage.removeItem(POS_PENDING_HELD_CART_RESUME_STORAGE_KEY);
    return null;
  }
}

function removeStoredPosCartState() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(POS_ACTIVE_CART_STORAGE_KEY);
}

function removePendingHeldCartResumeState() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(POS_PENDING_HELD_CART_RESUME_STORAGE_KEY);
}

function getHeldCartErrorMessage(
  result: Extract<PosHeldCartActionResult, { status: "error" }>,
) {
  const fieldErrorMessages = Object.values(result.fieldErrors ?? {}).filter(
    Boolean,
  );

  if (fieldErrorMessages.length === 0) {
    return result.message;
  }

  return `${result.message} ${fieldErrorMessages.join(" ")}`;
}

const paymentMethodConfigs: PaymentMethodConfig[] = [
  {
    method: "cash",
    label: "Cash",
    shortLabel: "Cash",
    description: "Tunai, mendukung kembalian.",
    amountLabel: "Uang diterima",
    providerLabel: null,
    providerPlaceholder: null,
    referenceLabel: null,
    referencePlaceholder: null,
    requiresReference: false,
    allowOverpayment: true,
  },
  {
    method: "qris_manual",
    label: "QRIS Manual",
    shortLabel: "QRIS",
    description: "Kasir verifikasi dari aplikasi merchant/bank.",
    amountLabel: "Nominal QRIS",
    providerLabel: "Provider/PJP",
    providerPlaceholder: "Contoh: BCA Merchant, GoPay, DANA",
    referenceLabel: "Reference number",
    referencePlaceholder: "Nomor referensi / ID transaksi QRIS",
    requiresReference: true,
    allowOverpayment: false,
  },
  {
    method: "debit_card",
    label: "Debit Card EDC",
    shortLabel: "Debit",
    description: "EDC manual dengan approval code.",
    amountLabel: "Nominal debit",
    providerLabel: "Bank/acquirer",
    providerPlaceholder: "Contoh: BCA, Mandiri, BRI",
    referenceLabel: "Approval code",
    referencePlaceholder: "Kode approval dari mesin EDC",
    requiresReference: true,
    allowOverpayment: false,
  },
  {
    method: "credit_card",
    label: "Credit Card EDC",
    shortLabel: "Credit",
    description: "Kartu kredit EDC manual.",
    amountLabel: "Nominal credit",
    providerLabel: "Bank/acquirer",
    providerPlaceholder: "Contoh: BCA, Mandiri, BNI",
    referenceLabel: "Approval code",
    referencePlaceholder: "Kode approval dari mesin EDC",
    requiresReference: true,
    allowOverpayment: false,
  },
  {
    method: "bank_transfer",
    label: "Bank Transfer",
    shortLabel: "Transfer",
    description: "Transfer manual yang sudah diverifikasi.",
    amountLabel: "Nominal transfer",
    providerLabel: "Bank pengirim/tujuan",
    providerPlaceholder: "Contoh: BCA a.n. Customer ke BCA toko",
    referenceLabel: "Reference number",
    referencePlaceholder: "Nomor referensi transfer",
    requiresReference: true,
    allowOverpayment: false,
  },
];

const defaultPaymentMethodConfig = paymentMethodConfigs[0]!;

function getPaymentConfig(method: PosManualPaymentMethod): PaymentMethodConfig {
  return (
    paymentMethodConfigs.find((config) => config.method === method) ??
    defaultPaymentMethodConfig
  );
}

function getCheckoutErrorMessage(
  result: Extract<PosCheckoutActionResult, { status: "error" }>,
) {
  const fieldErrorMessages = Object.values(result.fieldErrors ?? {}).filter(
    Boolean,
  );

  if (fieldErrorMessages.length === 0) {
    return result.message;
  }

  const detailMessage = fieldErrorMessages.join(" ");

  return result.message.includes(detailMessage)
    ? result.message
    : `${result.message} ${detailMessage}`;
}

function parseAmount(amount: string | null) {
  if (!amount) {
    return 0;
  }

  const parsedAmount = Number(amount);

  return Number.isFinite(parsedAmount) ? parsedAmount : 0;
}

function formatCurrency(amount: string | number | null) {
  if (amount === null || amount === undefined || amount === "") {
    return "Harga belum diset";
  }

  const parsedAmount = typeof amount === "number" ? amount : Number(amount);

  if (!Number.isFinite(parsedAmount)) {
    return "Harga belum diset";
  }

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(parsedAmount);
}

function getPaymentDraftValidationMessage({
  payments,
  totalAmount,
}: {
  payments: PosPaymentDraft[];
  totalAmount: number;
}) {
  if (payments.length === 0) {
    return "Tambahkan minimal satu pembayaran sebelum menyelesaikan transaksi.";
  }

  let totalPaidAmount = 0;

  for (const payment of payments) {
    const config = getPaymentConfig(payment.method);

    if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0) {
      return `${config.label} memiliki nominal pembayaran yang tidak valid.`;
    }

    totalPaidAmount += payment.amount;

    if (payment.method === "cash") {
      if (
        payment.receivedAmount === null ||
        !Number.isSafeInteger(payment.receivedAmount) ||
        payment.receivedAmount < payment.amount
      ) {
        return "Nominal uang diterima cash tidak valid.";
      }

      const expectedChangeAmount = Math.max(
        payment.receivedAmount - payment.amount,
        0,
      );

      if (payment.changeAmount !== expectedChangeAmount) {
        return "Nominal kembalian cash tidak sesuai dengan uang diterima.";
      }

      continue;
    }

    if (payment.receivedAmount !== null || payment.changeAmount > 0) {
      return "Kembalian hanya boleh tercatat untuk pembayaran cash.";
    }

    if (config.requiresReference && !payment.reference?.trim()) {
      return `${config.referenceLabel ?? "Reference"} wajib diisi untuk ${config.label}.`;
    }
  }

  if (totalPaidAmount !== totalAmount) {
    return `Total pembayaran harus sama dengan total transaksi ${formatCurrency(totalAmount)}.`;
  }

  return null;
}

function formatVarianceAmount(amount: number) {
  if (amount > 0) {
    return `+${formatCurrency(amount)}`;
  }

  if (amount < 0) {
    return `-${formatCurrency(Math.abs(amount))}`;
  }

  return formatCurrency(0);
}

function formatRupiahInput(value: string | number | null) {
  if (value === null || value === undefined) {
    return "";
  }

  const numericValue = String(value)
    .replace(/[^0-9]/g, "")
    .replace(/^0+(?=\d)/, "");

  if (!numericValue) {
    return "";
  }

  return numericValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parsePaymentAmountInput(value: string) {
  const numericValue = value.replace(/[^0-9]/g, "");

  if (!numericValue) {
    return 0;
  }

  const parsedAmount = Number(numericValue);

  return Number.isSafeInteger(parsedAmount) ? parsedAmount : Number.NaN;
}

function createPaymentDraftId() {
  return `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createCheckoutIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pos_${crypto.randomUUID()}`;
  }

  return `pos_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function ActionMessage({ state }: { state: PosShiftActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        state.status === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700",
      )}
    >
      {state.message}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="mt-1.5 text-xs text-red-600">{message}</p>;
}

function CurrencyFormInput({
  name,
  placeholder,
  className,
  onValueChange,
}: {
  name: string;
  placeholder: string;
  className?: string;
  onValueChange?: (numericValue: number | null) => void;
}) {
  const [displayValue, setDisplayValue] = useState("");

  function handleChange(value: string) {
    const nextDisplayValue = formatRupiahInput(value);
    const numericValue = nextDisplayValue.replace(/[^0-9]/g, "");

    setDisplayValue(nextDisplayValue);
    onValueChange?.(numericValue ? Number(numericValue) : null);
  }

  return (
    <>
      <input
        type="hidden"
        name={name}
        value={displayValue.replace(/[^0-9]/g, "")}
      />
      <input
        value={displayValue}
        onChange={(event) => handleChange(event.target.value)}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        className={className}
      />
    </>
  );
}

function OpenShiftSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent)]/90 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
    >
      {pending ? (
        <>
          <LoaderCircle className="size-4 animate-spin" />
          Membuka shift...
        </>
      ) : (
        <>
          <Clock3 className="size-4" />
          Buka Shift
        </>
      )}
    </button>
  );
}

function CloseShiftSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
    >
      {pending ? (
        <>
          <LoaderCircle className="size-4 animate-spin" />
          Menutup shift...
        </>
      ) : (
        <>
          <StopCircle className="size-4" />
          Closing Shift
        </>
      )}
    </button>
  );
}

function formatDecimal(value: string | null, suffix: string) {
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

function formatOpenedAt(value: Date | string) {
  const openedAt = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(openedAt.getTime())) {
    return "waktu tidak diketahui";
  }

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(openedAt);
}

function getItemBackground(item: PosAvailableItem) {
  const firstCharCode = item.sku.charCodeAt(0) || 0;

  return itemBackgrounds[firstCharCode % itemBackgrounds.length];
}

function getItemDetail(item: PosAvailableItem) {
  const details = [
    formatDecimal(item.weightGram, "gr"),
    item.exchangePurityPercent
      ? `Kadar ${formatDecimal(item.exchangePurityPercent, "%")}`
      : item.purityPercent
        ? `Kadar ${formatDecimal(item.purityPercent, "%")}`
        : null,
  ].filter(Boolean);

  return details.length > 0 ? details.join(" · ") : "Detail item belum lengkap";
}

function getItemSpecChips(item: PosAvailableItem) {
  const primaryPurity = item.exchangePurityPercent ?? item.purityPercent;

  return [
    item.weightGram ? `${formatDecimal(item.weightGram, "gr")}` : null,
    primaryPurity ? `Kadar ${formatDecimal(primaryPurity, "%")}` : null,
    item.size ? `Uk. ${item.size}` : null,
    item.color ? item.color : null,
    item.gemstone ? item.gemstone : null,
  ].filter(Boolean) as string[];
}

function getMediaUrl(imageKey: string | null) {
  const normalizedKey = imageKey
    ?.split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");

  if (!normalizedKey) {
    return null;
  }

  return `/media/${normalizedKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function getItemImageUrl(item: PosAvailableItem) {
  return getMediaUrl(item.imageKey ?? item.productImageKey);
}

function getCustomerCode(customer: PosCustomerOption) {
  return customer.customerCode?.trim() || "Tanpa kode";
}

function getCustomerContactLabel(customer: PosCustomerOption) {
  return customer.phone || customer.email || "Kontak belum dilengkapi";
}

function getCustomerSearchText(customer: PosCustomerOption) {
  return [
    customer.customerCode,
    customer.fullName,
    customer.phone,
    customer.email,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function buildCustomerCreateHref(query: string) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return "/pos/pelanggan";
  }

  return `/pos/pelanggan?q=${encodeURIComponent(normalizedQuery)}`;
}

function PosItemImage({
  item,
  alt,
  className,
  iconClassName,
  showCatalogBadge = false,
}: {
  item: PosAvailableItem;
  alt: string;
  className?: string;
  iconClassName?: string;
  showCatalogBadge?: boolean;
}) {
  const [hasImageError, setHasImageError] = useState(false);
  const imageUrl = getItemImageUrl(item);
  const shouldShowImage = Boolean(imageUrl) && !hasImageError;
  const usesCatalogPhoto =
    shouldShowImage && !item.imageKey && Boolean(item.productImageKey);

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        shouldShowImage ? "bg-neutral-100" : getItemBackground(item),
        className,
      )}
    >
      {shouldShowImage ? (
        // Foto produk disajikan melalui route media internal yang dilindungi sesi.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl ?? undefined}
          alt={alt}
          onError={() => setHasImageError(true)}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <div className="grid size-full place-items-center">
          <Gem
            className={cn(
              "text-[var(--accent)] transition-transform group-hover:scale-105",
              iconClassName,
            )}
            strokeWidth={1.25}
          />
        </div>
      )}

      {showCatalogBadge && usesCatalogPhoto ? (
        <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2 py-1 text-[10px] font-medium text-neutral-600 backdrop-blur">
          Foto katalog
        </span>
      ) : null}
    </div>
  );
}

function CartContent({
  cartItems,
  subtotalAmount,
  totalAmount,
  canCheckout,
  checkoutDisabledReason,
  customers,
  selectedCustomer,
  customerQuery,
  customerSearchResults,
  isCustomerSelectorOpen,
  onCustomerQueryChange,
  onCustomerInputFocus,
  onCustomerInputBlur,
  onSelectCustomer,
  onClearCustomer,
  onRemoveItem,
  onClearCart,
  onContinueToPayment,
  canHoldCart,
  holdCartDisabledReason,
  onOpenHoldDialog,
}: CartContentProps) {
  const hasCartItems = cartItems.length > 0;
  const hasCustomers = customers.length > 0;
  const hasCustomerSearchQuery = customerQuery.trim().length > 0;

  return (
    <div className="flex min-h-full flex-col bg-white p-4 sm:p-5">
      {hasCartItems ? (
        <div className="max-h-[38vh] space-y-3 overflow-y-auto border-b border-[var(--border)] pb-4 lg:max-h-none">
          {cartItems.map((item, index) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[var(--border)] bg-white p-3"
            >
              <div className="flex gap-3">
                <div className="relative shrink-0">
                  <PosItemImage
                    item={item}
                    alt={`${item.productName} ${item.sku}`}
                    className="size-14 rounded-xl"
                    iconClassName="size-7"
                  />
                  <span className="absolute -left-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-neutral-950 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-neutral-950">
                        {item.productName}
                      </p>

                      <p className="mt-1 truncate text-[11px] text-[var(--muted)]">
                        {item.sku} · {item.barcode}
                      </p>
                    </div>

                    <button
                      type="button"
                      aria-label={`Hapus ${item.productName}`}
                      onClick={() => onRemoveItem(item.id)}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    {getItemDetail(item)}
                  </p>

                  <p className="mt-2 text-sm font-semibold text-neutral-950">
                    {formatCurrency(item.sellingAmount)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid min-h-56 place-items-center border-b border-[var(--border)] py-8 text-center">
          <div>
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <ShoppingBag className="size-7" />
            </div>

            <h3 className="mt-4 text-sm font-semibold text-neutral-950">
              Belum ada item di keranjang
            </h3>
            <p className="mt-2 max-w-64 text-xs leading-5 text-[var(--muted)]">
              Pilih item dari katalog atau scan barcode. Satu barcode mewakili
              satu item fisik jewelry.
            </p>
          </div>
        </div>
      )}

      <div className="mt-auto border-t border-[var(--border)] pt-4">
        <div className="rounded-2xl border border-[var(--border)] bg-neutral-50/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Customer
            </p>
            <a
              href={buildCustomerCreateHref(customerQuery)}
              className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent)]/80"
            >
              Tambah baru
            </a>
          </div>

          {selectedCustomer ? (
            <div className="mt-3 rounded-xl border border-[var(--accent-soft)] bg-white p-3">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <UserRound className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutral-950">
                    {selectedCustomer.fullName}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--muted)]">
                    {getCustomerCode(selectedCustomer)} ·{" "}
                    {getCustomerContactLabel(selectedCustomer)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClearCustomer}
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label="Hapus customer dari transaksi"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="relative mt-3">
              <label className="flex h-11 items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-3 focus-within:border-[var(--accent)] focus-within:ring-4 focus-within:ring-[var(--accent-soft)]">
                <Search className="size-4 shrink-0 text-neutral-400" />

                <input
                  type="search"
                  value={customerQuery}
                  onChange={(event) =>
                    onCustomerQueryChange(event.target.value)
                  }
                  onFocus={onCustomerInputFocus}
                  onBlur={onCustomerInputBlur}
                  placeholder="Cari nama, kode, atau nomor telepon"
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
                />

                <UserRound className="size-4 text-neutral-400" />
              </label>

              {isCustomerSelectorOpen ? (
                <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-xl">
                  {customerSearchResults.length > 0 ? (
                    <div className="max-h-72 overflow-y-auto p-1.5">
                      {customerSearchResults.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => onSelectCustomer(customer)}
                          className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-neutral-50"
                        >
                          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
                            <UserRound className="size-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-neutral-950">
                              {customer.fullName}
                            </p>
                            <p className="mt-1 truncate text-xs text-[var(--muted)]">
                              {getCustomerCode(customer)} ·{" "}
                              {getCustomerContactLabel(customer)}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-neutral-700">
                      <p className="font-medium text-neutral-950">
                        Customer tidak ditemukan
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        Buat customer baru dari halaman POS Pelanggan, lalu
                        kembali ke checkout.
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {!selectedCustomer ? (
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {hasCustomers
                ? hasCustomerSearchQuery
                  ? "Pilih customer dari hasil pencarian, atau lanjutkan sebagai walk-in customer."
                  : "Opsional. Kosongkan untuk walk-in customer."
                : "Belum ada customer aktif. Transaksi tetap bisa dilanjutkan sebagai walk-in customer."}
            </p>
          ) : null}
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3 text-[var(--muted)]">
            <span>Jumlah item</span>
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-800">
                {cartItems.length} item
              </span>

              {hasCartItems ? (
                <button
                  type="button"
                  onClick={onClearCart}
                  className="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-neutral-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between text-[var(--muted)]">
            <span>Subtotal</span>
            <span className="font-medium text-neutral-800">
              {formatCurrency(subtotalAmount)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[var(--muted)]">Diskon</span>

            <button
              type="button"
              disabled
              className="flex items-center gap-1.5 font-medium text-neutral-300"
            >
              <BadgePercent className="size-4" />
              Minta Diskon
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-[var(--border)] pt-4">
            <span className="text-base font-semibold text-neutral-950">
              Total
            </span>

            <span className="text-xl font-semibold tracking-tight text-neutral-950">
              {formatCurrency(totalAmount)}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          <button
            type="button"
            disabled={!canCheckout}
            onClick={onContinueToPayment}
            className={cn(
              "flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 font-semibold transition",
              canCheckout
                ? "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
                : "cursor-not-allowed bg-neutral-200 text-neutral-500",
            )}
          >
            Lanjut ke Pembayaran
            <ChevronRight className="size-4" />
          </button>

          <button
            type="button"
            disabled={!canHoldCart}
            onClick={onOpenHoldDialog}
            className={cn(
              "flex h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition",
              canHoldCart
                ? "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100"
                : "cursor-not-allowed border-[var(--border)] bg-neutral-100 text-neutral-400",
            )}
          >
            <Pause className="size-4" />
            Tahan Transaksi
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] leading-5 text-[var(--muted)]">
          {canCheckout
            ? selectedCustomer
              ? `Checkout untuk ${selectedCustomer.fullName}.`
              : "Lanjutkan sebagai walk-in customer."
            : checkoutDisabledReason}
          {hasCartItems ? (
            <>
              <br />
              {canHoldCart
                ? "Atau tahan transaksi untuk dilanjutkan nanti."
                : holdCartDisabledReason}
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}

type HoldCartDialogProps = {
  cartItems: PosAvailableItem[];
  totalAmount: number;
  selectedCustomer: PosCustomerOption | null;
  titleInput: string;
  noteInput: string;
  feedback: string | null;
  isPending: boolean;
  onTitleInputChange: (value: string) => void;
  onNoteInputChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

function HoldCartDialog({
  cartItems,
  totalAmount,
  selectedCustomer,
  titleInput,
  noteInput,
  feedback,
  isPending,
  onTitleInputChange,
  onNoteInputChange,
  onCancel,
  onSubmit,
}: HoldCartDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-[var(--border)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                Hold Cart
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-neutral-950">
                Tahan transaksi ini?
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Item akan dikunci sementara dan tidak muncul di katalog POS
                sampai hold di-resume atau dibatalkan.
              </p>
            </div>

            <button
              type="button"
              aria-label="Tutup form hold cart"
              onClick={onCancel}
              disabled={isPending}
              className="grid size-9 shrink-0 place-items-center rounded-xl text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5">
          <div className="rounded-2xl border border-[var(--border)] bg-neutral-50 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">Total sementara</span>
              <span className="font-semibold text-neutral-950">
                {formatCurrency(totalAmount)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">Jumlah item</span>
              <span className="font-semibold text-neutral-950">
                {cartItems.length} item
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[var(--muted)]">Customer</span>
              <span className="truncate font-semibold text-neutral-950">
                {selectedCustomer?.fullName ?? "Walk-in customer"}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="mb-2 block font-medium text-neutral-800">
                Nama hold / catatan singkat
              </span>
              <input
                value={titleInput}
                onChange={(event) => onTitleInputChange(event.target.value)}
                maxLength={160}
                placeholder="Contoh: Bu Sari tunggu suami"
                className="h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-4 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              />
              <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
                Opsional, tapi sangat membantu saat mencari transaksi ditahan.
              </p>
            </label>

            <label className="block text-sm">
              <span className="mb-2 block font-medium text-neutral-800">
                Catatan internal
              </span>
              <textarea
                value={noteInput}
                onChange={(event) => onNoteInputChange(event.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Contoh: Customer cek saldo, item jangan dijual dulu."
                className="w-full resize-none rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Item yang dikunci
            </p>
            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
              {cartItems.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-xl bg-neutral-50 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-950">
                      {index + 1}. {item.productName}
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">
                      {item.sku} · {item.barcode}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-neutral-950">
                    {formatCurrency(item.sellingAmount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {feedback ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {feedback}
            </div>
          ) : null}
        </div>

        <div className="grid gap-2 border-t border-[var(--border)] p-4 sm:grid-cols-[1fr_1.4fr] sm:p-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex h-11 items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-wait disabled:opacity-70"
          >
            {isPending ? (
              <>
                <LoaderCircle className="size-4 animate-spin" />
                Menahan transaksi...
              </>
            ) : (
              <>
                <Pause className="size-4" />
                Simpan Hold
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckoutSuccessContent({
  sale,
  onStartNewTransaction,
}: CheckoutSuccessContentProps) {
  return (
    <div className="flex min-h-full flex-col bg-white p-4 sm:p-5">
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <div className="grid size-14 place-items-center rounded-2xl bg-white text-emerald-600">
          <CheckCircle2 className="size-8" />
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Transaksi Berhasil
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-neutral-950">
          {sale.invoiceNumber}
        </h2>
        <p className="mt-2 text-sm leading-6 text-emerald-800">
          Transaksi POS sudah tersimpan, payment tercatat, dan item otomatis
          berubah menjadi terjual.
        </p>
      </div>

      <div className="mt-4 rounded-3xl border border-[var(--border)] bg-white p-4">
        <div className="flex items-center justify-between gap-4 text-sm">
          <span className="text-[var(--muted)]">Total transaksi</span>
          <span className="text-lg font-semibold tracking-tight text-neutral-950">
            {formatCurrency(sale.totalAmount)}
          </span>
        </div>

        <div className="mt-4 grid gap-3 text-sm">
          <div className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-3 text-neutral-700">
            <FileText className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="font-medium text-neutral-900">
                Nota/certificate masuk antrean print
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Dokumen A5 landscape sudah dibuat dari data transaksi real
                {sale.receiptCertificateJobId
                  ? " dan dikirim ke Hardware Hub untuk silent print."
                  : ". PDF tetap bisa dibuka manual dari tombol di bawah."}
              </p>
              {sale.receiptCertificateJobId ? (
                <p className="mt-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800">
                  Job print:{" "}
                  {sale.receiptCertificateJobId.slice(0, 8).toUpperCase()}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-3 text-neutral-700">
            <ShoppingBag className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" />
            <div>
              <p className="font-medium text-neutral-900">
                Stok sudah diperbarui
              </p>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Item yang terjual tidak akan muncul lagi sebagai stok available
                di POS.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-auto border-t border-[var(--border)] pt-4">
        <button
          type="button"
          onClick={onStartNewTransaction}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 font-semibold text-white transition hover:bg-[var(--accent)]/90"
        >
          Transaksi Baru
          <ChevronRight className="size-4" />
        </button>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <a
            href={`/api/sales/${sale.id}/receipt-certificate`}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Buka PDF A5
          </a>
          <a
            href={`/api/sales/${sale.id}/receipt-certificate`}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Preview Cetak
          </a>
        </div>

        <p className="mt-3 text-center text-[11px] leading-5 text-[var(--muted)]">
          Jika Document Printer belum dikonfigurasi di Hardware Hub, job print
          akan terlihat failed di dashboard hardware dan PDF tetap bisa dibuka
          manual.
        </p>
      </div>
    </div>
  );
}

function PaymentContent({
  totalAmount,
  paidAmount,
  remainingAmount,
  totalChangeAmount,
  payments,
  selectedMethod,
  amountInput,
  providerInput,
  referenceInput,
  noteInput,
  paymentFeedback,
  canFinalizePayment,
  isCheckoutPending,
  onBackToCart,
  onMethodChange,
  onAmountInputChange,
  onProviderInputChange,
  onReferenceInputChange,
  onNoteInputChange,
  onAddPayment,
  onRemovePayment,
  onResetPayments,
  onFinalizePayment,
}: PaymentContentProps) {
  const selectedConfig = getPaymentConfig(selectedMethod);
  const parsedInputAmount = parsePaymentAmountInput(amountInput);
  const recognizedCashAmount =
    selectedMethod === "cash"
      ? Math.min(Math.max(parsedInputAmount, 0), remainingAmount)
      : parsedInputAmount;
  const cashChangeAmount =
    selectedMethod === "cash"
      ? Math.max(parsedInputAmount - remainingAmount, 0)
      : 0;
  const hasPayments = payments.length > 0;
  const paymentProgressPercentage =
    totalAmount > 0 ? Math.min((paidAmount / totalAmount) * 100, 100) : 0;
  const nonCashAmountIsTooHigh =
    !selectedConfig.allowOverpayment && parsedInputAmount > remainingAmount;

  return (
    <div className="flex min-h-full flex-col bg-white p-4 sm:p-5">
      <div className="border-b border-[var(--border)] pb-4">
        <button
          type="button"
          onClick={onBackToCart}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-black px-3 py-1.5 !text-xs font-semibold text-white transition hover:bg-black/90"
        >
          ← Keranjang
        </button>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              Pembayaran
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-neutral-950">
              {remainingAmount > 0
                ? "Selesaikan pembayaran"
                : "Pembayaran lunas"}
            </h2>
          </div>

          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold",
              remainingAmount > 0
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700",
            )}
          >
            {remainingAmount > 0 ? "Belum lunas" : "Lunas"}
          </span>
        </div>
      </div>

      <div className="grid gap-3 border-b border-[var(--border)] py-4">
        <div className="rounded-2xl border border-[var(--border)] bg-neutral-50 p-3">
          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3 text-[var(--muted)]">
              <span>Total belanja</span>
              <span className="font-semibold text-neutral-950">
                {formatCurrency(totalAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[var(--muted)]">
              <span>Sudah dibayar</span>
              <span className="font-semibold text-neutral-950">
                {formatCurrency(paidAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[var(--accent)]">
              <span className="font-semibold">Sisa bayar</span>
              <span className="text-lg font-bold tracking-tight">
                {formatCurrency(remainingAmount)}
              </span>
            </div>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${paymentProgressPercentage}%` }}
            />
          </div>
        </div>

        {totalChangeAmount > 0 ? (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-700">
            <span className="text-sm font-semibold">Total kembalian</span>
            <span className="text-base font-bold tracking-tight">
              {formatCurrency(totalChangeAmount)}
            </span>
          </div>
        ) : null}
      </div>

      {paymentFeedback ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {paymentFeedback}
        </div>
      ) : null}

      {remainingAmount > 0 ? (
        <>
          <div className="border-b border-[var(--border)] py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-neutral-950">
                Metode pembayaran
              </p>
              <span className="text-xs font-medium text-[var(--muted)]">
                {selectedConfig.shortLabel}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1">
              {paymentMethodConfigs.map((config) => (
                <button
                  key={config.method}
                  type="button"
                  onClick={() => onMethodChange(config.method)}
                  className={cn(
                    "h-7 rounded-lg border px-3 !text-xs !font-semibold transition",
                    selectedMethod === config.method
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] bg-white text-neutral-700 hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]",
                  )}
                >
                  {config.shortLabel}
                </button>
              ))}
            </div>

            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {selectedConfig.description}
            </p>
          </div>

          <div className="border-b border-[var(--border)] py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-neutral-950">
                Tambah pembayaran
              </p>
              <p className="text-xs font-medium text-[var(--muted)]">
                Sisa {formatCurrency(remainingAmount)}
              </p>
            </div>

            <div className="space-y-4">
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-neutral-800">
                  {selectedConfig.amountLabel}
                </span>
                <input
                  value={amountInput}
                  onChange={(event) =>
                    onAmountInputChange(formatRupiahInput(event.target.value))
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Contoh: 1.350.000"
                  className={cn(
                    "h-12 w-full rounded-2xl border bg-white px-4 text-base font-semibold text-neutral-950 outline-none transition placeholder:text-sm placeholder:font-normal placeholder:text-neutral-400 focus:ring-4",
                    nonCashAmountIsTooHigh
                      ? "border-red-300 focus:border-red-400 focus:ring-red-50"
                      : "border-[var(--border)] focus:border-[var(--accent)] focus:ring-[var(--accent-soft)]",
                  )}
                />
              </label>

              {selectedMethod === "cash" && parsedInputAmount > 0 ? (
                <div className="rounded-2xl bg-neutral-50 p-3 text-xs leading-5 text-[var(--muted)]">
                  <div className="flex items-center justify-between gap-3">
                    <span>Diakui sebagai pembayaran</span>
                    <span className="font-semibold text-neutral-950">
                      {formatCurrency(recognizedCashAmount)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span>Kembalian</span>
                    <span
                      className={cn(
                        "font-semibold",
                        cashChangeAmount > 0
                          ? "text-emerald-700"
                          : "text-neutral-950",
                      )}
                    >
                      {formatCurrency(cashChangeAmount)}
                    </span>
                  </div>
                </div>
              ) : null}

              {nonCashAmountIsTooHigh ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                  {selectedConfig.label} tidak boleh lebih besar dari sisa
                  bayar.
                </div>
              ) : null}

              {selectedConfig.providerLabel ? (
                <label className="block text-sm">
                  <span className="mb-2 block font-medium text-neutral-800">
                    {selectedConfig.providerLabel}
                    <span className="ml-1 text-xs font-normal text-[var(--muted)]">
                      (opsional)
                    </span>
                  </span>
                  <input
                    value={providerInput}
                    onChange={(event) =>
                      onProviderInputChange(event.target.value)
                    }
                    maxLength={80}
                    placeholder={
                      selectedConfig.providerPlaceholder ?? "Opsional"
                    }
                    className="h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-4 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                  />
                </label>
              ) : null}

              {selectedConfig.referenceLabel ? (
                <label className="block text-sm">
                  <span className="mb-2 flex items-center justify-between gap-3 font-medium text-neutral-800">
                    {selectedConfig.referenceLabel}
                    {selectedConfig.requiresReference ? (
                      <span className="text-xs font-semibold text-[var(--accent)]">
                        Wajib
                      </span>
                    ) : null}
                  </span>
                  <input
                    value={referenceInput}
                    onChange={(event) =>
                      onReferenceInputChange(event.target.value)
                    }
                    maxLength={160}
                    required={selectedConfig.requiresReference}
                    placeholder={
                      selectedConfig.referencePlaceholder ?? "Nomor referensi"
                    }
                    className="h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-4 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                  />
                </label>
              ) : null}

              <label className="block text-sm">
                <span className="mb-2 block font-medium text-neutral-800">
                  Catatan / referensi tambahan
                </span>
                <input
                  value={noteInput}
                  onChange={(event) => onNoteInputChange(event.target.value)}
                  maxLength={160}
                  placeholder="Opsional"
                  className="h-11 w-full rounded-2xl border border-[var(--border)] bg-white px-4 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
                />
              </label>

              <button
                type="button"
                onClick={onAddPayment}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 px-4 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                <WalletCards className="size-4" />
                Tambahkan {selectedConfig.shortLabel}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="border-b border-[var(--border)] py-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-800">
            <div className="flex items-start gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-600">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-950">
                  Pembayaran sudah pas
                </p>
                <p className="mt-1 text-xs leading-5 text-emerald-700">
                  Form tambah pembayaran disembunyikan. Periksa daftar
                  pembayaran, lalu selesaikan transaksi.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-neutral-950">
            Daftar pembayaran
          </p>
          {hasPayments ? (
            <button
              type="button"
              onClick={onResetPayments}
              className="text-xs font-semibold text-red-600 hover:text-red-700"
            >
              Reset
            </button>
          ) : null}
        </div>

        {hasPayments ? (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="rounded-2xl border border-[var(--border)] bg-white p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-950">
                      {payment.methodLabel}
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">
                      {payment.reference
                        ? `Ref: ${payment.reference}`
                        : payment.provider
                          ? payment.provider
                          : "Manual verified"}
                    </p>
                  </div>

                  <div className="flex items-start gap-2">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-neutral-950">
                        {formatCurrency(payment.amount)}
                      </p>
                      {payment.changeAmount > 0 ? (
                        <p className="mt-1 text-xs text-emerald-700">
                          Kembali {formatCurrency(payment.changeAmount)}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      aria-label={`Hapus pembayaran ${payment.methodLabel}`}
                      onClick={() => onRemovePayment(payment.id)}
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-neutral-50 px-4 py-5 text-center text-xs leading-5 text-[var(--muted)]">
            Belum ada pembayaran masuk. Tambahkan minimal satu pembayaran untuk
            menyelesaikan transaksi.
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-[var(--border)] pt-4">
        <button
          type="button"
          disabled={!canFinalizePayment || isCheckoutPending}
          onClick={onFinalizePayment}
          className={cn(
            "flex h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 font-semibold transition",
            canFinalizePayment && !isCheckoutPending
              ? "bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90"
              : "cursor-not-allowed bg-neutral-200 text-neutral-500",
          )}
        >
          {isCheckoutPending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Memproses transaksi...
            </>
          ) : (
            <>
              Selesaikan Transaksi
              <ChevronRight className="size-4" />
            </>
          )}
        </button>

        <p className="mt-3 text-center text-[11px] leading-5 text-[var(--muted)]">
          {canFinalizePayment
            ? "Payment sudah lunas. Transaksi siap disimpan dan stok akan otomatis terjual."
            : remainingAmount > 0
              ? "Tambahkan pembayaran sampai sisa bayar Rp0."
              : "Payment belum siap divalidasi."}
        </p>
      </div>
    </div>
  );
}
function PosContextNotice({
  context,
  canManageShifts,
  onCloseShiftClick,
  isCloseShiftPanelOpen = false,
}: {
  context: PosOperationalContext;
  canManageShifts: boolean;
  onCloseShiftClick?: () => void;
  isCloseShiftPanelOpen?: boolean;
}) {
  if (!context.outlet) {
    return (
      <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Outlet aktif tidak ditemukan. Hubungi manager/admin untuk mengatur akses
        outlet staff ini.
      </div>
    );
  }

  if (!context.register) {
    return (
      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Register aktif untuk {context.outlet.name} belum tersedia. POS bisa
        menampilkan katalog, tapi transaksi belum bisa diproses.
      </div>
    );
  }

  if (!context.activeShift) {
    return (
      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Shift untuk register {context.register.name} belum aktif. Sales masih
        bisa melihat katalog, tetapi checkout akan diblokir sampai shift dibuka.
        {canManageShifts
          ? " Buka shift terlebih dahulu sebelum menerima pembayaran."
          : " Hubungi manager untuk membuka shift."}
      </div>
    );
  }

  const expectedCash =
    context.activeShift.expectedCash ?? context.activeShift.openingCash;

  return (
    <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-900 sm:px-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white text-emerald-600">
            <Clock3 className="size-4" />
          </div>

          <div className="min-w-0">
            <p className="truncate font-semibold text-neutral-950">
              Shift aktif · {context.register.name}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-5 text-emerald-800">
              <span>
                Jam buka: {formatOpenedAt(context.activeShift.openedAt)}
              </span>
              <span>
                Saldo Cash: {formatCurrency(context.activeShift.openingCash)}
              </span>
              <span>Expected: {formatCurrency(expectedCash)}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
            Katalog real-time
          </span>

          {canManageShifts ? (
            <button
              type="button"
              onClick={onCloseShiftClick}
              className={cn(
                "inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition",
                isCloseShiftPanelOpen
                  ? "bg-black text-white hover:bg-black/80"
                  : "bg-red-600 text-white hover:bg-red-700",
              )}
            >
              <StopCircle className="size-3.5" />
              {isCloseShiftPanelOpen ? "Sembunyikan" : "Menu Shift"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OpenShiftCard({ context }: { context: PosOperationalContext }) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    openPosShiftAction,
    initialPosShiftActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  if (!context.outlet || !context.register || context.activeShift) {
    return null;
  }

  return (
    <section className="mb-4 rounded-2xl border border-[var(--border)] bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <WalletCards className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-neutral-950">Buka Shift POS</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Shift akan dibuka untuk {context.register.name} di{" "}
            {context.outlet.name}. Semua transaksi sales HP dan Mini PC akan
            masuk ke shift aktif ini.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="registerId" value={context.register.id} />

        <ActionMessage state={state} />

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <label className="block text-sm">
            <span className="mb-2 block font-medium text-neutral-800">
              Modal (Opening)
            </span>
            <CurrencyFormInput
              name="openingCash"
              placeholder="Contoh: 500.000"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            />
            <FieldError message={state.fieldErrors?.openingCash} />
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              Kosongkan jika tidak ada modal awal.
            </p>
          </label>

          <label className="block text-sm">
            <span className="mb-2 block font-medium text-neutral-800">
              Catatan (Opsional)
            </span>
            <input
              name="note"
              maxLength={240}
              placeholder="Contoh: Shift pagi outlet utama"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            />
            <FieldError message={state.fieldErrors?.note} />
          </label>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--muted)]">
            Setelah shift aktif, cart bisa dilanjutkan ke payment pada phase
            berikutnya.
          </p>
          <OpenShiftSubmitButton />
        </div>
      </form>
    </section>
  );
}

function CloseShiftCard({
  context,
  onCancel,
}: {
  context: PosOperationalContext;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(
    closePosShiftAction,
    initialPosShiftActionState,
  );
  const [actualCashAmount, setActualCashAmount] = useState<number | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      onCancel?.();
      router.refresh();
    }
  }, [onCancel, router, state.status]);

  if (!context.outlet || !context.register || !context.activeShift) {
    return null;
  }

  const expectedCash =
    context.activeShift.expectedCash ?? context.activeShift.openingCash;
  const expectedCashAmount = parseAmount(expectedCash);
  const cashVarianceAmount =
    actualCashAmount === null ? null : actualCashAmount - expectedCashAmount;
  const cashVarianceLabel =
    cashVarianceAmount === null
      ? "Input nominal uang cash aktual untuk melihat selisih."
      : formatVarianceAmount(cashVarianceAmount);

  return (
    <section className="mb-4 rounded-2xl border border-red-100 bg-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600">
          <StopCircle className="size-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold text-neutral-950">
                Closing Shift POS
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                Rekonsiliasi kas untuk {context.register.name}. Expected cash
                sistem saat ini {formatCurrency(expectedCash)}. Setelah ditutup,
                checkout akan diblokir sampai shift baru dibuka.
              </p>
            </div>
          </div>
        </div>
      </div>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="shiftId" value={context.activeShift.id} />
        <input type="hidden" name="registerId" value={context.register.id} />

        <ActionMessage state={state} />

        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <label className="block text-sm">
            <span className="mb-2 block font-medium text-neutral-800">
              Nominal Uang (Closing)
            </span>
            <CurrencyFormInput
              name="actualCash"
              placeholder="Contoh: 2.500.000"
              onValueChange={setActualCashAmount}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            />
            <FieldError message={state.fieldErrors?.actualCash} />
            <p className="mt-1.5 text-xs text-[var(--muted)]">
              Hitung uang di laci (Cash Drawer), lalu input nominal aktual.
            </p>
          </label>

          <label className="block text-sm">
            <span className="mb-2 block font-medium text-neutral-800">
              Alasan / Catatan Selisih
            </span>
            <input
              name="varianceReason"
              maxLength={500}
              placeholder="Berikan alasan jika total cash kurang / lebih dari expected cash"
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm text-neutral-950 outline-none transition placeholder:text-neutral-400 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]"
            />
            <FieldError message={state.fieldErrors?.varianceReason} />
          </label>
        </div>

        <div
          className={cn(
            "grid gap-3 rounded-2xl border p-3 text-sm sm:grid-cols-3",
            cashVarianceAmount === null
              ? "border-[var(--border)] bg-neutral-50 text-neutral-700"
              : cashVarianceAmount === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : cashVarianceAmount > 0
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          <div>
            <p className="text-[10px] !font-medium uppercase text-current/60">
              Nominal Seharusnya
            </p>
            <p className="mt-1 !font-medium text-neutral-950">
              {formatCurrency(expectedCashAmount)}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase text-current/60">
              Total Uang (Closing)
            </p>
            <p className="mt-1 !font-medium text-neutral-950">
              {actualCashAmount === null
                ? "-----"
                : formatCurrency(actualCashAmount)}
            </p>
          </div>

          <div>
            <p className="text-[10px] !font-medium uppercase text-current/60">
              Selisih Uang
            </p>
            <p className="mt-1 !font-medium text-neutral-950">
              {cashVarianceLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--muted)]">
            Expected cash dihitung dari modal awal, cash sale, kas masuk/keluar,
            dan refund cash.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="flex h-11 w-full items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 sm:w-auto"
              >
                Batal
              </button>
            ) : null}
            <CloseShiftSubmitButton />
          </div>
        </div>
      </form>
    </section>
  );
}

export function PosWorkspace({
  categories,
  items,
  customers,
  context,
  canManageShifts,
}: PosWorkspaceProps) {
  const router = useRouter();
  const [activeCategoryId, setActiveCategoryId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCloseShiftPanelOpen, setIsCloseShiftPanelOpen] = useState(false);
  const [cartItems, setCartItems] = useState<PosAvailableItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<PosCustomerOption | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [isCustomerSelectorOpen, setIsCustomerSelectorOpen] = useState(false);
  const [cartFeedback, setCartFeedback] = useState<string | null>(null);
  const [isScanLookupPending, startScanLookupTransition] = useTransition();
  const [panelMode, setPanelMode] = useState<PosPanelMode>("cart");
  const [payments, setPayments] = useState<PosPaymentDraft[]>([]);
  const [selectedMethod, setSelectedMethod] =
    useState<PosManualPaymentMethod>("cash");
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentProviderInput, setPaymentProviderInput] = useState("");
  const [paymentReferenceInput, setPaymentReferenceInput] = useState("");
  const [paymentNoteInput, setPaymentNoteInput] = useState("");
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<
    Extract<PosCheckoutActionResult, { status: "success" }>["sale"] | null
  >(null);
  const [isCheckoutPending, startCheckoutTransition] = useTransition();
  const [isHoldDialogOpen, setIsHoldDialogOpen] = useState(false);
  const [holdTitleInput, setHoldTitleInput] = useState("");
  const [holdNoteInput, setHoldNoteInput] = useState("");
  const [holdFeedback, setHoldFeedback] = useState<string | null>(null);
  const [isHoldPending, startHoldTransition] = useTransition();
  const posWorkspaceCommandHandlerRef = useRef<
    (command: PosWorkspaceCommand) => void
  >(() => undefined);

  useEffect(() => {
    if (!cartFeedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCartFeedback(null);
    }, CART_FEEDBACK_AUTO_CLOSE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [cartFeedback]);

  useEffect(() => {
    const pendingResumeState = getPendingHeldCartResumeState();
    const storedCartState = pendingResumeState ? null : getStoredPosCartState();

    if (!pendingResumeState && !storedCartState) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (pendingResumeState) {
        removePendingHeldCartResumeState();
        removeStoredPosCartState();
        setCartItems(pendingResumeState.items);
        setSelectedCustomer(pendingResumeState.heldCart.customer);
        setCustomerQuery(pendingResumeState.heldCart.customer?.fullName ?? "");
        setIsCustomerSelectorOpen(false);
        setCheckoutResult(null);
        setPayments([]);
        setPaymentFeedback(null);
        setPaymentAmountInput("");
        setPaymentProviderInput("");
        setPaymentReferenceInput("");
        setPaymentNoteInput("");
        setPanelMode("cart");
        setIsMobileCartOpen(true);
        setCartFeedback(
          `Hold ${pendingResumeState.heldCart.holdNumber} berhasil dimasukkan kembali ke cart.`,
        );
        router.refresh();
        return;
      }

      if (!storedCartState) {
        return;
      }

      setCartItems(storedCartState.items);
      setSelectedCustomer(storedCartState.customer);
      setCustomerQuery(storedCartState.customer?.fullName ?? "");
      setIsCustomerSelectorOpen(false);

      if (storedCartState.items.length > 0) {
        setCartFeedback("Cart POS terakhir dipulihkan dari sesi browser ini.");
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [router]);

  useEffect(() => {
    if (panelMode === "success") {
      removeStoredPosCartState();
      return;
    }

    saveStoredPosCartState({
      items: cartItems,
      customer: selectedCustomer,
    });
  }, [cartItems, panelMode, selectedCustomer]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return items.filter((item) => {
      const matchesCategory =
        activeCategoryId === "all" || item.categoryId === activeCategoryId;

      if (!matchesCategory) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return [
        item.sku,
        item.barcode,
        item.qrValue,
        item.serialNumber,
        item.productCode,
        item.productName,
        item.categoryName,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedSearch));
    });
  }, [activeCategoryId, items, searchQuery]);

  const customerSearchResults = useMemo(() => {
    const normalizedQuery = customerQuery.trim().toLowerCase();

    const matchedCustomers = normalizedQuery
      ? customers.filter((customer) =>
          getCustomerSearchText(customer).includes(normalizedQuery),
        )
      : customers;

    return matchedCustomers.slice(0, 8);
  }, [customerQuery, customers]);

  const cartItemIds = useMemo(
    () => new Set(cartItems.map((item) => item.id)),
    [cartItems],
  );

  const subtotalAmount = useMemo(
    () =>
      cartItems.reduce(
        (total, item) => total + parseAmount(item.sellingAmount),
        0,
      ),
    [cartItems],
  );

  const totalAmount = subtotalAmount;
  const paidAmount = useMemo(
    () => payments.reduce((total, payment) => total + payment.amount, 0),
    [payments],
  );
  const remainingAmount = Math.max(totalAmount - paidAmount, 0);
  const totalChangeAmount = useMemo(
    () => payments.reduce((total, payment) => total + payment.changeAmount, 0),
    [payments],
  );
  const totalAvailableItems = items.length;
  const canCheckout =
    cartItems.length > 0 &&
    Boolean(context.register) &&
    Boolean(context.activeShift);
  const checkoutDisabledReason = !cartItems.length
    ? "Tambahkan minimal satu item sebelum lanjut ke pembayaran."
    : !context.register
      ? "Register aktif belum tersedia untuk outlet ini."
      : !context.activeShift
        ? "Shift aktif belum dibuka, checkout belum bisa dilanjutkan."
        : "Lanjutkan ke pembayaran manual.";
  const canFinalizePayment =
    canCheckout && payments.length > 0 && remainingAmount === 0;
  const canHoldCart =
    panelMode === "cart" &&
    cartItems.length > 0 &&
    payments.length === 0 &&
    Boolean(context.register) &&
    Boolean(context.activeShift);
  const holdCartDisabledReason = !cartItems.length
    ? "Tambahkan minimal satu item sebelum transaksi bisa ditahan."
    : payments.length > 0
      ? "Transaksi yang sudah memiliki payment tidak bisa ditahan. Reset payment terlebih dahulu."
      : !context.register
        ? "Register aktif belum tersedia untuk outlet ini."
        : !context.activeShift
          ? "Shift aktif belum dibuka, hold cart belum bisa dibuat."
          : "Transaksi bisa ditahan.";

  function resetPaymentForm(
    nextMethod: PosManualPaymentMethod = selectedMethod,
  ) {
    setSelectedMethod(nextMethod);
    setPaymentAmountInput("");
    setPaymentProviderInput("");
    setPaymentReferenceInput("");
    setPaymentNoteInput("");
  }

  function resetPayments() {
    setPayments([]);
    setPaymentFeedback(null);
    setCheckoutResult(null);
    resetPaymentForm();
  }

  function resetPaymentFlow() {
    setPanelMode("cart");
    resetPayments();
  }

  function selectCustomer(customer: PosCustomerOption) {
    setSelectedCustomer(customer);
    setCustomerQuery(customer.fullName);
    setIsCustomerSelectorOpen(false);
    setCheckoutResult(null);
    resetPaymentFlow();
    setCartFeedback(
      `Customer ${customer.fullName} dipilih untuk transaksi ini.`,
    );
  }

  function clearSelectedCustomer() {
    const customerName = selectedCustomer?.fullName;

    setSelectedCustomer(null);
    setCustomerQuery("");
    setIsCustomerSelectorOpen(false);
    setCheckoutResult(null);
    resetPaymentFlow();

    if (customerName) {
      setCartFeedback(`Customer ${customerName} dihapus dari transaksi.`);
    }
  }

  function clearCart() {
    setCartItems([]);
    setSelectedCustomer(null);
    setCustomerQuery("");
    setIsCustomerSelectorOpen(false);
    setCheckoutResult(null);
    resetPaymentFlow();
    setCartFeedback("Keranjang transaksi direset.");
  }

  function openHoldDialog() {
    if (!canHoldCart) {
      setCartFeedback(holdCartDisabledReason);
      return;
    }

    setHoldTitleInput(selectedCustomer?.fullName ?? "");
    setHoldNoteInput("");
    setHoldFeedback(null);
    setIsHoldDialogOpen(true);
  }

  function closeHoldDialog() {
    if (isHoldPending) {
      return;
    }

    setIsHoldDialogOpen(false);
    setHoldFeedback(null);
  }

  function holdCurrentCart() {
    if (!canHoldCart) {
      setHoldFeedback(holdCartDisabledReason);
      return;
    }

    if (holdTitleInput.trim().length > 160) {
      setHoldFeedback("Nama hold maksimal 160 karakter.");
      return;
    }

    if (holdNoteInput.trim().length > 500) {
      setHoldFeedback("Catatan hold maksimal 500 karakter.");
      return;
    }

    setHoldFeedback(null);

    startHoldTransition(async () => {
      const result = await holdPosCartAction({
        itemIds: cartItems.map((item) => item.id),
        customerId: selectedCustomer?.id ?? null,
        title: holdTitleInput,
        note: holdNoteInput,
      });

      if (result.status === "error") {
        setHoldFeedback(getHeldCartErrorMessage(result));
        return;
      }

      setCartItems([]);
      setSelectedCustomer(null);
      setCustomerQuery("");
      setIsCustomerSelectorOpen(false);
      setCheckoutResult(null);
      resetPaymentFlow();
      removeStoredPosCartState();
      setIsHoldDialogOpen(false);
      setHoldTitleInput("");
      setHoldNoteInput("");
      setCartFeedback(result.message);
      router.refresh();
    });
  }

  function addItemToCart(item: PosAvailableItem) {
    const sellingAmount = parseAmount(item.sellingAmount);

    if (sellingAmount <= 0) {
      setCartFeedback(
        `${item.sku} belum memiliki harga jual. Lengkapi harga sebelum transaksi.`,
      );
      return;
    }

    if (cartItemIds.has(item.id)) {
      setCartFeedback(`${item.sku} sudah ada di keranjang.`);
      return;
    }

    setCartItems((currentItems) => [...currentItems, item]);
    setCheckoutResult(null);
    resetPaymentFlow();
    setCartFeedback(`${item.sku} ditambahkan ke keranjang.`);
  }

  function removeItemFromCart(itemId: string) {
    setCartItems((currentItems) => {
      const removedItem = currentItems.find((item) => item.id === itemId);
      const nextItems = currentItems.filter((item) => item.id !== itemId);

      if (removedItem) {
        resetPaymentFlow();
        setCartFeedback(`${removedItem.sku} dihapus dari keranjang.`);
      }

      return nextItems;
    });
  }
  function continueToPayment() {
    if (!canCheckout) {
      setCartFeedback(checkoutDisabledReason);
      return;
    }

    setPanelMode("payment");
    setPaymentFeedback(null);
    setPaymentAmountInput(formatRupiahInput(remainingAmount || totalAmount));
    setCartFeedback(null);
  }

  function lookupScannedItem(scanValue: string) {
    const normalizedScanValue = scanValue.trim();

    if (!normalizedScanValue) {
      setCartFeedback(
        "Masukkan barcode, QR value, serial number, atau SKU item.",
      );
      return;
    }

    setIsScannerOpen(false);
    setSearchQuery(normalizedScanValue);
    setCartFeedback(`Mencari item ${normalizedScanValue}...`);

    startScanLookupTransition(async () => {
      const result = await lookupPosScanValueAction(normalizedScanValue);

      if (result.status === "found") {
        addItemToCart(result.item);
        return;
      }

      setCartFeedback(result.message);
    });
  }

  function handlePosShellCommand(command: PosWorkspaceCommand) {
    const normalizedValue = command.value.trim();

    if (!normalizedValue) {
      if (command.type === "search") {
        setIsScannerOpen(false);
        setSearchQuery("");
        setCartFeedback(null);
      }

      return;
    }

    if (command.type === "scan") {
      lookupScannedItem(normalizedValue);
      return;
    }

    setIsScannerOpen(false);
    setSearchQuery(normalizedValue);
    setCartFeedback(`Filter katalog: ${normalizedValue}`);
  }

  useEffect(() => {
    posWorkspaceCommandHandlerRef.current = handlePosShellCommand;
  });

  useEffect(() => {
    function handleCommandEvent(event: Event) {
      const command = normalizePosWorkspaceCommand(
        (event as CustomEvent<unknown>).detail,
      );

      if (command) {
        posWorkspaceCommandHandlerRef.current(command);
      }
    }

    window.addEventListener(POS_WORKSPACE_COMMAND_EVENT, handleCommandEvent);

    try {
      const pendingCommandValue = window.sessionStorage.getItem(
        POS_PENDING_COMMAND_STORAGE_KEY,
      );

      if (pendingCommandValue) {
        window.sessionStorage.removeItem(POS_PENDING_COMMAND_STORAGE_KEY);

        const pendingCommand = normalizePosWorkspaceCommand(
          JSON.parse(pendingCommandValue),
        );

        if (pendingCommand) {
          posWorkspaceCommandHandlerRef.current(pendingCommand);
        }
      }
    } catch {
      window.sessionStorage.removeItem(POS_PENDING_COMMAND_STORAGE_KEY);
    }

    return () => {
      window.removeEventListener(
        POS_WORKSPACE_COMMAND_EVENT,
        handleCommandEvent,
      );
    };
  }, []);

  function changePaymentMethod(method: PosManualPaymentMethod) {
    resetPaymentForm(method);
    setPaymentFeedback(null);
    if (remainingAmount > 0) {
      setPaymentAmountInput(formatRupiahInput(remainingAmount));
    }
  }

  function addPayment() {
    if (!canCheckout) {
      setPaymentFeedback(checkoutDisabledReason);
      return;
    }

    if (remainingAmount <= 0) {
      setPaymentFeedback(
        "Pembayaran sudah lunas. Tidak perlu menambah payment.",
      );
      return;
    }

    const config = getPaymentConfig(selectedMethod);
    const inputAmount = parsePaymentAmountInput(paymentAmountInput);
    const provider = paymentProviderInput.trim();
    const reference = paymentReferenceInput.trim();
    const note = paymentNoteInput.trim();

    if (!Number.isFinite(inputAmount) || inputAmount <= 0) {
      setPaymentFeedback("Nominal pembayaran harus lebih dari Rp0.");
      return;
    }

    if (!config.allowOverpayment && inputAmount > remainingAmount) {
      setPaymentFeedback(
        `${config.label} tidak boleh lebih besar dari sisa bayar ${formatCurrency(remainingAmount)}.`,
      );
      return;
    }

    if (config.requiresReference && !reference) {
      setPaymentFeedback(
        `${config.referenceLabel ?? "Reference"} wajib diisi.`,
      );
      return;
    }

    if (provider.length > 80) {
      setPaymentFeedback("Provider/bank maksimal 80 karakter.");
      return;
    }

    if (reference.length > 160) {
      setPaymentFeedback("Reference number maksimal 160 karakter.");
      return;
    }

    if (note.length > 160) {
      setPaymentFeedback("Catatan payment maksimal 160 karakter.");
      return;
    }

    const recognizedAmount =
      selectedMethod === "cash"
        ? Math.min(inputAmount, remainingAmount)
        : inputAmount;
    const changeAmount =
      selectedMethod === "cash"
        ? Math.max(inputAmount - remainingAmount, 0)
        : 0;

    const nextRemainingAmount = Math.max(remainingAmount - recognizedAmount, 0);

    setPayments((currentPayments) => [
      ...currentPayments,
      {
        id: createPaymentDraftId(),
        method: selectedMethod,
        methodLabel: config.label,
        amount: recognizedAmount,
        receivedAmount: selectedMethod === "cash" ? inputAmount : null,
        changeAmount,
        provider: provider || null,
        reference: reference || null,
        note: note || null,
      },
    ]);

    resetPaymentForm(selectedMethod);

    if (nextRemainingAmount > 0) {
      setPaymentAmountInput(formatRupiahInput(nextRemainingAmount));
    }

    setPaymentFeedback(
      changeAmount > 0
        ? `${config.label} ditambahkan. Kembalian ${formatCurrency(changeAmount)}.`
        : `${config.label} ${formatCurrency(recognizedAmount)} ditambahkan.`,
    );
  }

  function removePayment(paymentId: string) {
    setPayments((currentPayments) =>
      currentPayments.filter((payment) => payment.id !== paymentId),
    );
    setPaymentFeedback("Payment dihapus. Periksa kembali sisa bayar.");
  }

  function finalizePayment() {
    const paymentValidationMessage = getPaymentDraftValidationMessage({
      payments,
      totalAmount,
    });

    if (!canFinalizePayment || paymentValidationMessage) {
      setPaymentFeedback(
        paymentValidationMessage ??
          "Payment belum lunas atau transaksi belum siap diproses.",
      );
      return;
    }

    setPaymentFeedback("Memproses transaksi POS...");

    const checkoutPayload = {
      itemIds: cartItems.map((item) => item.id),
      payments: payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        receivedAmount: payment.receivedAmount,
        changeAmount: payment.changeAmount,
        provider: payment.provider,
        reference: payment.reference,
        note: payment.note,
      })),
      idempotencyKey: createCheckoutIdempotencyKey(),
      customerId: selectedCustomer?.id ?? null,
      note: null,
    };

    startCheckoutTransition(async () => {
      const result = await completePosCheckoutAction(checkoutPayload);

      if (result.status === "error") {
        setPaymentFeedback(getCheckoutErrorMessage(result));
        return;
      }

      setCheckoutResult(result.sale);
      setPaymentFeedback(null);
      setCartFeedback(null);
      setCartItems([]);
      setSelectedCustomer(null);
      setCustomerQuery("");
      setIsCustomerSelectorOpen(false);
      setPayments([]);
      resetPaymentForm();
      setPanelMode("success");
      setIsMobileCartOpen(true);
      router.refresh();
    });
  }

  const cartContent = (
    <CartContent
      cartItems={cartItems}
      subtotalAmount={subtotalAmount}
      totalAmount={totalAmount}
      canCheckout={canCheckout}
      checkoutDisabledReason={checkoutDisabledReason}
      customers={customers}
      selectedCustomer={selectedCustomer}
      customerQuery={customerQuery}
      customerSearchResults={customerSearchResults}
      isCustomerSelectorOpen={isCustomerSelectorOpen}
      onCustomerQueryChange={(value) => {
        setCustomerQuery(value);
        setIsCustomerSelectorOpen(true);
        if (selectedCustomer) {
          setSelectedCustomer(null);
          resetPaymentFlow();
        }
      }}
      onCustomerInputFocus={() => setIsCustomerSelectorOpen(true)}
      onCustomerInputBlur={() => {
        window.setTimeout(() => setIsCustomerSelectorOpen(false), 120);
      }}
      onSelectCustomer={selectCustomer}
      onClearCustomer={clearSelectedCustomer}
      onRemoveItem={removeItemFromCart}
      onClearCart={clearCart}
      onContinueToPayment={continueToPayment}
      canHoldCart={canHoldCart}
      holdCartDisabledReason={holdCartDisabledReason}
      onOpenHoldDialog={openHoldDialog}
    />
  );

  const paymentContent = (
    <PaymentContent
      totalAmount={totalAmount}
      paidAmount={paidAmount}
      remainingAmount={remainingAmount}
      totalChangeAmount={totalChangeAmount}
      payments={payments}
      selectedMethod={selectedMethod}
      amountInput={paymentAmountInput}
      providerInput={paymentProviderInput}
      referenceInput={paymentReferenceInput}
      noteInput={paymentNoteInput}
      paymentFeedback={paymentFeedback}
      canFinalizePayment={canFinalizePayment}
      isCheckoutPending={isCheckoutPending}
      onBackToCart={() => setPanelMode("cart")}
      onMethodChange={changePaymentMethod}
      onAmountInputChange={setPaymentAmountInput}
      onProviderInputChange={setPaymentProviderInput}
      onReferenceInputChange={setPaymentReferenceInput}
      onNoteInputChange={setPaymentNoteInput}
      onAddPayment={addPayment}
      onRemovePayment={removePayment}
      onResetPayments={resetPayments}
      onFinalizePayment={finalizePayment}
    />
  );

  const successContent = checkoutResult ? (
    <CheckoutSuccessContent
      sale={checkoutResult}
      onStartNewTransaction={() => {
        setCheckoutResult(null);
        setCartFeedback(null);
        setPaymentFeedback(null);
        setSelectedCustomer(null);
        setCustomerQuery("");
        setIsCustomerSelectorOpen(false);
        setPanelMode("cart");
        setIsMobileCartOpen(false);
      }}
    />
  ) : null;

  const sidePanelContent =
    panelMode === "success" && successContent
      ? successContent
      : panelMode === "payment"
        ? paymentContent
        : cartContent;

  return (
    <>
      {isHoldDialogOpen ? (
        <HoldCartDialog
          cartItems={cartItems}
          totalAmount={totalAmount}
          selectedCustomer={selectedCustomer}
          titleInput={holdTitleInput}
          noteInput={holdNoteInput}
          feedback={holdFeedback}
          isPending={isHoldPending}
          onTitleInputChange={setHoldTitleInput}
          onNoteInputChange={setHoldNoteInput}
          onCancel={closeHoldDialog}
          onSubmit={holdCurrentCart}
        />
      ) : null}

      <div className="lg:grid lg:h-[calc(100vh-7.5rem)] lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
        {/* Katalog */}
        <section className="min-w-0 p-4 pb-36 sm:p-5 sm:pb-36 lg:overflow-y-auto lg:border-r lg:border-[var(--border)] lg:p-6">
          <PosContextNotice
            context={context}
            canManageShifts={canManageShifts}
            isCloseShiftPanelOpen={isCloseShiftPanelOpen}
            onCloseShiftClick={() =>
              setIsCloseShiftPanelOpen((isOpen) => !isOpen)
            }
          />

          {canManageShifts ? <OpenShiftCard context={context} /> : null}

          {canManageShifts && isCloseShiftPanelOpen && context.activeShift ? (
            <CloseShiftCard
              context={context}
              onCancel={() => setIsCloseShiftPanelOpen(false)}
            />
          ) : null}

          {cartFeedback ? (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white p-3 text-sm text-neutral-700">
              <p>{cartFeedback}</p>
              <button
                type="button"
                aria-label="Tutup pesan keranjang"
                onClick={() => setCartFeedback(null)}
                className="grid size-6 shrink-0 place-items-center rounded-lg text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          {/* Search mobile */}
          <div className="mb-4 flex items-center gap-2 md:hidden">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-3">
              <Search className="size-4 shrink-0 text-neutral-400" />

              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Scan atau cari barang..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
              />
            </label>

            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              aria-label="Scan dengan kamera"
              className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-white text-[var(--accent)]"
            >
              <ScanBarcode className="size-5" />
            </button>
          </div>

          <label className="mb-4 hidden h-11 max-w-xl items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-3 md:flex lg:hidden">
            <Search className="size-4 shrink-0 text-neutral-400" />

            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Cari SKU, barcode, nama produk..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
            />
          </label>

          {/* Kategori */}
          <div className="flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-1">
            <button
              type="button"
              onClick={() => setActiveCategoryId("all")}
              className={cn(
                "h-9 shrink-0 rounded-lg px-4 text-xs font-medium transition-colors sm:text-sm",
                activeCategoryId === "all"
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950",
              )}
            >
              Semua
            </button>

            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategoryId(category.id)}
                className={cn(
                  "h-9 shrink-0 rounded-lg px-4 text-xs font-medium transition-colors sm:text-sm",
                  activeCategoryId === category.id
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950",
                )}
              >
                {category.name}
                {category.totalAvailableItems > 0 ? (
                  <span className="ml-2 text-[10px] text-current/60">
                    {category.totalAvailableItems}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-neutral-950">
                Pilih Item Produk
              </h1>

              <p className="mt-1 text-xs text-[var(--muted)]">
                Menampilkan stok item fisik yang tersedia di outlet aktif.
              </p>
            </div>

            <span className="hidden text-xs text-[var(--muted)] sm:block">
              {filteredItems.length} dari {totalAvailableItems} item tersedia
            </span>
          </div>

          {totalAvailableItems >= POS_INITIAL_ITEM_LIMIT ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Menampilkan {POS_INITIAL_ITEM_LIMIT} item terbaru. Gunakan search
              atau scan barcode untuk menemukan item yang lebih spesifik.
            </p>
          ) : null}

          {/* Product grid */}
          {filteredItems.length > 0 ? (
            <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
              {filteredItems.map((item) => {
                const isInCart = cartItemIds.has(item.id);
                const hasSellingAmount = parseAmount(item.sellingAmount) > 0;
                const specChips = getItemSpecChips(item);

                return (
                  <article
                    key={item.id}
                    className={cn(
                      "group overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 hover:shadow-md",
                      isInCart
                        ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]"
                        : "border-[var(--border)] hover:border-neutral-300",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => addItemToCart(item)}
                      className="block w-full text-left"
                    >
                      <div className="relative">
                        <PosItemImage
                          item={item}
                          alt={`${item.productName} ${item.sku}`}
                          className="aspect-[5/4] sm:aspect-[4/3]"
                          iconClassName="size-14 sm:size-16"
                          showCatalogBadge
                        />

                        <span
                          className={cn(
                            "absolute left-3 top-3 rounded-full bg-white/30 px-2 py-1 text-[10px] font-medium backdrop-blur",
                            isInCart
                              ? "text-[var(--accent)]"
                              : "text-neutral-600",
                          )}
                        >
                          {isInCart ? "Di Keranjang" : "Tersedia"}
                        </span>
                      </div>
                    </button>

                    <div className="space-y-2.5 p-2.5 sm:space-y-3 sm:p-4">
                      <div className="space-y-2">
                        <p className="line-clamp-1 text-xs font-semibold leading-5 text-neutral-950 sm:line-clamp-2 sm:min-h-10 sm:text-[15px]">
                          {item.productName}
                        </p>

                        <div className="flex gap-1.5">
                          <span className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[8px] font-semibold uppercase text-[var(--accent)] sm:px-2.5 sm:py-1 sm:text-[10px]">
                            {item.categoryName}
                          </span>

                          <span className="inline-flex max-w-full items-center rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[8px] font-medium text-neutral-600 sm:px-2.5 sm:py-1 sm:text-[10px]">
                            <span className="truncate">{item.sku}</span>
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] sm:text-[10px]">
                          Spesifikasi
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-0.5 sm:mt-2 sm:gap-1">
                          {specChips.length > 0 ? (
                            <>
                              {specChips.map((spec) => (
                                <span
                                  key={`${item.id}-${spec}`}
                                  className="inline-flex items-center rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[9px] font-medium text-neutral-700 sm:px-2.5 sm:py-1 sm:text-[10px]"
                                >
                                  {spec}
                                </span>
                              ))}
                            </>
                          ) : (
                            <span className="text-[11px] text-[var(--muted)]">
                              {getItemDetail(item)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--accent-soft)] bg-[var(--accent-soft)]/70 p-2.5 sm:items-end sm:gap-3 sm:rounded-2xl sm:p-3">
                        <div className="min-w-0">
                          <p className="hidden text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] sm:block">
                            Harga jual
                          </p>
                          <p className="truncate text-xs font-semibold text-neutral-950 sm:mt-1 sm:text-[15px]">
                            {formatCurrency(item.sellingAmount)}
                          </p>
                        </div>

                        <button
                          type="button"
                          aria-label={
                            isInCart
                              ? `${item.productName} sudah di keranjang`
                              : `Tambahkan ${item.productName}`
                          }
                          onClick={() => addItemToCart(item)}
                          disabled={isInCart || !hasSellingAmount}
                          className={cn(
                            "grid size-9 shrink-0 place-items-center rounded-xl border bg-white transition sm:size-10 sm:rounded-2xl",
                            isInCart
                              ? "cursor-not-allowed border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                              : hasSellingAmount
                                ? "border-[var(--border)] text-[var(--accent)] hover:border-[var(--accent)] hover:bg-white"
                                : "cursor-not-allowed border-neutral-200 text-neutral-300",
                          )}
                        >
                          <ShoppingBag className="size-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 grid min-h-72 place-items-center rounded-3xl border border-dashed border-[var(--border)] bg-white p-8 text-center">
              <div>
                <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Gem className="size-7" />
                </div>
                <h2 className="mt-4 font-semibold text-neutral-950">
                  Tidak ada item tersedia
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--muted)]">
                  Cek filter pencarian, kategori, atau pastikan item inventory
                  sudah berstatus tersedia di outlet aktif.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Cart desktop */}
        <aside className="hidden min-h-0 overflow-y-auto bg-white lg:block">
          {sidePanelContent}
        </aside>
      </div>

      {/* Sticky cart mobile/tablet */}
      <button
        type="button"
        onClick={() => setIsMobileCartOpen(true)}
        className="fixed bottom-[124px] left-4 right-4 z-30 flex h-16 items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 text-left shadow-[0_12px_32px_rgba(0,0,0,0.14)] lg:hidden"
      >
        <div className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <ShoppingBag className="size-5" />

          <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[var(--accent)] text-[10px] font-semibold text-white">
            {cartItems.length}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs text-[var(--muted)]">
            {cartItems.length > 0
              ? `${cartItems.length} item di keranjang`
              : "Penjualan Saat Ini"}
          </p>

          <p className="mt-0.5 truncate text-sm font-semibold text-neutral-950">
            {formatCurrency(totalAmount)}
          </p>
        </div>

        <ChevronRight className="size-5 shrink-0 text-neutral-400" />
      </button>

      {/* Cart fullscreen mobile/tablet */}
      {isMobileCartOpen ? (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-white lg:hidden">
          <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-[var(--border)] bg-white/95 px-4 backdrop-blur">
            <div>
              <p className="font-semibold text-neutral-950">
                {panelMode === "success"
                  ? "Transaksi Berhasil"
                  : panelMode === "payment"
                    ? "Pembayaran Manual"
                    : "Keranjang Penjualan"}
              </p>

              <p className="text-xs text-[var(--muted)]">
                {panelMode === "success"
                  ? "Transaksi sudah tersimpan."
                  : panelMode === "payment"
                    ? "Selesaikan payment dan simpan transaksi."
                    : "Periksa item sebelum pembayaran."}
              </p>
            </div>

            <button
              type="button"
              aria-label="Tutup keranjang"
              onClick={() => setIsMobileCartOpen(false)}
              className="grid size-10 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100"
            >
              <X className="size-5" />
            </button>
          </header>

          {sidePanelContent}
        </div>
      ) : null}

      <CameraScannerModal
        isOpen={isScannerOpen}
        isProcessing={isScanLookupPending}
        onClose={() => setIsScannerOpen(false)}
        onScan={lookupScannedItem}
      />
    </>
  );
}
