import { Suspense } from "react";

export default function CustomerPortalPage({
  params,
}: PageProps<"/portal/[customerId]">) {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      {params.then(({ customerId }) => (
        <h1 className="text-2xl font-semibold">Customer {customerId}</h1>
      ))}
    </Suspense>
  );
}
