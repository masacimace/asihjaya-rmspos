"use client";

import {
  ChevronDown,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { logoutAction } from "@/app/actions/auth";

type UserMenuProps = {
  fullName: string;
  roleLabel: string;
  currentArea: "admin" | "pos";
  canAccessAdmin?: boolean;
  canAccessPos?: boolean;
};

export function UserMenu({
  fullName,
  roleLabel,
  currentArea,
  canAccessAdmin = false,
  canAccessPos = false,
}: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="flex items-center gap-2 rounded-xl px-1.5 py-1.5 text-left transition hover:bg-neutral-100 sm:px-2"
      >
        <CircleUserRound className="size-9 shrink-0 text-neutral-500" />

        <div className="hidden min-w-0 sm:block">
          <p className="max-w-36 truncate text-xs font-medium text-neutral-950">
            {fullName}
          </p>

          <p className="max-w-36 truncate text-xs text-[var(--muted)]">
            {roleLabel}
          </p>
        </div>

        <ChevronDown className="hidden size-4 shrink-0 text-neutral-400 sm:block" />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-2 shadow-[0_18px_50px_rgba(0,0,0,0.14)]">
          <div className="border-b border-[var(--border)] px-3 py-3">
            <p className="truncate text-sm font-semibold text-neutral-950">
              {fullName}
            </p>

            <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
              {roleLabel}
            </p>
          </div>

          <div className="py-2">
            {currentArea === "admin" && canAccessPos ? (
              <Link
                href="/pos"
                onClick={() => setIsOpen(false)}
                className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950"
              >
                <ShoppingBag className="size-4" />
                Buka Aplikasi POS
              </Link>
            ) : null}

            {currentArea === "pos" && canAccessAdmin ? (
              <Link
                href="/admin"
                onClick={() => setIsOpen(false)}
                className="flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-neutral-700 transition hover:bg-neutral-100 hover:text-neutral-950"
              >
                <LayoutDashboard className="size-4" />
                Dashboard Admin
              </Link>
            ) : null}
          </div>

          <form
            action={logoutAction}
            className="border-t border-[var(--border)] pt-2"
          >
            <button
              type="submit"
              className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-red-600 transition hover:bg-red-50"
            >
              <LogOut className="size-4" />
              Keluar
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
