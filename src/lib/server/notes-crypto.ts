import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { env } from '$env/dynamic/private';
import { db } from './db/index';

/**
 * At-rest encryption for bookmark notes (which may hold passwords).
 *
 * - AES-256-GCM (authenticated: tampering is detected on decrypt).
 * - One key per instance. Preferred source is the NOTES_ENCRYPTION_KEY env var
 *   (base64 or hex of 32 bytes) so the key can live OUTSIDE the data volume —
 *   that's what protects a leaked database/backup. If unset, a key is generated
 *   once and stored next to the DB (data/notes.key, 0600) so the app works out
 *   of the box; we log a warning that env is stronger for the backup case.
 * - Stored format: "v1:" + base64(iv[12] | tag[16] | ciphertext). Legacy
 *   plaintext (no "v1:" prefix) is read through unchanged, so existing notes
 *   keep working until the one-time backfill re-encrypts them.
 *
 * What this protects: someone who obtains the raw DB file / a backup.
 * What it can't: a compromised *running* server — it must hold the key to show
 * you your notes. No security theatre.
 */

const VERSION = 'v1';

function loadKey(): Buffer {
  const raw = (env.NOTES_ENCRYPTION_KEY ?? '').trim();
  if (raw) {
    const key = decodeKey(raw);
    if (key.length !== 32)
      throw new Error('NOTES_ENCRYPTION_KEY must decode to 32 bytes (e.g. `openssl rand -base64 32`).');
    return key;
  }

  // No env key: generate + persist next to the database.
  const dbPath = env.DATABASE_PATH || 'data/linkbank.db';
  const keyPath = join(dirname(dbPath), 'notes.key');
  if (existsSync(keyPath)) {
    const key = decodeKey(readFileSync(keyPath, 'utf8').trim());
    if (key.length === 32) return key;
  }
  mkdirSync(dirname(keyPath), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString('base64'), { mode: 0o600 });
  console.warn(
    `[notes] No NOTES_ENCRYPTION_KEY set — generated one at ${keyPath}. ` +
      `For protection against a leaked backup, set NOTES_ENCRYPTION_KEY in your ` +
      `environment instead (keep it out of the data volume). Losing the key makes notes unrecoverable.`
  );
  return key;
}

function decodeKey(s: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  return Buffer.from(s, 'base64');
}

const KEY = loadKey();

/** Encrypt a note for storage. null/empty stays null. */
export function encryptNote(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === '') return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${Buffer.concat([iv, tag, ct]).toString('base64')}`;
}

/** Decrypt a stored note. Legacy plaintext (no prefix) is returned as-is. */
export function decryptNote(stored: string | null | undefined): string | null {
  if (stored == null || stored === '') return null;
  if (!stored.startsWith(VERSION + ':')) return stored; // legacy plaintext
  try {
    const buf = Buffer.from(stored.slice(VERSION.length + 1), 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key or tampered data — don't leak ciphertext, surface a marker.
    return '[unable to decrypt note]';
  }
}

export function isEncrypted(stored: string | null | undefined): boolean {
  return typeof stored === 'string' && stored.startsWith(VERSION + ':');
}

/**
 * One-time backfill: encrypt any notes still stored as plaintext. Safe to run
 * on every boot — it only touches rows that aren't already `v1:`-encrypted.
 */
export async function backfillNoteEncryption(): Promise<void> {
  const rows = await db
    .selectFrom('bookmarks')
    .select(['id', 'notes'])
    .where('notes', 'is not', null)
    .execute();

  const legacy = rows.filter((r) => r.notes != null && !isEncrypted(r.notes));
  if (legacy.length === 0) return;

  await db.transaction().execute(async (trx) => {
    for (const r of legacy) {
      await trx
        .updateTable('bookmarks')
        .set({ notes: encryptNote(r.notes) })
        .where('id', '=', r.id)
        .execute();
    }
  });
  console.log(`[notes] encrypted ${legacy.length} previously-plaintext note(s) at rest.`);
}
