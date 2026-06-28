import { HeldCartsClient } from "@/components/pos/held-carts-client";
import { getPosHeldCartListData } from "@/features/pos/queries";
import { requirePermission } from "@/lib/auth/session";

export const runtime = "nodejs";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  return Array.isArray(value) ? value[0] : value;
}

export default async function PosHeldCartsPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const query = getSearchParam(resolvedSearchParams, "q") ?? "";

  const auth = await requirePermission("pos.access");
  const primaryOutlet =
    auth.outlets.find((outlet) => outlet.isPrimary) ?? auth.outlets[0];

  const data = await getPosHeldCartListData({
    organizationId: auth.organization.id,
    outletId: primaryOutlet?.id,
    query,
  });

  return <HeldCartsClient data={data} />;
}
