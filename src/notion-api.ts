import type {
  AppendBlockChildrenResponse,
  NotionApiErrorPayload,
  NotionBlock,
  NotionBlockInput,
  NotionDataSource,
  NotionDatabase,
  NotionListResponse,
  NotionPage,
} from "./notion-types";

const REQUESTS_PER_SECOND = 3;
const WINDOW_MS = 1_000;

export class NotionApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NotionApiError";
  }
}

export class NotionApiClient {
  private requestTimestamps: number[] = [];

  constructor(
    private readonly token: string,
    private readonly notionApiVersion: string,
  ) {}

  async retrievePage(pageId: string): Promise<NotionPage> {
    return this.request<NotionPage>("GET", `pages/${pageId}`);
  }

  async retrieveDatabase(databaseId: string): Promise<NotionDatabase> {
    return this.request<NotionDatabase>("GET", `databases/${databaseId}`);
  }

  async retrieveDataSource(dataSourceId: string): Promise<NotionDataSource> {
    return this.request<NotionDataSource>("GET", `data_sources/${dataSourceId}`);
  }

  async queryDataSource(
    dataSourceId: string,
    startCursor?: string,
  ): Promise<NotionListResponse<NotionPage>> {
    return this.request<NotionListResponse<NotionPage>>(
      "POST",
      `data_sources/${dataSourceId}/query`,
      {
        body: {
          page_size: 100,
          ...(startCursor ? { start_cursor: startCursor } : {}),
        },
      },
    );
  }

  async listBlockChildren(blockId: string, startCursor?: string): Promise<NotionListResponse<NotionBlock>> {
    return this.request<NotionListResponse<NotionBlock>>("GET", `blocks/${blockId}/children`, {
      query: {
        page_size: "100",
        ...(startCursor ? { start_cursor: startCursor } : {}),
      },
    });
  }

  async listAllBlockChildren(blockId: string): Promise<NotionBlock[]> {
    const results: NotionBlock[] = [];
    let nextCursor: string | undefined;
    const seenCursors = new Set<string>();

    do {
      if (nextCursor) {
        assertCursorAdvances(seenCursors, nextCursor, `block children for ${blockId}`);
      }

      const response = await this.listBlockChildren(blockId, nextCursor);
      results.push(...response.results);
      nextCursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (nextCursor);

    return results;
  }

  async deleteBlock(blockId: string): Promise<void> {
    await this.request("DELETE", `blocks/${blockId}`);
  }

  async appendBlocks(
    blockId: string,
    blocks: NotionBlockInput[],
    options?: {
      position?: {
        type: "start";
      } | {
        type: "after_block";
        after_block: {
          id: string;
        };
      };
    },
  ): Promise<void> {
    if (blocks.length === 0) {
      return;
    }

    const chunks = chunkArray(blocks, 100);
    let pendingPosition = options?.position;

    for (const chunk of chunks) {
      await this.request<AppendBlockChildrenResponse>("PATCH", `blocks/${blockId}/children`, {
        body: {
          children: chunk,
          ...(pendingPosition ? { position: pendingPosition } : {}),
        },
      });

      pendingPosition = undefined;
    }
  }

  isNotFoundOrForbidden(error: unknown): boolean {
    return error instanceof NotionApiError && (error.status === 403 || error.status === 404);
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string>;
    },
  ): Promise<T> {
    await this.throttle();

    const url = new URL(`https://api.notion.com/v1/${path}`);

    for (const [key, value] of Object.entries(options?.query ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "Notion-Version": this.notionApiVersion,
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorPayload = await tryReadJson<NotionApiErrorPayload>(response);
      throw new NotionApiError(
        response.status,
        errorPayload?.code ?? "unknown_error",
        errorPayload?.message ?? `${method} ${path} failed with ${response.status}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private async throttle(): Promise<void> {
    while (true) {
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter((timestamp) => now - timestamp < WINDOW_MS);

      if (this.requestTimestamps.length < REQUESTS_PER_SECOND) {
        this.requestTimestamps.push(now);
        return;
      }

      const oldest = this.requestTimestamps[0];
      const waitMs = WINDOW_MS - (now - oldest) + 10;
      await sleep(waitMs);
    }
  }
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

async function tryReadJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertCursorAdvances(seenCursors: Set<string>, cursor: string, label: string): void {
  if (seenCursors.has(cursor)) {
    throw new Error(`Notion pagination cursor repeated while loading ${label}. Stopping to avoid an infinite loop.`);
  }

  seenCursors.add(cursor);
}
