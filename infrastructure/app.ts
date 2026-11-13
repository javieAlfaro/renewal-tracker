import { App } from "aws-cdk-lib";
import { RenewalStack } from "./renewal-stack";

const app = new App();
new RenewalStack(app, "RenewalTracker", {
  description: "Subscription tracker with authenticated list and create API",
});
