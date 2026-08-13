/**
 * Import bookmarks exported from the old LinkBank (dbo.userlinks) into the new
 * `bookmarks` table.
 *
 * Input JSON: an array of rows, exactly as `SELECT ... FOR JSON PATH` produces:
 *   [{ "linkid":123, "name":"...", "url":"...", "notes":"<TripleDES>",
 *      "branchid":13, "sortorder":1 }, ...]
 *
 * Notes were TripleDES-encrypted by the old Node-RED backend (CryptoJS-style,
 * passphrase key). We decrypt them here and store the plaintext for now;
 * Phase 4 re-encrypts at rest with AES-GCM under a per-deployment key.
 *
 * Usage:
 *   NOTES_LEGACY_KEY='...' node --experimental-strip-types \
 *       scripts/import-bookmarks.ts <userlinks.json> [username] [--verify]
 *
 *   --verify : decrypt and print a sample, insert nothing (sanity-check the key)
 */
import Database from 'better-sqlite3';
import CryptoJS from 'crypto-js';
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const username = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'yngvef';
const verifyOnly = process.argv.includes('--verify');
const noNotes = process.argv.includes('--no-notes'); // import without notes (they hold passwords)
const DB_PATH = process.env.DATABASE_PATH ?? 'data/linkbank.db';
const KEY = process.env.NOTES_LEGACY_KEY ?? '';

if (!file) {
  console.error('Usage: NOTES_LEGACY_KEY=... node --experimental-strip-types scripts/import-bookmarks.ts <userlinks.json> [username] [--verify]');
  process.exit(1);
}

interface Row {
  linkid: number;
  name: string;
  url: string;
  notes: string | null;
  branchid: number;
  sortorder: number;
}

/** Decrypt a TripleDES ciphertext produced by the old backend. */
function decryptNote(cipher: string | null): { text: string | null; ok: boolean } {
  if (!cipher) return { text: null, ok: true };
  if (!KEY) return { text: cipher, ok: false }; // no key → leave as-is, flag it
  try {
    const text = CryptoJS.TripleDES.decrypt(cipher, KEY).toString(CryptoJS.enc.Utf8);
    // A wrong key usually yields '' or invalid UTF-8; treat empty-from-nonempty as failure.
    if (text === '' && cipher.trim() !== '') return { text: cipher, ok: false };
    return { text, ok: true };
  } catch {
    return { text: cipher, ok: false };
  }
}

// Strip a UTF-8 BOM (sqlcmd / PowerShell Out-File add one) and surrounding
// whitespace before parsing — otherwise JSON.parse throws on the leading char.
const raw = readFileSync(file, 'utf8').replace(/^﻿/, '').trim();
const rows: Row[] = JSON.parse(raw);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as
  | { id: number }
  | undefined;
if (!user) {
  console.error(`No user "${username}" — run the tree seed first.`);
  process.exit(1);
}
const userId = user.id;

const validBranch = new Set<number>(
  (db.prepare('SELECT id FROM branches WHERE user_id = ?').all(userId) as { id: number }[]).map(
    (r) => r.id
  )
);

// classify
const importable: Row[] = [];
const orphans: Row[] = [];
let decryptFails = 0;
const sample: { title: string; notes: string | null }[] = [];

for (const r of rows) {
  if (!validBranch.has(r.branchid)) {
    orphans.push(r);
    continue;
  }
  const { ok } = decryptNote(r.notes);
  if (!ok) decryptFails++;
  if (sample.length < 5 && r.notes) sample.push({ title: r.name, notes: decryptNote(r.notes).text });
  importable.push(r);
}

console.log(`rows in export      : ${rows.length}`);
console.log(`importable (mapped) : ${importable.length}`);
console.log(`orphan branchid     : ${orphans.length}${orphans.length ? ' (folders no longer exist)' : ''}`);
console.log(`note decrypt issues : ${decryptFails}`);
if (sample.length) {
  console.log('\nsample decrypted notes (verify these look right):');
  for (const s of sample) console.log(`  • ${s.title}: ${JSON.stringify(s.notes)}`);
}
if (orphans.length) {
  console.log('\norphaned bookmarks (branchid has no folder — NOT imported):');
  for (const o of orphans) console.log(`  • [branch ${o.branchid}] ${o.name} — ${o.url}`);
}

if (verifyOnly) {
  console.log('\n--verify: nothing written.');
  process.exit(0);
}

const insert = db.prepare(
  'INSERT INTO bookmarks (id, user_id, branch_id, title, url, notes, position) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const run = db.transaction((items: Row[]) => {
  db.prepare('DELETE FROM bookmarks WHERE user_id = ?').run(userId);
  db.prepare("DELETE FROM sqlite_sequence WHERE name = 'bookmarks'").run();
  for (const r of items) {
    const notes = noNotes ? null : decryptNote(r.notes).text;
    insert.run(r.linkid, userId, r.branchid, r.name, r.url, notes, r.sortorder);
  }
});
run(importable);

console.log(`\nImported ${importable.length} bookmarks for "${username}".`);
db.close();
