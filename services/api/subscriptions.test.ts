import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";
import { DynamoDBDocumentClient, type QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { handler } from "./subscriptions";

const previousTableName = process.env.TABLE_NAME;

beforeEach(() => {
  process.env.TABLE_NAME = "test-subscriptions";
});

afterEach(() => {
  if (previousTableName === undefined) {
    delete process.env.TABLE_NAME;
  } else {
    process.env.TABLE_NAME = previousTableName;
  }
});

it("rejects requests without a verified owner before querying the database", async (t) => {
  const send = t.mock.method(DynamoDBDocumentClient.prototype, "send", async () => {
    throw new Error("Unexpected database call");
  });
  const event = { requestContext: {} } as APIGatewayProxyEventV2WithJWTAuthorizer;
  assert.equal((await handler(event)).statusCode, 401);
  assert.equal(send.mock.callCount(), 0);
});

it("uses the token owner for both query and pagination despite a supplied owner parameter", async (t) => {
  let query: QueryCommand["input"] | undefined;
  t.mock.method(DynamoDBDocumentClient.prototype, "send", async (command: QueryCommand) => {
    query = command.input;
    return { Items: [], LastEvaluatedKey: { ownerId: "real-user", id: "last-id" } };
  });
  const event = {
    requestContext: { authorizer: { jwt: { claims: { sub: "real-user" } } } },
    queryStringParameters: { ownerId: "other-user", after: "cursor-id" },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

  const response = await handler(event);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(query?.ExpressionAttributeValues, { ":ownerId": "real-user" });
  assert.deepEqual(query?.ExclusiveStartKey, { ownerId: "real-user", id: "cursor-id" });
  assert.deepEqual(JSON.parse(response.body!), { subscriptions: [], nextCursor: "last-id" });
});
