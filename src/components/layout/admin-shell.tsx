"use client";

import {
  Bell,
  Boxes,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Gem,
  LayoutDashboard,
  Menu,
  ReceiptText,
  ScanBarcode,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { UserMenu } from "@/components/auth/user-menu";
import { CameraScannerModal } from "@/components/scanner/camera-scanner-modal";
import { ApprovalDrawer } from "@/components/layout/approval-drawer";
import { cn } from "@/lib/utils";

type AdminShellUser = {
  fullName: string;
  roleLabel: string;
  canAccessPos: boolean;
  canAccessAdministration: boolean;
  canAccessProducts: boolean;
  canAccessInventory: boolean;
};

type NavigationItem = {
  label: string;
  href?: string;
  icon: typeof Store;
  access?: "administration" | "products" | "inventory";
  children?: { label: string; href: string }[];
};

const navigation: NavigationItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Penjualan",
    href: "/admin/penjualan",
    icon: ReceiptText,
  },
  {
    label: "Produk",
    href: "/admin/produk",
    icon: Gem,
    access: "products",
  },
  {
    label: "Inventaris",
    href: "/admin/inventaris",
    icon: Boxes,
    access: "inventory",
  },
  {
    label: "Pelanggan",
    href: "/admin/pelanggan",
    icon: UsersRound,
  },
  {
    label: "Operasional",
    icon: Store,
    children: [
      { label: "Shift Kasir", href: "/admin/operasional/shift" },
      { label: "Laporan Outlet", href: "/admin/laporan" },
      { label: "Riwayat Approval", href: "/admin/operasional/approval" },
      { label: "Pergerakan Kas", href: "/admin/operasional/kas" },
      { label: "Hardware Hub", href: "/admin/operasional/hardware" },
    ],
  },
  {
    label: "Administrasi",
    href: "/admin/administrasi",
    icon: ShieldCheck,
    access: "administration",
  },
  {
    label: "Pengaturan",
    href: "/admin/pengaturan",
    icon: Settings,
  },
] as const;

type SidebarContentProps = {
  pathname: string;
  canAccessPos: boolean;
  canAccessAdministration: boolean;
  canAccessProducts: boolean;
  canAccessInventory: boolean;
  onNavigate?: () => void;
};

function isNavigationActive(pathname: string, href: string) {
  return href === "/admin"
    ? pathname === "/admin"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  pathname,
  canAccessPos,
  canAccessAdministration,
  canAccessProducts,
  canAccessInventory,
  onNavigate,
}: SidebarContentProps) {
  const visibleNavigation = navigation.filter((item) => {
    if (item.access === "administration") {
      return canAccessAdministration;
    }

    if (item.access === "products") {
      return canAccessProducts;
    }

    if (item.access === "inventory") {
      return canAccessInventory;
    }

    return true;
  });
  return (
    <>
      <Link
        href="/admin"
        onClick={onNavigate}
        className="mb-8 flex items-center gap-3 px-2"
      >
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <Store className="size-5" />
        </div>

        <div className="min-w-0 max-w-full overflow-x-hidden">
          <p className="font-semibold tracking-wide text-neutral-950">
            ASIHJAYA
          </p>

          <p className="truncate text-xs text-[var(--muted)]">
            Retail Management
          </p>
        </div>
      </Link>

      <nav className="space-y-1">
        {visibleNavigation.map(({ label, href, icon: Icon, children }) => {
          if (children) {
            const isChildActive = children.some((child) =>
              isNavigationActive(pathname, child.href),
            );
            return (
              <details key={label} open={isChildActive} className="group">
                <summary className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950 marker:content-none [&::-webkit-details-marker]:hidden">
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      isChildActive && "text-[var(--accent)]",
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      isChildActive && "text-neutral-950",
                    )}
                  >
                    {label}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-1 flex flex-col gap-1 pl-10 pr-3">
                  {children.map((child) => {
                    const isSubActive = isNavigationActive(
                      pathname,
                      child.href,
                    );
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onNavigate}
                        className={cn(
                          "block rounded-lg px-3 py-2 text-sm transition-colors",
                          isSubActive
                            ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                            : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900",
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          }

          const isActive = isNavigationActive(pathname, href!);

          return (
            <Link
              key={href}
              href={href!}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--accent-soft)] text-neutral-950"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950",
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] shrink-0",
                  isActive && "text-[var(--accent)]",
                )}
              />

              <span className="min-w-0 flex-1">{label}</span>
            </Link>
          );
        })}
      </nav>

      {canAccessPos ? (
        <div className="mt-auto pt-6">
          <Link
            href="/pos"
            onClick={onNavigate}
            className="group flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-3 transition-all hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
          >
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] transition-transform group-hover:scale-105">
              <ShoppingBag className="size-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-neutral-950">
                Buka System POS
              </p>

              <p className="truncate text-xs text-[var(--muted)]">
                kasir & transaksi
              </p>
            </div>

            <ChevronRight className="size-4 shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
          </Link>
        </div>
      ) : null}
    </>
  );
}

