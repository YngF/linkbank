/**
 * Import an ADDITIONAL user into an existing LinkBank database, with their
 * folder tree and bookmarks. Non-destructive: it never touches other users.
 *
 * The new user is created WITHOUT a password. They then "claim" the account by
 * registering their username on the sign-in screen (see the claim flow), which
 * sets their password and keeps all the data imported here.
 *
 * Branch ids are reassigned fresh (mapped old→new) so they never collide with
 * ids already in the database; bookmark branch references are remapped to match.
 * Notes are decrypted from the old TripleDES scheme, same as the main import.
 *
 * Usage:
 *   NOTES_LEGACY_KEY='...' node --experimental-strip-types \
 *     scripts/import-user.ts <tree.json> <userlinks.json> <username> [--admin] [--verify]
 *
 *   --admin  : make this user an admin (default: normal user)
 *   --verify : report what would happen, write nothing
 */
import Database from 'better-sqlite3';
import CryptoJS from 'crypto-js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [treeFile, linksFile, username] = args.filter((a) => !a.startsWith('--'));
const isAdmin = flags.has('--admin') ? 1 : 0;
const verifyOnly = flags.has('--verify');
const DB_PATH = process.env.DATABASE_PATH ?? 'data/linkbank.db';
const KEY = process.env.NOTES_LEGACY_KEY ?? '';

if (!treeFile || !username) {
  console.error('Usage: NOTES_LEGACY_KEY=... node --experimental-strip-types scripts/import-user.ts <tree.json> <userlinks.json> <username> [--admin] [--verify]');
  process.exit(1);
}

interface JsTreeNode { id: string; text?: string; name?: string; children?: JsTreeNode[] }
interface Link { linkid: number; name: string; url: string; notes: string | null; branchid: number; sortorder: number }

function stripBom(s: string) { return s.replace(/^﻿/, '').trim(); }
function decryptNote(cipher: string | null): string | null {
  if (!cipher) return null;
  if (!KEY) return cipher;
  try {
    const t = CryptoJS.TripleDES.decrypt(cipher, KEY).toString(CryptoJS.enc.Utf8);
    return t === '' && cipher.trim() !== '' ? cipher : t;
  } catch {
    return cipher;
  }
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

// Guard: schema must exist (run the app once, or seed, first).
const hasUsers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
if (!hasUsers) { console.error('No schema found — start the app once (it migrates on boot) before importing.'); process.exit(1); }

const taken = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (taken) { console.error(`User "${username}" already exists. Choose another username or delete it first.`); process.exit(1); }

let tree: JsTreeNode[] = JSON.parse(stripBom(readFileSync(treeFile, 'utf8')));
if (!Array.isArray(tree)) tree = [tree];
const links: Link[] = linksFile ? JSON.parse(stripBom(readFileSync(linksFile, 'utf8'))) : [];

// ---- plan the tree (old id -> depth-first walk) ----------------------------
const oldToNew = new Map<number, number>();
let folderCount = 0;

const run = db.transaction(() => {
  const userId = Number(
    db.prepare('INSERT INTO users (username, is_admin) VALUES (?, ?)').run(username, isAdmin).lastInsertRowid
  );

  const insertBranch = db.prepare(
    'INSERT INTO branches (user_id, parent_id, name, position) VALUES (?, ?, ?, ?)'
  );
  const walk = (nodes: JsTreeNode[], parentNewId: number | null) => {
    nodes.forEach((node, i) => {
      const name = node.text ?? node.name ?? '(unnamed)';
      const newId = Number(insertBranch.run(userId, parentNewId, name, i + 1).lastInsertRowid);
      oldToNew.set(Number(node.id), newId);
      folderCount++;
      if (Array.isArray(node.children) && node.children.length) walk(node.children, newId);
    });
  };
  walk(tree, null);

  const insertBm = db.prepare(
    'INSERT INTO bookmarks (user_id, branch_id, title, url, notes, position) VALUES (?, ?, ?, ?, ?, ?)'
  );
  let imported = 0;
  const orphans: Link[] = [];
  for (const l of links) {
    const newBranch = oldToNew.get(l.branchid);
    if (!newBranch) { orphans.push(l); continue; }
    insertBm.run(userId, newBranch, l.name, l.url, decryptNote(l.notes), l.sortorder);
    imported++;
  }

  return { userId, imported, orphans };
});

if (verifyOnly) {
  // Dry-run: build the map without writing (roll back).
  console.log(`Would create user "${username}" (${isAdmin ? 'admin' : 'normal'}) with ${countNodes(tree)} folders and up to ${links.length} bookmarks.`);
  const sample = links.slice(0, 5).filter((l) => l.notes).map((l) => `  • ${l.name}: ${JSON.stringify(decryptNote(l.notes))}`);
  if (sample.length) { console.log('sample decrypted notes:'); sample.forEach((s) => console.log(s)); }
  console.log('--verify: nothing written.');
  process.exit(0);
}

const result = run();
console.log(`Created user "${username}" (id ${result.userId}, ${isAdmin ? 'admin' : 'normal'}).`);
console.log(`  folders  : ${folderCount}`);
console.log(`  bookmarks: ${result.imported}${result.orphans.length ? ` (skipped ${result.orphans.length} with unknown folders)` : ''}`);
if (result.orphans.length) {
  console.log('  orphaned bookmarks (branchid not in the tree):');
  for (const o of result.orphans) console.log(`    - [branch ${o.branchid}] ${o.name} — ${o.url}`);
}
console.log(`\nNext: have ${username} claim the account by registering the username "${username}" on the sign-in screen.`);
db.close();

function countNodes(nodes: JsTreeNode[]): number {
  let n = 0;
  const walk = (a: JsTreeNode[]) => a.forEach((x) => { n++; if (x.children) walk(x.children); });
  walk(nodes);
  return n;
}
