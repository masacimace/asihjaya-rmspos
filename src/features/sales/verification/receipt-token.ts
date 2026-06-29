import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT_TOKEN_PREFIX = "receipt-certificate";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{11}$/;

function uuidToBase64Url(uuid: string) {
  if (!UUID_PATTERN.test(uuid)) {
    throw new Error("Sale id untuk token verifikasi nota tidak valid.");
  }

  return Buffer.from(uuid.replaceAll("-", ""), "hex").toString("base64url");
}

function base64UrlToUuid(value: string) {
  const bytes = Buffer.from(value, "base64url");

  if (bytes.length !== 16) {
    return null;
  }

  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function createReceiptSignature(saleId: string) {
  return createHmac("sha256", serverEnv.SESSION_SECRET)
    .update(`${RECEIPT_TOKEN_PREFIX}:${saleId}`)
    .digest()
    .subarray(0, 8)
    .toString("base64url");
}

export function createReceiptVerificationToken(saleId: string) {
  const saleToken = uuidToBase64Url(saleId);
  const signature = createReceiptSignature(saleId);

  return `${saleToken}.${signature}`;
}

export function verifyReceiptVerificationToken(token: string) {
  const normalizedToken = token.trim();

  if (!TOKEN_PATTERN.test(normalizedToken)) {
    return null;
  }

  const [saleToken, signature] = normalizedToken.split(".");

  if (!saleToken || !signature) {
    return null;
  }

  const saleId = base64UrlToUuid(saleToken);

  if (!saleId || !UUID_PATTERN.test(saleId)) {
    return null;
  }

  const expectedSignature = createReceiptSignature(saleId);
  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    return null;
  }

  return { saleId };
}

export function createReceiptVerificationUrl(saleId: string) {
  const token = createReceiptVerificationToken(saleId);

  return {
    token,
    url: `${serverEnv.APP_URL}/v/${token}`,
  };
}
