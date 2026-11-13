import { useState, type FormEvent } from "react";
import {
  currencies,
  todayInManila,
  type Currency,
  type BillingCycle,
} from "./subscriptions";
import type { NewSubscription } from "./subscriptions-api";

interface Props {
  onSave: (subscription: NewSubscription) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  demo: boolean;
}

export function SubscriptionForm({ onSave, onCancel, saving, demo }: Props) {
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    const amountMinor = Math.round(Number(data.get("amount")) * 100);
    if (!name || !Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      setError("Enter a name and a valid amount.");
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
        status: data.get("status") === "trial" ? "trial" : "active",
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
        <h2 id="form-heading">Add a subscription</h2>
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
            maxLength={80}
            placeholder="e.g. YouTube Premium"
            required
            autoFocus
          />
        </label>
        <label>
          Category
          <select name="category">
            <option>Entertainment</option>
            <option>Productivity</option>
            <option>Design</option>
            <option>Storage</option>
            <option>Development</option>
            <option>Other</option>
          </select>
        </label>
        <label>
          Amount per billing cycle
          <input
            name="amount"
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
          <select name="currency">
            {currencies.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </select>
        </label>
        <label>
          Billing cycle
          <select name="cycle">
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <label>
          Next charge / trial end
          <input
            name="nextChargeDate"
            type="date"
            defaultValue={todayInManila()}
            min="2000-01-01"
            max="2100-12-31"
            required
          />
        </label>
        <label>
          Status
          <select name="status">
            <option value="active">Active</option>
            <option value="trial">Free trial</option>
          </select>
        </label>
        <div className="form-submit">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : demo ? "Add to preview" : "Save subscription"}
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
