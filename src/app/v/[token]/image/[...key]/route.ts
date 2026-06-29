import { eq } from "drizzle-orm";

import { db } from "@/db";
import { sales } from "@/db/schema";
import { verifyReceiptVerificationToken } from "@/features/sales/verification/receipt-token";
import {
  imageKeyBelongsToOrganization,
  readImageFile,
} from "@/lib/storage/image-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
    key: string[];
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { token, key } = await context.params;
  const parsedToken = verifyReceiptVerificationToken(token);

  if (!parsedToken) {
    return new Response("Not found", { status: 404 });
  }

  const [saleRow] = await db
    .select({
      organizationId: sales.organizationId,
    })
    .from(sales)
    .where(eq(sales.id, parsedToken.saleId))
    .limit(1);

  if (!saleRow) {
    return new Response("Not found", { status: 404 });
  }

  const imageKey = key.map((segment) => decodeURIComponent(segment)).join("/");

  if (!imageKeyBelongsToOrganization(imageKey, saleRow.organizationId)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const image = await readImageFile(imageKey);

    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
