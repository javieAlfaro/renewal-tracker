// Parse decimal digits directly so saved cents never depend on float rounding.
export function parseAmountMinor(value: string): number | null {
  const amount = value.trim();
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(amount)) return null;
  const [whole, fraction = ""] = amount.split(".");
  const minor = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor <= 9_999_999_900 ? minor : null;
}
