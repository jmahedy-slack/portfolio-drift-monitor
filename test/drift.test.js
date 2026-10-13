import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  BAND_AMBER_THRESHOLD,
  BAND_RED_THRESHOLD,
  bandUtilisation,
  driftStatus,
  estimateTransactionCost,
  proposeTrades,
  proposalForMandate,
  tradesNetToZero,
  tradesToCsv,
} from "../src/engine/drift.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const mandates = JSON.parse(readFileSync(join(__dirname, "../src/data/mandates.json"), "utf8"));

const westbrook = mandates.mandates.find((m) => m.id === "westbrook-pension-balanced");

describe("band utilisation boundaries (75% and 100%)", () => {
  it("is green at exactly 75% utilisation", () => {
    const current = 0.35 + 0.04 * BAND_AMBER_THRESHOLD;
    assert.ok(Math.abs(bandUtilisation(current, 0.35, 0.04) - BAND_AMBER_THRESHOLD) < 1e-9);
    assert.equal(driftStatus(current, 0.35, 0.04), "green");
  });

  it("is amber just above 75% utilisation", () => {
    assert.equal(driftStatus(0.35 + 0.04 * BAND_AMBER_THRESHOLD + 1e-6, 0.35, 0.04), "amber");
  });

  it("is amber just below 100% utilisation", () => {
    assert.equal(driftStatus(0.3899, 0.35, 0.04), "amber");
  });

  it("is red at exactly 100% utilisation", () => {
    const current = 0.35 + 0.04 * BAND_RED_THRESHOLD;
    assert.ok(Math.abs(bandUtilisation(current, 0.35, 0.04) - BAND_RED_THRESHOLD) < 1e-12);
    assert.equal(driftStatus(current, 0.35, 0.04), "red");
  });

  it("is red beyond 100% utilisation", () => {
    assert.equal(driftStatus(0.392, 0.35, 0.04), "red");
  });
});

describe("Westbrook Pension Fund — Balanced acceptance", () => {
  it("shows mandate status red and expected rebalance trades", () => {
    const { analysis, trades } = proposalForMandate(westbrook);

    assert.equal(analysis.status, "red");
    assert.equal(tradesNetToZero(trades), true);

    const byName = Object.fromEntries(trades.map((t) => [t.assetClassName, t]));

    assert.equal(byName["Global Equity"].side, "Sell");
    assert.equal(byName["Global Equity"].notional, -10_500_000);

    assert.equal(byName["Fixed Income"].side, "Buy");
    assert.equal(byName["Fixed Income"].notional, 7_250_000);

    assert.equal(byName["Real Assets"].side, "Buy");
    assert.equal(byName["Real Assets"].notional, 1_500_000);

    assert.equal(byName["Cash"].side, "Buy");
    assert.equal(byName["Cash"].notional, 1_750_000);
  });

  it("estimates total transaction cost at £25,125", () => {
    const { totalEstimatedCost } = proposalForMandate(westbrook);
    assert.equal(totalEstimatedCost, 25_125);
  });

  it("exports dealing-desk CSV with trade lines", () => {
    const { trades, totalEstimatedCost } = proposalForMandate(westbrook);
    const csv = tradesToCsv(westbrook.name, trades, mandates.valuationDate, totalEstimatedCost);
    assert.match(csv, /"Global Equity",Sell,10500000\.00/);
    assert.match(csv, /"Fixed Income",Buy,7250000\.00/);
    assert.match(csv, /TOTAL.*25125\.00/);
  });
});

describe("proposeTrades", () => {
  it("nets buys and sells to zero for Westbrook", () => {
    const trades = proposeTrades(westbrook);
    const net = trades.reduce((s, t) => s + t.notional, 0);
    assert.equal(net, 0);
  });
});

describe("estimateTransactionCost", () => {
  it("scales with aggregated trade notional", () => {
    const trades = proposeTrades(westbrook);
    const totalNotional = trades.reduce((s, t) => s + Math.abs(t.notional), 0);
    assert.equal(totalNotional, 21_000_000);
    assert.equal(estimateTransactionCost(trades), 25_125);
  });
});
