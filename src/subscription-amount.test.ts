import assert from "node:assert/strict";
import { it } from "node:test";
import { parseAmountMinor } from "./subscription-amount";

it("converts decimal prices into exact minor units including the supported maximum", () => {
  for (const [input, expected] of [
    ["0", 0],
    ["0.01", 1],
    ["0.29", 29],
    ["1.10", 110],
    ["19.99", 1999],
    [".5", 50],
    ["12.", 1200],
    [" 001.05 ", 105],
    ["99999999", 9_999_999_900],
  ] as const)
    assert.equal(parseAmountMinor(input), expected, input);
});

it("rejects missing, negative, fractional-cent, exponent, non-finite, and oversized prices", () => {
  for (const input of [
    "",
    " ",
    "-0.01",
    "-0",
    "+1",
    ".",
    "1.005",
    "0.001",
    "1e2",
    "NaN",
    "Infinity",
    "1,000",
    "1.2.3",
    "99999999.01",
    "100000000",
    "9007199254740991",
    "9".repeat(400),
  ]) {
    assert.equal(parseAmountMinor(input), null, input);
  }
});
