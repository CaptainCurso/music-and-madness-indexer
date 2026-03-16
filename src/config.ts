import dotenv from "dotenv";

dotenv.config();

export interface ScannerConfig {
  notionToken: string;
  notionApiVersion: string;
  rootPageId: string;
  catalogDatabaseId: string;
  catalogDataSourceId?: string;
  workQueuePageId: string;
  excludedPageIds: Set<string>;
  sourcePageUrlPropertyName: string;
  queueStartHeading: string;
}

export function loadConfig(): ScannerConfig {
  const notionToken = resolveNotionBearerToken();
  const notionApiVersion = getNotionApiVersion();
  const rootPageId = extractNotionId(requireEnv("NOTION_ROOT_PAGE_URL_OR_ID"));
  const catalogDatabaseId = extractNotionId(requireEnv("NOTION_CATALOG_DATABASE_URL_OR_ID"));
  const catalogDataSourceRaw = process.env.NOTION_CATALOG_DATA_SOURCE_URL_OR_ID?.trim();
  const catalogDataSourceId = catalogDataSourceRaw
    ? extractNotionId(catalogDataSourceRaw)
    : undefined;
  const workQueuePageId = extractNotionId(requireEnv("NOTION_WORK_QUEUE_PAGE_URL_OR_ID"));
  const excludedPageIds = new Set(
    parseListEnv("NOTION_EXCLUDED_PAGE_URLS_OR_IDS").map((value) => extractNotionId(value)),
  );

  return {
    notionToken,
    notionApiVersion,
    rootPageId,
    catalogDatabaseId,
    catalogDataSourceId,
    workQueuePageId,
    excludedPageIds,
    sourcePageUrlPropertyName: process.env.SOURCE_PAGE_URL_PROPERTY_NAME?.trim() || "Source Page URL",
    queueStartHeading: process.env.QUEUE_START_HEADING?.trim() || "QUEUE START",
  };
}

export function getNotionApiVersion(): string {
  return process.env.NOTION_API_VERSION?.trim() || "2026-03-11";
}

export function resolveNotionBearerToken(): string {
  const accessToken = process.env.NOTION_ACCESS_TOKEN?.trim();

  if (accessToken) {
    return accessToken;
  }

  if (isOAuthModeConfigured()) {
    throw new Error(
      "No NOTION_ACCESS_TOKEN is configured yet. Complete the OAuth flow first with `npm run oauth:exchange -- --code=<code>`.",
    );
  }

  return requireEnv("NOTION_TOKEN");
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseListEnv(name: string): string[] {
  const raw = requireEnv(name);

  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function extractNotionId(value: string): string {
  const matches = value.match(
    /[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g,
  );

  if (!matches || matches.length === 0) {
    throw new Error(`Could not find a Notion ID in: ${value}`);
  }

  return normalizeNotionId(matches[0]);
}

export function tryExtractNotionId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    return extractNotionId(value);
  } catch {
    return null;
  }
}

export function normalizeNotionId(value: string): string {
  const hex = value.replace(/-/g, "").toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`Invalid Notion ID: ${value}`);
  }

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildNotionPageUrl(pageId: string): string {
  return `https://www.notion.so/${pageId.replace(/-/g, "")}`;
}

export function isOAuthModeConfigured(): boolean {
  return Boolean(
    process.env.OAUTH_CLIENT_ID?.trim()
      || process.env.OAUTH_REDIRECT_URI?.trim()
      || process.env.NOTION_AUTH_URL?.trim()
      || process.env.OAUTH_CLIENT_SECRET?.trim(),
  );
}
