# Hiredly AI

A Next.js resume builder for Australian job seekers. The free workspace includes live preview, Classic, Modern and Minimal templates, browser autosave, JSON backups and A4 PDF export.

## Run locally on Windows

Use Node.js 22 or newer. From the downloaded project's outer folder, run:

```powershell
cd .\resume-studio-starter
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:3000. For a quick walkthrough, open the builder, select **Load sample resume**, then open **AI application**. Paste a job ad that mentions Microsoft 365 or troubleshooting and select **Try a sample draft**. The sample uses the resume text in the browser. Review the matched skills, edit the cover letter and use the PDF buttons to open the browser's print dialog.

To check the production build, stop the development server and run `npm.cmd run build`. Use `npm.cmd start` to serve that build locally.

## Publish a public demo on GitHub Pages

In the public GitHub repository, choose **Settings → Pages → Source → GitHub Actions**. Run **Publish the Hiredly AI demo** from the Actions tab to deploy the first version. Future pushes to the main branch redeploy automatically. GitHub displays the public URL under **Settings → Pages** and in the workflow's deployment result.

The Pages build includes the browser-based editor, templates, PDF controls and sample application workflow. It omits live AI, accounts and checkout. Run `npm.cmd run build:pages` to generate the static files locally in `out/`. For a project subpath in a local build, set `PAGES_BASE_PATH` to a value such as `/hiredly-ai-demo`. The workflow gets this path from GitHub automatically.

## Enable online accounts and AI

1. Copy `.env.example` to `.env.local` inside this app folder. Keep the server secrets in that file or your hosting provider's secrets settings.
2. Create or select a Supabase project. Apply [the SQL migration](supabase/migrations/001_workspace.sql) through the SQL Editor or your migration workflow. Enter the project URL, publishable key and secret key in `.env.local`.
3. Enable email/password authentication in Supabase. Configure its Site URL and allow the app's `/?view=account` URL for confirmation and password recovery, using the same origin you open in your browser.
4. Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL`. The AI route verifies the account and reserves a credit before sending resume facts and the job description to OpenAI. It leaves out the resume's email, phone and location fields. Review the generated content before applying it to a resume.
5. Restart the development server after changing configuration.

The browser keeps the current resume, template, job description and application draft on this device. Use **Online versions** to save named copies of your resume to your account. The SQL policies restrict each version to its owner.

## Test Stripe billing

1. In Stripe test mode, create a one-time **A$2.99 AUD** price for the application pack and a monthly **A$12.99 AUD** price for Pro. Enter both Price IDs and the test secret key in `.env.local`.
2. Set `NEXT_PUBLIC_SITE_URL` to the app's origin and enable the Stripe test customer portal for billing management. Use cancellation at the end of the paid period if you want access to continue until that period ends.
3. Forward signed Stripe test events to the webhook. With the Stripe CLI authenticated, run:

```powershell
stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded,invoice.paid,customer.subscription.deleted,charge.refunded --forward-to localhost:3000/api/stripe/webhook
```

4. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET` and restart the app. Sign in, buy a pack with a Stripe test card, then refresh the credit balance on the **Account** screen. Repeat with Pro and test a renewal. Stripe test payments should be in AUD at the advertised totals, without discounts or customer credit balances.

The pack adds one application credit. A paid Pro billing period adds 15 credits that expire at the end of that period. Each credit generates a paired resume and cover letter. The database reserves credits atomically and the server tries to restore a credit on generation errors. The webhook verifies Stripe's signature and uses a unique payment or billing period to protect against duplicate credit grants.

Live Stripe keys are disabled. Before using this on a public domain, complete provider integration tests and configure production email, operational monitoring, and the site policies for customer data, billing and refunds.
