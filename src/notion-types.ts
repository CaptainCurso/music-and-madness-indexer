export interface RichTextItem {
  plain_text: string;
}

export interface PagePropertyValue {
  id?: string;
  type: string;
  title?: RichTextItem[];
  url?: string | null;
}

export interface NotionPage {
  object: "page";
  id: string;
  url: string;
  archived?: boolean;
  in_trash?: boolean;
  properties: Record<string, PagePropertyValue>;
}

export interface NotionBlock {
  object: "block";
  id: string;
  type: string;
  has_children: boolean;
  child_page?: {
    title: string;
  };
}

export interface NotionListResponse<T> {
  object: "list";
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface DataSourcePropertySchema {
  id: string;
  name: string;
  type: string;
}

export interface NotionDataSource {
  object: "data_source";
  id: string;
  properties: Record<string, DataSourcePropertySchema>;
}

export interface NotionDatabase {
  object: "database";
  id: string;
  data_sources?: Array<{
    id: string;
    name: string;
  }>;
}

export interface NotionApiErrorPayload {
  object: "error";
  status: number;
  code: string;
  message: string;
}

export interface NotionBlockInput {
  object: "block";
  type: string;
  [key: string]: unknown;
}

export interface AppendBlockChildrenResponse extends NotionListResponse<NotionBlock> {}
