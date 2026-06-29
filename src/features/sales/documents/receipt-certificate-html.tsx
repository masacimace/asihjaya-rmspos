import { createQrSvgDataUri } from "@/lib/qr-code/svg";

import type { ReceiptCertificateData } from "./receipt-certificate";

const receiptTerms = [
  "Barang yang tercantum dalam nota telah diperiksa, disetujui, ditimbang, dan diterima oleh pembeli.",
  "Barang dapat dijual kembali dalam keadaan utuh sesuai kebijakan toko dan harga pasar yang berlaku.",
  "Barang permata cacat atau pecah tidak dapat diterima kembali.",
  "Perhiasan batu dan sejenisnya hanya kami terima emasnya saja.",
  "Nota ini wajib dibawa saat menjual kembali. Jika nota hilang, transaksi dapat ditolak.",
];

const styles = String.raw`
  @page {
    size: A5 landscape;
    margin: 0;
  }

  .aj-preview-shell {
    width: 100%;
    overflow: auto;
    padding: 24px;
    background: #fbfbfb;
  }

  .aj-receipt-page,
  .aj-receipt-page * {
    box-sizing: border-box;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .aj-receipt-page {
    --gold: #b37a1f;
    --gold-2: #d7ad4a;
    --gold-soft: #f6ead0;
    --ink: #1c1712;
    --muted: #74675c;
    --line: #ead7ad;
    --cream: #fffaf0;
    --maroon: #a81f3d;

    position: relative;
    width: 210mm;
    height: 148mm;
    overflow: hidden;
    margin: 0 auto;
    padding: 6mm 7mm;
    color: var(--ink);
    background:#fafaf6;
    border: 0.45mm solid var(--gold);
    border-radius: 2.2mm;
    font-family: Arial, Helvetica, sans-serif;
    box-shadow: 0 20px 54px rgba(58, 42, 22, 0.16);
  }

  .aj-receipt-page::before {
    content: "";
    position: absolute;
    inset: 2.5mm;
    border: 0.18mm solid rgba(179, 122, 31, 0.35);
    pointer-events: none;
  }

  .aj-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 128mm;
    height: 128mm;
    pointer-events: none;
    opacity: 0.09;
  }

  .aj-watermark img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  /* ─── MAIN LAYOUT ─── */

  .aj-document-content {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 2.5mm;
    height: 100%;
  }

  /* ─── HEADER ─── */

  .aj-header {
    display: grid;
    grid-template-columns: 28mm 1fr 54mm;
    gap: 3.5mm;
    align-items: stretch;
  }

  .aj-logo-block {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 1.4mm;
    padding: 2mm 0;
  }

  .aj-logo {
    width: 22mm;
    height: 22mm;
    object-fit: contain;
  }

  .aj-brand-block {
    display: grid;
    align-content: center;
    min-width: 0;
  }

  .aj-eyebrow {
    width: fit-content;
    margin-bottom: 1.2mm;
    padding: 0.7mm 2mm;
    border-radius: 999px;
    color: var(--gold);
    background: rgba(246, 234, 208, 0.68);
    border: 0.18mm solid rgba(179, 122, 31, 0.34);
    font-size: 5.2pt;
    font-weight: 900;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .aj-brand-title {
    color: var(--ink);
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 16pt;
    font-weight: 900;
    line-height: 1;
    letter-spacing: 0.035em;
    text-transform: uppercase;
  }

  .aj-branch-title {
    margin-top: 1.2mm;
    color: var(--gold);
    font-size: 9.4pt;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .aj-contact-lines {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.8mm 3mm;
    margin-top: 1.8mm;
    color: #5f554c;
    font-size: 5.5pt;
    line-height: 1.2;
  }

  .aj-contact-item {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 1mm;
    font-size: 7.5pt;
  }

  .aj-contact-item:first-child {
    grid-column: 1 / -1;
  }

  .aj-certificate-card {
    display: grid;
    align-content: center;
    padding: 3mm 3.5mm;
  }

  .aj-divider {
    height: 0.22mm;
    margin: 2mm 0 2.2mm;
    background: linear-gradient(90deg, transparent, rgba(179, 122, 31, 0.72), transparent);
  }

  .aj-summary-lines {
    display: grid;
    gap: 1.2mm;
    font-size: 6.4pt;
  }

  .aj-summary-row {
    display: grid;
    grid-template-columns: 16mm 1fr;
    gap: 1.5mm;
  }

  .aj-summary-value {
    font-weight: 900;
  }

  /* ─── INFO STRIP ─── */

  .aj-info-strip {
    display: grid;
    grid-template-columns: 1fr 1fr 40mm;
    overflow: hidden;
    border: 0.2mm solid rgba(179, 122, 31, 0.28);
    border-radius: 2.5mm;
    background: rgba(255, 255, 255, 0.72);
  }

  .aj-info-box {
    display: flex;
    align-items: center;
    gap: 2mm;
    min-width: 0;
    padding: 1.8mm 3.5mm;
    border-left: 0.18mm solid rgba(179, 122, 31, 0.18);
  }

  .aj-info-box:first-child {
    border-left: 0;
  }

  .aj-info-label {
    color: var(--muted);
    font-size: 7.5pt;
    line-height: 1.1;
  }

  .aj-info-value {
    margin-top: 0.4mm;
    color: var(--ink);
    font-size: 7.6pt;
    font-weight: 900;
    line-height: 1.05;
  }

  .aj-payment-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--maroon);
    background: rgba(168, 31, 61, 0.055);
    font-size: 6pt;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-align: center;
    text-transform: uppercase;
  }

  /* ─── PRODUCTS TABLE ─── */

  .aj-products-card {
    overflow: hidden;
    border: 0.22mm solid rgba(179, 122, 31, 0.25);
    border-radius: 2.5mm;
    background: rgba(255, 255, 255, 1.0);
    min-height: 0;
  }

  .aj-products-grid {
    display: grid;
    grid-template-rows: 7.5mm;
    grid-auto-rows: 1fr;
    height: 100%;
  }

  .aj-product-row {
    display: grid;
    grid-template-columns: 18mm 22mm 1fr 16mm 18mm 32mm;
    align-items: center;
    column-gap: 3mm;
    padding: 0 4mm;
    border-bottom: 0.18mm solid rgba(234, 215, 173, 0.76);
  }

  .aj-product-row:last-child {
    border-bottom: 0;
  }

  .aj-product-head {
    color: #000;
    background: #f5f5dc;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 6.4pt;
    font-weight: 900;
    letter-spacing: 0.02em;
  }

  .aj-code {
    font-size: 6.8pt;
    font-weight: 800;
    text-align: center;
  }

  .aj-thumb {
    display: grid;
    width: 14mm;
    height: 14mm;
    overflow: hidden;
    place-items: center;
    justify-self: center;
    color: var(--gold);
    background: linear-gradient(135deg, #fffefa, #fbf0d8);
    font-size: 4.8pt;
    font-weight: 800;
    text-align: center;
  }

  .aj-thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .aj-thumb-fallback {
    padding: 1mm;
    line-height: 1.1;
  }

  .aj-product-name {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 7.2pt;
    font-weight: 900;
    line-height: 1.08;
    text-transform: uppercase;
  }

  .aj-product-meta {
    margin-top: 0.6mm;
    color: var(--muted);
    font-size: 6.5pt;
    font-weight: 600;
    line-height: 1.15;
  }

  .aj-kadar {
    display: grid;
    width: 9.2mm;
    height: 9.2mm;
    place-items: center;
    justify-self: center;
    color: #000;
    background: rgba(255, 253, 248, 0.92);
    font-size: 5.8pt;
    font-weight: 900;
  }

  .aj-gram {
    font-size: 6.8pt;
    font-weight: 800;
    text-align: center;
  }

  .aj-price {
    font-size: 7.6pt;
    font-weight: 900;
    text-align: right;
  }

  /* ─── FOOTER ─── */

  .aj-footer {
    display: grid;
    grid-template-columns: 1fr 52mm 26mm;
    gap: 2.5mm;
    min-height: 0;
  }

  .aj-notes,
  .aj-total-card,
  .aj-qr-card {
    border: 0.2mm solid rgba(179, 122, 31, 0.23);
    border-radius: 2.5mm;
    background: rgba(255, 255, 255, 0.74);
  }

  .aj-notes {
    padding: 2.5mm 3mm;
    overflow: hidden;
  }

  .aj-notes-title {
    display: flex;
    align-items: center;
    gap: 1.2mm;
    margin-bottom: 1mm;
    color: var(--gold);
    font-size: 6pt;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .aj-terms {
    margin: 0;
    padding-left: 3mm;
    color: #382f28;
    font-size: 5.6pt;
    line-height: 1.36;
  }

  .aj-total-card {
    display: grid;
    align-content: center;
    gap: 1.7mm;
    padding: 2.2mm 3mm;
  }

  .aj-total-breakdown {
    display: grid;
    gap: 0.9mm;
    padding-bottom: 1.5mm;
    border-bottom: 0.2mm solid rgba(179, 122, 31, 0.42);
  }

  .aj-total-detail-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 3mm;
    color: #4b4037;
    font-size: 5.8pt;
    line-height: 1.1;
  }

  .aj-total-detail-row strong {
    color: var(--ink);
    font-size: 6pt;
    font-weight: 900;
    white-space: nowrap;
  }

  .aj-total-row-discount strong,
  .aj-total-row-change strong {
    color: var(--maroon);
  }

  .aj-total-row-paid strong {
    color: var(--gold);
  }

  .aj-total-box {
    display: grid;
    gap: 0.8mm;
    padding: 2.1mm 3.2mm;
    border-radius: 2mm;
    color: #000;
  }

  .aj-total-label {
    font-size: 5.3pt;
    font-weight: 900;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .aj-total-amount {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12.2pt;
    font-weight: 900;
    line-height: 1;
    white-space: nowrap;
  }

  .aj-qr-card {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 1mm;
    padding: 2mm;
    text-align: center;
  }

  .aj-qr-box {
    display: grid;
    width: 18mm;
    height: 18mm;
    place-items: center;
    overflow: hidden;
    background: #fff;
  }

  .aj-qr-box img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .aj-qr-label {
    padding: 0.7mm 1.5mm;
    border-radius: 999px;
    color: #fffdf7;
    background: var(--maroon);
    font-size: 4.5pt;
    font-weight: 900;
    text-transform: uppercase;
  }

  .aj-qr-note {
    color: var(--muted);
    font-size: 4.4pt;
    line-height: 1.2;
  }

  @media screen and (max-width: 980px) {
    .aj-preview-shell {
      padding: 12px;
    }
  }

  @media print {
    html,
    body {
      width: 210mm;
      height: 148mm;
      margin: 0;
      padding: 0;
      background: #f9f9f9;
    }

    .aj-preview-shell {
      width: 210mm;
      height: 148mm;
      overflow: hidden;
      padding: 0;
      background: #f9f9f9;
    }

    .aj-receipt-page {
      margin: 0;
      box-shadow: none;
    }
  }
`;

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

