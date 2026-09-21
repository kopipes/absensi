import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes, createHash } from 'crypto';

// Max decoded photo size accepted from the client (server-side enforcement).
//
// Benchmark (measured on the app's own adaptive compression: max 1280px wide,
// JPEG 0.75 → 0.55, then downscale if needed):
//   - typical selfie           ~25 KB  (normal scene)
//   - busy/noisy worst case    ~250 KB (12 MP sensor with fine detail)
//   - raw phone selfie (before compression)  ~2–5 MB, up to ~12 MB
// The client already guarantees ≤~256 KB, so 800 KB gives ~3× headroom: no
// legitimate selfie is rejected, while still bounding disk usage per photo.
export const MAX_PHOTO_BYTES = 800 * 1024; // 800 KB

const PHOTO_SUBDIR = 'absensi';
const KEY_PATTERN = /^\d{4}\/\d{2}\/[A-Za-z0-9_-]+\.jpg$/;
const DATA_URL_PATTERN = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/=\s]+)$/i;

/** True when the buffer starts with valid JPEG or PNG magic bytes. */
export function isSupportedImageBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  return isJpeg || isPng;
}

/** SHA-256 of the decoded image bytes — used to detect reused selfie files. */
export function hashPhotoBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

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
  const saved = await saveAttendancePhotoWithMeta(dataUrl, opts);
  return saved.key;
}

/**
 * Same as saveAttendancePhoto but also returns integrity metadata (hash) so
 * callers can flag reused/unverified selfies.
 */
export async function saveAttendancePhotoWithMeta(
  dataUrl: string,
  opts: { userId: string; date: string; kind: 'in' | 'out' }
): Promise<{ key: string; hash: string }> {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw new Error('invalid-photo-format');

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0) throw new Error('empty-photo');
  if (buffer.length > MAX_PHOTO_BYTES) throw new Error('photo-too-large');
  if (!isSupportedImageBuffer(buffer)) throw new Error('invalid-photo-format');

  // Folder by year/month (based on the attendance date string YYYY-MM-DD)
  const year = opts.date.slice(0, 4);
  const month = opts.date.slice(5, 7);
  const filename = `${opts.kind}_${sanitizeSegment(opts.userId)}_${Date.now()}_${randomBytes(4).toString('hex')}.jpg`;
  const key = `${year}/${month}/${filename}`;

  const root = getUploadRoot();
  await fs.mkdir(path.join(root, year, month), { recursive: true });
  await fs.writeFile(path.join(root, key), buffer);

  return { key, hash: hashPhotoBuffer(buffer) };
}

/** Remove a stored photo (used to roll back a failed DB write). */
export async function deleteAttendancePhoto(key: string): Promise<void> {
  const filePath = resolvePhotoPath(key);
  if (!filePath) return;
  await fs.unlink(filePath).catch(() => {});
}

/**
 * Delete every stored photo belonging to a user (check-in and check-out).
 * Keys look like `<yyyy>/<mm>/<kind>_<userId>_<ts>_<rand>.jpg`, so a filename
 * prefix match is enough to find them across year/month folders.
 */
export async function deleteUserPhotos(userId: string): Promise<number> {
  const root = getUploadRoot();
  const segment = sanitizeSegment(userId);
  let removed = 0;

  let yearDirs: string[];
  try {
    yearDirs = await fs.readdir(root);
  } catch {
    return 0;
  }

  for (const year of yearDirs) {
    if (!/^\d{4}$/.test(year)) continue;
    const yearPath = path.join(root, year);
    let monthDirs: string[];
    try {
      monthDirs = await fs.readdir(yearPath);
    } catch {
      continue;
    }
    for (const month of monthDirs) {
      if (!/^\d{2}$/.test(month)) continue;
      const monthPath = path.join(yearPath, month);
      let files: string[];
      try {
        files = await fs.readdir(monthPath);
      } catch {
        continue;
      }
      for (const file of files) {
        if (!file.endsWith('.jpg') || !file.includes(`_${segment}_`)) continue;
        try {
          await fs.unlink(path.join(monthPath, file));
          removed++;
        } catch {
          /* ignore individual failures */
        }
      }
    }
  }

  return removed;
}
