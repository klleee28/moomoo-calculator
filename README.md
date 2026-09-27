# Tradecraft trading calculator

A focused trading workspace with local calculations and an optional synced trade journal for planning US equity trades using the fee assumptions in the original Moomoo Malaysia calculator.

## Open the app

Open `index.html` in a modern browser to use the calculator without setup. For sign-in and a synced journal, configure the public Supabase settings, run `npm ci`, `npm run build`, then `npm run preview`. See [DEPLOYMENT.md](DEPLOYMENT.md) for the full Vercel and shared-Supabase setup.

## Workflow

1. **Trade planner:** Enter ticker, direction, entry and stop. Set account balance, risk budget, and target reward. Choose automatic sizing or a custom share count. Results update immediately.
2. **Outcomes:** Compare net profit/loss across exit levels, including the selected reward target. Expand the fee table to inspect each transaction leg.
3. **Review & copy:** Review the complete plan, add a trade thesis, and copy order parameters or a journal entry. Copying never places an order. `Alt+C` copies a valid plan when focus is outside an input.
4. **Trade journal:** Sign in to save plans and track planned, open, or closed trades across devices. Record actual fills, optional fees, entry reasons, and lessons; search/filter trades; view closed net P&L and win rate; export/import JSON backups.
5. **Broker settings:** Select promo or standard commission and enter a USD/MYR rate. These preferences apply across the workspace.

The current calculator inputs and preferences remain local to the browser. Journal records are saved separately to your signed-in Supabase account. **Reset plan** restores the example trade and risk inputs, clears draft notes, and keeps broker settings and saved journal records. Each journal entry retains its original plan independently of later calculator changes.

Entry reasons have quick-select buttons (Breakout, Pullback, Support bounce, Resistance rejection, Trend continuation, Reversal, Volume spike, and News catalyst) plus a custom field. Reasons appear in their own journal column and can be searched. Existing records without reasons remain compatible.

Actual journal fees are optional. Leaving the field blank stores an unknown actual fee and uses an estimate based on the saved broker settings and recorded fills. The record and aggregate P&L are labelled estimated, and win rate is provisional when any closed record uses estimates. Entering `0` explicitly means zero actual fees. Add actual fees later to finalize the result. Reasons, fractional quantities, and optional fees are included in JSON backups; no database migration is needed.

## Calculation scope

- Automatic sizing offers whole shares or fractional shares to four decimal places and includes both transaction legs' estimated fees in stop-loss risk. Cash requirements are checked separately; the cash-size button includes entry fees.
- Target profit is the risk budget multiplied by the selected reward ratio. Effective reward/risk uses the actual estimated stop loss, which can be lower than the budget because shares are rounded down.
- Custom planner quantities and journal quantities support fractional shares down to 0.0001. Fee estimates retain the existing schedule; fractional-order charges may differ from these assumptions.
- Breakeven and targets round toward the requested net profit, so the breakeven row can show a small positive amount.
- Short-side fee details correctly assign SEC and TAF to the entry sale. Unreachable positive-price short targets cannot be copied.
- Invalid or incomplete inputs clear dependent results and prevent copying. Custom sizes above budget remain explicitly flagged.
- The original fee rates are retained as assumptions; they have **not** been verified against current broker or regulatory schedules. Exchange rates and example stock prices are manually entered, not live quotes. Slippage, short borrow costs, financing, and broker-specific buying-power requirements are excluded.

## Development checks

Node.js is needed for building the configured cloud app and running tests:

```sh
npm ci
npm test
```

Browser checks use installed Microsoft Edge by default. Set `BROWSER_CHANNEL=chrome` to use installed Chrome instead. Tests cover the main workflow, clipboard output, input validation, short fee allocation, custom sizing and cash limits, persistence and reset, unavailable short targets, storage failures, and responsive layouts. Screenshots are written to the ignored `test-results/` directory.

The source calculator is in `index.html`. The build injects the public cloud settings and bundles the official Supabase client into `dist/index.html`. No development tests or database scripts are deployed. Browser journal tests simulate the Supabase API; database isolation is tested against the actual SQL in an in-memory PostgreSQL engine. A live sign-in/sync check still requires the deployed database and authentication settings.
