# SpendWise

A personal + work money tracker covering spending, income, savings goals, investments and net worth in one place. It runs on your own computer and works offline. Optionally, it syncs to your own Supabase project for backup and use across devices.

## Run it

- **Windows:** double-click `Start SpendWise.bat`. It opens http://localhost:5173.
- **Any OS:** `npm start` (or `node server.js`), then open http://localhost:5173.

Requires Node.js 18+ and has no dependencies to install. Opening `index.html` directly also works, but voice input then asks for mic permission every time, and links are saved without their page contents being read.

To try it out: **Settings → Load sample data** (or the button on the empty dashboard) loads about 6 months of realistic personal and work activity.

## Ways to add money movement

| Method | What happens |
|---|---|
| **Speak** (mic button, or press `V`) | Chrome/Edge speech recognition, set to Indian English by default (Hindi, Tamil, Telugu, etc. in Settings). Say *"spent 450 on groceries at DMart yesterday and 1200 for client lunch at Taj for work"*: it becomes two entries with amount, date, payee, category, workspace and payment method filled in. |
| **Type** (`N`) | Same natural-language parser. It understands `2k`, `1.5 lakh`, spoken numbers ("two thousand five hundred"), "yesterday", "last friday", "on 3 sep", `dd/mm/yyyy`, UPI/card/cash, "for work", "reimbursable". |
| **Form** | Classic manual form. The payee autocompletes and fills in the category you used last time. |
| **Upload** | **Bank CSV** (auto-detects date / narration / debit / credit / amount columns and cleans `UPI/DR/…/SWIGGY/…` into "Swiggy"). **Receipt photo** (reads the text in the image with Tesseract OCR, then finds the grand total, date and merchant). **PDF** invoice or statement (reads the text with pdf.js; a statement becomes one row per line). **JSON** backup restore. |
| **Link / paste** | `upi://pay?...` links are read directly. Web receipt or order links are saved as documents, and the server reads the page to find the total. You can also paste bank SMS alerts or statement text. |

Every method shows a **review step** before saving. Possible duplicates (same date, amount and type) are flagged. When you save, SpendWise learns payee → category rules, so it gets more accurate over time.

## What you can see

- **Dashboard.** KPIs (spent, income, net saved and savings rate, invested and saved, net worth) with change vs. the previous period, a daily spend chart split into personal and work, auto-generated insights, top categories, top payees, budgets, upcoming bills, and recent activity.
- **Global filters** on every analytics page: *All / Personal / Work* and a date range (7d, 30d, this month, last month, 90d, YTD, 12m, all, custom).
- **Drill-down everywhere.** Click any bar, day, category or payee to open the matching transactions.
- **Analytics tabs**
  - **Daily:** spending calendar heatmap, daily bars, average by weekday, no-spend days, month-end forecast, cumulative spend.
  - **Categories:** ranking, needs vs. wants, 12-month trend for any category, a breakdown table with change vs. the previous period, income sources, investment mix.
  - **Payees:** who you pay, sortable by amount, frequency or average size, plus a searchable table.
  - **Trends:** income vs. spending by month, where each month's money went (spent / invested / saved), cumulative cash flow, personal vs. work, payment methods, emergency-fund target.
  - **Work & claims:** work spend, pending reimbursements (mark them reimbursed in bulk, export a claim sheet), out-of-pocket costs.
  - **Recurring:** automatically detected subscriptions and bills, with monthly and yearly cost, next due date, and payments that seem to have stopped.
- **Transactions.** Search plus filters (type, category, payee, method, amount, claim status, has-document), sorting, bulk re-categorize / move workspace / mark reimbursed / delete with undo, CSV export.
- **Bills & EMIs**
  - **Upcoming:** overdue items to confirm, everything due this week / next 30 days / later with ✓ Paid and Skip buttons, a 60-day chart by week, and browser reminders (1, 3 or 7 days before).
  - **Subscriptions:** amount, billing cycle (weekly to yearly) and next renewal date. A usage rating (use often / sometimes / rarely) shows how much a year you could reclaim. Pause or cancel, with a running "saved by cancelling" total and a cancel link per service. Subscriptions detected in your transactions are offered with a one-click **Track** button.
  - **EMIs & loans:** principal, rate, tenure and first EMI date. The EMI is calculated for you and matches bank figures. Each loan shows its **next due date**, EMI n of N, outstanding principal, interest paid and left, and end date. There's a full repayment schedule, a **prepayment calculator** (interest and months saved), a **debt-free date**, and the outstanding balance can appear as a liability in Wealth automatically.
  - **Auto-linking:** when you log a payment that looks like a known subscription or EMI (for example, saying "Netflix 649 by card"), it's linked automatically and the next due date moves forward.
- **Financial health.** A 0–100 score built from 12 metrics, each with a target, an explanation and a tip:
  - savings rate
  - emergency fund (months of expenses)
  - EMI-to-income (FOIR)
  - fixed commitments
  - investment rate
  - credit card utilisation
  - debt-to-assets
  - financial independence progress (25× rule, with years-to-FI)
  - lifestyle creep
  - subscription load
  - term life cover
  - health insurance

  It also has a 50/30/20 check and **Safe to spend this month**: income − spent − bills still due − savings to reach 20%.
