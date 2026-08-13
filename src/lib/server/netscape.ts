import { db } from './db/index';
import { decryptNote, encryptNote } from './notes-crypto';

/**
 * Netscape Bookmark File Format — the HTML format every browser and most
 * bookmark managers import/export. This module both writes it (export) and
 * parses it tolerantly (import).
 */

// ---- shared helpers --------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unesc(s: string): string {
  return s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&'); // last, so we don't double-decode
}

// ---- export ----------------------------------------------------------------

interface Node {
  id: number;
  name: string;
  parent_id: number | null;
}

export async function exportHtml(userId: number): Promise<string> {
  const branches = (await db
    .selectFrom('branches')
    .select(['id', 'name', 'parent_id'])
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .orderBy('position')
    .execute()) as Node[];

  const bookmarks = await db
    .selectFrom('bookmarks')
    .select(['id', 'branch_id', 'title', 'url', 'notes', 'position'])
    .where('user_id', '=', userId)
    .where('is_deleted', '=', 0)
    .orderBy('position')
    .execute();

  const childFolders = new Map<number | null, Node[]>();
  for (const b of branches) {
    const k = b.parent_id;
    if (!childFolders.has(k)) childFolders.set(k, []);
    childFolders.get(k)!.push(b);
  }
  const childBookmarks = new Map<number, typeof bookmarks>();
  for (const m of bookmarks) {
    if (!childBookmarks.has(m.branch_id)) childBookmarks.set(m.branch_id, []);
    childBookmarks.get(m.branch_id)!.push(m);
  }

  const out: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>'
  ];

  const emitFolder = (folder: Node, indent: string) => {
    out.push(`${indent}<DT><H3>${esc(folder.name)}</H3>`);
    out.push(`${indent}<DL><p>`);
    for (const sub of childFolders.get(folder.id) ?? []) emitFolder(sub, indent + '    ');
    for (const m of childBookmarks.get(folder.id) ?? []) {
      out.push(`${indent}    <DT><A HREF="${esc(m.url)}">${esc(m.title)}</A>`);
      const note = decryptNote(m.notes);
      if (note) out.push(`${indent}    <DD>${esc(note)}`);
    }
    out.push(`${indent}</DL><p>`);
  };

  // The user's root folder(s): emit their *contents* at top level so a browser
  // import drops them straight onto the bookmarks bar.
  for (const root of childFolders.get(null) ?? []) {
    for (const sub of childFolders.get(root.id) ?? []) emitFolder(sub, '    ');
    for (const m of childBookmarks.get(root.id) ?? []) {
      out.push(`    <DT><A HREF="${esc(m.url)}">${esc(m.title)}</A>`);
      const note = decryptNote(m.notes);
      if (note) out.push(`    <DD>${esc(note)}`);
    }
  }

  out.push('</DL><p>');
  return out.join('\n') + '\n';
}

// ---- import (tolerant parser) ---------------------------------------------

export interface ParsedFolder {
  type: 'folder';
  name: string;
  children: ParsedNode[];
}
export interface ParsedLink {
  type: 'link';
  url: string;
  title: string;
  notes: string | null;
}
export type ParsedNode = ParsedFolder | ParsedLink;

/**
 * Parse a Netscape bookmark file into a tree. Tolerant of the loose markup real
 * browsers emit: it scans H3/A/DD/DL tokens in document order and rebuilds the
 * nesting with a stack, rather than trusting well-formed HTML.
 */
export function parseNetscape(html: string): ParsedNode[] {
  const root: ParsedFolder = { type: 'folder', name: '__root__', children: [] };
  const stack: ParsedFolder[] = [root];
  let pending: ParsedFolder | null = null; // folder awaiting its <DL>
  let lastLink: ParsedLink | null = null;

  const token =
    /<dl[^>]*>|<\/dl>|<dt>\s*<h3[^>]*>([\s\S]*?)<\/h3>|<a\s+[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>|<dd>([^\n<]*)/gi;

  let m: RegExpExecArray | null;
  while ((m = token.exec(html))) {
    const tag = m[0].toLowerCase();
    if (tag.startsWith('<dl')) {
      // Enter the folder opened by the preceding <H3>, or root for the top DL.
      stack.push(pending ?? stack[stack.length - 1]);
      pending = null;
      lastLink = null;
    } else if (tag === '</dl>') {
      if (stack.length > 1) stack.pop();
      lastLink = null;
    } else if (m[1] != null) {
      // folder heading
      const folder: ParsedFolder = { type: 'folder', name: unesc(m[1].trim()) || 'Untitled', children: [] };
      stack[stack.length - 1].children.push(folder);
      pending = folder;
      lastLink = null;
    } else if (m[2] != null) {
      // link
      const link: ParsedLink = {
        type: 'link',
        url: unesc(m[2].trim()),
        title: unesc((m[3] ?? '').replace(/\s+/g, ' ').trim()) || m[2].trim(),
        notes: null
      };
      stack[stack.length - 1].children.push(link);
      lastLink = link;
    } else if (m[4] != null && lastLink) {
      // description -> notes on the preceding link
      lastLink.notes = unesc(m[4].trim()) || null;
    }
  }

  return root.children;
}

// ---- import insertion ------------------------------------------------------

/** Insert a parsed tree under an existing branch. Returns counts. */
export async function importInto(
  userId: number,
  parentBranchId: number,
  nodes: ParsedNode[]
): Promise<{ folders: number; bookmarks: number }> {
  let folders = 0;
  let bookmarks = 0;

  await db.transaction().execute(async (trx) => {
    const insertNodes = async (list: ParsedNode[], parentId: number) => {
      let pos = 1;
      for (const n of list) {
        if (n.type === 'folder') {
          const res = await trx
            .insertInto('branches')
            .values({ user_id: userId, parent_id: parentId, name: n.name.slice(0, 50), position: pos++ })
            .returning('id')
            .executeTakeFirstOrThrow();
          folders++;
          await insertNodes(n.children, Number(res.id));
        } else {
          if (!/^https?:\/\//i.test(n.url)) continue; // skip non-web entries (place: etc.)
          await trx
            .insertInto('bookmarks')
            .values({
              user_id: userId,
              branch_id: parentId,
              title: n.title.slice(0, 300) || n.url,
              url: n.url,
              notes: encryptNote(n.notes),
              position: pos++
            })
            .execute();
          bookmarks++;
        }
      }
    };
    await insertNodes(nodes, parentBranchId);
  });

  return { folders, bookmarks };
}
