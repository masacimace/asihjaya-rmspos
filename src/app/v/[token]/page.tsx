import Image from "next/image";

import {
  getPublicReceiptVerificationData,
  getPublicVerificationImageUrl,
} from "@/features/sales/verification/receipt-verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

function formatAmount(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return "Rp 0";
  }

  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value: Date | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function formatGram(value: string | null) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "-";
  }

  return `${amount.toLocaleString("id-ID", { maximumFractionDigits: 2 })} g`;
}

function formatPercent(value: string | null) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "-";
  }

  return `${amount.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

export default async function PublicReceiptVerificationPage({ params }: PageProps) {
  const { token } = await params;
  const data = await getPublicReceiptVerificationData(token);

  if (data.status === "invalid") {
    return (
      <main className="min-h-screen bg-[#fffaf0] px-4 py-8 text-neutral-950">
        <section className="mx-auto max-w-lg rounded-[2rem] border border-red-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-red-50 text-2xl">
            !
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-red-600">
            Verifikasi Nota
          </p>
          <h1 className="mt-2 text-2xl font-bold">Nota tidak valid</h1>
          <p className="mt-3 text-sm leading-6 text-neutral-600">{data.message}</p>
          <p className="mt-6 rounded-2xl bg-neutral-50 p-4 text-xs leading-5 text-neutral-500">
            Pastikan QR berasal dari nota/certificate resmi Asih Jaya. Jika ragu,
            hubungi outlet Asih Jaya terdekat.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fffaf0] px-4 py-8 text-neutral-950">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-[#ead7ad] bg-white shadow-sm">
        <div className="bg-gradient-to-br from-[#fff9ee] to-white p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#b37a1f]">
                Asih Jaya Receipt Verification
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight">
                Nota Valid
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-600">
                Nota/certificate ini terdaftar di sistem Asih Jaya. Cocokkan nomor
                order dan detail barang dengan nota fisik yang kamu scan.
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 ring-1 ring-emerald-100">
              VALID
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#ead7ad] bg-white p-4">
              <p className="text-xs font-semibold text-neutral-500">No. Order</p>
              <p className="mt-1 break-words text-sm font-black">
                {data.sale.invoiceNumber}
              </p>
            </div>
            <div className="rounded-2xl border border-[#ead7ad] bg-white p-4">
              <p className="text-xs font-semibold text-neutral-500">Tanggal</p>
              <p className="mt-1 text-sm font-black">
                {formatDateTime(data.sale.completedAt)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#ead7ad] bg-white p-4">
              <p className="text-xs font-semibold text-neutral-500">Outlet</p>
              <p className="mt-1 text-sm font-black">{data.outlet.name}</p>
            </div>
            <div className="rounded-2xl border border-[#ead7ad] bg-white p-4">
              <p className="text-xs font-semibold text-neutral-500">Total</p>
              <p className="mt-1 text-sm font-black">
                {formatAmount(data.sale.totalAmount)}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 p-6 sm:p-8">
          <section className="grid gap-3 rounded-3xl border border-neutral-200 p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-neutral-500">Customer</p>
              <p className="mt-1 text-sm font-bold">
                {data.customer?.name ?? "Pelanggan Umum"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-500">Telepon</p>
              <p className="mt-1 text-sm font-bold">{data.customer?.phone ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-neutral-500">Pembayaran</p>
              <p className="mt-1 text-sm font-bold">{data.paymentSummary}</p>
            </div>
          </section>

          <section>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b37a1f]">
                  Detail Barang
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {data.totalItems} item terverifikasi
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {data.items.map((item) => {
                const imageUrl = getPublicVerificationImageUrl({
                  imageKey: item.imageKey,
                  token: data.token,
                });

                return (
                  <article
                    key={`${item.lineNumber}-${item.productCode}`}
                    className="grid gap-4 rounded-3xl border border-neutral-200 p-4 sm:grid-cols-[88px_1fr]"
                  >
                    <div className="grid size-20 place-items-center overflow-hidden rounded-2xl border border-[#ead7ad] bg-[#fffaf0] text-center text-[11px] font-bold text-[#b37a1f]">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={item.productName}
                          width={96}
                          height={96}
                          className="size-full object-cover"
                          unoptimized
                        />
                      ) : (
                        item.categoryName ?? "Produk"
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-black uppercase tracking-wide">
                            {item.productName}
                          </h3>
                          <p className="mt-1 text-sm text-neutral-500">
                            {item.productCode}
                          </p>
                        </div>
                        <span className="rounded-full bg-[#f6ead0] px-3 py-1 text-xs font-bold text-[#7a4e1d]">
                          {item.categoryName ?? "Perhiasan"}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                        <div>
                          <p className="text-xs text-neutral-500">Berat</p>
                          <p className="font-bold">{formatGram(item.weightGram)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500">Kadar</p>
                          <p className="font-bold">{formatPercent(item.purityPercent)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-neutral-500">Tukar</p>
                          <p className="font-bold">
                            {formatPercent(item.exchangePurityPercent)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <p className="rounded-3xl bg-neutral-50 p-4 text-xs leading-5 text-neutral-500">
            Halaman ini hanya menampilkan ringkasan verifikasi. Data lengkap transaksi
            tetap tersimpan secara internal di sistem Asih Jaya.
          </p>
        </div>
      </section>
    </main>
  );
}
