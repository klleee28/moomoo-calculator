# Deploy Tradecraft on Vercel using your existing Supabase project

Two apps can share one Supabase project. This app uses only `public.tradecraft_journal`; existing application tables are untouched. Both apps share the project's authentication user directory, email configuration, and resource quotas.

## 1. Create the journal table

Open the existing project in the [Supabase dashboard](https://supabase.com/dashboard), select **SQL Editor**, and run the complete contents of [`supabase/schema.sql`](supabase/schema.sql).

The script creates a dedicated table, per-user row-level security policies, and a version trigger for conflicting edits. It is safe to rerun. It does not modify existing application tables or authentication settings. Do not disable row-level security or add public read policies.

## 2. Import the GitHub repository into Vercel

In Vercel, choose **Add New → Project**, import `klleee28/moomoo-calculator`, and use the repository root. The checked-in `vercel.json` supplies these settings:

| Setting          | Value           |
| ---------------- | --------------- |
| Framework preset | Other           |
| Install command  | `npm ci`        |
| Build command    | `npm run build` |
| Output directory | `dist`          |

Add these **Environment Variables** for Production (and Preview if wanted):

| Variable                   | Value                                                 |
| -------------------------- | ----------------------------------------------------- |
| `SUPABASE_URL`             | Your existing project's URL, starting with `https://` |
| `SUPABASE_PUBLISHABLE_KEY` | Its `sb_publishable_...` public key                   |

A legacy `SUPABASE_ANON_KEY` is also supported. **Never use a service-role key or `sb_secret_...` key.** Browser keys are intentionally included in the public app bundle; database access is protected by authentication and the row-level security policies.

Deploy after setting the variables. Changes to environment variables require a new deployment. The build publishes only `dist/index.html`, including the official Supabase client. Development tests, database scripts, and local environment files are not published.

## 3. Allow this app's authentication redirects

In the existing Supabase project, open **Authentication → URL Configuration**. Keep the existing **Site URL** unchanged so the other app continues to work. Add the new production URL to **Redirect URLs**:

```text
https://YOUR-PROJECT.vercel.app/#journal
```

For local development, also add `http://127.0.0.1:8766/#journal`. Add any custom domain separately. Prefer explicit project URLs over allowing every Vercel deployment domain.

Email/password sign-in is the default. Existing Supabase accounts can sign in immediately. New accounts follow the project's current sign-up and email-confirmation settings. Password recovery and sign-up confirmation return to this app through the added redirect URL. Open confirmation/recovery links in the browser where you requested them (the app uses PKCE). To change devices, sign in there normally.

The app does not modify shared email templates, password policies, providers, or the Site URL. If your existing templates hard-code the other app's address, those links will need an application-aware template before confirmation and recovery can return here. Supabase's email delivery settings and limits apply to both apps.

Google sign-in is optional: enable it in the existing project only if you want it, then set `GOOGLE_AUTH_ENABLED=true` in Vercel and redeploy. It is hidden by default.

## 4. Verify

1. Sign in, plan a trade, and choose **Save to journal** from **Review & copy**.
2. Save a planned/open/closed record, then refresh the page.
3. Sign in on a second device with the same account and open **Trade journal**.
4. Confirm the record appears. Updates are fetched when opening the journal, returning to the browser, or choosing **Refresh**.
5. Sign out. Records should disappear from the screen but remain in the account.

Journal writes require a connection and server confirmation. A failed save keeps the editor open; it never reports success just because a local copy exists. This is not an offline write queue. JSON export/import provides a personal backup; imports support up to 1,000 records / 5 MB and preserve existing IDs rather than overwrite records.

## Local preview

Copy `.env.example` to `.env.local`, enter the same public project settings, then run:

```sh
npm ci
npm run build
npm run preview
```

Open `http://127.0.0.1:8766`. `.env.local` and `dist/` are ignored by Git. Opening the source `index.html` directly still runs the calculator, but the configured cloud journal is available in the built version.

## Tests and their limits

`npm test` builds the app and runs calculator regressions, journal browser flows against a simulated Supabase API using the real SDK, and the actual SQL policies in an in-memory PostgreSQL engine. Tests cover account isolation, optimistic edit conflicts, save failures, two independent browser sessions, backup/import, and phone layout. They do not send real sign-in emails or replace the final live check after applying the SQL and Vercel settings.

References: [Vercel build settings](https://vercel.com/docs/builds/configure-a-build), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