function toNumber(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return amount;
}

function formatNegativeAmount(value: string | number | null | undefined) {
  const amount = toNumber(value);

  if (amount <= 0) {
    return formatAmount(0);
  }

  return `-${formatAmount(amount)}`;
}

function getPaymentMetadataAmount(
  payment: ReceiptCertificateData["payments"][number],
  key: string,
) {
  const value = payment.metadata?.[key];

  if (typeof value === "number" || typeof value === "string") {
    return toNumber(value);
  }

  return 0;
}

function getPaymentReceivedAmount(
  payment: ReceiptCertificateData["payments"][number],
) {
  const receivedAmount = getPaymentMetadataAmount(payment, "receivedAmount");

  if (receivedAmount > 0) {
    return receivedAmount;
  }

  return toNumber(payment.amount);
}

function getTotalPaidAmount(data: ReceiptCertificateData) {
  return data.payments.reduce(
    (total, payment) => total + getPaymentReceivedAmount(payment),
    0,
  );
}

function getTotalChangeAmount(data: ReceiptCertificateData) {
  return data.payments.reduce(
    (total, payment) =>
      total + getPaymentMetadataAmount(payment, "changeAmount"),
    0,
  );
}

function formatDate(value: Date | null, timezone: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  })
    .format(value)
    .replace(".", "");
}

