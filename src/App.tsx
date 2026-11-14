import { useEffect, useRef, useState } from "react";
import { cloudSession, hasCloudConfig } from "./cloud-session";
import { SubscriptionForm } from "./SubscriptionForm";
import type { NewSubscription, SubscriptionDetails } from "./subscriptions-api";
import {
  currencies,
  createDemoSubscriptions,
  daysBetween,
  formatDate,
  formatMoney,
  monthlyTotal,
  todayInManila,
  upcomingCharges,
  type Currency,
  type Subscription,
  type SubscriptionStatus,
} from "./subscriptions";

type Filter = "all" | SubscriptionStatus;

export function App() {
  if (cloudSession) return <CloudDashboard session={cloudSession} />;
  if (hasCloudConfig) {
    return (
      <CloudScreen
        title="Cloud configuration incomplete"
        message="Set all four public configuration values and reload."
      />
    );
  }
  return <Dashboard />;
}

function CloudScreen({
  title,
  message,
  action,
  secondary,
}: {
  title: string;
  message: string;
  action?: { label: string; run: () => void };
  secondary?: { label: string; run: () => void };
}) {
  return (
    <main className="main-content">
      <section className="panel empty-state">
        <h1>{title}</h1>
        <p className="mb-4" role="status">
          {message}
        </p>
        {action && (
          <button className="primary-button" onClick={action.run}>
            {action.label}
          </button>
        )}
        {secondary && (
          <button className="text-button ml-3" onClick={secondary.run}>
            {secondary.label}
          </button>
        )}
      </section>
    </main>
  );
}

function CloudDashboard({
  session,
}: {
  session: NonNullable<typeof cloudSession>;
}) {
  const [signedIn, setSignedIn] = useState<boolean>();
  const [records, setRecords] = useState<Subscription[]>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      try {
        const user = await session.initialize();
        if (signal.aborted) return;
        setSignedIn(Boolean(user));
        if (!user) return;
        const subscriptions = await session.api.list(signal);
        if (!signal.aborted) setRecords(subscriptions);
      } catch {
        if (!signal.aborted) {
          setError(
            "Could not open your subscriptions. Try again or sign in again.",
          );
        }
      }
    })();
    return () => controller.abort();
  }, [session, attempt]);

  function redirect(action: () => Promise<void>) {
    setRedirecting(true);
    setError("");
    void action().catch(() => {
      setRedirecting(false);
      setError("Could not connect to sign-in. Please try again.");
    });
  }

  if (redirecting)
    return (
      <CloudScreen title="Redirecting" message="Opening Amazon Cognito…" />
    );
  if (records)
    return (
      <Dashboard
        cloud={{
          records,
          create: session.api.create,
          update: session.api.update,
          signOut: () => redirect(session.signOut),
        }}
      />
    );
  if (signedIn && error) {
    return (
      <CloudScreen
        title="Could not load subscriptions"
        message={error}
        action={{
          label: "Try again",
          run: () => {
            setError("");
            setAttempt((value) => value + 1);
          },
        }}
        secondary={{ label: "Sign out", run: () => redirect(session.signOut) }}
      />
    );
  }
  if (signedIn === false || error) {
    return (
      <CloudScreen
        title="Renewal Tracker"
        message={error || "Sign in to view and manage your subscriptions."}
        action={{ label: "Sign in", run: () => redirect(session.signIn) }}
      />
    );
  }
  return (
    <CloudScreen
      title="Renewal Tracker"
      message="Loading your subscriptions…"
    />
  );
}

interface CloudDashboardData {
  records: Subscription[];
  create: (details: NewSubscription) => Promise<Subscription>;
  update: (id: string, details: SubscriptionDetails) => Promise<Subscription>;
  signOut: () => void;
}

