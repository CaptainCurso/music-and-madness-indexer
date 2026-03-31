import { loadConfig, normalizeNotionId, tryExtractNotionId } from "./config";
import { NotionApiClient, NotionApiError } from "./notion-api";
import {
  hasStoredRefreshToken,
  isOAuthConfigured,
  refreshStoredAccessToken,
} from "./notion-oauth";
import type { DataSourcePropertySchema, NotionBlock, NotionPage } from "./notion-types";
import {
  buildCrawledPage,
  buildQueueBlocks,
  type CatalogRow,
  type CrawledPage,
  type DuplicateGroup,
  type ScanReport,
} from "./queue-blocks";

async function main(): Promise<void> {
  await ensureOAuthAccessTokenReady();

  try {
    await runScan();
  } catch (error) {
    if (await shouldRetryAfterOAuthRefresh(error)) {
      await runScan();
      return;
    }

    throw error;
  }
}

async function runScan(): Promise<void> {
  const config = loadConfig();
  const notion = new NotionApiClient(config.notionToken, config.notionApiVersion);

  console.log("Starting Music and Madness scan.");
  console.log(`Root page ID: ${config.rootPageId}`);

  const crawledPages = await crawlWiki(notion, config.rootPageId, config.excludedPageIds);
  console.log(`Wiki crawl complete. Pages found: ${crawledPages.length}`);

  console.log(`Loading catalog database: ${config.catalogDatabaseId}`);
  const catalogRows = await loadCatalogRows(
    notion,
    config.catalogDatabaseId,
    config.catalogDataSourceId,
    config.sourcePageUrlPropertyName,
  );
  console.log(`Catalog query complete. Rows found: ${catalogRows.length}`);

  const report = computeDiff(crawledPages, catalogRows);
  console.log(
    `Diff summary: to index=${report.toIndex.length}, duplicates=${report.duplicates.length}, orphans=${report.orphans.length}`,
  );

  await rewriteWorkQueue(notion, config.workQueuePageId, report, config.queueStartHeading);
  console.log(`Work queue updated successfully: ${config.workQueuePageId}`);
}

async function ensureOAuthAccessTokenReady(): Promise<void> {
  if (!isOAuthConfigured()) {
    return;
  }

  if (process.env.NOTION_ACCESS_TOKEN?.trim()) {
    return;
  }

  if (hasStoredRefreshToken()) {
    console.log("Refreshing stored Notion OAuth access token before the scan.");
    await refreshStoredAccessToken();
    return;
  }

  throw new Error(
    "No NOTION_ACCESS_TOKEN is configured yet. Open the authorization URL and run `npm run oauth:exchange -- --code=<code>` first.",
  );
}

async function shouldRetryAfterOAuthRefresh(error: unknown): Promise<boolean> {
  if (!(error instanceof NotionApiError) || error.status !== 401) {
    return false;
  }

  if (!isOAuthConfigured() || !hasStoredRefreshToken()) {
    return false;
  }

  console.log("Stored OAuth access token was rejected. Refreshing and retrying once.");
  await refreshStoredAccessToken();
  return true;
}

