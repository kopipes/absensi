import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

// Max decoded photo size accepted from the client (server-side enforcement)
export const MAX_PHOTO_BYTES = 400 * 1024; // 400 KB

const PHOTO_SUBDIR = 'absensi';
const KEY_PATTERN = /^\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.jpg$/;
const DATA_URL_PATTERN = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/i;

export function getUploadRoot(): string {
  const base = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), 'uploads');
  return path.join(base, PHOTO_SUBDIR);
}

export function isValidPhotoKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/** Resolve a storage key to an absolute path, rejecting traversal. */
export function resolvePhotoPath(key: string): string | null {
  if (!isValidPhotoKey(key)) return null;
  const root = getUploadRoot();
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'x';
}

/**
 * Decode a base64 image data URL and persist it as a JPEG file.
 * Returns the relative storage key to save in the database.
 */
export async function saveAttendancePhoto(
  dataUrl: string,
  opts: { userId: string; date: string; kind: 'in' | 'out' }
): Promise<string> {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw new Error('invalid-photo-format');

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) throw new Error('empty-photo');
  if (buffer.length > MAX_PHOTO_BYTES) throw new Error('photo-too-large');

  // Folder by year/month (based on the attendance date string YYYY-MM-DD)
  const year = opts.date.slice(0, 4);
  const month = opts.date.slice(5, 7);
  const filename = `${opts.kind}_${sanitizeSegment(opts.userId)}_${Date.now()}_${randomBytes(4).toString('hex')}.jpg`;
  const key = `${year}/${month}/${filename}`;

  const root = getUploadRoot();
  await fs.mkdir(path.join(root, year, month), { recursive: true });
  await fs.writeFile(path.join(root, key), buffer);

  return key;
}

/** Remove a stored photo (used to roll back a failed DB write). */
export async function deleteAttendancePhoto(key: string): Promise<void> {
  const filePath = resolvePhotoPath(key);
  if (!filePath) return;
  await fs.unlink(filePath).catch(() => {});
}
