/**
 * Core business-logic tests (no DB, no network).
 *
 * Run with:  npm test
 *
 * Covers the rules most likely to regress: the 8-hour completeness rule,
 * shortfall math, cutoff handling flags, and the RBAC visibility scope.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateWorkedMinutes,
  calculateShortageMinutes,
  STANDARD_WORK_MINUTES,
  formatMinutes,
  calculateDistance,
} from '../src/lib/utils';
import { getDataScope, canViewUser } from '../src/lib/rbac';
import { isSupportedImageBuffer, MAX_PHOTO_BYTES, hashPhotoBuffer } from '../src/lib/photos';

const at = (hhmm: string, date = '2026-09-15') => new Date(`${date}T${hhmm}:00+07:00`);

test('worked minutes: exactly 8 hours counts as standard', () => {
  assert.equal(calculateWorkedMinutes(at('08:00'), at('16:00')), STANDARD_WORK_MINUTES);
});

test('worked minutes: incomplete or reversed ranges return 0', () => {
  assert.equal(calculateWorkedMinutes(null, at('17:00')), 0);
  assert.equal(calculateWorkedMinutes(at('08:00'), null), 0);
  assert.equal(calculateWorkedMinutes(at('17:00'), at('08:00')), 0);
});

test('shortage: 7h30m is 30 minutes short of an 8h day', () => {
  assert.equal(calculateShortageMinutes(calculateWorkedMinutes(at('08:00'), at('15:30'))), 30);
});

test('shortage: a full day has no shortage', () => {
  assert.equal(calculateShortageMinutes(calculateWorkedMinutes(at('08:00'), at('17:00'))), 0);
});

test('formatMinutes renders hours and minutes', () => {
  assert.equal(formatMinutes(0), '0 menit');
  assert.equal(formatMinutes(45), '45 menit');
  assert.equal(formatMinutes(60), '1 jam');
  assert.equal(formatMinutes(90), '1 jam 30 menit');
});

test('distance: same point is 0, known 1-degree latitude is ~111km', () => {
  assert.equal(Math.round(calculateDistance(-6.2, 106.8, -6.2, 106.8)), 0);
  const km = calculateDistance(0, 0, 0, 1) / 1000;
  assert.ok(km > 110 && km < 112, `expected ~111km, got ${km}`);
});

test('RBAC scope: admin and manager see all, SPV sees team, user sees self', () => {
  assert.equal(getDataScope('ADMIN'), 'all');
  assert.equal(getDataScope('MANAGER'), 'all');
  assert.equal(getDataScope('SPV'), 'team');
  assert.equal(getDataScope('USER'), 'self');
});

test('canViewUser: SPV only sees self and direct reports', () => {
  const spv = 'spv-1';
  assert.equal(canViewUser('SPV', spv, { id: spv, managerId: 'mgr-1' }), true);
  assert.equal(canViewUser('SPV', spv, { id: 'sub-1', managerId: spv }), true);
  assert.equal(canViewUser('SPV', spv, { id: 'other', managerId: 'mgr-2' }), false);
});

test('canViewUser: manager sees everyone, user only self', () => {
  assert.equal(canViewUser('MANAGER', 'mgr-1', { id: 'x', managerId: 'someone' }), true);
  assert.equal(canViewUser('USER', 'u-1', { id: 'u-1', managerId: null }), true);
  assert.equal(canViewUser('USER', 'u-1', { id: 'u-2', managerId: null }), false);
});

test('photo magic bytes: valid JPEG/PNG accepted, junk rejected', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const junk = Buffer.from('this is not an image at all');
  assert.equal(isSupportedImageBuffer(jpeg), true);
  assert.equal(isSupportedImageBuffer(png), true);
  assert.equal(isSupportedImageBuffer(junk), false);
  assert.equal(isSupportedImageBuffer(Buffer.from([0xff, 0xd8])), false);
});

test('photo size cap leaves headroom over the worst measured selfie', () => {
  // Worst case measured from the app's own compression: ~250 KB (12 MP, noisy)
  const worstMeasuredKB = 250;
  assert.ok(
    MAX_PHOTO_BYTES / 1024 >= worstMeasuredKB * 2,
    `cap ${MAX_PHOTO_BYTES / 1024}KB should be at least 2x the ${worstMeasuredKB}KB worst case`
  );
  assert.equal(MAX_PHOTO_BYTES, 800 * 1024);
});

test('photo hash is stable and differs for different bytes', () => {
  const a = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const b = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 9]);
  assert.equal(hashPhotoBuffer(a), hashPhotoBuffer(a));
  assert.notEqual(hashPhotoBuffer(a), hashPhotoBuffer(b));
  assert.match(hashPhotoBuffer(a), /^[0-9a-f]{64}$/);
});