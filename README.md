# Renewal Tracker

A subscription tracker built with React, TypeScript, Vite, and Tailwind CSS, with an AWS CDK backend foundation. The frontend is intended for Vercel Hobby and the backend for a small AWS deployment.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The preview includes illustrative sample prices, currency-specific spending summaries, search, status filters, an add-subscription form, and local cancellation/reactivation. All changes live in memory and reset on reload. Marking a plan cancelled changes the preview record only. Cancellation with the actual provider is a separate action.

Monthly equivalents include active plans. Upcoming payments use each plan's stored next charge within the next 30 calendar days, including estimated trial conversions. Repeated future billing occurrences and month-end recurrence rules are a later milestone. Dates use Asia/Manila and totals never combine currencies.

## Project layout

```text
src/
  App.tsx                    Dashboard and preview interactions
  SubscriptionForm.tsx       Add-subscription form
  subscriptions.ts          Model, date helpers, and calculations
  styles.css                 Responsive styles and Tailwind entry
services/api/
  subscriptions.ts          Authenticated DynamoDB read handler
infrastructure/
  app.ts                     CDK entry point
  renewal-stack.ts           AWS resources and permissions
```

## Verify the foundation

```sh
npm run typecheck
npm test
npm run build
npm run infra:synth
```

Synthesis generates a CloudFormation template in `cdk.out` locally. Deployment is a separate command and creates billable AWS resources.

## AWS foundation

The stack defines Cognito Lite with email verification, a public browser app client using SRP, a DynamoDB Standard table with 1 read and 1 write capacity unit, and an HTTP API with a Cognito JWT authorizer. `GET /subscriptions` queries only the authenticated user's partition. The response contains `subscriptions` and a nullable `nextCursor`. Pass the cursor as `?after=...` to fetch the next page. The route requires a Cognito access token with the `aws.cognito.signin.user.admin` scope.

The Lambda role has read access to the table. API requests have a configured throttle, logs expire after seven days, and the table and user pool are retained when the stack is removed. Retained resources can continue to incur costs and require deliberate cleanup through AWS. CDK bootstrapping also creates deployment asset storage.

The browser currently uses sample data. Cloud sign-in, subscription writes, and email delivery are pending. The API is ready for connecting in the next milestone.

When deploying later, configure AWS credentials through your local AWS profile. Bootstrap the chosen account and region with the CDK CLI, then use the explicit deployment command with the frontend origin.

```sh
npm run infra:deploy -- -c frontendOrigin=https://YOUR-PROJECT.vercel.app
```

Use the stack outputs for the API URL, Cognito pool ID, and browser client ID. Keep AWS credentials on the backend and in deployment tooling. The default CORS origin matches the Vite URL, `http://127.0.0.1:5173`.

## Frontend hosting

For Vercel, use the repository root, the Vite framework preset, `npm run build` as the build command, and `dist` as the output directory. The starter uses a single page with section anchors. The included font is bundled locally.

## Next milestones

1. Connect Cognito sign-in and the read API, then add validated create/edit/archive operations and owner-isolation checks.
2. Add recurrence rules, trials, cancellation deadlines, and CSV export/import.
3. Add EventBridge Scheduler and SES daily reminder digests with delivery history and recovery from failed runs.
4. Verify a deployed user flow, review actual AWS usage, and document the architecture for the portfolio.

## Cost assumptions

The design targets light personal use with Vercel Hobby and AWS recurring free allowances. DynamoDB's provisioned free allowance is shared across tables and indexes in the account's applicable billing scope. API Gateway, SES, logs, backups, and CDK asset storage can produce charges. Confirm account eligibility and current regional prices before deployment and configure a budget alert. Alerts can arrive after charges occur.

- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/)
- [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [SES pricing](https://aws.amazon.com/ses/pricing/)
