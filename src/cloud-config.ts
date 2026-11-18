const settings = [
  "VITE_API_URL",
  "VITE_COGNITO_ISSUER",
  "VITE_COGNITO_DOMAIN",
  "VITE_COGNITO_CLIENT_ID",
] as const;

export function readCloudConfig(env: Record<string, string | undefined>) {
  const [apiUrl, authority, domain, clientId] = settings.map(
    (name) => env[name]?.trim() ?? "",
  );
  if (![apiUrl, authority, domain, clientId].some(Boolean)) {
    return { mode: "demo" } as const;
  }

  for (const [index, value] of [apiUrl, authority, domain].entries()) {
    const url = URL.canParse(value) ? new URL(value) : null;
    if (
      url?.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (index === 2 && url.pathname !== "/")
    ) {
      return {
        mode: "invalid",
        message: `${settings[index]} must be a valid HTTPS ${index === 2 ? "origin" : "URL"}.`,
      } as const;
    }
  }
  if (!clientId || /\s/.test(clientId)) {
    return {
      mode: "invalid",
      message: "Set VITE_COGNITO_CLIENT_ID to the Cognito app client ID.",
    } as const;
  }

  return { mode: "cloud", apiUrl, authority, domain, clientId } as const;
}