- **Budgets.** Monthly limits per category (or overall) and per workspace, with a pace marker, a projected month-end total, and statuses (on track / near limit / will overshoot / over). "Suggest from history" sets limits at about 95% of your 3-month average.
- **Goals.** Savings goals with deadline and required monthly amount. Contributions are recorded as Saving transactions.
- **Wealth.** Accounts and holdings (bank, MF, stocks, FD, PF/NPS, gold, crypto, property, loans, credit cards), net worth over time, asset allocation, gains vs. amount invested, and a monthly "update all balances" check-in.
- **Documents.** Every receipt, PDF and link, linked to the transactions it supports, with the text read from it kept for reference.

Keyboard: `N` add · `V` voice · `/` search · `G` then `D`/`T`/`A`/`B`/`W` to switch pages · `Esc` close.

## Research: what makes people actually keep tracking

Looking at leading trackers (YNAB, Monarch, Copilot, Mint's successors, Actual Budget, Walnut/Axio, ET Money, INDmoney, Spendee, Wallet) and personal-finance practice, the same patterns come up again and again:

1. **Logging has to be quick, or people stop.** Most people give up on manual trackers within weeks. The winners cut down on typing through bank sync, SMS parsing (dominant in India), receipt scanning and quick entry. → Voice, one-sentence typing, SMS/statement paste, CSV, OCR, and learned payee rules.
2. **Automatic categorisation plus easy correction.** Trust depends on fixing a wrong category once and never seeing the mistake again. → Rules learned from what you save and what you correct, plus editable rules in Settings.
3. **Personal vs. business separation** matters for freelancers and salaried people who claim expenses. Mixing them distorts both views. → A workspace on every entry, a global toggle, and a claims workflow.
4. **Look forward, not only back.** Budgets that project month-end (pace), upcoming bills and forecasts change behaviour more than past-only reports. → Pace markers, "will overshoot" status, month-end forecast, recurring bill detection.
5. **The whole picture: cash flow and net worth.** People want spending, saving and investing in one place, because a month where investing and saving went up looks worse if you only count "spend". → Separate Income / Expense / Investment / Saving types, a monthly allocation chart, and net worth from account snapshots.
6. **Subscriptions leak money quietly.** The typical user underestimates recurring charges considerably. → Automatic recurring detection with yearly cost and "stopped?" flags.
7. **Plain-language insights beat raw charts** for most users. → An insights panel: biggest changes, weekend effect, unclaimed reimbursements, savings rate vs. the 20% rule of thumb.
8. **Goals give saving a purpose.** → Goals with a required monthly amount, and a one-click emergency fund sized at 6× your average monthly spend.
9. **Privacy.** Many people won't hand over bank credentials. → Local-first storage, backup/restore, no account.

### The metrics planners track, and the guidelines used

| Metric | How it's calculated | Guideline | Source |
|---|---|---|---|
| Savings rate | (income − spending) ÷ income | 10–20%+ | [US News](https://money.usnews.com/money/personal-finance/family-finance/articles/personal-finance-ratios-to-know-at-all-times), [SoFi](https://www.sofi.com/learn/content/important-personal-finance-ratios/) |
| Emergency fund | liquid assets ÷ monthly spending | 3–6 months | [US News](https://money.usnews.com/money/personal-finance/family-finance/articles/personal-finance-ratios-to-know-at-all-times) |
| EMI-to-income (FOIR) | all EMIs ÷ monthly income | < 40% safe, 40–50% caution, > 50% risk | [Kotak](https://www.kotak.bank.in/en/stories-in-focus/loans/home-loan/what-percentage-of-your-salary-should-be-accounted-for-home-loan-emis-read-here.html), [Finnovate](https://www.finnovate.in/learn/blog/home-loan-emi-affordability-india) |
| Credit utilisation | card balance ÷ card limit | < 30% (best 1–10%) | [HDFC Bank](https://www.hdfc.bank.in/blogs/credit-cards/impact-of-credit-card-usage-on-cibil-score) |
| FI number | 25 × annual spending (4% rule) | progress toward 100% | [ChooseFI](https://choosefi.com/financial-independence/how-to-calculate-fi-number) |
| Term cover | sum assured ÷ annual income | 10–15× income (+ loans) | [Kotak Life](https://www.kotaklife.com/insurance-guide/protection/how-much-term-life-insurance-cover-do-i-need-in-india), [Digit](https://www.godigit.com/life-insurance/term-insurance/how-much-term-insurance-do-i-need) |
| Subscriptions | monthly equivalent of all active subscriptions | review unused ones; people average 12–15 | [CNBC Select](https://www.cnbc.com/select/best-subscription-trackers/) |

These are general rules of thumb, not personal financial advice.

## Data & privacy

- The app keeps its working copy in the browser: records in `localStorage`, uploaded files in IndexedDB. It works offline.
- **With cloud sync on** (below), everything is also stored in *your own* Supabase project and synced across your devices.
- **Without cloud sync**, the data lives only in this browser. Export a backup regularly (Settings → Download backup), because clearing browser data erases it.
- Other network use is optional: the OCR and PDF libraries load from a CDN the first time you upload an image or PDF, and a link you paste is fetched through your own local server.

## Cloud sync with Supabase (one-time setup, ~10 minutes)

1. **Create a project.** Go to [supabase.com](https://supabase.com), open New project, and pick the region closest to you (e.g. Mumbai).
2. **Create the tables.** In the project, open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This creates:
   - `transactions`: one row per entry, with real columns, so you can query or export them.
   - `records`: budgets, goals, accounts, rules, documents, categories and settings.
   - Lock-down rules (row-level security), so each signed-in user can only read and write their own rows.
   - A private `documents` storage bucket for receipts, with one folder per user.
3. **Allow the sign-in redirect.** Open **Authentication → URL Configuration**, set **Site URL** to `http://localhost:5173`, and add `http://localhost:5173` under **Redirect URLs**. Add your hosted address here too if you deploy the app later.
4. **Optional: Google sign-in.** Open **Authentication → Sign In / Providers → Google**, enable it, and paste an OAuth client ID and secret from Google Cloud Console. The Google client's authorized redirect URI must be the callback URL that Supabase shows on that page. Email magic-link sign-in works without this step.
5. **Connect the app.** Open **Project Settings → API** and copy the **Project URL** and the **anon / publishable** key. In SpendWise, go to **Settings → Cloud sync**, paste both and click **Connect** (or put them in [`js/config.js`](js/config.js)). Then sign in with the email link or Google.
   - ⚠️ Never use the `service_role` / secret key in the app. It bypasses all security rules.
6. **Choose what happens to existing data.** If this device already has data, SpendWise asks whether to **upload & merge** it or **use cloud data only**. If what you have locally is just sample data, choose *use cloud data only*.

**How sync works**
- **When it syncs:** a few seconds after any change, every minute, when you come back to the tab, and when your connection returns. The pill in the top bar shows the status (Synced / Syncing / Offline / Error).
- **Offline:** you can keep adding entries; they upload when you're back online.
- **Two devices editing the same entry before syncing:** the device that syncs last wins.
- **Deletes:** deleted items are marked as deleted in the database rather than removed, so your other devices learn about them.
- **Wipe protection:** if one action would delete more than 30% of your cloud data (e.g. *Erase everything* or loading sample data while signed in), SpendWise asks first. Choose *Cancel* to restore everything from the cloud.
- **Receipts:** uploaded to the private bucket. Another device downloads a receipt only when you open it.

**Supabase free tier:** 500 MB database + 1 GB file storage, which is years of personal records. Free projects pause after about a week without use. Opening the app regularly avoids this, or you can resume the project from the dashboard; no data is lost.

**Querying your data:** in Supabase's SQL editor, use the `transactions_live` view (live rows only), for example:
```sql
select category, sum(amount) from transactions_live
where type = 'expense' and date >= date_trunc('month', now())
group by 1 order by 2 desc;
```

## Project layout

```
index.html          app shell
css/styles.css      design tokens (light/dark), layout, components
js/util.js          dates, formatting, DOM helpers
js/store.js         state, persistence, categories, IndexedDB files
js/nlp.js           natural-language / SMS / receipt / UPI parsing
js/analytics.js     filters, aggregations, recurring detection, insights, budgets, net worth
js/charts.js        dependency-free SVG charts with tooltips
js/capture.js       add flows: voice, form, upload (CSV/OCR/PDF), link/paste, review
js/views.js         dashboard, transactions, analytics
js/views2.js        budgets, goals, wealth, documents, settings
js/views3.js        Bills & EMIs page (upcoming, subscriptions, loans)
js/bills.js         EMI maths, due dates, auto-linking payments, reminders
js/health.js        financial health metrics, score, safe-to-spend, Health page
js/sample.js        demo data generator
js/app.js           router, global filters, modal, theme, shortcuts
js/cloud.js         Supabase auth + two-way sync + receipt storage
js/config.js        optional hard-coded Supabase URL / anon key
supabase/schema.sql tables, security policies, storage bucket (fresh installs)
supabase/migrations/002_bills_emis.sql  upgrade for existing projects (already applied to yours)
server.js           static server + /api/fetch for reading receipt links
```

## Limitations and possible next steps

- Voice needs Chrome or Edge (Firefox and Safari lack the Web Speech API); typing works everywhere.
- To use it on your phone, host the app on an `https://` address (e.g. Vercel or Netlify) and add that address to Supabase's Redirect URLs. Reading pasted receipt links would then need a small serverless function in place of `server.js`.
- No live bank connection. In India that would go through the RBI Account Aggregator framework (e.g. Setu, Finvu).
- Investment values are updated manually; mutual fund NAVs could be pulled automatically from AMFI.
- Multi-currency amounts are not converted; one display currency is used.
