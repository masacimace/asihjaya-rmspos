import {
  AlertTriangle,
  BadgeDollarSign,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  PackageCheck,
  ReceiptText,
  ScanBarcode,
  ShoppingBag,
  Store,
  TrendingDown,
  TrendingUp,
  UsersRound,
  WalletCards,
  WifiOff,
} from "lucide-react";
import Link from "next/link";

import type {
  AdminDashboardActivityKind,
  AdminDashboardAlertTone,
  AdminDashboardPeriod,
  AdminDashboardRecentTransaction,
  AdminDashboardTrendPoint,
  DashboardComparisonMetric,
} from "@/features/admin/dashboard/contracts";
import {
  ADMIN_DASHBOARD_PERIOD_OPTIONS,
  getAdminDashboardData,
  parseAdminDashboardPeriodRange,
} from "@/features/admin/dashboard/queries";
import { requirePermission } from "@/lib/auth/session";

const quickActions = [
  {
    label: "Tambah Item",
    description: "Registrasi barang baru",
    href: "/admin/inventaris",
    icon: Boxes,
  },
  {
    label: "Penerimaan Barang",
    description: "Catat stok masuk",
    href: "/admin/inventaris",
    icon: PackageCheck,
  },
  {
    label: "Cetak Label",
    description: "Barcode dan QR produk",
    href: "/admin/inventaris",
    icon: ScanBarcode,
  },
  {
    label: "Lihat Laporan",
    description: "Penjualan dan stok",
    href: "/admin/laporan",
    icon: TrendingUp,
  },
] as const;

function buildDashboardPeriodUrl(range: string) {
  return range === "today" ? "/admin" : `/admin?range=${range}`;
}

const statusMeta: Record<
  AdminDashboardRecentTransaction["status"],
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-neutral-100 text-neutral-600",
  },
  awaiting_payment: {
    label: "Menunggu",
    className: "bg-amber-50 text-amber-700",
  },
  completed: {
    label: "Selesai",
    className: "bg-emerald-50 text-emerald-700",
  },
  cancelled: {
    label: "Dibatalkan",
    className: "bg-neutral-100 text-neutral-600",
  },
  voided: {
    label: "Void",
    className: "bg-red-50 text-red-600",
  },
  partially_refunded: {
    label: "Refund Parsial",
    className: "bg-orange-50 text-orange-700",
  },
  refunded: {
    label: "Refund",
    className: "bg-orange-50 text-orange-700",
  },
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactMoney(value: number) {
  if (value <= 0) return "0";

  if (value >= 1_000_000_000) {
    return `${new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: value >= 10_000_000_000 ? 0 : 1,
    }).format(value / 1_000_000_000)}M`;
  }

  if (value >= 1_000_000) {
    return `${new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: value >= 10_000_000 ? 0 : 1,
    }).format(value / 1_000_000)}Jt`;
  }

  if (value >= 1_000) {
    return `${new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 0,
    }).format(value / 1_000)}Rb`;
  }

  return formatInteger(value);
}

function formatDateTime(value: Date | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function getComparison(
  metric: DashboardComparisonMetric,
  comparisonLabel: string,
) {
  const delta = metric.current - metric.previous;

  if (metric.previous === 0) {
    if (metric.current === 0) {
      return {
        tone: "neutral" as const,
        value: "0%",
        label: `belum ada data ${comparisonLabel.replace("dari ", "")}`,
      };
    }

    return {
      tone: "up" as const,
      value: "Baru",
      label: comparisonLabel,
    };
  }

  const percentage = (delta / metric.previous) * 100;
  const formattedPercentage = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 1,
  }).format(Math.abs(percentage));

  if (Math.abs(percentage) < 0.1) {
    return {
      tone: "neutral" as const,
      value: "Stabil",
      label: comparisonLabel,
    };
  }

  return {
    tone: percentage > 0 ? ("up" as const) : ("down" as const),
    value: `${formattedPercentage}%`,
    label: comparisonLabel,
  };
}

