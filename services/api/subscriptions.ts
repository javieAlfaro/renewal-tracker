import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { currencies, type Subscription } from "../../src/subscriptions";

const database = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(
  statusCode: number,
  body: object,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function readSubscription(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Omit<Subscription, "id"> | undefined {
  let data: unknown;
  try {
    const body = event.body ?? "";
    data = JSON.parse(
      event.isBase64Encoded
        ? Buffer.from(body, "base64").toString("utf8")
        : body,
    );
  } catch {
    return undefined;
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    return undefined;

  const {
    name,
    category,
    amountMinor,
    currency,
    cycle,
    nextChargeDate,
    status,
  } = data as Record<string, unknown>;
  const supportedCurrency = currencies.find((value) => value === currency);
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 80 ||
    typeof category !== "string" ||
    !category.trim() ||
    category.trim().length > 40 ||
    typeof amountMinor !== "number" ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    amountMinor > 9_999_999_900 ||
    !supportedCurrency ||
    (cycle !== "monthly" && cycle !== "yearly") ||
    (status !== "active" && status !== "trial" && status !== "cancelled") ||
    typeof nextChargeDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(nextChargeDate) ||
    nextChargeDate < "2000-01-01" ||
    nextChargeDate > "2100-12-31"
  )
    return undefined;

  const chargeDate = new Date(`${nextChargeDate}T00:00:00Z`);
  if (
    !Number.isFinite(chargeDate.getTime()) ||
    chargeDate.toISOString().slice(0, 10) !== nextChargeDate
  )
    return undefined;

  return {
    name: name.trim(),
    category: category.trim(),
    amountMinor,
    currency: supportedCurrency,
    cycle,
    nextChargeDate,
    status,
  };
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  // Ownership comes exclusively from the verified token, never from a request parameter.
  const ownerId = event.requestContext.authorizer?.jwt?.claims.sub;
  if (typeof ownerId !== "string" || !ownerId) {
    return json(401, { message: "Sign in to manage subscriptions." });
  }
  if (!process.env.TABLE_NAME) {
    console.error("TABLE_NAME is not configured");
    return json(500, { message: "Service configuration is incomplete." });
  }

  const method = event.requestContext.http.method;
  const updating = method === "PUT";
  try {
    if (method === "POST" || updating) {
      const fields = readSubscription(event);
      if (!fields || (!updating && fields.status === "cancelled"))
        return json(400, { message: "Enter valid subscription details." });

      if (updating) {
        const id = event.pathParameters?.id;
        if (!id || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/.test(id)) {
          return json(400, { message: "Enter a valid subscription ID." });
        }
        await database.send(
          new UpdateCommand({
            TableName: process.env.TABLE_NAME,
            Key: { ownerId, id },
            ConditionExpression: "attribute_exists(id)",
            UpdateExpression:
              "SET #name = :name, #category = :category, #amount = :amount, #currency = :currency, #cycle = :cycle, #date = :nextCharge, #status = :status",
            ExpressionAttributeNames: {
              "#name": "name",
              "#category": "category",
              "#amount": "amountMinor",
              "#currency": "currency",
              "#cycle": "cycle",
              "#date": "nextChargeDate",
              "#status": "status",
            },
            ExpressionAttributeValues: {
              ":name": fields.name,
              ":category": fields.category,
              ":amount": fields.amountMinor,
              ":currency": fields.currency,
              ":cycle": fields.cycle,
              ":nextCharge": fields.nextChargeDate,
              ":status": fields.status,
            },
          }),
        );
        return json(200, { subscription: { ...fields, id } });
      }

      const subscription: Subscription = { ...fields, id: randomUUID() };
      await database.send(
        new PutCommand({
          TableName: process.env.TABLE_NAME,
          Item: { ...subscription, ownerId },
          ConditionExpression: "attribute_not_exists(id)",
        }),
      );
      return json(201, { subscription });
    }

    if (method !== "GET") return json(405, { message: "Method not allowed." });

    const result = await database.send(
      new QueryCommand({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: "ownerId = :ownerId",
        ExpressionAttributeValues: { ":ownerId": ownerId },
        Limit: 100,
        ExclusiveStartKey: event.queryStringParameters?.after
          ? { ownerId, id: event.queryStringParameters.after }
          : undefined,
      }),
    );
    return json(200, {
      subscriptions: result.Items ?? [],
      nextCursor: result.LastEvaluatedKey?.id ?? null,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    if (updating && name === "ConditionalCheckFailedException") {
      return json(404, { message: "Subscription not found." });
    }
    console.error(
      method === "GET"
        ? "Subscription query failed"
        : "Subscription write failed",
      { name },
    );
    return json(500, {
      message:
        method === "GET"
          ? "Unable to load subscriptions. Please try again."
          : "Unable to save the subscription.",
    });
  }
}