export function AdminShell({
  children,
  user,
}: {
  children: ReactNode;
  user: AdminShellUser;
}) {
  const pathname = usePathname();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);

  return (
    <div className="grid h-dvh w-full max-w-[100vw] overflow-hidden bg-[var(--background)] lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Sidebar desktop */}
      <aside className="hidden h-dvh min-h-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-white p-5 lg:flex">
        <SidebarContent
          pathname={pathname}
          canAccessPos={user.canAccessPos}
          canAccessAdministration={user.canAccessAdministration}
          canAccessProducts={user.canAccessProducts}
          canAccessInventory={user.canAccessInventory}
        />
      </aside>

      {/* Sidebar mobile */}
      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-50 max-w-[100vw] overflow-hidden lg:hidden">
          <button
            type="button"
            aria-label="Tutup navigasi"
            className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <aside className="relative z-10 flex h-full w-[min(86vw,300px)] max-w-full flex-col overflow-y-auto border-r border-[var(--border)] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                aria-label="Tutup menu"
                onClick={() => setIsMobileMenuOpen(false)}
                className="grid size-10 place-items-center rounded-xl text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950"
              >
                <X className="size-5" />
              </button>
            </div>

            <SidebarContent
              pathname={pathname}
              canAccessPos={user.canAccessPos}
              canAccessAdministration={user.canAccessAdministration}
              canAccessProducts={user.canAccessProducts}
              canAccessInventory={user.canAccessInventory}
              onNavigate={() => setIsMobileMenuOpen(false)}
            />
          </aside>
        </div>
      ) : null}

      <div className="flex h-dvh min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-20 w-full max-w-full min-w-0 shrink-0 items-center gap-3 overflow-x-hidden border-b border-[var(--border)] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            aria-label="Buka navigasi"
            onClick={() => setIsMobileMenuOpen(true)}
            className="grid size-10 shrink-0 place-items-center rounded-xl text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950 lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <label className="hidden h-11 w-full max-w-md items-center gap-3 rounded-xl border border-[var(--border)] bg-white px-4 text-sm text-[var(--muted)] md:flex">
            <Search className="size-4 shrink-0" />

            <input
              type="search"
              placeholder="Cari transaksi, barcode, produk, atau pelanggan..."
              className="min-w-0 flex-1 bg-transparent text-neutral-950 outline-none placeholder:text-neutral-400"
            />

            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              aria-label="Scan Barcode"
              className="mr-1 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-950"
            >
              <ScanBarcode className="size-4" />
            </button>
          </label>

          <div className="min-w-0 md:hidden">
            <p className="truncate text-sm font-semibold">ASIHJAYA</p>

            <p className="truncate text-xs text-[var(--muted)]">
              Retail Management
            </p>
          </div>

          <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
            <button
              type="button"
              aria-label="Persetujuan"
              onClick={() => setIsApprovalOpen(true)}
              className="relative grid size-10 place-items-center rounded-xl text-neutral-600 transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
            >
              <ClipboardCheck className="size-5" />
              {/* Notification Badge */}
              <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-white bg-red-600 text-[10px] font-bold text-white">
                1
              </span>
            </button>

            <button
              type="button"
              aria-label="Notifikasi"
              className="relative grid size-10 place-items-center rounded-xl text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-950"
            >
              <Bell className="size-5" />

              <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-[var(--accent)]" />
            </button>

            <UserMenu
              fullName={user.fullName}
              roleLabel={user.roleLabel}
              currentArea="admin"
              canAccessPos={user.canAccessPos}
            />
          </div>
        </header>

        <main className="min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <CameraScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={(result) => {
          console.log("Barcode terscan:", result);
          setIsScannerOpen(false);
        }}
      />

      <ApprovalDrawer
        isOpen={isApprovalOpen}
        onClose={() => setIsApprovalOpen(false)}
      />
    </div>
  );
}
