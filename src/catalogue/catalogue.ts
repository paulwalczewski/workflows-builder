import {
  type Catalogue,
  capabilityLabel as engineCapabilityLabel,
  limitLabel as engineLimitLabel,
  factDef,
} from "@wb/workflow-engine";

/**
 * What this product offers the workflow builder and runtime. Plain data, safe
 * to send to the browser. The subscription is the engine's "subject" and each
 * subscription item is a "child".
 */
export const TRIGGER_SUBSCRIPTION_OPENED = "subscription.opened";

export const CAPABILITIES = {
  cancel: "subscription.cancel",
  pause: "subscription.pause",
  resume: "subscription.resume",
  reactivate: "subscription.reactivate",
  addItem: "item.add",
  removeItem: "item.remove",
  updateQuantity: "item.updateQuantity",
  updatePayment: "payment.update",
} as const;

export type CapabilityId = (typeof CAPABILITIES)[keyof typeof CAPABILITIES];

export const LIMITS = {
  maxItems: "subscription.maxItems",
  maxQuantity: "item.maxQuantity",
} as const;

export const subscriptionCatalogue: Catalogue = {
  triggers: [
    { id: TRIGGER_SUBSCRIPTION_OPENED, label: "Customer opens a subscription" },
  ],
  facts: [
    {
      id: "customer.tier",
      label: "Customer tier",
      scope: "subject",
      type: "enum",
      options: [
        { value: "standard", label: "Standard" },
        { value: "pro", label: "Pro" },
      ],
    },
    {
      id: "subscription.status",
      label: "Subscription status",
      scope: "subject",
      type: "enum",
      options: [
        { value: "active", label: "Active" },
        { value: "paused", label: "Paused" },
        { value: "canceled", label: "Canceled" },
        { value: "failed", label: "Payment failed" },
      ],
    },
    {
      id: "subscription.currentCycle",
      label: "Completed billing cycles",
      scope: "subject",
      type: "number",
      unit: "cycles",
    },
    {
      id: "subscription.monthlySpend",
      label: "Monthly spend",
      scope: "subject",
      type: "number",
      unit: "per month, in the subscription's currency",
      scale: 100,
      description:
        "Item prices per cycle, converted to one month using the billing policy.",
    },
    {
      id: "subscription.daysUntilRenewal",
      label: "Days until renewal",
      scope: "subject",
      type: "number",
      unit: "days",
      description:
        "Whole days until the next billing, rounded up. Missing when nothing is scheduled.",
    },
    {
      id: "subscription.itemCount",
      label: "Number of items",
      scope: "subject",
      type: "number",
      unit: "items",
    },
    {
      id: "subscription.billingInterval",
      label: "Billing interval",
      scope: "subject",
      type: "enum",
      options: [
        { value: "day", label: "Daily" },
        { value: "week", label: "Weekly" },
        { value: "month", label: "Monthly" },
        { value: "year", label: "Yearly" },
      ],
    },
    {
      id: "item.quantity",
      label: "Item quantity",
      scope: "child",
      type: "number",
      unit: "units",
    },
    {
      id: "item.unitPrice",
      label: "Item unit price",
      scope: "child",
      type: "number",
      unit: "in the subscription's currency",
      scale: 100,
    },
    {
      id: "item.totalPrice",
      label: "Item price per cycle",
      scope: "child",
      type: "number",
      unit: "in the subscription's currency",
      scale: 100,
    },
  ],
  capabilities: [
    {
      id: CAPABILITIES.cancel,
      label: "Cancel subscription",
      subject: "subject",
    },
    { id: CAPABILITIES.pause, label: "Pause subscription", subject: "subject" },
    {
      id: CAPABILITIES.resume,
      label: "Resume subscription",
      subject: "subject",
    },
    {
      id: CAPABILITIES.reactivate,
      label: "Reactivate subscription",
      subject: "subject",
    },
    { id: CAPABILITIES.addItem, label: "Add item", subject: "subject" },
    {
      id: CAPABILITIES.updatePayment,
      label: "Update payment method",
      subject: "subject",
    },
    { id: CAPABILITIES.removeItem, label: "Remove item", subject: "child" },
    {
      id: CAPABILITIES.updateQuantity,
      label: "Change item quantity",
      subject: "child",
    },
  ],
  limits: [
    { id: LIMITS.maxItems, label: "Maximum items", subject: "subject" },
    {
      id: LIMITS.maxQuantity,
      label: "Maximum quantity per item",
      subject: "child",
    },
  ],
  terms: { subject: "subscription", child: "item" },
  effects: [
    { type: "capability.allow", label: "Allow" },
    { type: "capability.deny", label: "Deny, with a reason" },
    { type: "limit.set", label: "Set a limit" },
  ],
};

export const capabilityLabel = (id: string) =>
  engineCapabilityLabel(subscriptionCatalogue, id);

export const limitLabel = (id: string) =>
  engineLimitLabel(subscriptionCatalogue, id);

export const factLabel = (id: string) =>
  factDef(subscriptionCatalogue, id)?.label ?? id;