async function crawlWiki(
  notion: NotionApiClient,
  rootPageId: string,
  excludedPageIds: Set<string>,
): Promise<CrawledPage[]> {
  const crawledPages: CrawledPage[] = [];
  const visitedPageIds = new Set<string>();
  const visitedContainerIds = new Set<string>();
  let nextProgressLogAt = 25;
  await crawlRootContainer();

  return crawledPages.sort(comparePagesByPath);

  async function crawlRootContainer(): Promise<void> {
    try {
      const rootPage = await notion.retrievePage(rootPageId);
      console.log(`Scanning root page: ${getPageTitle(rootPage)}`);
      await crawlRootPageBlocks();
      return;
    } catch (error) {
      if (!isWrongObjectTypeError(error, "database")) {
        throw error;
      }
    }

    const rootDatabase = await notion.retrieveDatabase(rootPageId);
    console.log(`Scanning root database: ${getDatabaseLabel(rootDatabase)}`);
    const topLevelPages = await loadRootDatabasePages(notion, rootDatabase);

    for (const page of topLevelPages) {
      const path = buildPath("", page.title);
      console.log(`Starting top-level section: ${path}`);
      const sectionCount = await crawlPageSubtree(page.id, page.title, path);

      if (sectionCount > 0) {
        console.log(`Section ${path}: ${sectionCount} page(s)`);
      }
    }
  }

  async function crawlRootPageBlocks(): Promise<void> {
    const rootBlocks = await safelyListBlockChildren(notion, rootPageId, "root page");
    let inlineRootPages = 0;

    for (const block of rootBlocks) {
      if (isChildPageBlock(block)) {
        const pageId = normalizeNotionId(block.id);
        const title = getChildPageTitle(block);
        const path = buildPath("", title);
        console.log(`Starting top-level section: ${path}`);
        const sectionCount = await crawlPageSubtree(pageId, title, path);

        if (sectionCount > 0) {
          console.log(`Section ${path}: ${sectionCount} page(s)`);
        }

        continue;
      }

      if (block.type === "child_database") {
        continue;
      }

      if (block.has_children) {
        inlineRootPages += await crawlNestedBlocks(block.id, "");
      }
    }

    if (inlineRootPages > 0) {
      console.log(`Root inline blocks: ${inlineRootPages} page(s)`);
    }
  }

  async function crawlPageSubtree(pageId: string, title: string, path: string): Promise<number> {
    if (excludedPageIds.has(pageId)) {
      console.log(`Skipping excluded subtree: ${path}`);
      return 0;
    }

    if (visitedPageIds.has(pageId)) {
      return 0;
    }

    const pageBlocks = await listPageBlocksOrSkip(pageId, path);

    if (!pageBlocks) {
      return 0;
    }

    visitedPageIds.add(pageId);
    visitedContainerIds.add(pageId);
    crawledPages.push(buildCrawledPage(pageId, title, path));
    logCrawlProgress(path);

    const descendantCount = await crawlListedBlocks(pageBlocks, path);
    return 1 + descendantCount;
  }

  async function crawlNestedBlocks(containerId: string, currentPath: string): Promise<number> {
    const normalizedContainerId = normalizeNotionId(containerId);

    if (visitedContainerIds.has(normalizedContainerId)) {
      return 0;
    }

    visitedContainerIds.add(normalizedContainerId);

    const blocks = await safelyListBlockChildren(notion, normalizedContainerId, currentPath || "root container");
    return crawlListedBlocks(blocks, currentPath);
  }

  async function crawlListedBlocks(blocks: NotionBlock[], currentPath: string): Promise<number> {
    let discoveredCount = 0;

    for (const block of blocks) {
      if (isChildPageBlock(block)) {
        const pageId = normalizeNotionId(block.id);
        const title = getChildPageTitle(block);
        const path = buildPath(currentPath, title);
        discoveredCount += await crawlPageSubtree(pageId, title, path);
        continue;
      }

      if (block.type === "child_database") {
        continue;
      }

      if (block.has_children) {
        discoveredCount += await crawlNestedBlocks(block.id, currentPath);
      }
    }

    return discoveredCount;
  }

  async function listPageBlocksOrSkip(pageId: string, path: string): Promise<NotionBlock[] | null> {
    try {
      return await notion.listAllBlockChildren(pageId);
    } catch (error) {
      if (notion.isNotFoundOrForbidden(error)) {
        console.warn(`Skipping inaccessible page ${pageId} at ${path}`);
        return null;
      }

      throw error;
    }
  }

  function logCrawlProgress(path: string): void {
    if (crawledPages.length === 1 || crawledPages.length >= nextProgressLogAt) {
      console.log(`Crawled pages so far: ${crawledPages.length} (latest: ${path})`);

      while (crawledPages.length >= nextProgressLogAt) {
        nextProgressLogAt += 25;
      }
    }
  }
}

