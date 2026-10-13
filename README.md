# Portfolio Drift Monitor

Daily dashboard for portfolio managers and investment risk: mandate asset allocation vs target weights and tolerance bands, RAG status per asset class, proposed rebalancing trades with estimated transaction cost, and CSV export for the dealing desk.

## Run tests

```bash
npm test
```

## Preview

Open `Homepage.html` in a browser (embedded mandate data). Westbrook Pension Fund — Balanced (£250m) opens by default with red mandate status and the acceptance trade proposal.

## Engine

Core logic lives in `src/engine/drift.js`:

- Band utilisation = |current − target| ÷ tolerance band width
- Green ≤ 75%, amber above 75% and below 100%, red at or beyond 100%
- Transaction cost: blended **11.964286 bps** on each trade leg’s absolute notional (sums to £25,125 for the Westbrook fixture)
