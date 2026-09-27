# Tradecraft trading calculator

A focused, offline trading workspace for planning US equity trades using the fee assumptions in the original Moomoo Malaysia calculator.

## Open the app

Open `index.html` in a modern browser. No install, build step, API key, or network request is needed by the app. For a local web preview, run `python -m http.server 8080 --bind 127.0.0.1` and visit `http://127.0.0.1:8080`.

## Workflow

1. **Trade planner:** Enter ticker, direction, entry and stop. Set account balance, risk budget, and target reward. Choose automatic sizing or a custom share count. Results update immediately.
2. **Outcomes:** Compare net profit/loss across exit levels, including the selected reward target. Expand the fee table to inspect each transaction leg.
3. **Review & copy:** Review the complete plan, add a trade thesis, and copy order parameters or a journal entry. Copying never places an order. `Alt+C` copies a valid plan when focus is outside an input.
4. **Broker settings:** Select promo or standard commission and enter a USD/MYR rate. These preferences apply across the workspace.

The current plan, notes, and preferences are stored only in this browser's local storage. **Reset plan** restores the example trade and risk inputs, clears notes, and keeps broker settings. This is a planning calculator, not a persistent trade-history journal; copy entries to your own journal before resetting.

## Calculation scope

- Automatic whole-share sizing includes both transaction legs' estimated fees in stop-loss risk. Cash requirements are checked separately; the cash-size button includes entry fees.
- Target profit is the risk budget multiplied by the selected reward ratio. Effective reward/risk uses the actual estimated stop loss, which can be lower than the budget because shares are rounded down.
- Breakeven and targets round toward the requested net profit, so the breakeven row can show a small positive amount.
- Short-side fee details correctly assign SEC and TAF to the entry sale. Unreachable positive-price short targets cannot be copied.
- Invalid or incomplete inputs clear dependent results and prevent copying. Custom sizes above budget remain explicitly flagged.
- The original fee rates are retained as assumptions; they have **not** been verified against current broker or regulatory schedules. Exchange rates and example stock prices are manually entered, not live quotes. Slippage, short borrow costs, financing, and broker-specific buying-power requirements are excluded.

## Development checks

Node.js is needed only for development:

```sh
npm ci
npm test
```

Browser checks use installed Microsoft Edge by default. Set `BROWSER_CHANNEL=chrome` to use installed Chrome instead. Tests cover the main workflow, clipboard output, input validation, short fee allocation, custom sizing and cash limits, persistence and reset, unavailable short targets, storage failures, and responsive layouts. Screenshots are written to the ignored `test-results/` directory.

The application remains self-contained in `index.html`; development packages are not loaded by the app.
