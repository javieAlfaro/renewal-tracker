import { UserManager, WebStorageStateStore, type User } from "oidc-client-ts";
import { subscriptionApi } from "./subscriptions-api";

const apiUrl = import.meta.env.VITE_API_URL;
const authority = import.meta.env.VITE_COGNITO_ISSUER;
const domain = import.meta.env.VITE_COGNITO_DOMAIN;
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
const config = [apiUrl, authority, domain, clientId];
const returnUrl = `${window.location.origin}/`;

export const hasCloudConfig = config.some(Boolean);

function createCloudSession() {
  if (!config.every(Boolean)) return null;

  const manager = new UserManager({
    authority,
    client_id: clientId,
    redirect_uri: returnUrl,
    response_type: "code",
    scope: "openid email aws.cognito.signin.user.admin",
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: false,
    loadUserInfo: false,
  });
  let refresh: Promise<User | null> | undefined;
  let initialSession: Promise<User | null> | undefined;

  return {
    initialize() {
      initialSession ??= (async () => {
        const url = new URL(window.location.href);
        if (
          url.searchParams.has("state") &&
          (url.searchParams.has("code") || url.searchParams.has("error"))
        ) {
          try {
            return await manager.signinRedirectCallback();
          } finally {
            window.history.replaceState(null, "", returnUrl);
          }
        }
        const user = await manager.getUser();
        return user?.expired && !user.refresh_token ? null : user;
      })();
      return initialSession;
    },
    signIn: () => manager.signinRedirect(),
    async signOut() {
      await manager.removeUser();
      const url = new URL("/logout", domain);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("logout_uri", returnUrl);
      window.location.assign(url);
    },
    api: subscriptionApi(apiUrl, async () => {
      const user = await manager.getUser();
      if (user && !user.expired) return user.access_token;
      if (user?.refresh_token) {
        refresh ??= manager.signinSilent().finally(() => {
          refresh = undefined;
        });
        const renewed = await refresh.catch(() => null);
        if (renewed && !renewed.expired) return renewed.access_token;
      }
      throw new Error("Your session has expired. Sign out and sign in again.");
    }),
  };
}

export const cloudSession = createCloudSession();
