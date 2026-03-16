import { buildNotionPageUrl } from "./config";
import type { NotionBlockInput } from "./notion-types";

export interface CrawledPage {
  id: string;
  title: string;
  path: string;
  url: string;
}

export interface CatalogRow {
  id: string;
  title: string;
  sourcePageUrl: string | null;
  sourcePageId: string | null;
}

export interface DuplicateGroup {
  page: CrawledPage;
  rows: CatalogRow[];
}

export interface ScanReport {
  scannedAt: Date;
  pagesCrawled: number;
  alreadyCataloged: number;
  toIndex: CrawledPage[];
  duplicates: DuplicateGroup[];
  orphans: CatalogRow[];
}

export function buildQueueBlocks(report: ScanReport, queueStartHeading: string): NotionBlockInput[] {
  const blocks: NotionBlockInput[] = [
    heading2("Scanner Summary"),
    bullet(`Scan date: ${formatScanDate(report.scannedAt)}`),
    bullet(`Pages crawled: ${report.pagesCrawled}`),
    bullet(`Already cataloged: ${report.alreadyCataloged}`),
    bullet(`To index: ${report.toIndex.length}`),
    bullet(`Duplicates: ${report.duplicates.length}`),
    bullet(`Orphans: ${report.orphans.length}`),
    divider(),
    heading2(queueStartHeading),
  ];

  for (const page of report.toIndex) {
    blocks.push(heading3(`ACTION: INDEX — ${page.title}`));
    blocks.push(bullet(`Source URL: ${page.url}`, page.url));
    blocks.push(bullet(`Path from root: ${page.path}`));
    blocks.push(bullet(`Page ID: ${page.id}`));
  }

  for (const duplicate of report.duplicates) {
    blocks.push(heading3(`ACTION: REVIEW_DUPLICATE — ${duplicate.page.title}`));
    blocks.push(bullet(`Source URL: ${duplicate.page.url}`, duplicate.page.url));
    blocks.push(bullet(`Catalog row count: ${duplicate.rows.length}`));
    blocks.push(bullet(`Catalog row IDs: ${duplicate.rows.map((row) => row.id).join(", ")}`));
  }

  for (const orphan of report.orphans) {
    blocks.push(heading3(`ACTION: REVIEW_ORPHAN — ${orphan.title}`));
    blocks.push(bullet(`Catalog row ID: ${orphan.id}`));
    blocks.push(
      bullet(
        `Stored source URL: ${orphan.sourcePageUrl ?? "Missing"}`,
        orphan.sourcePageUrl ?? undefined,
      ),
    );
  }

  return blocks;
}

export function buildCrawledPage(id: string, title: string, path: string): CrawledPage {
  return {
    id,
    title,
    path,
    url: buildNotionPageUrl(id),
  };
}

function heading2(text: string): NotionBlockInput {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [textSpan(text)],
    },
  };
}

function heading3(text: string): NotionBlockInput {
  return {
    object: "block",
    type: "heading_3",
    heading_3: {
      rich_text: [textSpan(text)],
    },
  };
}

function bullet(text: string, link?: string): NotionBlockInput {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [textSpan(text, link)],
    },
  };
}

function divider(): NotionBlockInput {
  return {
    object: "block",
    type: "divider",
    divider: {},
  };
}

function textSpan(content: string, link?: string): Record<string, unknown> {
  return {
    type: "text",
    text: {
      content,
      ...(link ? { link: { url: link } } : {}),
    },
  };
}

function formatScanDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}
