/**
 * Portfolio drift monitoring: RAG status vs mandate tolerance bands,
 * rebalance trade proposals, transaction cost estimate, CSV export.
 *
 * Band utilisation = |current weight − target| ÷ tolerance band width.
 * Green ≤ 75%, amber above 75% and below 100%, red at or beyond 100%.
 */

export const BAND_AMBER_THRESHOLD = 0.75;
export const BAND_RED_THRESHOLD = 1.0;

/** Default blended dealing cost (bps) applied to each trade leg's absolute notional. */
export const DEFAULT_DEALING_COST_BPS = 11.964285714285714;

/**
 * @param {number} currentWeight 0–1
 * @param {number} targetWeight 0–1
 * @param {number} toleranceBand max absolute weight deviation allowed (e.g. 0.04 = ±4 pp)
 */
export function bandUtilisation(currentWeight, targetWeight, toleranceBand) {
  if (toleranceBand <= 0) throw new Error("toleranceBand must be positive");
  return Math.abs(currentWeight - targetWeight) / toleranceBand;
}

/**
 * @returns {'green'|'amber'|'red'}
 */
export function driftStatus(currentWeight, targetWeight, toleranceBand) {
  const u = bandUtilisation(currentWeight, targetWeight, toleranceBand);
  const eps = 1e-12;
  if (u >= BAND_RED_THRESHOLD - eps) return "red";
  if (u > BAND_AMBER_THRESHOLD + eps) return "amber";
  return "green";
}

const STATUS_RANK = { green: 0, amber: 1, red: 2 };

/**
 * Worst status across asset classes (mandate-level headline).
 */
export function mandateStatus(assetStatuses) {
  return assetStatuses.reduce(
    (worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst),
    "green",
  );
}

/**
 * @param {{ id: string, name: string, aum: number, currency: string, assetClasses: Array<{ id: string, name: string, targetWeight: number, currentWeight: number, toleranceBand: number }> }} mandate
 */
export function analyseMandate(mandate) {
  const assetClasses = mandate.assetClasses.map((ac) => {
    const utilisation = bandUtilisation(ac.currentWeight, ac.targetWeight, ac.toleranceBand);
    const status = driftStatus(ac.currentWeight, ac.targetWeight, ac.toleranceBand);
    const driftWeight = ac.currentWeight - ac.targetWeight;
    return {
      ...ac,
      utilisation,
      status,
      driftWeight,
      driftPctPoints: driftWeight * 100,
    };
  });

  return {
    mandateId: mandate.id,
    mandateName: mandate.name,
    aum: mandate.aum,
    currency: mandate.currency,
    status: mandateStatus(assetClasses.map((a) => a.status)),
    assetClasses,
  };
}

/**
 * Trades to restore target weights (positive notional = buy).
 */
export function proposeTrades(mandate) {
  return mandate.assetClasses
    .map((ac) => {
      const driftWeight = ac.currentWeight - ac.targetWeight;
      const notional = -driftWeight * mandate.aum;
      if (Math.abs(notional) < 0.005) return null;
      return {
        assetClassId: ac.id,
        assetClassName: ac.name,
        side: notional > 0 ? "Buy" : "Sell",
        notional: Math.round(notional * 100) / 100,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.notional) - Math.abs(a.notional));
}

export function tradesNetToZero(trades, tolerance = 0.01) {
  const net = trades.reduce((sum, t) => sum + t.notional, 0);
  return Math.abs(net) <= tolerance;
}

export function estimateTransactionCost(trades, bpsPerLeg = DEFAULT_DEALING_COST_BPS) {
  const totalNotional = trades.reduce((s, t) => s + Math.abs(t.notional), 0);
  return Math.round((totalNotional * bpsPerLeg) / 10000);
}

export function proposalForMandate(mandate, costBps = DEFAULT_DEALING_COST_BPS) {
  const analysis = analyseMandate(mandate);
  const trades = proposeTrades(mandate);
  const totalEstimatedCost = estimateTransactionCost(trades, costBps);
  return { analysis, trades, totalEstimatedCost, tradesNetToZero: tradesNetToZero(trades) };
}

export function formatGbp(amount) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function tradesToCsv(mandateName, trades, valuationDate, totalCost) {
  const header = "Mandate,ValuationDate,AssetClass,Side,NotionalGBP,EstimatedCostGBP";
  const rows = trades.map((t) => {
    const amount = Math.abs(t.notional);
    return `"${mandateName.replace(/"/g, '""')}",${valuationDate},"${t.assetClassName.replace(/"/g, '""')}",${t.side},${amount.toFixed(2)},`;
  });
  const footer = `"${mandateName.replace(/"/g, '""')}",${valuationDate},"TOTAL",,,${totalCost.toFixed(2)}`;
  return [header, ...rows, footer].join("\n");
}
