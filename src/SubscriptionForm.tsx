import { useState, type FormEvent } from "react";
import {
  currencies,
  todayInManila,
  type Currency,
  type BillingCycle,
  type Subscription,
  type SubscriptionStatus,
} from "./subscriptions";
import type { SubscriptionDetails } from "./subscriptions-api";
import { parseAmountMinor } from "./subscription-amount";

const categories = [
  "Entertainment",
  "Productivity",
  "Design",
  "Storage",
  "Development",
  "Other",
];

interface Props {
  initial?: Subscription;
  onSave: (subscription: SubscriptionDetails) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  demo: boolean;
}

export function SubscriptionForm({
  initial,
  onSave,
  onCancel,
  saving,
  demo,
}: Props) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState<SubscriptionStatus>(
    initial?.status ?? "active",
  );
  const categoryOptions =
    initial && !categories.includes(initial.category)
      ? [...categories, initial.category]
      : categories;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    const amountMinor = parseAmountMinor(String(data.get("amount") ?? ""));
    if (!name) {
      setError("Enter a service name.");
      return;
    }
    if (amountMinor === null) {
      setError(
        "Enter an amount from 0 to 99,999,999 with up to two decimal places.",
      );
      return;
    }
    setError("");
    try {
      await onSave({
        name,
        amountMinor,
        currency: data.get("currency") as Currency,
        cycle: data.get("cycle") as BillingCycle,
        nextChargeDate: String(data.get("nextChargeDate")),
        category: String(data.get("category")),
        status,
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save. Please try again.",
      );
    }
  }

  return (
    <section className="panel form-panel" aria-labelledby="form-heading">
      <div className="section-heading">
        <h2 id="form-heading">
          {initial ? `Edit ${initial.name}` : "Add a subscription"}
        </h2>
        <button
          className="text-button"
          type="button"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
      <form onSubmit={submit} className="subscription-form">
        <label>
          Service name
          <input
            name="name"
            defaultValue={initial?.name}
            maxLength={80}
            placeholder="e.g. YouTube Premium"
            required
            autoFocus
          />
        </label>
        <label>
          Category
          <select name="category" defaultValue={initial?.category}>
            {categoryOptions.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          Amount per billing cycle
          <input
            name="amount"
            defaultValue={
              initial ? (initial.amountMinor / 100).toFixed(2) : undefined
            }
            type="number"
            min="0"
            max="99999999"
            step="0.01"
            placeholder="0.00"
            required
          />
        </label>
        <label>
          Currency
          <select name="currency" defaultValue={initial?.currency}>
            {currencies.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </label>
        <label>
          Billing cycle
          <select name="cycle" defaultValue={initial?.cycle}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label>
          <span id="billing-date-label">
            {status === "trial" ? "Trial end date" : "Billing date"}
          </span>
          <input
            name="nextChargeDate"
            type="date"
            aria-labelledby="billing-date-label"
            aria-describedby="billing-date-hint"
            defaultValue={initial?.nextChargeDate ?? todayInManila()}
            min="2000-01-01"
            max="2100-12-31"
            required
          />
          <small id="billing-date-hint">
            {status === "trial"
              ? "The estimated first charge if the trial converts."
              : "Recurring estimates use this date as the start of the schedule."}
          </small>
        </label>
        <label>
          Status
          <select
            name="status"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as SubscriptionStatus)
            }
          >
            <option value="active">Active</option>
            <option value="trial">Free trial</option>
            {initial && <option value="cancelled">Cancelled</option>}
          </select>
        </label>
        <div className="form-submit">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving
              ? "Saving…"
              : initial
                ? "Save changes"
                : demo
                  ? "Add to preview"
                  : "Save subscription"}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
