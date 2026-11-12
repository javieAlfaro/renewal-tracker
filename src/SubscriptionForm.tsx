import { useState, type FormEvent } from "react";
import {
  currencies,
  todayInManila,
  type Subscription,
  type Currency,
  type BillingCycle,
  type SubscriptionStatus,
} from "./subscriptions";

interface Props {
  onSave: (subscription: Subscription) => void;
  onCancel: () => void;
}

export function SubscriptionForm({ onSave, onCancel }: Props) {
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name")).trim();
    const amountMinor = Math.round(Number(data.get("amount")) * 100);
    if (!name || !Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      setError("Enter a name and a valid amount.");
      return;
    }
    onSave({
      id: crypto.randomUUID(),
      name,
      amountMinor,
      currency: data.get("currency") as Currency,
      cycle: data.get("cycle") as BillingCycle,
      nextChargeDate: String(data.get("nextChargeDate")),
      category: String(data.get("category")),
      status: data.get("status") as SubscriptionStatus,
    });
  }

  return (
    <section className="panel form-panel" aria-labelledby="form-heading">
      <div className="section-heading">
        <h2 id="form-heading">Add a subscription</h2>
        <button className="text-button" type="button" onClick={onCancel}>
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
          <button className="primary-button" type="submit">
            Add to preview
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