function getRoundedChartMax(value: number) {
  if (value <= 0) return 5_000_000;

  const step = value >= 50_000_000 ? 10_000_000 : 5_000_000;

  return Math.ceil(value / step) * step;
}

type SalesChartInsight = {
  label: string;
  value: string;
  description: string;
};

function getSalesChartInsights({
  points,
  period,
}: {
  points: AdminDashboardTrendPoint[];
  period: AdminDashboardPeriod;
}) {
  const totalRevenue = points.reduce((total, point) => total + point.revenue, 0);
  const averageRevenue = points.length > 0 ? Math.round(totalRevenue / points.length) : 0;
  const emptyBuckets = points.filter((point) => point.revenue <= 0).length;
  const bucketLabel = period.chartGranularity === "hour" ? "jam" : "hari";
  const bestPoint = points.reduce(
    (selected, point) => (point.revenue > selected.revenue ? point : selected),
    points[0] ?? {
      dateKey: "",
      label: "-",
      revenue: 0,
      transactionCount: 0,
      itemSold: 0,
    },
  );

  const insights: SalesChartInsight[] = [
    {
      label: "Total periode",
      value: formatMoney(totalRevenue),
      description: period.label,
    },
    {
      label: period.chartGranularity === "hour" ? "Jam terbaik" : "Hari terbaik",
      value: bestPoint.revenue > 0 ? formatMoney(bestPoint.revenue) : "Belum ada",
      description: bestPoint.revenue > 0 ? bestPoint.label : "Belum ada transaksi",
    },
    {
      label: `Rata-rata per ${bucketLabel}`,
      value: formatMoney(averageRevenue),
      description: period.chartBucketLabel,
    },
    {
      label: `${bucketLabel[0]?.toUpperCase() ?? ""}${bucketLabel.slice(1)} tanpa transaksi`,
      value: formatInteger(emptyBuckets),
      description: `${points.length} ${bucketLabel} dipantau`,
    },
  ];

  return {
    totalRevenue,
    averageRevenue,
    hasRevenue: totalRevenue > 0,
    bestPoint,
    bestLabel: period.chartGranularity === "hour" ? "Jam terbaik" : "Hari terbaik",
    insights,
  };
}

