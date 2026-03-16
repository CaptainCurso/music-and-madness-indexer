import { getNotionApiVersion } from "./config";
import { upsertEnvValues } from "./env-file";

const NOTION_AUTHORIZE_URL = "https://api.notion.com/v1/oauth/authorize";
const NOTION_TOKEN_URL = "https://api.notion.com/v1/oauth/token";

export interface OAuthRuntimeConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  authorizationUrl?: string;
  accessToken?: string;
  refreshToken?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string | null;
  workspace_icon?: string | null;
  duplicated_template_id?: string | null;
  owner?: unknown;
  refresh_token?: string | null;
}

export function isOAuthConfigured(): boolean {
  return Boolean(
    process.env.OAUTH_CLIENT_ID?.trim()
      || process.env.OAUTH_REDIRECT_URI?.trim()
      || process.env.NOTION_AUTH_URL?.trim()
      || process.env.OAUTH_CLIENT_SECRET?.trim(),
  );
}

export function loadOAuthRuntimeConfig(): OAuthRuntimeConfig {
  const authorizationUrl = process.env.NOTION_AUTH_URL?.trim() || undefined;
  const clientId = process.env.OAUTH_CLIENT_ID?.trim() || getQueryParam(authorizationUrl, "client_id");
  const redirectUri = process.env.OAUTH_REDIRECT_URI?.trim() || getQueryParam(authorizationUrl, "redirect_uri");
  const clientSecret = process.env.OAUTH_CLIENT_SECRET?.trim() || process.env.NOTION_TOKEN?.trim() || undefined;
  const accessToken = process.env.NOTION_ACCESS_TOKEN?.trim() || undefined;
  const refreshToken = process.env.NOTION_REFRESH_TOKEN?.trim() || undefined;

  return {
    clientId,
    clientSecret,
    redirectUri,
    authorizationUrl,
    accessToken,
    refreshToken,
  };
}

export function getAuthorizationUrl(): string {
  const config = loadOAuthRuntimeConfig();

  if (config.authorizationUrl) {
    return config.authorizationUrl;
  }

  if (!config.clientId || !config.redirectUri) {
    throw new Error(
      "Missing OAuth settings. Add OAUTH_CLIENT_ID and OAUTH_REDIRECT_URI to .env, or set NOTION_AUTH_URL.",
    );
  }

  return buildAuthorizationUrl(config.clientId, config.redirectUri);
}

export async function exchangeAuthorizationCode(input: string): Promise<OAuthTokenResponse> {
  const config = requireOAuthConfig({
    requireClientId: true,
    requireClientSecret: true,
    requireRedirectUri: true,
  });
  const code = normalizeAuthorizationCode(input);

  if (!code) {
    throw new Error(
      "Missing authorization code. Run `npm run oauth:exchange -- --code=<code-or-full-callback-url>`.",
    );
  }

  const response = await requestOAuthTokens(
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri!,
    },
    config,
  );

  persistOAuthTokens(response);
  return response;
}

export async function refreshStoredAccessToken(): Promise<OAuthTokenResponse> {
  const config = requireOAuthConfig({
    requireClientId: true,
    requireClientSecret: true,
    requireRefreshToken: true,
  });

  const response = await requestOAuthTokens(
    {
      grant_type: "refresh_token",
      refresh_token: config.refreshToken!,
    },
    config,
  );

  persistOAuthTokens(response);
  return response;
}

export function hasStoredRefreshToken(): boolean {
  return Boolean(process.env.NOTION_REFRESH_TOKEN?.trim());
}

function buildAuthorizationUrl(clientId: string, redirectUri: string): string {
  const url = new URL(NOTION_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

function requireOAuthConfig(requirements: {
  requireClientId?: boolean;
  requireClientSecret?: boolean;
  requireRedirectUri?: boolean;
  requireRefreshToken?: boolean;
}): OAuthRuntimeConfig {
  const config = loadOAuthRuntimeConfig();

  if (requirements.requireClientId && !config.clientId) {
    throw new Error("Missing OAUTH_CLIENT_ID. Add it to .env before using the OAuth helper.");
  }

  if (requirements.requireClientSecret && !config.clientSecret) {
    throw new Error(
      "Missing OAuth client secret. Add OAUTH_CLIENT_SECRET to .env, or store the client secret in NOTION_TOKEN as a fallback.",
    );
  }

  if (requirements.requireRedirectUri && !config.redirectUri) {
    throw new Error(
      "Missing OAUTH_REDIRECT_URI. Add it to .env, or include redirect_uri inside NOTION_AUTH_URL.",
    );
  }

  if (requirements.requireRefreshToken && !config.refreshToken) {
    throw new Error(
      "Missing NOTION_REFRESH_TOKEN. Run `npm run oauth:exchange -- --code=<code>` first.",
    );
  }

  return config;
}

async function requestOAuthTokens(
  body: Record<string, string>,
  config: OAuthRuntimeConfig,
): Promise<OAuthTokenResponse> {
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(NOTION_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
      "Notion-Version": getNotionApiVersion(),
    },
    body: JSON.stringify(body),
  });

  const payloadText = await response.text();
  const payload = tryParseJson(payloadText);

  if (!response.ok) {
    const message = isErrorPayload(payload) ? payload.message : payloadText;
    throw new Error(`OAuth token request failed (${response.status}): ${message}`);
  }

  if (!payload || typeof payload !== "object" || typeof payload.access_token !== "string") {
    throw new Error("OAuth token request succeeded, but the response did not include an access token.");
  }

  return payload as unknown as OAuthTokenResponse;
}

function persistOAuthTokens(response: OAuthTokenResponse): void {
  const valuesToPersist: Record<string, string> = {
    NOTION_ACCESS_TOKEN: response.access_token,
    NOTION_REFRESH_TOKEN: response.refresh_token ?? "",
  };

  upsertEnvValues(valuesToPersist);
  process.env.NOTION_ACCESS_TOKEN = response.access_token;
  process.env.NOTION_REFRESH_TOKEN = response.refresh_token ?? "";
}

function normalizeAuthorizationCode(input: string): string {
  const trimmedInput = input.trim();

  if (!trimmedInput) {
    return "";
  }

  try {
    const url = new URL(trimmedInput);
    const error = url.searchParams.get("error");

    if (error) {
      const description = url.searchParams.get("error_description");
      throw new Error(description ? `${error}: ${description}` : error);
    }

    return url.searchParams.get("code")?.trim() || "";
  } catch {
    return trimmedInput;
  }
}

function getQueryParam(rawUrl: string | undefined, key: string): string | undefined {
  if (!rawUrl) {
    return undefined;
  }

  try {
    return new URL(rawUrl).searchParams.get(key) || undefined;
  } catch {
    return undefined;
  }
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isErrorPayload(value: Record<string, unknown> | null): value is { message: string } {
  return Boolean(value && typeof value.message === "string");
}