function formatGram(value: string | null | undefined) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "-";
  }

  return `${amount.toLocaleString("id-ID", { maximumFractionDigits: 2 })} g`;
}

function formatPercent(value: string | null | undefined) {
  const amount = Number(value ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "-";
  }

  return `${amount.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}

function buildProductMeta(item: ReceiptCertificateData["items"][number]) {
  const itemName = getItemName(item);
  const masterProductName =
    item.snapshot.masterProductName ??
    (item.snapshot.itemDisplayName ? item.snapshot.productName : null);

  if (!masterProductName || masterProductName === itemName) {
    return null;
  }

  return masterProductName;
}

function getProductCode(item: ReceiptCertificateData["items"][number]) {
  return (
    item.snapshot.barcode ??
    item.snapshot.qrValue ??
    item.snapshot.serialNumber ??
    item.snapshot.sku ??
    "-"
  );
}

function getItemName(item: ReceiptCertificateData["items"][number]) {
  return (
    item.snapshot.itemDisplayName ??
    item.snapshot.productName ??
    item.snapshot.masterProductName ??
    item.snapshot.productCode ??
    "Item Perhiasan"
  );
}

function getThumbnailLabel(item: ReceiptCertificateData["items"][number]) {
  return item.snapshot.categoryName ?? "Produk";
}

function getProductImageKey(item: ReceiptCertificateData["items"][number]) {
  return item.snapshot.imageKey ?? item.snapshot.productImageKey ?? null;
}

function getMediaImageUrl(imageKey: string) {
  const normalizedKey = imageKey
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/media/${normalizedKey}`;
}

