/**
 * File: exportTypes.ts
 * Path: server/channel/exportTypes.ts
 * Description: Row and listing types shared by the channel exporter.
 */


export interface RawComment {
  id?: string;
  parent?: string;
  text?: string;
  author?: string;
  author_id?: string;
  author_is_uploader?: boolean;
  is_pinned?: boolean;
  like_count?: number | null;
  timestamp?: number | null;
  time_text?: string;
}

export interface FlatEntry {
  id?: string;
  title?: string;
  duration?: number | null;
  view_count?: number | null;
  url?: string;
}

export interface RankedVideo {
  id: string;
  title: string;
  duration: number;
  view_count: number;
}
