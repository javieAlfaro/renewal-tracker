# Renewal Tracker

A subscription tracker built with React, TypeScript, Vite, and Tailwind CSS, with an AWS CDK backend foundation. The frontend is intended for Vercel Hobby and the backend for a small AWS deployment.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. With no cloud configuration, the preview includes illustrative sample prices, currency-specific spending summaries, search, status filters, an add-subscription form, and local cancellation/reactivation. Preview changes reset on reload. Cancellation with the actual provider is a separate action.

Monthly equivalents include active plans. The 30-day forecast projects active monthly and yearly charges from the saved billing date. If a month is shorter, the forecast uses its last day and returns to the original day when possible. Trials appear once at their saved end date if it falls inside the window. Forecast dates are estimates and leave saved records intact. Dates use Asia/Manila and totals never combine currencies.

Use **Export CSV** in the subscriptions list to download a copy of all loaded records, including cancelled plans. Search and status filters only affect the on-screen list. The export includes the amount in each plan's original currency.

The category filter combines with search and status filters. It includes categories from your saved records. CSV export continues to include the full list regardless of the selected filters.

Search matches service names and categories, ignores letter case, and trims surrounding spaces.

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

## Deploy and verify

Install the AWS CLI and configure a named profile with credentials and a default region. Replace `YOUR_PROFILE`, `ACCOUNT_ID`, and `REGION` using the profile and the values printed by these checks. Run `npm ci` from the repository root before using the CDK CLI.

```sh
aws sts get-caller-identity --profile YOUR_PROFILE --query Account --output text
aws configure get region --profile YOUR_PROFILE
npx cdk bootstrap aws://ACCOUNT_ID/REGION --profile YOUR_PROFILE
```

To verify with the local Vite app, leave the default frontend origin at `http://localhost:5173`.

```sh
npm run infra:diff -- --profile YOUR_PROFILE
npm run infra:deploy -- --profile YOUR_PROFILE
```

For a Vercel deployment, pass `-c frontendOrigin=https://YOUR-PROJECT.vercel.app` to both CDK commands. Use the exact HTTPS origin without a trailing slash. The stack registers that origin for CORS and uses its root URL for Cognito redirects. Set `-c cognitoDomainPrefix=YOUR-UNIQUE-PREFIX` if the default Cognito domain prefix is unavailable in the chosen region. [AWS CDK bootstrap guide](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html)

Copy [.env.example](.env.example) to `.env.local` for local testing or set these public values in Vercel for the deployed site.

| Variable                 | CDK output         |
| ------------------------ | ------------------ |
| `VITE_API_URL`           | `ApiUrl`           |
| `VITE_COGNITO_ISSUER`    | `CognitoIssuer`    |
| `VITE_COGNITO_DOMAIN`    | `CognitoDomain`    |
| `VITE_COGNITO_CLIENT_ID` | `UserPoolClientId` |

Restart Vite or rebuild the Vercel site after setting the values. Cloud mode uses Cognito to sign in and stores the session in the current browser tab.

1. Open the frontend at the configured origin. Sign up with a test email, verify it, and sign in.
2. Add a subscription, edit its price, and reload. Confirm the edited price persists. Mark the subscription cancelled and check that it drops out of the forecast.
3. Sign in as a second test account in a separate browser profile. Confirm the first account's subscription is absent.
4. Sign out and confirm the dashboard returns to its sign-in screen. To verify the API separately, request `GET /subscriptions` on the `ApiUrl` without an access token and expect HTTP `401`.

## Frontend hosting

For Vercel, use the repository root, the Vite framework preset, `npm run build` as the build command, and `dist` as the output directory. The starter uses a single page with section anchors. The included font is bundled locally.

### Troubleshoot the first cloud deployment

| Symptom                                                          | Check                                                                                                                                                                      |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The deployed site opens in sample mode                           | Set the four `VITE_*` values for the environment you deployed to, then trigger a fresh build.                                                                              |
| Cognito shows `redirect_mismatch`                                | Compare the app client's callback URL with the browser's exact origin plus `/`. CDK sets that URL from `frontendOrigin`. On the local server, use `http://localhost:5173`. |
| Sign-in works but the browser blocks API calls with a CORS error | Check that the API's allowed origin matches the browser's scheme, hostname, and port. Compare the value with `frontendOrigin` in the last CDK deployment.                  |
| An authenticated API request returns `401` or `403`              | Confirm the client is configured from the same stack as the API and uses a Cognito access token with the route's required scope. Sign in again to obtain a fresh token.    |

Use the CloudFormation stack outputs as the source for the frontend settings. [Cognito troubleshooting](https://docs.aws.amazon.com/cognito/latest/developerguide/troubleshooting.html) · [API Gateway CORS](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-cors.html)

## Next milestones

1. Deploy the stack and verify sign-in, persistence, sign-out, and account isolation in AWS.
2. Add trial cancellation deadlines and CSV import.
3. Add EventBridge Scheduler and SES daily reminder digests with delivery history and recovery from failed runs.
4. Verify a deployed user flow, review actual AWS usage, and document the architecture for the portfolio.

## Cost assumptions

The design targets light personal use with Vercel Hobby and AWS recurring free allowances. DynamoDB's provisioned free allowance is shared across tables and indexes in the account's applicable billing scope. API Gateway, SES, logs, backups, and CDK asset storage can produce charges. Confirm account eligibility and current regional prices before deployment and configure a budget alert. Alerts can arrive after charges occur.

- [Vercel Hobby](https://vercel.com/docs/plans/hobby)
- [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/)
- [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [SES pricing](https://aws.amazon.com/ses/pricing/)