function ProductThumbnail({
  item,
}: {
  item: ReceiptCertificateData["items"][number];
}) {
  const imageKey = getProductImageKey(item);

  if (!imageKey) {
    return (
      <div className="aj-thumb aj-thumb-fallback">
        {getThumbnailLabel(item)}
      </div>
    );
  }

  return (
    <div className="aj-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={getMediaImageUrl(imageKey)} alt={getItemName(item)} />
    </div>
  );
}

function getPaymentSummary(data: ReceiptCertificateData) {
  if (data.payments.length === 0) {
    return "Pembayaran tercatat";
  }

  const methodLabels: Record<string, string> = {
    bank_transfer: "Transfer",
    cash: "Cash",
    credit_card: "Credit Card",
    debit_card: "Debit Card",
    qris_manual: "QRIS",
    qris_gateway: "QRIS",
  };

  return data.payments
    .map(
      (payment) =>
        methodLabels[payment.method] ?? payment.method.replaceAll("_", " "),
    )
    .join(" + ");
}

export function ReceiptCertificateHtmlDocument({
  data,
}: {
  data: ReceiptCertificateData;
}) {
  const customerName = data.customer?.fullName ?? "Pelanggan Umum";
  const customerPhone = data.customer?.phone ?? "-";
  const completedDate = formatDate(
    data.sale.completedAt,
    data.organization.timezone,
  );
  const visibleItems = data.items.slice(0, 3);
  const paymentSummary = getPaymentSummary(data);
  const subtotalAmount = toNumber(data.sale.subtotalAmount);
  const discountAmount = toNumber(data.sale.discountAmount);
  const depositAmount = toNumber(data.sale.additionalFeeAmount);
  const totalPaidAmount = getTotalPaidAmount(data);
  const changeAmount = getTotalChangeAmount(data);
  const verificationQrImage = createQrSvgDataUri(data.verification.url);

  return (
    <div className="aj-preview-shell">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <article
        className="aj-receipt-page"
        aria-label="Nota dan certificate pembelian"
      >
        <div className="aj-watermark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/nota-logo.png" alt="" />
        </div>
        <div className="aj-document-content">
          <header className="aj-header">
            <div className="aj-logo-block">
              <div className="aj-logo-ring">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="aj-logo"
                  src="/logo/nota-logo.png"
                  alt="Asih Jaya"
                />
              </div>
            </div>

            <div className="aj-brand-block">
              <div className="aj-eyebrow">Nota Pembelian & Certificate</div>
              <div className="aj-brand-title">Toko Emas Asih Jaya</div>
              <div className="aj-branch-title">{data.outlet.name}</div>
              <div className="aj-contact-lines">
                <span className="aj-contact-item">
                  {data.outlet.address ?? "Alamat outlet belum diatur"}
                </span>
                <span className="aj-contact-item">
                  WA: {data.outlet.phone ?? "-"}
                </span>
                <span className="aj-contact-item">
                  IG: @asihjaya.bantargebang
                </span>
              </div>
            </div>

            <aside className="aj-certificate-card">
              <div className="aj-summary-lines">
                <div className="aj-summary-row">
                  <span>No. Order</span>
                  <span className="aj-summary-value">
                    : {data.sale.invoiceNumber}
                  </span>
                </div>
                <div className="aj-summary-row">
                  <span>Tanggal</span>
                  <span className="aj-summary-value">: {completedDate}</span>
                </div>
                <div className="aj-summary-row">
                  <span>Sales</span>
                  <span className="aj-summary-value">
                    : {data.cashier.fullName}
                  </span>
                </div>
              </div>
            </aside>
          </header>

          <section className="aj-info-strip">
            <div className="aj-info-box">
              <div>
                <div className="aj-info-label">Konsumen</div>
                <div className="aj-info-value">{customerName}</div>
              </div>
            </div>
            <div className="aj-info-box">
              <div>
                <div className="aj-info-label">Telepon</div>
                <div className="aj-info-value">{customerPhone}</div>
              </div>
            </div>
            <div className="aj-info-box aj-payment-badge">{paymentSummary}</div>
          </section>

          <section className="aj-products-card">
            <div className="aj-products-grid">
              <div className="aj-product-row aj-product-head">
                <div>KODE</div>
                <div>FOTO</div>
                <div>PRODUCT</div>
                <div>KADAR ±%</div>
                <div>GRAM</div>
                <div>HARGA</div>
              </div>
              {visibleItems.map((item) => (
                <div className="aj-product-row" key={item.lineNumber}>
                  <div className="aj-code">{getProductCode(item)}</div>
                  <ProductThumbnail item={item} />
                  <div>
                    <div className="aj-product-name">{getItemName(item)}</div>
                    <div className="aj-product-meta">
                      {buildProductMeta(item)}
                    </div>
                  </div>
                  <div className="aj-kadar">
                    {formatPercent(item.snapshot.exchangePurityPercent)}
                  </div>
                  <div className="aj-gram">
                    {formatGram(item.snapshot.weightGram)}
                  </div>
                  <div className="aj-price">
                    {formatAmount(item.finalPriceAmount)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <footer className="aj-footer">
            <section className="aj-notes">
              <div className="aj-notes-title">Perhatian</div>
              <ol className="aj-terms">
                {receiptTerms.map((term) => (
                  <li key={term}>{term}</li>
                ))}
              </ol>
            </section>

            <section className="aj-total-card">
              <div
                className="aj-total-breakdown"
                aria-label="Rincian pembayaran"
              >
                <div className="aj-total-detail-row">
                  <span>Subtotal</span>
                  <strong>{formatAmount(subtotalAmount)}</strong>
                </div>
                {discountAmount > 0 ? (
                  <div className="aj-total-detail-row aj-total-row-discount">
                    <span>Diskon</span>
                    <strong>{formatNegativeAmount(discountAmount)}</strong>
                  </div>
                ) : null}
                {depositAmount > 0 ? (
                  <div className="aj-total-detail-row">
                    <span>Dana Titip</span>
                    <strong>{formatAmount(depositAmount)}</strong>
                  </div>
                ) : null}
                <div className="aj-total-detail-row aj-total-row-paid">
                  <span>Dibayar</span>
                  <strong>{formatAmount(totalPaidAmount)}</strong>
                </div>
                {changeAmount > 0 ? (
                  <div className="aj-total-detail-row aj-total-row-change">
                    <span>Kembalian</span>
                    <strong>{formatAmount(changeAmount)}</strong>
                  </div>
                ) : null}
              </div>
              <div className="aj-total-box">
                <span className="aj-total-label">Total Pembayaran</span>
                <strong className="aj-total-amount">
                  {formatAmount(data.sale.totalAmount)}
                </strong>
              </div>
            </section>

            <section className="aj-qr-card">
              <div className="aj-qr-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={verificationQrImage} alt="QR verifikasi nota" />
              </div>
              <div className="aj-qr-label">Scan Keaslian</div>
              <div className="aj-qr-note">Pindai QR untuk verifikasi nota</div>
            </section>
          </footer>
        </div>
      </article>
    </div>
  );
}
