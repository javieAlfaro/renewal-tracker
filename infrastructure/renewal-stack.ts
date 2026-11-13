import { join } from "node:path";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  AttributeType,
  BillingMode,
  Table,
  TableEncryption,
} from "aws-cdk-lib/aws-dynamodb";
import {
  AccountRecovery,
  FeaturePlan,
  UserPool,
} from "aws-cdk-lib/aws-cognito";
import {
  CorsHttpMethod,
  HttpApi,
  HttpMethod,
  HttpStage,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpUserPoolAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Runtime, Architecture } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

export class RenewalStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const table = new Table(this, "Subscriptions", {
      partitionKey: { name: "ownerId", type: AttributeType.STRING },
      sortKey: { name: "id", type: AttributeType.STRING },
      billingMode: BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      encryption: TableEncryption.DEFAULT,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const userPool = new UserPool(this, "Users", {
      featurePlan: FeaturePlan.LITE,
      signInAliases: { email: true },
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: true,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const userPoolClient = userPool.addClient("WebClient", {
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: Duration.hours(1),
    });

    const logs = new LogGroup(this, "ApiLogs", {
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const handler = new NodejsFunction(this, "ListSubscriptions", {
      entry: join(process.cwd(), "services/api/subscriptions.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      memorySize: 128,
      timeout: Duration.seconds(10),
      logGroup: logs,
      environment: { TABLE_NAME: table.tableName },
      bundling: { minify: true, bundleAwsSDK: true },
    });
    table.grantReadData(handler);
    table.grant(handler, "dynamodb:PutItem");

    const frontendOrigin =
      this.node.tryGetContext("frontendOrigin") ?? "http://127.0.0.1:5173";
    const api = new HttpApi(this, "Api", {
      createDefaultStage: false,
      corsPreflight: {
        allowOrigins: [frontendOrigin],
        allowHeaders: ["Authorization", "Content-Type"],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
      },
    });
    new HttpStage(this, "DefaultStage", {
      httpApi: api,
      stageName: "$default",
      autoDeploy: true,
      throttle: { rateLimit: 5, burstLimit: 10 },
    });
    api.addRoutes({
      path: "/subscriptions",
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: new HttpLambdaIntegration("ListIntegration", handler),
      authorizer: new HttpUserPoolAuthorizer("UserAuthorizer", userPool, {
        userPoolClients: [userPoolClient],
      }),
      // Cognito SRP access tokens include this scope. Requiring it excludes ID tokens.
      authorizationScopes: ["aws.cognito.signin.user.admin"],
    });

    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, "SubscriptionsTableName", { value: table.tableName });
  }
}
