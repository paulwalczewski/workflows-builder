"use client";

import {
  Alert,
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import { useState, useTransition } from "react";
import { submitAction } from "@/app/portal/actions";
import { CAPABILITIES } from "@/catalogue/catalogue";
import { formatDate, subscriptionTitle } from "@/catalogue/format";
import { describePolicy, formatMoney, monthlySpend } from "@/domain/billing";
import { MAX_QUANTITY, type SubscriptionAction } from "@/domain/transitions";
import type { Product } from "@/domain/types";
import { GatedButton } from "./GatedButton";
import type { PortalRun } from "./types";

const statusColor = {
  active: "success",
  paused: "warning",
  canceled: "default",
  failed: "danger",
} as const;

const statusLabel = {
  active: "Active",
  paused: "Paused",
  canceled: "Canceled",
  failed: "Payment failed",
} as const;

interface Props {
  run: PortalRun;
  products: Product[];
  /** The simulated time, passed back to the server with every action. */
  simulatedNow: string | null;
  onExplain: () => void;
}

export function SubscriptionCard({
  run,
  products,
  simulatedNow,
  onExplain,
}: Props) {
  const { subscription, view } = run;
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [editingCard, setEditingCard] = useState(false);
  const [brand, setBrand] = useState("Visa");
  const [last4, setLast4] = useState("");
  const [productId, setProductId] = useState<string | null>(null);

  const act = (action: SubscriptionAction) =>
    startTransition(async () => {
      const outcome = await submitAction(
        subscription.id,
        action,
        simulatedNow ?? undefined,
      );
      setFeedback(
        outcome.ok
          ? { ok: true, text: outcome.message }
          : { ok: false, text: outcome.reason },
      );
      if (outcome.ok) {
        setEditingCard(false);
        setLast4("");
        setProductId(null);
      }
    });

  const sub = (capability: string) => view.capabilities[capability];
  const currency = subscription.currencyCode;
  const days = run.input.facts["subscription.daysUntilRenewal"];
  const addable = products.filter(
    (p) =>
      p.currencyCode === currency &&
      !subscription.items.some((i) => i.productId === p.id),
  );
  const addView = sub(CAPABILITIES.addItem);

  return (
    <Card>
      <Card.Header className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Card.Title className="text-lg">
            {subscriptionTitle(subscription)}
          </Card.Title>
          <Chip color={statusColor[subscription.status]} variant="soft">
            {statusLabel[subscription.status]}
          </Chip>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Meta label="Next billing">
            {subscription.nextBillingDate
              ? `${formatDate(subscription.nextBillingDate)}${typeof days === "number" ? ` (${days <= 0 ? "due" : `in ${days} day${days === 1 ? "" : "s"}`})` : ""}`
              : "Not scheduled"}
          </Meta>
          <Meta label="Billing">
            {describePolicy(subscription.billingPolicy)}
          </Meta>
          <Meta label="Cycles completed">{subscription.currentCycle}</Meta>
          <Meta label="Monthly spend">
            {formatMoney(monthlySpend(subscription), currency)}
          </Meta>
        </dl>
      </Card.Header>

      <Card.Content className="flex flex-col gap-5">
        {confirmingCancel ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-danger-soft p-2">
            <span className="text-sm text-danger-soft-foreground">
              Cancel this subscription? No further boxes will ship.
            </span>
            <Button
              variant="danger"
              size="sm"
              isPending={pending}
              onPress={() => {
                setConfirmingCancel(false);
                act({ capability: CAPABILITIES.cancel });
              }}
            >
              Yes, cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setConfirmingCancel(false)}
            >
              Keep subscription
            </Button>
          </div>
        ) : (
          <section
            aria-label="Subscription actions"
            className="flex flex-wrap items-center gap-2"
          >
            <GatedButton
              view={sub(CAPABILITIES.pause)}
              size="sm"
              variant="secondary"
              busy={pending}
              onPress={() => act({ capability: CAPABILITIES.pause })}
            >
              Pause
            </GatedButton>
            <GatedButton
              view={sub(CAPABILITIES.resume)}
              size="sm"
              variant="secondary"
              busy={pending}
              onPress={() => act({ capability: CAPABILITIES.resume })}
            >
              Resume
            </GatedButton>
            <GatedButton
              view={sub(CAPABILITIES.reactivate)}
              size="sm"
              variant="secondary"
              busy={pending}
              onPress={() => act({ capability: CAPABILITIES.reactivate })}
            >
              Reactivate
            </GatedButton>
            <GatedButton
              view={sub(CAPABILITIES.cancel)}
              size="sm"
              variant="danger-soft"
              busy={pending}
              onPress={() => setConfirmingCancel(true)}
            >
              Cancel subscription
            </GatedButton>
          </section>
        )}

        <section aria-label="Items" className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">Items</h3>
          <ul className="flex flex-col divide-y divide-separator rounded-2xl border border-separator">
            {subscription.items.map((item) => {
              const views = view.items[item.id] ?? {};
              const quantity = views[CAPABILITIES.updateQuantity];
              const max = Math.min(
                view.limits.maxQuantity[item.id] ?? MAX_QUANTITY,
                MAX_QUANTITY,
              );
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-sm text-muted">
                      {item.quantity} ×{" "}
                      {formatMoney(
                        Math.round(item.totalPrice / item.quantity),
                        currency,
                      )}{" "}
                      = {formatMoney(item.totalPrice, currency)} per cycle
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <GatedButton
                      view={quantity}
                      isIconOnly
                      size="sm"
                      variant="secondary"
                      aria-label={`Fewer ${item.title}`}
                      busy={pending}
                      localReason={
                        item.quantity <= 1
                          ? "Remove the item instead of going below 1."
                          : null
                      }
                      onPress={() =>
                        act({
                          capability: CAPABILITIES.updateQuantity,
                          itemId: item.id,
                          quantity: item.quantity - 1,
                        })
                      }
                    >
                      −
                    </GatedButton>
                    {quantity && quantity.availability !== "hidden" && (
                      <span className="w-7 text-center tabular-nums">
                        {item.quantity}
                      </span>
                    )}
                    <GatedButton
                      view={quantity}
                      isIconOnly
                      size="sm"
                      variant="secondary"
                      aria-label={`More ${item.title}`}
                      busy={pending}
                      localReason={
                        item.quantity >= max ? `Up to ${max} per item.` : null
                      }
                      onPress={() =>
                        act({
                          capability: CAPABILITIES.updateQuantity,
                          itemId: item.id,
                          quantity: item.quantity + 1,
                        })
                      }
                    >
                      +
                    </GatedButton>
                    <GatedButton
                      view={views[CAPABILITIES.removeItem]}
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${item.title}`}
                      busy={pending}
                      onPress={() =>
                        act({
                          capability: CAPABILITIES.removeItem,
                          itemId: item.id,
                        })
                      }
                    >
                      Remove
                    </GatedButton>
                  </div>
                </li>
              );
            })}
          </ul>

          {addView && addView.availability !== "hidden" && (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                className="w-64"
                aria-label="Product to add"
                placeholder="Add a product"
                isDisabled={addView.availability !== "enabled"}
                value={productId}
                onChange={(value) => setProductId(value ? String(value) : null)}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {addable.map((p) => (
                      <ListBox.Item key={p.id} id={p.id} textValue={p.title}>
                        {p.title} ({formatMoney(p.unitPrice, currency)})
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <GatedButton
                view={addView}
                size="sm"
                variant="secondary"
                busy={pending}
                localReason={productId ? null : "Choose a product first."}
                onPress={() =>
                  productId &&
                  act({ capability: CAPABILITIES.addItem, productId })
                }
              >
                Add item
              </GatedButton>
            </div>
          )}
        </section>

        <section aria-label="Payment method" className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">Payment method</h3>
          {editingCard ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                act({ capability: CAPABILITIES.updatePayment, brand, last4 });
              }}
            >
              <Select
                className="w-36"
                value={brand}
                onChange={(value) => setBrand(String(value))}
              >
                <Label>Card brand</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {["Visa", "Mastercard", "Amex"].map((b) => (
                      <ListBox.Item key={b} id={b} textValue={b}>
                        {b}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <TextField
                className="w-32"
                value={last4}
                onChange={setLast4}
                inputMode="numeric"
                maxLength={4}
              >
                <Label>Last 4 digits</Label>
                <Input placeholder="1234" />
              </TextField>
              <Button
                type="submit"
                size="sm"
                variant="primary"
                isPending={pending}
              >
                Save card
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onPress={() => setEditingCard(false)}
              >
                Keep current card
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-medium">
                {subscription.paymentMethod.brand} ending{" "}
                {subscription.paymentMethod.last4}
              </span>
              <GatedButton
                view={sub(CAPABILITIES.updatePayment)}
                size="sm"
                variant={
                  subscription.status === "failed" ? "primary" : "secondary"
                }
                busy={pending}
                onPress={() => setEditingCard(true)}
              >
                Update payment method
              </GatedButton>
            </div>
          )}
        </section>

        <output aria-live="polite" className="block">
          {feedback && (
            <Alert status={feedback.ok ? "success" : "danger"}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{feedback.text}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </output>
      </Card.Content>

      <Card.Footer className="flex justify-end">
        <Button variant="tertiary" size="sm" onPress={onExplain}>
          Why can I do this?
        </Button>
      </Card.Footer>
    </Card>
  );
}

function Meta({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