async function loadCatalogRows(
  notion: NotionApiClient,
  catalogDatabaseId: string,
  explicitDataSourceId: string | undefined,
  sourcePageUrlPropertyName: string,
): Promise<CatalogRow[]> {
  const database = await notion.retrieveDatabase(catalogDatabaseId);
  const dataSourceId = explicitDataSourceId ?? resolveSingleDataSourceId(database);

  console.log(`Using catalog data source: ${dataSourceId}`);

  const dataSource = await notion.retrieveDataSource(dataSourceId);
  assertUrlPropertyExists(dataSource.properties, sourcePageUrlPropertyName);

  const rows: CatalogRow[] = [];
  let nextCursor: string | undefined;
  let lastLoggedCount = -1;
  const seenCursors = new Set<string>();

  do {
    if (nextCursor) {
      assertCursorAdvances(seenCursors, nextCursor, `catalog rows for data source ${dataSourceId}`);
    }

    const response = await notion.queryDataSource(dataSourceId, nextCursor);

    for (const page of response.results) {
      if (page.object !== "page") {
        continue;
      }

      if (page.archived || page.in_trash) {
        continue;
      }

      const sourcePageUrl = getUrlProperty(page, sourcePageUrlPropertyName);

      rows.push({
        id: normalizeNotionId(page.id),
        title: getPageTitle(page),
        sourcePageUrl,
        sourcePageId: tryExtractNotionId(sourcePageUrl),
      });
    }

    nextCursor = response.has_more ? response.next_cursor ?? undefined : undefined;

    if (rows.length !== lastLoggedCount || !nextCursor) {
      console.log(`Catalog rows loaded so far: ${rows.length}`);
      lastLoggedCount = rows.length;
    }
  } while (nextCursor);

  return rows.sort(compareRowsByTitle);
}

function computeDiff(crawledPages: CrawledPage[], catalogRows: CatalogRow[]): ScanReport {
  const pageById = new Map(crawledPages.map((page) => [page.id, page]));
  const rowsBySourcePageId = new Map<string, CatalogRow[]>();
  const orphans: CatalogRow[] = [];

  for (const row of catalogRows) {
    if (!row.sourcePageId) {
      orphans.push(row);
      continue;
    }

    if (!pageById.has(row.sourcePageId)) {
      orphans.push(row);
      continue;
    }

    const existingRows = rowsBySourcePageId.get(row.sourcePageId) ?? [];
    existingRows.push(row);
    rowsBySourcePageId.set(row.sourcePageId, existingRows);
  }

  const toIndex = crawledPages
    .filter((page) => !rowsBySourcePageId.has(page.id))
    .sort(comparePagesByPath);

  const duplicates: DuplicateGroup[] = Array.from(rowsBySourcePageId.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([pageId, rows]) => ({
      page: pageById.get(pageId)!,
      rows: [...rows].sort(compareRowsByTitle),
    }))
    .sort((left, right) => comparePagesByPath(left.page, right.page));

  const alreadyCataloged = crawledPages.filter((page) => rowsBySourcePageId.has(page.id)).length;

  return {
    scannedAt: new Date(),
    pagesCrawled: crawledPages.length,
    alreadyCataloged,
    toIndex,
    duplicates,
    orphans: orphans.sort(compareRowsByTitle),
  };
}

async function rewriteWorkQueue(
  notion: NotionApiClient,
  workQueuePageId: string,
  report: ScanReport,
  queueStartHeading: string,
): Promise<void> {
  console.log(`Rewriting work queue page: ${workQueuePageId}`);
  const existingBlocks = await notion.listAllBlockChildren(workQueuePageId);
  console.log(`Existing top-level queue blocks: ${existingBlocks.length}`);

  for (const block of existingBlocks) {
    await notion.deleteBlock(block.id);
  }

  const newBlocks = buildQueueBlocks(report, queueStartHeading);
  await notion.appendBlocks(workQueuePageId, newBlocks);
}

async function safelyListBlockChildren(
  notion: NotionApiClient,
  blockId: string,
  label: string,
): Promise<NotionBlock[]> {
  try {
    return await notion.listAllBlockChildren(blockId);
  } catch (error) {
    if (notion.isNotFoundOrForbidden(error)) {
      console.warn(`Skipping inaccessible block container for ${label}: ${blockId}`);
      return [];
    }

    throw error;
  }
}

