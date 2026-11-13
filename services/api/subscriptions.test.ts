import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";
import {
  DynamoDBDocumentClient,
  type PutCommand,
  type QueryCommand,
} from "@aws-sdk/lib-dynamodb";
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
  const send = t.mock.method(
    DynamoDBDocumentClient.prototype,
    "send",
    async () => {
      throw new Error("Unexpected database call");
    },
  );
  const event = {
    requestContext: {},
  } as APIGatewayProxyEventV2WithJWTAuthorizer;
  assert.equal((await handler(event)).statusCode, 401);
  assert.equal(send.mock.callCount(), 0);
});

it("uses the token owner for both query and pagination despite a supplied owner parameter", async (t) => {
  let query: QueryCommand["input"] | undefined;
  t.mock.method(
    DynamoDBDocumentClient.prototype,
    "send",
    async (command: QueryCommand) => {
      query = command.input;
      return {
        Items: [],
        LastEvaluatedKey: { ownerId: "real-user", id: "last-id" },
      };
    },
  );
  const event = {
    requestContext: {
      http: { method: "GET" },
      authorizer: { jwt: { claims: { sub: "real-user" } } },
    },
    queryStringParameters: { ownerId: "other-user", after: "cursor-id" },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;

  const response = await handler(event);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(query?.ExpressionAttributeValues, {
    ":ownerId": "real-user",
  });
  assert.deepEqual(query?.ExclusiveStartKey, {
    ownerId: "real-user",
    id: "cursor-id",
  });
  assert.deepEqual(JSON.parse(response.body!), {
    subscriptions: [],
    nextCursor: "last-id",
  });
});

const details = {
  name: " Sample Plan ",
  category: "Other",
  amountMinor: 1299,
  currency: "PHP",
  cycle: "monthly",
  nextChargeDate: "2028-02-29",
  status: "active",
};

function createEvent(body: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    body,
    requestContext: {
      http: { method: "POST" },
      authorizer: { jwt: { claims: { sub: "real-user" } } },
    },
  } as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

it("creates a record under the token owner with a server-generated ID", async (t) => {
  let input: PutCommand["input"] | undefined;
  t.mock.method(
    DynamoDBDocumentClient.prototype,
    "send",
    async (command: PutCommand) => {
      input = command.input;
      return {};
    },
  );
  const response = await handler(
    createEvent(
      JSON.stringify({
        ...details,
        ownerId: "other-user",
        id: "client-id",
      }),
    ),
  );
  assert.equal(response.statusCode, 201);
  const { subscription } = JSON.parse(response.body!);
  assert.match(subscription.id, /^[\da-f-]{36}$/);
  assert.deepEqual(subscription, {
    ...details,
    name: "Sample Plan",
    id: subscription.id,
  });
  assert.deepEqual(input?.Item, { ...subscription, ownerId: "real-user" });
  assert.equal(input?.ConditionExpression, "attribute_not_exists(id)");
});

it("rejects malformed bodies and invalid fields before writing", async (t) => {
  const send = t.mock.method(
    DynamoDBDocumentClient.prototype,
    "send",
    async () => {
      throw new Error("Unexpected database call");
    },
  );
  const invalid = [
    "{",
    "null",
    JSON.stringify({ ...details, nextChargeDate: "2027-02-29" }),
    JSON.stringify({ ...details, amountMinor: 10.5 }),
    JSON.stringify({ ...details, currency: "JPY" }),
    JSON.stringify({ ...details, status: "cancelled" }),
    JSON.stringify({ ...details, name: " " }),
  ];
  for (const body of invalid) {
    assert.equal((await handler(createEvent(body))).statusCode, 400, body);
  }
  assert.equal(send.mock.callCount(), 0);
});