function SalesChart({
  points,
  averageRevenue,
  hasRevenue,
  bestLabel,
}: {
  points: AdminDashboardTrendPoint[];
  averageRevenue: number;
  hasRevenue: boolean;
  bestLabel: string;
}) {
  const width = 760;
  const left = 50;
  const right = 750;
  const top = 35;
  const bottom = 235;
  const chartWidth = right - left;
  const maxRevenue = Math.max(
    ...points.map((point) => point.revenue),
    averageRevenue,
    0,
  );
  const maxAxisValue = getRoundedChartMax(maxRevenue);
  const chartPoints = points.map((point, index) => {
    const x =
      points.length === 1
        ? left
        : left + (chartWidth / Math.max(points.length - 1, 1)) * index;
    const y = bottom - (point.revenue / maxAxisValue) * (bottom - top);

    return { ...point, x, y };
  });
  const linePath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`)
    .join(" ");
  const areaPath = chartPoints.length
    ? `${linePath} L${chartPoints[chartPoints.length - 1]?.x ?? right} ${bottom} L${chartPoints[0]?.x ?? left} ${bottom} Z`
    : "";
  const highlightedPoint = chartPoints.reduce(
    (selected, point) => (point.revenue > selected.revenue ? point : selected),
    chartPoints[0] ?? {
      dateKey: "",
      label: "",
      revenue: 0,
      transactionCount: 0,
      itemSold: 0,
      x: left,
      y: bottom,
    },
  );
  const averageY = bottom - (averageRevenue / maxAxisValue) * (bottom - top);
  const gridValues = [
    maxAxisValue,
    maxAxisValue * 0.75,
    maxAxisValue * 0.5,
    maxAxisValue * 0.25,
    0,
  ];

  return (
    <div className="mt-5 min-w-0 overflow-hidden">
      <div className="relative h-[250px] w-full sm:h-[280px]">
        {hasRevenue ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(highlightedPoint.x / width) * 100}%`,
              top: `${Math.max(highlightedPoint.y - 58, 0)}px`,
            }}
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
              {bestLabel}
            </p>
            <p className="mt-1 text-[var(--muted)]">{highlightedPoint.label}</p>
            <p className="mt-0.5 font-semibold text-neutral-950">
              {formatMoney(highlightedPoint.revenue)}
            </p>
          </div>
        ) : null}

        {averageRevenue > 0 ? (
          <div
            className="pointer-events-none absolute right-0 z-10 -translate-y-1/2 rounded-full border border-[var(--border)] bg-white/90 px-2.5 py-1 text-[10px] font-medium text-[var(--muted)] shadow-sm"
            style={{ top: `${(averageY / 260) * 100}%` }}
          >
            Rata-rata {formatCompactMoney(averageRevenue)}
          </div>
        ) : null}

        {!hasRevenue ? (
          <div className="pointer-events-none absolute inset-x-10 top-1/2 z-10 -translate-y-1/2 rounded-2xl border border-dashed border-[var(--border)] bg-white/85 px-4 py-5 text-center shadow-sm">
            <p className="text-sm font-medium text-neutral-900">
              Belum ada penjualan pada periode ini.
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Transaksi completed akan otomatis muncul di grafik.
            </p>
          </div>
        ) : null}

        <svg
          viewBox="0 0 760 260"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label="Grafik ringkasan penjualan"
        >
          <defs>
            <linearGradient id="salesAreaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.24" />
              <stop
                offset="100%"
                stopColor="var(--accent)"
                stopOpacity="0.02"
              />
            </linearGradient>
          </defs>

          {[top, top + 50, top + 100, top + 150, bottom].map((y) => (
            <line
              key={y}
              x1={left}
              x2={right}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {averageRevenue > 0 ? (
            <line
              x1={left}
              x2={right}
              y1={averageY}
              y2={averageY}
              stroke="var(--accent)"
              strokeDasharray="5 6"
              strokeOpacity="0.45"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {areaPath ? <path d={areaPath} fill="url(#salesAreaGradient)" /> : null}

          {linePath ? (
            <path
              d={linePath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}

          {chartPoints.map((point) => {
            const isHighlighted =
              hasRevenue && point.dateKey === highlightedPoint.dateKey;

            return (
              <circle
                key={point.dateKey}
                cx={point.x}
                cy={point.y}
                r={isHighlighted ? "5.5" : "4"}
                fill={isHighlighted ? "var(--accent)" : "white"}
                stroke="var(--accent)"
                strokeWidth={isHighlighted ? "2.5" : "2"}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-y-0 left-0 flex w-10 flex-col justify-between pb-5 pt-7 text-[10px] text-[var(--muted)] sm:text-xs">
          {gridValues.map((value) => (
            <span key={value}>{formatCompactMoney(value)}</span>
          ))}
        </div>
      </div>

      <div
        className="ml-10 grid min-w-0 overflow-hidden text-center text-[10px] text-[var(--muted)] sm:text-xs"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((point, index) => {
          const labelStep = Math.max(1, Math.ceil(points.length / 7));
          const shouldShowLabel =
            index === 0 || index === points.length - 1 || index % labelStep === 0;

          return (
            <span
              key={point.dateKey}
              className={shouldShowLabel ? "truncate" : "sr-only"}
            >
              {point.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function getAlertToneClass(tone: AdminDashboardAlertTone) {
  if (tone === "success") return "bg-emerald-50 text-emerald-700";
  if (tone === "danger") return "bg-red-50 text-red-600";
  if (tone === "warning") return "bg-amber-50 text-amber-700";

  return "bg-neutral-100 text-neutral-600";
}

function getActivityIcon(kind: AdminDashboardActivityKind) {
  if (kind === "sale") return ReceiptText;
  if (kind === "customer") return UsersRound;
  if (kind === "inventory") return Boxes;
  if (kind === "product") return ShoppingBag;
  if (kind === "shift") return Store;
  if (kind === "hold_cart") return ClipboardCheck;
  if (kind === "approval") return ClipboardCheck;
  if (kind === "administration") return UsersRound;

  return ClipboardCheck;
}

function getActivityIconClass(kind: AdminDashboardActivityKind) {
  if (kind === "sale") return "bg-emerald-50 text-emerald-700";
  if (kind === "customer") return "bg-blue-50 text-blue-700";
  if (kind === "inventory" || kind === "product") return "bg-amber-50 text-amber-700";
  if (kind === "shift") return "bg-neutral-100 text-neutral-600";
  if (kind === "approval") return "bg-violet-50 text-violet-700";

  return "bg-[var(--accent-soft)] text-[var(--accent)]";
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requirePermission("admin.access");
  const resolvedSearchParams = await searchParams;
  const selectedRange = parseAdminDashboardPeriodRange(resolvedSearchParams.range);
  const dashboard = await getAdminDashboardData(auth, selectedRange);
  const firstName = auth.user.fullName.split(" ")[0] ?? auth.user.fullName;
  const statisticCards = [
    {
      label: "Penjualan Bersih",
      value: formatMoney(dashboard.summary.revenue.current),
      metric: dashboard.summary.revenue,
      icon: BadgeDollarSign,
      iconClassName: "bg-amber-50 text-amber-700",
    },
    {
      label: "Jumlah Transaksi",
      value: formatInteger(dashboard.summary.transactionCount.current),
      metric: dashboard.summary.transactionCount,
      icon: ReceiptText,
      iconClassName: "bg-violet-50 text-violet-700",
    },
    {
      label: "Item Terjual",
      value: formatInteger(dashboard.summary.itemSold.current),
      metric: dashboard.summary.itemSold,
      icon: ShoppingBag,
      iconClassName: "bg-blue-50 text-blue-700",
    },
    {
      label: "Rata-rata Transaksi",
      value: formatMoney(dashboard.summary.averageTransaction.current),
      metric: dashboard.summary.averageTransaction,
      icon: WalletCards,
      iconClassName: "bg-emerald-50 text-emerald-700",
    },
  ];
  const operationalStatusCards = [
    {
      label: "Stok Tersedia",
      value: formatInteger(dashboard.summary.availableStock),
      description: "Item aktif siap jual",
      icon: Boxes,
      iconClassName: "bg-blue-50 text-blue-700",
    },
    {
      label: "Transaksi Tertahan",
      value: formatInteger(dashboard.summary.activeHeldCarts),
      description: "Hold cart aktif",
      icon: ClipboardCheck,
      iconClassName: "bg-amber-50 text-amber-700",
    },
    {
      label: "Shift Aktif",
      value: formatInteger(dashboard.summary.activeShifts),
      description: "Shift kasir berjalan",
      icon: Store,
      iconClassName: "bg-neutral-100 text-neutral-700",
    },
    {
      label: "Print Job Gagal",
      value: formatInteger(dashboard.summary.failedHardwareJobsToday),
      description: "Pada periode ini",
      icon: WifiOff,
      iconClassName:
        dashboard.summary.failedHardwareJobsToday > 0
          ? "bg-red-50 text-red-600"
          : "bg-emerald-50 text-emerald-700",
    },
  ];
  const salesChartInsights = getSalesChartInsights({
    points: dashboard.trend,
    period: dashboard.period,
  });
  const revenueComparison = getComparison(
    dashboard.summary.revenue,
    dashboard.period.comparisonLabel,
  );
  const RevenueComparisonIcon =
    revenueComparison.tone === "down"
      ? TrendingDown
      : revenueComparison.tone === "neutral"
        ? CheckCircle2
        : TrendingUp;
  const revenueComparisonClassName =
    revenueComparison.tone === "down"
      ? "bg-red-50 text-red-600"
      : revenueComparison.tone === "neutral"
        ? "bg-neutral-100 text-neutral-600"
        : "bg-emerald-50 text-emerald-700";

  return (
    <div className="min-w-0 max-w-full overflow-x-hidden space-y-5 lg:space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-950 sm:text-[28px]">
            Selamat datang kembali, {firstName} 👋
          </h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
            {dashboard.period.description}
          </p>
        </div>

        <details className="group relative z-30 w-fit max-w-full shrink-0">
          <summary className="flex h-11 max-w-full cursor-pointer list-none items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-medium text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:bg-neutral-50 marker:content-none [&::-webkit-details-marker]:hidden">
            <CalendarDays className="size-4" />
            <span className="truncate">{dashboard.period.label}</span>
            <ChevronDown className="size-4 text-neutral-400 transition-transform group-open:rotate-180" />
          </summary>

          <div className="absolute left-0 z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-1.5 shadow-xl sm:left-auto sm:right-0">
            {ADMIN_DASHBOARD_PERIOD_OPTIONS.map((option) => {
              const isActive = option.value === dashboard.period.range;

              return (
                <Link
                  key={option.value}
                  href={buildDashboardPeriodUrl(option.value)}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive
                      ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                      : "text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  <span>{option.label}</span>
                  {isActive ? <CheckCircle2 className="size-4" /> : null}
                </Link>
              );
            })}
          </div>
        </details>
      </section>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {statisticCards.map(
              ({ label, value, metric, icon: Icon, iconClassName }) => {
                const comparison = getComparison(
                  metric,
                  dashboard.period.comparisonLabel,
                );
                const TrendIcon =
                  comparison.tone === "down"
                    ? TrendingDown
                    : comparison.tone === "neutral"
                      ? CheckCircle2
                      : TrendingUp;
                const toneClassName =
                  comparison.tone === "down"
                    ? "text-red-600"
                    : comparison.tone === "neutral"
                      ? "text-neutral-500"
                      : "text-[var(--success)]";

                return (
                  <article
                    key={label}
                    className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-5"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`grid size-11 shrink-0 place-items-center rounded-full ${iconClassName}`}
                      >
                        <Icon className="size-5" />
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs text-[var(--muted)] sm:text-sm">
                          {label}
                        </p>
                        <p className="mt-1 truncate text-xl font-semibold tracking-tight text-neutral-950">
                          {value}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-1.5 text-xs">
                      <TrendIcon className={`size-3.5 ${toneClassName}`} />
                      <span className={`font-medium ${toneClassName}`}>
                        {comparison.value}
                      </span>
                      <span className="truncate text-[var(--muted)]">
                        {comparison.label}
                      </span>
                    </div>
                  </article>
                );
              },
            )}
          </section>

          <section className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {operationalStatusCards.map(
              ({ label, value, description, icon: Icon, iconClassName }) => (
                <article
                  key={label}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                >
                  <div
                    className={`grid size-10 shrink-0 place-items-center rounded-xl ${iconClassName}`}
                  >
                    <Icon className="size-5" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs text-[var(--muted)]">{label}</p>
                    <p className="mt-0.5 text-lg font-semibold text-neutral-950">
                      {value}
                    </p>
                    <p className="truncate text-[11px] text-[var(--muted)]">
                      {description}
                    </p>
                  </div>
                </article>
              ),
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-neutral-950">
                  Ringkasan Penjualan
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  {dashboard.period.chartDescription}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium ${revenueComparisonClassName}`}
                >
                  <RevenueComparisonIcon className="size-3.5" />
                  {revenueComparison.value} {revenueComparison.label}
                </span>

                <span className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] px-3 text-xs font-medium text-neutral-600">
                  {dashboard.period.chartBucketLabel}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {salesChartInsights.insights.map((insight) => (
                <div
                  key={insight.label}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)]/70 p-3"
                >
                  <p className="text-[11px] text-[var(--muted)]">
                    {insight.label}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-neutral-950">
                    {insight.value}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
                    {insight.description}
                  </p>
                </div>
              ))}
            </div>

            <SalesChart
              points={dashboard.trend}
              averageRevenue={salesChartInsights.averageRevenue}
              hasRevenue={salesChartInsights.hasRevenue}
              bestLabel={salesChartInsights.bestLabel}
            />
          </section>

          <section className="grid min-w-0 gap-5 2xl:grid-cols-[0.9fr_1.25fr]">
            <article className="min-w-0 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)] sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-neutral-950">
                    Produk Terlaris
                  </h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {dashboard.period.topProductsDescription}
                  </p>
                </div>

                <Link
                  href="/admin/laporan"
                  className="text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  Lihat semua
                </Link>
              </div>

              {dashboard.topProducts.length > 0 ? (
                <div className="scrollbar-clean mt-5 max-h-[560px] space-y-3 overflow-y-auto overscroll-contain pr-1">
                  {dashboard.topProducts.map((product) => (
                    <details
                      key={product.productId}
                      open={product.rank === 1}
                      className="group min-w-0 rounded-2xl border border-[var(--border)] bg-white/70"
                    >
                      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-3 p-3 marker:content-none [&::-webkit-details-marker]:hidden">
                        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent)]">
                          {product.rank}
                        </div>

                        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--accent)]">
                          <ShoppingBag className="size-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900">
                            {product.productName}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--muted)]">
                            {formatInteger(product.itemSold)} item terjual dari
                            katalog ini
                          </p>
                        </div>

                        <div className="hidden shrink-0 text-right sm:block">
                          <p className="text-xs font-medium text-neutral-700">
                            {formatMoney(product.revenue)}
                          </p>
                          <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                            total omzet
                          </p>
                        </div>

                        <ChevronRight className="size-4 shrink-0 text-neutral-300 transition-transform group-open:rotate-90 group-hover:text-[var(--accent)]" />
                      </summary>

                      <div className="border-t border-[var(--border)] bg-[var(--surface-muted)]/60 px-3 py-3">
                        <div className="mb-3 flex items-center justify-between gap-3 text-[11px] text-[var(--muted)]">
                          <span>Item fisik yang terjual</span>
                          <Link
                            href={`/admin/produk/${product.productId}`}
                            className="shrink-0 font-medium text-[var(--accent)] hover:underline"
                          >
                            Detail produk
                          </Link>
                        </div>

                        {product.items.length > 0 ? (
                          <div className="scrollbar-clean max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-1">
                            {product.items.map((item) => (
                              <div
                                key={item.itemId}
                                className="flex min-w-0 items-start gap-3 rounded-xl bg-white p-3"
                              >
                                <div className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                                  <ScanBarcode className="size-4" />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-xs font-medium text-neutral-900">
                                    {item.itemName}
                                  </p>
                                  <p className="mt-1 truncate text-[11px] text-[var(--muted)]">
                                    SKU {item.sku} · Barcode {item.barcode}
                                  </p>
                                  <p className="mt-1 text-[11px] text-[var(--muted)] sm:hidden">
                                    {formatMoney(item.revenue)}
                                  </p>
                                </div>

                                <div className="hidden shrink-0 text-right sm:block">
                                  <p className="text-xs font-semibold text-neutral-900">
                                    {formatMoney(item.revenue)}
                                  </p>
                                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                                    {formatInteger(item.itemSold)}x terjual
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-4 text-center text-xs text-[var(--muted)]">
                            Detail item terjual belum tersedia untuk produk ini.
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-5 text-center text-xs text-[var(--muted)]">
                  Belum ada penjualan produk dalam 30 hari terakhir.
                </div>
              )}
            </article>

            <article className="min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
                <div>
                  <h2 className="font-semibold text-neutral-950">
                    Transaksi Terbaru
                  </h2>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Transaksi outlet terbaru pada periode ini.
                  </p>
                </div>

                <Link
                  href="/admin/penjualan"
                  className="text-xs font-medium text-[var(--accent)] hover:underline"
                >
                  Lihat semua
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left">
                  <thead>
                    <tr className="border-y border-[var(--border)] bg-[var(--surface-muted)] text-xs text-[var(--muted)]">
                      <th className="px-5 py-3 font-medium">Invoice</th>
                      <th className="px-4 py-3 font-medium">Pelanggan</th>
                      <th className="px-4 py-3 font-medium">Total</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dashboard.recentTransactions.length > 0 ? (
                      dashboard.recentTransactions.map((transaction) => {
                        const meta = statusMeta[transaction.status];

                        return (
                          <tr
                            key={transaction.id}
                            className="border-b border-[var(--border)] last:border-b-0"
                          >
                            <td className="px-5 py-3.5 text-xs font-medium text-neutral-900">
                              <Link
                                href={`/admin/penjualan/${transaction.id}`}
                                className="hover:text-[var(--accent)] hover:underline"
                              >
                                {transaction.invoiceNumber}
                              </Link>
                              <p className="mt-1 text-[10px] font-normal text-[var(--muted)]">
                                {formatDateTime(
                                  transaction.completedAt ?? transaction.createdAt,
                                )}
                              </p>
                            </td>
                            <td className="px-4 py-3.5 text-xs text-neutral-700">
                              {transaction.customerName ?? "Umum"}
                            </td>
                            <td className="px-4 py-3.5 text-xs font-medium text-neutral-900">
                              {formatMoney(transaction.totalAmount)}
                            </td>
                            <td className="px-5 py-3.5">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.className}`}
                              >
                                {meta.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-8 text-center text-xs text-[var(--muted)]"
                        >
                          Belum ada transaksi yang tercatat.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        </div>

        <aside className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <h2 className="font-semibold text-neutral-950">Aksi Cepat</h2>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {quickActions.map(({ label, description, href, icon: Icon }) => (
                <Link
                  key={label}
                  href={href}
                  className="group flex min-h-28 flex-col items-center justify-center rounded-xl border border-[var(--border)] p-3 text-center transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
                >
                  <Icon className="size-5 text-[var(--accent)] transition-transform group-hover:scale-105" />

                  <p className="mt-2 text-xs font-semibold text-neutral-900">
                    {label}
                  </p>

                  <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-[var(--muted)]">
                    {description}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-neutral-950">
                Perlu Perhatian
              </h2>

              <Link
                href="/admin/operasional"
                className="text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Lihat semua
              </Link>
            </div>

            <div className="mt-4 divide-y divide-[var(--border)]">
              {dashboard.operationalAlerts.map((alert) => {
                const AlertIcon =
                  alert.tone === "success"
                    ? CheckCircle2
                    : alert.tone === "neutral"
                      ? Store
                      : AlertTriangle;

                return (
                  <Link
                    key={alert.id}
                    href={alert.href}
                    className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div
                      className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${getAlertToneClass(alert.tone)}`}
                    >
                      <AlertIcon className="size-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-5 text-neutral-900">
                        {alert.title}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-[var(--muted)]">
                        {alert.description}
                      </p>
                    </div>

                    <ChevronRight className="mt-2 size-4 shrink-0 text-neutral-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-neutral-950">
                Aktivitas Terbaru
              </h2>
            </div>

            {dashboard.recentActivities.length > 0 ? (
              <div className="mt-4 space-y-4">
                {dashboard.recentActivities.map((activity) => {
                  const Icon = getActivityIcon(activity.kind);

                  return (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div
                        className={`grid size-9 shrink-0 place-items-center rounded-xl ${getActivityIconClass(activity.kind)}`}
                      >
                        <Icon className="size-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium leading-5 text-neutral-900">
                          {activity.title}
                        </p>
                        <p className="truncate text-[11px] text-[var(--muted)]">
                          {activity.description}
                        </p>
                      </div>

                      {activity.value ? (
                        <p className="shrink-0 text-[11px] font-semibold text-[var(--success)]">
                          {formatMoney(activity.value)}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] p-4 text-center text-xs text-[var(--muted)]">
                Belum ada aktivitas terbaru.
              </div>
            )}

            <Link
              href="/admin/administrasi"
              className="mt-5 flex items-center justify-center gap-2 border-t border-[var(--border)] pt-4 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              Lihat seluruh aktivitas
              <ChevronRight className="size-3.5" />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
