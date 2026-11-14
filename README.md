# Renewal Tracker

A subscription tracker built with React, TypeScript, Vite, and Tailwind CSS, with an AWS CDK backend foundation. The frontend is intended for Vercel Hobby and the backend for a small AWS deployment.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. With no cloud configuration, the preview includes illustrative sample prices, currency-specific spending summaries, search, status filters, an add-subscription form, and local cancellation/reactivation. Preview changes reset on reload. Cancellation with the actual provider is a separate action.

Monthly equivalents include active plans. Upcoming payments use each plan's stored next charge within the next 30 calendar days, including estimated trial conversions. Repeated future billing occurrences and month-end recurrence rules are a later milestone. Dates use Asia/Manila and totals never combine currencies.

Use **Export CSV** in the subscriptions list to download a copy of all loaded records, including cancelled plans. Search and status filters only affect the on-screen list. The export includes the amount in each plan's original currency.

## Project layout

```text
src/
  App.tsx                    Dashboard and preview interactions
  SubscriptionForm.tsx       Add-subscription form
  subscriptions.ts          Model, date helpers, and calculations
  styles.css                 Responsive styles and Tailwind entry
services/api/
  subscriptions.ts          Authenticated DynamoDB list, create, and update handler
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

The stack defines Cognito Lite with email verification and the classic hosted UI, a public browser app client using authorization code with PKCE, a DynamoDB Standard table with 1 read and 1 write capacity unit, and an HTTP API with a Cognito JWT authorizer. `GET /subscriptions` queries only the authenticated user's partition. The response contains `subscriptions` and a nullable `nextCursor`. Pass the cursor as `?after=...` to fetch the next page. The route requires a Cognito access token with the `aws.cognito.signin.user.admin` scope.

`POST /subscriptions` requires the same Cognito access token and accepts a JSON body with `name`, `category`, `amountMinor`, `currency`, `cycle`, `nextChargeDate`, and `status`. Amounts are nonnegative integers in minor units. Supported currencies are PHP, USD, and EUR. Use `monthly` or `yearly` for the cycle, `active` or `trial` for the initial status, and `YYYY-MM-DD` for the next charge. The server assigns the subscription ID and uses the token subject for ownership. A successful write returns `201` with `{ "subscription": { ... } }`. Invalid input returns `400`.

`PUT /subscriptions/{id}` updates an existing subscription using the same fields. It also accepts `cancelled` as a status. On success it returns `200` with the updated subscription. A missing record in the signed-in user's partition returns `404`.

The Lambda role has read, `PutItem`, and `UpdateItem` access to the table. API requests have a configured throttle, logs expire after seven days, and the table and user pool are retained when the stack is removed. Retained resources can continue to incur costs and require deliberate cleanup through AWS. CDK bootstrapping also creates deployment asset storage.

When deploying later, configure AWS credentials through your local AWS profile. Bootstrap the chosen account and region with the CDK CLI, then use the explicit deployment command with the frontend origin.

```sh
npm run infra:deploy -- -c frontendOrigin=https://YOUR-PROJECT.vercel.app
```

The stack registers `frontendOrigin` for API CORS and uses its root URL for Cognito redirects. The default is `http://localhost:5173`, which can be used to test against AWS from Vite. Set `-c cognitoDomainPrefix=YOUR-UNIQUE-PREFIX` if the default Cognito domain prefix is unavailable in the chosen region.

Copy [.env.example](.env.example) to `.env.local` for local testing or set these public values in Vercel for the deployed site.

| Variable                 | CDK output         |
| ------------------------ | ------------------ |
| `VITE_API_URL`           | `ApiUrl`           |
| `VITE_COGNITO_ISSUER`    | `CognitoIssuer`    |
| `VITE_COGNITO_DOMAIN`    | `CognitoDomain`    |
| `VITE_COGNITO_CLIENT_ID` | `UserPoolClientId` |

Restart Vite or rebuild the Vercel site after setting the values. Cloud mode uses Cognito to sign in and stores the session in the current browser tab. After sign-in, add a subscription, edit its price or status, and reload to check that the changes were saved to DynamoDB.

## Frontend hosting

For Vercel, use the repository root, the Vite framework preset, `npm run build` as the build command, and `dist` as the output directory. The starter uses a single page with section anchors. The included font is bundled locally.

## Next milestones

1. Deploy the stack and verify sign-in, persistence, sign-out, and account isolation in AWS.
2. Add recurrence rules, trial cancellation deadlines, and CSV import.
3. Add EventBridge Scheduler and SES daily reminder digests with delivery history and recovery from failed runs.
4. Verify a deployed user flow, review actual AWS usage, and document the architecture for the portfolio.

## Cost assumptions

The design targets light personal use with Vercel Hobby and AWS recurring free allowances. DynamoDB's provisioned free allowance is shared across tables and indexes in the account's applicable billing scope. API Gateway, SES, logs, backups, and CDK asset storage can produce charges. Confirm account eligibility and current regional prices before deployment and configure a budget alert. Alerts can arrive after charges occur.

- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/)
- [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [SES pricing](https://aws.amazon.com/ses/pricing/)
