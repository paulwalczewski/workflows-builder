import { Card } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import Link from "next/link";

const entries = [
  {
    href: "/portal",
    title: "Customer portal",
    description:
      "Open a customer's subscriptions. The published workflow decides what they can do, and the debug panel shows why.",
    cta: "Open portal",
  },
  {
    href: "/builder",
    title: "Workflow builder",
    description:
      "Author the ordered rules that grant and deny capabilities, with a live preview against any customer.",
    cta: "Open builder",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Subscription Workflows
        </h1>
        <p className="text-muted">
          Merchants write rules. Customers can do exactly what those rules
          allow.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {entries.map((entry) => (
          <Card key={entry.href}>
            <Card.Header>
              <Card.Title>{entry.title}</Card.Title>
              <Card.Description>{entry.description}</Card.Description>
            </Card.Header>
            <Card.Footer>
              <Link
                href={entry.href}
                className={buttonVariants({ variant: "primary" })}
              >
                {entry.cta}
              </Link>
            </Card.Footer>
          </Card>
        ))}
      </div>
    </div>
  );
}
