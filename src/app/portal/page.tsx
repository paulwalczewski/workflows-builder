import { Card, Chip } from "@heroui/react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { subscriptionTitle } from "@/catalogue/format";
import { ResetDataButton } from "@/components/portal/ResetDataButton";
import { listCustomers, listSubscriptions } from "@/server/store";

export default function PortalPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Customer portal
          </h1>
          <p className="text-muted">
            Pick a customer to open their subscriptions. There is no login in
            this demo.
          </p>
        </div>
        <ResetDataButton />
      </div>
      <Suspense fallback={<p className="text-muted">Loading customers…</p>}>
        <CustomerList />
      </Suspense>
    </div>
  );
}

const statusColor = {
  active: "success",
  paused: "warning",
  canceled: "default",
  failed: "danger",
} as const;

async function CustomerList() {
  await connection();
  const [customers, subscriptions] = await Promise.all([
    listCustomers(),
    listSubscriptions(),
  ]);

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {customers.map((customer) => {
        const own = subscriptions.filter((s) => s.customerId === customer.id);
        return (
          <li key={customer.id}>
            <Link
              href={`/portal/${customer.id}`}
              className="block h-full rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <Card.Header>
                  <div className="flex items-center justify-between gap-2">
                    <Card.Title>{customer.displayName}</Card.Title>
                    <Chip
                      color={customer.tier === "pro" ? "accent" : "default"}
                      size="sm"
                      variant="soft"
                    >
                      {customer.tier === "pro" ? "Pro" : "Standard"}
                    </Chip>
                  </div>
                  <Card.Description>
                    {own.length === 1
                      ? "1 subscription"
                      : `${own.length} subscriptions`}
                  </Card.Description>
                </Card.Header>
                <Card.Content>
                  <ul className="flex flex-col gap-2 text-sm">
                    {own.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{subscriptionTitle(s)}</span>
                        <Chip
                          color={statusColor[s.status]}
                          size="sm"
                          variant="soft"
                        >
                          {s.status}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </Card.Content>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
