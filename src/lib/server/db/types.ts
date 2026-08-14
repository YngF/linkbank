import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

/**
 * The database schema, as Kysely sees it.
 *
 * This is the portable core: the same interface targets SQLite today and
 * PostgreSQL later — only the dialect in db/index.ts changes, not this file.
 */
export interface Database {
  users: UsersTable;
  branches: BranchesTable;
  bookmarks: BookmarksTable;
  sessions: SessionsTable;
  favicons: FaviconsTable;
  tags: TagsTable;
  bookmark_tags: BookmarkTagsTable;
  invites: InvitesTable;
  api_tokens: ApiTokensTable;
  backgrounds: BackgroundsTable;
}

export interface ApiTokensTable {
  id: Generated<number>;
  user_id: number;
  name: string;
  token_hash: string; // sha256 of the raw token (raw only shown once at creation)
  created_at: Generated<string>;
  last_used_at: string | null;
}

export interface InvitesTable {
  id: Generated<number>;
  token_hash: string; // sha256 of the raw token (raw token only lives in the link)
  created_by: number;
  email: string | null;
  note: string | null;
  is_admin: Generated<number>; // 1 → the invited user becomes an admin
  expires_at: string | null; // NULL → never expires
  used_at: string | null;
  used_by: number | null;
  created_at: Generated<string>;
}

export interface TagsTable {
  id: Generated<number>;
  user_id: number;
  name: string;
  hue: number | null; // 0..359; NULL → derived from the name
  created_at: Generated<string>;
}
export type Tag = Selectable<TagsTable>;

export interface BookmarkTagsTable {
  bookmark_id: number;
  tag_id: number;
}

/** A tag as delivered to the UI, with a resolved (never-null) colour hue. */
export interface UiTag {
  id: number;
  name: string;
  hue: number;
  count?: number;
}

export interface SessionsTable {
  id: string; // sha256(token) hex
  user_id: number;
  expires_at: string;
  created_at: Generated<string>;
}

export interface FaviconsTable {
  host: string;
  data: Uint8Array | null;
  content_type: string | null;
  ok: Generated<number>;
  is_manual: Generated<number>;
  fetched_at: Generated<string>;
}

export interface BackgroundsTable {
  user_id: number;
  data: Uint8Array;
  content_type: string;
  updated_at: Generated<string>;
}

export interface UsersTable {
  id: Generated<number>;
  username: string;
  email: string | null;
  password_hash: string | null; // Better Auth will own credentials later
  is_admin: Generated<number>; // 0/1 — SQLite has no bool
  settings: Generated<string>; // JSON blob of per-user preferences (see server/prefs.ts)
  created_at: Generated<string>;
}
export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

export interface BranchesTable {
  id: Generated<number>;
  user_id: number;
  parent_id: number | null; // NULL = root folder
  name: string;
  position: number;
  icon: string | null;
  colour: string | null;
  is_deleted: Generated<number>;
  deleted_at: string | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}
export type Branch = Selectable<BranchesTable>;
export type NewBranch = Insertable<BranchesTable>;
export type BranchUpdate = Updateable<BranchesTable>;

export interface BookmarksTable {
  id: Generated<number>;
  user_id: number;
  branch_id: number;
  title: string;
  url: string;
  notes: string | null; // encrypted at rest
  position: number;
  is_deleted: Generated<number>;
  deleted_at: string | null;
  // Link-health (populated by the link-rot checker; NULL = never checked).
  link_status: string | null; // 'ok' | 'broken'
  link_code: number | null; // HTTP status, or 0 for a network-level failure
  link_detail: string | null; // human-readable reason, e.g. 'Not found (404)'
  link_checked_at: string | null;
  link_ignore: Generated<number>; // 1 = exempt from the link-rot checker
  created_at: Generated<string>;
  updated_at: Generated<string>;
}
export type Bookmark = Selectable<BookmarksTable>;
export type NewBookmark = Insertable<BookmarksTable>;
export type BookmarkUpdate = Updateable<BookmarksTable>;
/** A bookmark plus its tags, as delivered to the folder view. */
export type BookmarkWithTags = Bookmark & { tags: UiTag[] };

/** A branch node as delivered to the UI (nested). */
export interface TreeNode {
  id: number;
  name: string;
  icon: string | null;
  colour: string | null;
  count: number; // bookmarks in this folder + all descendants
  children: TreeNode[];
}
