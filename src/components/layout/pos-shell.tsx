"use client";

import {
  Bell,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  MoreHorizontal,
  Pause,
  Printer,
  ReceiptText,
  ScanBarcode,
  Search,
  ShoppingBag,
  Store,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { UserMenu } from "@/components/auth/user-menu";
import { CameraScannerModal } from "@/components/scanner/camera-scanner-modal";

import { cn } from "@/lib/utils";

type PosShellUser = {
  fullName: string;
  roleLabel: string;
  canAccessAdmin: boolean;
  outletName: string;
};

type PosShellStatus = {
  outletName: string;
  registerName: string | null;
  shift: {
    status: "open" | "closed" | "not_configured";
    openedAt: string | Date | null;
    openingCash: string | null;
    expectedCash: string | null;
    label: string;
  };
  hardware: {
    status: "online" | "stale" | "offline" | "disabled" | "not_configured";
    label: string;
    agentName: string | null;
    lastSeenAt: string | Date | null;
    hasConfigWarnings: boolean;
  };
  notifications?: PosShellNotification[];
};

type PosShellNotification = {
  id: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  tone: "info" | "warning" | "danger";
  icon: "held_cart" | "print" | "shift" | "hardware";
};

type PosWorkspaceCommand = {
  type: "search" | "scan";
  value: string;
};

const POS_WORKSPACE_COMMAND_EVENT = "asihjaya:pos-workspace-command";
const POS_PENDING_COMMAND_STORAGE_KEY =
  "asihjaya:pos-workspace-pending-command";

const fallbackStatus: PosShellStatus = {
  outletName: "Outlet belum dipilih",
  registerName: null,
  shift: {
    status: "not_configured",
    openedAt: null,
    openingCash: null,
    expectedCash: null,
    label: "Shift belum dicek",
  },
  hardware: {
    status: "not_configured",
    label: "Hardware Hub belum dicek",
    agentName: null,
    lastSeenAt: null,
    hasConfigWarnings: false,
  },
  notifications: [],
};

const navigation = [
  { label: "Kasir", href: "/pos", icon: ShoppingBag },
  {
    label: "Transaksi",
    href: "/pos/transaksi",
    icon: ReceiptText,
    children: [
      { label: "Daftar Transaksi", href: "/pos/transaksi", icon: ReceiptText },
      { label: "Transaksi Ditahan", href: "/pos/ditahan", icon: Pause },
    ],
  },
  { label: "Pelanggan", href: "/pos/pelanggan", icon: UsersRound },
  { label: "Shift Kasir", href: "/pos/shift", icon: Clock3 },
] as const;

const mobilePrimaryNavigation = [
  { label: "Kasir", href: "/pos", icon: ShoppingBag },
  { label: "Transaksi", href: "/pos/transaksi", icon: ReceiptText },
  { label: "Pelanggan", href: "/pos/pelanggan", icon: UsersRound },
] as const;

const mobileMoreNavigation = [
  { label: "Transaksi Tertahan", href: "/pos/ditahan", icon: Pause },
  { label: "Shift Kasir", href: "/pos/shift", icon: Clock3 },
] as const;

type SidebarContentProps = {
  pathname: string;
  canAccessAdmin: boolean;
  onNavigate?: () => void;
};

function isNavigationActive(pathname: string, href: string) {
  return href === "/pos" ? pathname === href : pathname.startsWith(href);
}

function isTransactionNavigationActive(pathname: string) {
  return (
    isNavigationActive(pathname, "/pos/transaksi") ||
    isNavigationActive(pathname, "/pos/ditahan")
  );
}

function formatStatusTime(value: string | Date | null) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getShiftStatusLabel(status: PosShellStatus["shift"]) {
  if (status.status !== "open") {
    return status.label;
  }

  const openedAt = formatStatusTime(status.openedAt);

  return openedAt ? `Shift aktif sejak ${openedAt}` : status.label;
}

function getShiftStatusClassName(status: PosShellStatus["shift"]["status"]) {
  if (status === "open") {
    return "text-[var(--success)]";
  }

  if (status === "closed") {
    return "text-amber-700";
  }

  return "text-red-600";
}

function getHardwareStatusClassName(
  status: PosShellStatus["hardware"]["status"],
) {
  if (status === "online") {
    return "text-[var(--success)]";
  }

  if (status === "stale") {
    return "text-amber-700";
  }

  return "text-red-600";
}
function getNotificationToneClassName(tone: PosShellNotification["tone"]) {
  if (tone === "danger") {
    return "border-red-100 bg-red-50 text-red-700";
  }

  if (tone === "warning") {
    return "border-amber-100 bg-amber-50 text-amber-700";
  }

  return "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)]";
}

function NotificationIcon({
  notification,
}: {
  notification: PosShellNotification;
}) {
  const iconClassName = "size-4";

  if (notification.icon === "held_cart") {
    return <Pause className={iconClassName} />;
  }

  if (notification.icon === "print" || notification.icon === "hardware") {
    return <Printer className={iconClassName} />;
  }

  return <Clock3 className={iconClassName} />;
}

function SidebarContent({
  pathname,
  canAccessAdmin,
  onNavigate,
}: SidebarContentProps) {
  const [openNavigationGroups, setOpenNavigationGroups] = useState<
    Record<string, boolean>
  >({ "/pos/transaksi": true });

  function toggleNavigationGroup(href: string) {
    setOpenNavigationGroups((currentGroups) => ({
      ...currentGroups,
      [href]: !currentGroups[href],
    }));
  }

  return (
    <>
      <Link
        href="/pos"
        onClick={onNavigate}
        className="mb-6 flex items-center gap-2 rounded-2xl px-2 py-1.5 transition hover:bg-neutral-50"
      >
        <span className="grid shrink-0 place-items-center">
          <Image
            src="/logo/asihjaya-brand-icon.png"
            alt="Asihjaya"
            width={128}
            height={128}
            className="h-15 w-auto object-contain"
            priority
          />
        </span>

        <span className="min-w-0">
          <Image
            src="/logo/asihjaya-brand-text.png"
            alt="Asihjaya"
            width={140}
            height={28}
            className="h-8 w-auto object-contain"
            priority
          />
          <span className="mt-0.5 block truncate text-xs font-medium text-[var(--muted)]">
            Retail Sales Applications
          </span>
        </span>
      </Link>
      <nav className="space-y-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          const hasChildren = "children" in item;
          const active = hasChildren
            ? isTransactionNavigationActive(pathname)
            : isNavigationActive(pathname, item.href);
          const expanded = hasChildren
            ? Boolean(openNavigationGroups[item.href])
            : false;

          return (
            <div key={item.href}>
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleNavigationGroup(item.href)}
                  aria-expanded={expanded}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left !text-sm !font-medium transition-colors",
                    active
                      ? "bg-[var(--accent-soft)] text-neutral-950"
                      : "text-black hover:bg-neutral-100 hover:text-neutral-950",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      active && "text-[var(--accent)]",
                    )}
                  />

                  <span className="min-w-0 flex-1">{item.label}</span>

                  <ChevronRight
                    className={cn(
                      "size-4 shrink-0 text-neutral-400 transition-transform",
                      expanded && "rotate-90",
                      active && "text-[var(--accent)]",
                    )}
                  />
                </button>
              ) : (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-[var(--accent-soft)] text-neutral-950"
                      : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      active && "text-[var(--accent)]",
                    )}
                  />

                  <span className="min-w-0 flex-1">{item.label}</span>
                </Link>
              )}

              {hasChildren && expanded ? (
                <div className="ml-[22px] mt-1 space-y-1 border-l border-[var(--border)] pl-3">
                  {item.children.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive = isNavigationActive(
                      pathname,
                      child.href,
                    );

                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        aria-current={childActive ? "page" : undefined}
                        className={cn(
                          "flex min-h-9 items-center gap-2.5 rounded-lg px-3 text-xs font-semibold transition-colors",
                          childActive
                            ? "bg-white text-[var(--accent)] shadow-sm ring-1 ring-[var(--border)]"
                            : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900",
                        )}
                      >
                        <ChildIcon className="size-4 shrink-0" />
                        <span>{child.label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      {canAccessAdmin ? (
        <div className="mt-auto pt-6">
          <Link
            href="/admin"
            onClick={onNavigate}
            className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-3 transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
          >
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] transition-transform group-hover:scale-105">
              <LayoutDashboard className="size-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-950">
                Dashboard Admin
              </p>
              <p className="truncate text-xs text-[var(--muted)]">
                Kelola operasional
              </p>
            </div>

            <ChevronRight className="size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
          </Link>
        </div>
      ) : null}
    </>
  );
}

export function PosShell({
  children,
  user,
  status,
}: {
  children: ReactNode;
  user: PosShellUser;
  status?: PosShellStatus;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const operationalStatus = status ?? fallbackStatus;
  const shiftLabel = getShiftStatusLabel(operationalStatus.shift);
  const notifications = operationalStatus.notifications ?? [];
  const notificationCount = notifications.length;

  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [topbarQuery, setTopbarQuery] = useState("");

  function sendPosWorkspaceCommand(command: PosWorkspaceCommand) {
    const normalizedValue = command.value.trim();

    if (!normalizedValue && command.type === "scan") {
      return;
    }

    const nextCommand = { ...command, value: normalizedValue };

    if (typeof window !== "undefined" && pathname === "/pos") {
      window.dispatchEvent(
        new CustomEvent(POS_WORKSPACE_COMMAND_EVENT, {
          detail: nextCommand,
        }),
      );
      return;
    }

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        POS_PENDING_COMMAND_STORAGE_KEY,
        JSON.stringify(nextCommand),
      );
    }

    router.push("/pos");
  }

  function handleTopbarSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendPosWorkspaceCommand({ type: "search", value: topbarQuery });
  }

  return (
    <div className="min-h-screen bg-[var(--background)] lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-[var(--border)] bg-white p-5 lg:flex">
        <SidebarContent
          pathname={pathname}
          canAccessAdmin={user.canAccessAdmin}
        />
      </aside>

      {/* Navigation drawer tablet/mobile */}
      {isNavigationOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup navigasi"
            className="absolute inset-0 backdrop-blur-[1px]"
            onClick={() => setIsNavigationOpen(false)}
          />

          <aside className="relative z-10 flex h-full w-[min(86vw,300px)] flex-col border-r border-[var(--border)] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                aria-label="Tutup menu"
                onClick={() => setIsNavigationOpen(false)}
                className="grid size-10 place-items-center rounded-xl text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950"
              >
                <X className="size-5" />
              </button>
            </div>

            <SidebarContent
              pathname={pathname}
              canAccessAdmin={user.canAccessAdmin}
              onNavigate={() => setIsNavigationOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      {/* Menu lainnya mobile */}
      {isMoreOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu lainnya"
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setIsMoreOpen(false)}
          />

          <section className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-neutral-200" />

            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-neutral-950">Menu Lainnya</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Akses fungsi pendukung POS.
                </p>
              </div>

              <button
                type="button"
                aria-label="Tutup"
                onClick={() => setIsMoreOpen(false)}
                className="grid size-10 place-items-center rounded-xl text-neutral-500 hover:bg-neutral-100"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {mobileMoreNavigation.map(({ label, href, icon: Icon }) => {
                const active = isNavigationActive(pathname, href);

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setIsMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border p-4 transition",
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] text-neutral-700 hover:bg-neutral-50",
                    )}
                  >
                    <Icon className="size-5 shrink-0" />
                    <span className="text-sm font-medium">{label}</span>
                  </Link>
                );
              })}

              <button
                type="button"
                className="flex items-center gap-3 rounded-2xl border border-[var(--border)] p-4 text-left"
              >
                <Printer className="size-5 text-[var(--accent)]" />
                <span className="text-sm font-medium">
                  Pemeriksaan Perangkat
                </span>
              </button>

              {user.canAccessAdmin ? (
                <Link
                  href="/admin"
                  onClick={() => setIsMoreOpen(false)}
                  className="flex items-center gap-3 rounded-2xl border border-[var(--border)] p-4"
                >
                  <LayoutDashboard className="size-5 text-[var(--accent)]" />
                  <span className="text-sm font-medium">
                    Kembali ke Dashboard Admin
                  </span>
                </Link>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-[72px] items-center gap-3 border-b border-[var(--border)] bg-white/95 px-4 backdrop-blur sm:px-5 lg:px-6">
          <Link
            href="/pos"
            className="flex min-w-0 items-center gap-2 lg:hidden"
          >
            <span className="grid size-14 shrink-0 place-items-center">
              <Image
                src="/logo/asihjaya-brand-icon.png"
                alt="Asihjaya"
                width={64}
                height={64}
                className="h-11 w-auto object-contain"
                priority
              />
            </span>

            <span className="min-w-0">
              <Image
                src="/logo/asihjaya-brand-text.png"
                alt="Asihjaya"
                width={112}
                height={24}
                className="h-6 w-auto object-contain"
                priority
              />
              <span className="block truncate text-[12px] font-medium text-[var(--muted)]">
                Sales Retail Applications
              </span>
            </span>
          </Link>

          <form
            onSubmit={handleTopbarSearchSubmit}
            className="hidden h-11 w-full max-w-[560px] items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 text-sm md:flex"
          >
            <Search className="size-4 shrink-0 text-neutral-400" />

            <input
              type="search"
              value={topbarQuery}
              onChange={(event) => setTopbarQuery(event.target.value)}
              placeholder="Cari SKU, barcode, nama, dan serial..."
              className="min-w-0 flex-1 bg-transparent text-neutral-950 outline-none placeholder:text-neutral-400"
            />

            <kbd className="hidden rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-[var(--muted)] xl:inline-flex">
              Enter
            </kbd>
          </form>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="hidden h-10 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 sm:flex"
            >
              <ScanBarcode className="size-4" />
              <span className="hidden xl:inline">Scan Barcode</span>
            </button>

            <div className="relative">
              <button
                type="button"
                aria-label="Notifikasi POS"
                aria-expanded={isNotificationsOpen}
                onClick={() => setIsNotificationsOpen((isOpen) => !isOpen)}
                className="relative grid size-10 place-items-center rounded-xl text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950"
              >
                <Bell className="size-5" />

                {notificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full border-2 border-white bg-[var(--accent)] px-1 text-[10px] font-bold leading-4 text-white">
                    {notificationCount > 9 ? "9+" : notificationCount}
                  </span>
                ) : null}
              </button>

              {isNotificationsOpen ? (
                <div className="absolute right-[-50px] top-full z-50 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
                  <div className="border-b border-[var(--border)] px-4 py-3">
                    <p className="text-sm font-semibold text-neutral-950">
                      Notifikasi POS
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Ringkasan operasional kasir yang perlu dicek.
                    </p>
                  </div>

                  {notificationCount > 0 ? (
                    <div className="max-h-[420px] overflow-y-auto p-2">
                      {notifications.map((notification) => (
                        <Link
                          key={notification.id}
                          href={notification.href}
                          onClick={() => setIsNotificationsOpen(false)}
                          className="group flex gap-3 rounded-2xl p-3 transition hover:bg-neutral-50"
                        >
                          <span
                            className={cn(
                              "grid size-10 shrink-0 place-items-center rounded-xl border",
                              getNotificationToneClassName(notification.tone),
                            )}
                          >
                            <NotificationIcon notification={notification} />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold text-neutral-950">
                              {notification.title}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">
                              {notification.description}
                            </span>
                            <span className="mt-2 inline-flex text-xs font-semibold text-[var(--accent)] transition group-hover:translate-x-0.5">
                              {notification.actionLabel} →
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-center">
                      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                        <Bell className="size-5" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-neutral-950">
                        Tidak ada notifikasi
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                        Semua operasional POS dalam kondisi aman.
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <UserMenu
              fullName={user.fullName}
              roleLabel={user.roleLabel}
              currentArea="pos"
              canAccessAdmin={user.canAccessAdmin}
            />
          </div>
        </header>

        <main className="min-h-0 flex-1 pb-[112px] lg:pb-0">{children}</main>

        {/* Status bar desktop */}
        <footer className="hidden h-12 shrink-0 items-center justify-between border-t border-[var(--border)] bg-white px-5 text-xs text-[var(--muted)] lg:flex lg:px-6">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 text-[var(--success)]">
              <span className="size-2 rounded-full bg-current shadow-[0_0_0_4px_rgba(31,138,85,0.12)]" />
              Online
            </span>

            <span className="flex items-center gap-2">
              <Store className="size-4" />
              {user.outletName}
            </span>

            <span
              className={cn(
                "flex items-center gap-2",
                getShiftStatusClassName(operationalStatus.shift.status),
              )}
            >
              <Clock3 className="size-4" />
              {shiftLabel}
            </span>
          </div>

          <span
            className={cn(
              "flex items-center gap-2",
              getHardwareStatusClassName(operationalStatus.hardware.status),
            )}
          >
            <Printer className="size-4" />
            {operationalStatus.hardware.label}
          </span>
        </footer>
      </div>

      {/* Status dan navigation mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-white lg:hidden">
        <div className="flex h-9 items-center justify-between border-b border-[var(--border)] px-4 text-[11px] text-[var(--muted)]">
          <span className="flex items-center gap-2 text-[var(--success)]">
            <Wifi className="size-3.5" />
            Online
          </span>

          <span className="truncate">
            {operationalStatus.outletName || user.outletName} · {shiftLabel}
          </span>
        </div>

        <nav className="grid h-[72px] grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {mobilePrimaryNavigation.map(({ label, href, icon: Icon }) => {
            const active =
              href === "/pos/transaksi"
                ? isTransactionNavigationActive(pathname)
                : isNavigationActive(pathname, href);

            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-[var(--accent)]" : "text-neutral-500",
                )}
              >
                <Icon className="size-5" />
                <span>{label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-neutral-500"
          >
            <MoreHorizontal className="size-5" />
            <span>Lainnya</span>
          </button>
        </nav>
      </div>

      <CameraScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(result) => {
          setIsScannerOpen(false);
          sendPosWorkspaceCommand({ type: "scan", value: result });
        }}
      />
    </div>
  );
}
