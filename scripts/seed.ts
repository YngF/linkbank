/**
 * Seed a fresh database with a real folder tree.
 *
 * Reads a jsTree-format blob (exactly what the old LinkBank stored in
 * dbo.usertrees) and inserts it into the new normalised `branches` table,
 * preserving parent/child structure and sibling order. Bookmarks are left for
 * the real migration; this exists so the app renders genuine data in dev.
 *
 * Usage:  node --experimental-strip-types scripts/seed.ts <seed.json> [username]
 */
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const seedFile = process.argv[2] ?? 'scripts/seed-tree.json';
const username = process.argv[3] ?? 'yngvef';
const DB_PATH = process.env.DATABASE_PATH ?? 'data/linkbank.db';

interface JsTreeNode {
  id: string;
  text?: string;
  name?: string;
  children?: JsTreeNode[];
}

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000'); // wait up to 5s for a lock instead of failing instantly
db.pragma('foreign_keys = ON');

// Minimal schema bootstrap so the seed can run standalone (mirrors migrate.ts).
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE, password_hash TEXT, is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
    parent_id INTEGER REFERENCES branches(id), name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0, icon TEXT, colour TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
    branch_id INTEGER NOT NULL REFERENCES branches(id), title TEXT NOT NULL, url TEXT NOT NULL,
    notes TEXT, position INTEGER NOT NULL DEFAULT 0, is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')));
`);

let tree: JsTreeNode[] = JSON.parse(readFileSync(seedFile, 'utf8'));
if (!Array.isArray(tree)) tree = [tree];

const wipe = db.transaction(() => {
  db.prepare('DELETE FROM bookmarks').run();
  db.prepare('DELETE FROM branches').run();
  db.prepare('DELETE FROM users').run();
  // Reset AUTOINCREMENT counters so a re-seed starts ids at 1 again.
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('users','branches','bookmarks')").run();
});
wipe();

const userId = Number(
  db.prepare('INSERT INTO users (username, is_admin) VALUES (?, 1)').run(username).lastInsertRowid
);

// Preserve the ORIGINAL jsTree node ids as branch ids, so bookmarks (whose
// branchid points at these values) map straight across during import.
const insertBranch = db.prepare(
  'INSERT INTO branches (id, user_id, parent_id, name, position) VALUES (?, ?, ?, ?, ?)'
);

let count = 0;
const walk = db.transaction((nodes: JsTreeNode[], parentId: number | null) => {
  nodes.forEach((node, i) => {
    const id = Number(node.id);
    if (!Number.isInteger(id)) throw new Error(`Non-integer folder id: ${JSON.stringify(node.id)}`);
    const name = node.text ?? node.name ?? '(unnamed)';
    insertBranch.run(id, userId, parentId, name, i + 1);
    count++;
    if (Array.isArray(node.children) && node.children.length) walk(node.children, id);
  });
});
walk(tree, null);

console.log(`Seeded user "${username}" (id ${userId}) with ${count} folders into ${DB_PATH}`);
db.close();