async function loadRootDatabasePages(
  notion: NotionApiClient,
  database: { id: string; data_sources?: Array<{ id: string; name: string }> },
): Promise<Array<{ id: string; title: string }>> {
  const dataSourceId = resolveSingleDataSourceId(database);
  const rootDatabaseId = normalizeNotionId(database.id);
  const pages: Array<{ id: string; title: string }> = [];
  let nextCursor: string | undefined;
  let lastLoggedCount = -1;
  const seenCursors = new Set<string>();

  do {
    if (nextCursor) {
      assertCursorAdvances(seenCursors, nextCursor, `root database pages for ${rootDatabaseId}`);
    }

    const response = await notion.queryDataSource(dataSourceId, nextCursor);

    for (const page of response.results) {
      if (page.object !== "page" || page.archived || page.in_trash) {
        continue;
      }

      if (page.parent?.type !== "database_id" || !page.parent.database_id) {
        continue;
      }

      if (normalizeNotionId(page.parent.database_id) !== rootDatabaseId) {
        continue;
      }

      pages.push({
        id: normalizeNotionId(page.id),
        title: getPageTitle(page),
      });
    }

    nextCursor = response.has_more ? response.next_cursor ?? undefined : undefined;

    if (pages.length !== lastLoggedCount || !nextCursor) {
      console.log(`Root database pages loaded so far: ${pages.length}`);
      lastLoggedCount = pages.length;
    }
  } while (nextCursor);

  return pages.sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
}

function resolveSingleDataSourceId(database: { data_sources?: Array<{ id: string; name: string }> }): string {
  const dataSources = database.data_sources ?? [];

  if (dataSources.length === 1) {
    return normalizeNotionId(dataSources[0].id);
  }

  if (dataSources.length === 0) {
    throw new Error("The catalog database does not expose any data sources through the Notion API.");
  }

  const summary = dataSources.map((source) => `${source.name || "Untitled"} (${source.id})`).join(", ");
  throw new Error(
    `The catalog database has multiple data sources. Set NOTION_CATALOG_DATA_SOURCE_URL_OR_ID to one of these IDs: ${summary}`,
  );
}

function isWrongObjectTypeError(error: unknown, expectedObjectType: string): boolean {
  return (
    error instanceof NotionApiError
    && error.status === 400
    && error.message.includes(`is a ${expectedObjectType}, not a page`)
  );
}

function getDatabaseLabel(database: { id: string; data_sources?: Array<{ id: string; name: string }> }): string {
  const firstNamedDataSource = (database.data_sources ?? []).find((dataSource) => dataSource.name?.trim());
  return firstNamedDataSource?.name?.trim() || database.id;
}

function assertUrlPropertyExists(
  properties: Record<string, DataSourcePropertySchema>,
  sourcePageUrlPropertyName: string,
): void {
  const property = properties[sourcePageUrlPropertyName];

  if (!property) {
    const availableProperties = Object.keys(properties).sort().join(", ");
    throw new Error(
      `Could not find the catalog property "${sourcePageUrlPropertyName}". Available properties: ${availableProperties}`,
    );
  }

  if (property.type !== "url") {
    throw new Error(
      `The catalog property "${sourcePageUrlPropertyName}" exists, but it is type "${property.type}" instead of "url".`,
    );
  }
}

function getUrlProperty(page: NotionPage, propertyName: string): string | null {
  const property = page.properties[propertyName];

  if (!property || property.type !== "url") {
    return null;
  }

  return property.url ?? null;
}

function getPageTitle(page: NotionPage): string {
  for (const property of Object.values(page.properties)) {
    if (property.type === "title") {
      const title = (property.title ?? []).map((item) => item.plain_text).join("").trim();
      return title || "Untitled";
    }
  }

  return "Untitled";
}

function isChildPageBlock(block: NotionBlock): boolean {
  return block.type === "child_page" && Boolean(block.child_page);
}

function getChildPageTitle(block: NotionBlock): string {
  const title = block.child_page?.title?.trim();
  return title || "Untitled";
}

function buildPath(parentPath: string, title: string): string {
  const sanitizedTitle = title.trim() || "Untitled";
  return parentPath ? `${parentPath}/${sanitizedTitle}` : `/${sanitizedTitle}`;
}

function comparePagesByPath(left: CrawledPage, right: CrawledPage): number {
  return left.path.localeCompare(right.path) || left.id.localeCompare(right.id);
}

function compareRowsByTitle(left: CatalogRow, right: CatalogRow): number {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

function assertCursorAdvances(seenCursors: Set<string>, cursor: string, label: string): void {
  if (seenCursors.has(cursor)) {
    throw new Error(`Notion pagination cursor repeated while loading ${label}. Stopping to avoid an infinite loop.`);
  }

  seenCursors.add(cursor);
}

main().catch((error: unknown) => {
  console.error("Scanner failed.");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
});
