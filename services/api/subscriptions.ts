import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

const database = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  // Ownership comes exclusively from the verified token, never from a request parameter.
  const ownerId = event.requestContext.authorizer?.jwt?.claims.sub;
  if (typeof ownerId !== "string" || !ownerId) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: "Sign in to view subscriptions." }),
    };
  }
  if (!process.env.TABLE_NAME) {
    console.error("TABLE_NAME is not configured");
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Service configuration is incomplete." }),
    };
  }

  try {
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
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        subscriptions: result.Items ?? [],
        nextCursor: result.LastEvaluatedKey?.id ?? null,
      }),
    };
  } catch (error) {
    console.error("Subscription query failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Unable to load subscriptions. Please try again.",
      }),
    };
  }
}