function Dashboard({ cloud }: { cloud?: CloudDashboardData }) {
  const [today] = useState(() => todayInManila());
  const [subscriptions, setSubscriptions] = useState(
    () => cloud?.records ?? createDemoSubscriptions(today),
  );
  const [currency, setCurrency] = useState<Currency>("PHP");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<"create" | Subscription | null>(null);
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [notice, setNotice] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const formTrigger = useRef<HTMLButtonElement>(null);
  const monthly = monthlyTotal(subscriptions, currency);
  const upcoming = upcomingCharges(subscriptions, currency, today);
  const visible = subscriptions.filter(
    (item) =>
      (filter === "all" || item.status === filter) &&
      item.name.toLowerCase().includes(search.toLowerCase()),
  );
  const activeCount = subscriptions.filter(
    (item) => item.status === "active",
  ).length;
  const trialCount = subscriptions.filter(
    (item) => item.status === "trial",
  ).length;

  function closeForm() {
    setForm(null);
    (formTrigger.current ?? addButton.current)?.focus();
  }

  async function saveSubscription(details: SubscriptionDetails) {
    if (saveInFlight.current || !form) return;
    saveInFlight.current = true;
    setSaving(true);
    try {
      if (form === "create") {
        if (details.status === "cancelled")
          throw new Error("Choose Active or Free trial.");
        const subscription = cloud
          ? await cloud.create({ ...details, status: details.status })
          : { ...details, id: crypto.randomUUID() };
        setSubscriptions((items) => [...items, subscription]);
        setFilter("all");
        setSearch("");
        setNotice(`${subscription.name} added.`);
      } else {
        const subscription = cloud
          ? await cloud.update(form.id, details)
          : { ...details, id: form.id };
        setSubscriptions((items) =>
          items.map((item) =>
            item.id === subscription.id ? subscription : item,
          ),
        );
        setNotice(`${subscription.name} updated.`);
      }
      setForm(null);
    } finally {
      saveInFlight.current = false;
      setSaving(false);
      // Wait until React re-enables the button before restoring focus.
      requestAnimationFrame(() => {
        if (!document.getElementById("form-heading")) {
          const trigger = formTrigger.current;
          (trigger?.isConnected ? trigger : addButton.current)?.focus();
        }
      });
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a href="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            r
          </span>
          renewal<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#main" className="nav-link active">
            Overview
          </a>
          <a href="#subscriptions" className="nav-link">
            Subscriptions
          </a>
        </nav>
        {cloud ? (
          <button
            className="preview-pill"
            disabled={saving}
            onClick={cloud.signOut}
          >
            Sign out
          </button>
        ) : (
          <span className="preview-pill">
            <span aria-hidden="true" />
            Local preview
          </span>
        )}
      </header>

      <main id="main" className="main-content">
        <div className="page-heading">
          <h1>Subscription overview</h1>
          <button
            ref={addButton}
            className="primary-button"
            aria-expanded={form === "create"}
            disabled={saving}
            onClick={(event) => {
              if (form === "create") {
                closeForm();
                return;
              }
              formTrigger.current = event.currentTarget;
              setForm("create");
            }}
          >
            <span aria-hidden="true">＋</span> Add subscription
          </button>
        </div>

        {!cloud && (
          <div className="demo-note">
            <span className="note-symbol" aria-hidden="true">
              i
            </span>
            <p>
              <strong>Sample data.</strong> Changes reset when you reload.
            </p>
          </div>
        )}
        <p className="sr-only" role="status">
          {notice}
        </p>

        {form && (
          <SubscriptionForm
            key={form === "create" ? "create" : form.id}
            initial={form === "create" ? undefined : form}
            onSave={saveSubscription}
            onCancel={closeForm}
            saving={saving}
            demo={!cloud}
          />
        )}

        <div className="summary-heading">
          <h2>At a glance</h2>
          <label className="currency-label">
            Show totals in
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
            >
              {currencies.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <section className="stats-grid" aria-label="Subscription summary">
          <article className="stat-card featured">
            <p>Monthly equivalent</p>
            <strong>{formatMoney(monthly, currency)}</strong>
            <small>Active plans · yearly costs divided by 12</small>
          </article>
          <article className="stat-card">
            <p>Next 30 days</p>
            <strong>
              {formatMoney(
                upcoming.reduce((sum, item) => sum + item.amountMinor, 0),
                currency,
              )}
            </strong>
            <small>
              {upcoming.length} scheduled charges · includes trial conversions
            </small>
          </article>
          <article className="stat-card">
            <p>Active subscriptions</p>
            <strong>
              {activeCount}
              <span className="stat-unit"> plans</span>
            </strong>
            <small>Across all currencies · {trialCount} on trial</small>
          </article>
        </section>

        <div className="content-grid">
          <section
            id="subscriptions"
            className="panel subscription-panel"
            aria-labelledby="subscriptions-heading"
          >
            <div className="section-heading">
              <h2 id="subscriptions-heading">Your subscriptions</h2>
              <span className="count-label">{subscriptions.length} total</span>
            </div>
            <div className="list-controls">
              <div className="filters" aria-label="Filter subscriptions">
                {(["all", "active", "trial", "cancelled"] as const).map(
                  (value) => (
                    <button
                      key={value}
                      aria-pressed={filter === value}
                      className={filter === value ? "selected" : ""}
                      onClick={() => setFilter(value)}
                    >
                      {value === "all"
                        ? "All plans"
                        : value === "trial"
                          ? "Trials"
                          : value.charAt(0).toUpperCase() + value.slice(1)}
                    </button>
                  ),
                )}
              </div>
              <label className="search-label">
                <span className="sr-only">Search subscriptions</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search plans…"
                />
              </label>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Service</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Next charge</th>
                    <th scope="col">Status</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="service">
                          <span
                            className={`service-avatar ${item.category.toLowerCase()}`}
                            aria-hidden="true"
                          >
                            {item.name.slice(0, 1)}
                          </span>
                          <div>
                            <strong>{item.name}</strong>
                            <small>{item.category}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong className="amount">
                          {formatMoney(item.amountMinor, item.currency)}
                        </strong>
                        <small>
                          per {item.cycle === "monthly" ? "month" : "year"}
                        </small>
                      </td>
                      <td>
                        <span className="charge-date">
                          {formatDate(item.nextChargeDate)}
                        </span>
                        <small>
                          {item.status === "trial"
                            ? "Trial ends"
                            : item.status === "cancelled"
                              ? "Previous schedule"
                              : "Estimated"}
                        </small>
                      </td>
                      <td>
                        <span className={`status-badge ${item.status}`}>
                          {item.status === "trial"
                            ? "Trial"
                            : item.status === "active"
                              ? "Active"
                              : "Cancelled"}
                        </span>
                      </td>
                      <td>
                        <button
                          className="row-button"
                          aria-label={`Edit ${item.name}`}
                          disabled={saving}
                          onClick={(event) => {
                            formTrigger.current = event.currentTarget;
                            setForm(item);
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visible.length === 0 && (
              <div className="empty-state">
                <h3>No subscriptions here yet</h3>
                <p>Try another filter or add a subscription.</p>
              </div>
            )}
            <div className="table-footnote">
              Amounts use each plan’s currency. Totals group matching
              currencies.
            </div>
          </section>

          <aside
            className="panel upcoming-panel"
            aria-labelledby="upcoming-heading"
          >
            <div className="section-heading">
              <h2 id="upcoming-heading">Coming up</h2>
              <span className="count-label">{currency}</span>
            </div>
            <div className="upcoming-list">
              {upcoming.slice(0, 4).map((item) => (
                <div className="upcoming-item" key={item.id}>
                  <div className="date-tile">
                    <span>
                      {new Date(
                        `${item.nextChargeDate}T00:00:00Z`,
                      ).toLocaleDateString("en", {
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </span>
                    <strong>{item.nextChargeDate.slice(-2)}</strong>
                  </div>
                  <div className="upcoming-detail">
                    <strong>{item.name}</strong>
                    <small>
                      {item.status === "trial"
                        ? "Trial ends"
                        : `${daysBetween(today, item.nextChargeDate)} days away`}
                    </small>
                  </div>
                  <span className="upcoming-amount">
                    {formatMoney(item.amountMinor, currency)}
                  </span>
                </div>
              ))}
            </div>
            {upcoming.length === 0 && (
              <p className="aside-empty">
                No scheduled charges in {currency} in the next 30 days.
              </p>
            )}
          </aside>
        </div>
        <footer className="page-footer">
          <span>
            renewal. <span className="footer-divider">/</span> Subscription
            tracker
          </span>
          <span>Dates shown in Asia/Manila</span>
        </footer>
      </main>
    </div>
  );
}
