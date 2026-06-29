import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  writeFileSync(path.join(root, relativePath), content, "utf8");
}

function ensureAfter(content, anchor, insertion, description) {
  if (content.includes(insertion.trim())) {
    return content;
  }

  const index = content.indexOf(anchor);

  if (index === -1) {
    throw new Error(`Tidak menemukan anchor: ${description}`);
  }

  return `${content.slice(0, index + anchor.length)}${insertion}${content.slice(
    index + anchor.length,
  )}`;
}

function replaceOnce(content, pattern, replacement, description) {
  const next = content.replace(pattern, replacement);

  if (next === content) {
    throw new Error(`Tidak menemukan target perubahan: ${description}`);
  }

  return next;
}

function patchReceiptData() {
  const relativePath = "src/features/sales/documents/receipt-certificate.ts";
  let content = read(relativePath);

  content = ensureAfter(
    content,
    "  productName?: string | null;\n",
    "  itemDisplayName?: string | null;\n  masterProductName?: string | null;\n",
    "SaleItemSnapshot item/master name fields",
  );

  content = ensureAfter(
    content,
    '    productName: readString("productName"),\n',
    '    itemDisplayName: readString("itemDisplayName"),\n    masterProductName: readString("masterProductName"),\n',
    "toSafeSnapshot item/master name readers",
  );

  content = ensureAfter(
    content,
    "      snapshot: saleItems.snapshot,\n",
    "      itemDisplayName: productItems.displayName,\n      masterProductName: productMasters.name,\n",
    "receipt item query item/master name fallback",
  );

  content = ensureAfter(
    content,
    "          ...snapshot,\n",
    "          itemDisplayName: snapshot.itemDisplayName ?? item.itemDisplayName,\n          masterProductName: snapshot.masterProductName ?? item.masterProductName,\n",
    "receipt snapshot item/master name fallback",
  );

  write(relativePath, content);
}

function patchReceiptHtml() {
  const relativePath = "src/features/sales/documents/receipt-certificate-html.tsx";
  let content = read(relativePath);

  content = replaceOnce(
    content,
    /function buildProductMeta\(item: ReceiptCertificateData\["items"\]\[number\]\) \{[\s\S]*?\n\}\n\nfunction getProductCode/,
    `function buildProductMeta(item: ReceiptCertificateData["items"][number]) {
  const itemName = getItemName(item);
  const masterProductName =
    item.snapshot.masterProductName ??
    (item.snapshot.itemDisplayName ? item.snapshot.productName : null);

  if (!masterProductName || masterProductName === itemName) {
    return null;
  }

  return masterProductName;
}

function getProductCode`,
    "buildProductMeta memakai nama master product",
  );

  content = replaceOnce(
    content,
    /function getItemName\(item: ReceiptCertificateData\["items"\]\[number\]\) \{[\s\S]*?\n\}\n\nfunction getThumbnailLabel/,
    `function getItemName(item: ReceiptCertificateData["items"][number]) {
  return (
    item.snapshot.itemDisplayName ??
    item.snapshot.productName ??
    item.snapshot.masterProductName ??
    item.snapshot.productCode ??
    "Item Perhiasan"
  );
}

function getThumbnailLabel`,
    "getItemName memakai item display name dengan fallback master",
  );

  write(relativePath, content);
}

function patchSampleData() {
  const relativePath = "src/features/sales/documents/receipt-certificate-sample-data.ts";
  let content;

  try {
    content = read(relativePath);
  } catch {
    return;
  }

  if (content.includes("itemDisplayName") || content.includes("masterProductName")) {
    return;
  }

  content = content
    .replace(
      '        productName: "Gelang Cartier Oval",',
      '        itemDisplayName: "Gelang Cartier Oval 3.76g",\n        masterProductName: "Gelang Cartier Oval",\n        productName: "Gelang Cartier Oval 3.76g",',
    )
    .replace(
      '        productName: "Cincin Kawin Polos",',
      '        itemDisplayName: "Cincin Kawin Polos Size 14",\n        masterProductName: "Cincin Kawin Polos",\n        productName: "Cincin Kawin Polos Size 14",',
    )
    .replace(
      '        productName: "Kalung Nuri Anak",',
      '        itemDisplayName: "Kalung Nuri Anak 1.5g",\n        masterProductName: "Kalung Nuri Anak",\n        productName: "Kalung Nuri Anak 1.5g",',
    );

  write(relativePath, content);
}

try {
  patchReceiptData();
  patchReceiptHtml();
  patchSampleData();
  console.log("Receipt/certificate sekarang memakai nama master product di baris meta item.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
