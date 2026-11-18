import assert from "node:assert/strict";
import { it } from "node:test";
import { readCloudConfig } from "./cloud-config";

const env = {
  VITE_API_URL: "https://api.example.test/stage/",
  VITE_COGNITO_ISSUER: "https://issuer.example.test/pool",
  VITE_COGNITO_DOMAIN: "https://login.example.test",
  VITE_COGNITO_CLIENT_ID: "test-client-id",
};

it("preserves demo mode for blank settings and accepts the documented cloud URLs", () => {
  assert.equal(readCloudConfig({ VITE_API_URL: " " }).mode, "demo");
  assert.deepEqual(readCloudConfig(env), {
    mode: "cloud",
    apiUrl: env.VITE_API_URL,
    authority: env.VITE_COGNITO_ISSUER,
    domain: env.VITE_COGNITO_DOMAIN,
    clientId: env.VITE_COGNITO_CLIENT_ID,
  });
});

it("identifies invalid endpoints and incomplete configuration before creating a cloud session", () => {
  for (const value of [
    "api.example.test",
    "http://api.example.test",
    "https://api.example.test?bad=1",
  ]) {
    assert.deepEqual(readCloudConfig({ ...env, VITE_API_URL: value }), {
      mode: "invalid",
      message: "VITE_API_URL must be a valid HTTPS URL.",
    });
  }
  assert.equal(
    readCloudConfig({
      ...env,
      VITE_COGNITO_DOMAIN: "https://login.example.test/path",
    }).mode,
    "invalid",
  );
  assert.equal(
    readCloudConfig({ ...env, VITE_COGNITO_CLIENT_ID: "" }).mode,
    "invalid",
  );
});
