import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';

const BASE = process.env.BASE || 'http://localhost:3000';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = './shots';

const accounts = {
  admin: { login: 'ADM001', password: 'admin123' },
  manager: { login: 'MGR001', password: 'manager123' },
  spv: { login: 'SPV001', password: 'spv123' },
  user: { login: 'EMP001', password: 'user123' },
};

// name, role, path, expected text (assertion), viewport
const SHOTS = [
  { name: '01-login', role: 'public', path: '/login', expect: ['Masuk', 'password'] },
  { name: '02-user-dashboard', role: 'user', path: '/dashboard', expect: ['Karyawan'] },
  { name: '03-user-attendance', role: 'user', path: '/attendance', expect: ['Absen', 'Riwayat'] },
  { name: '04-user-history', role: 'user', path: '/attendance', expect: ['Riwayat'], tab: 'Riwayat' },
  { name: '05-user-notifications', role: 'user', path: '/notifications', expect: ['Notifikasi'] },
  { name: '06-user-profile', role: 'user', path: '/profile', expect: ['Data Diri'] },
  { name: '10-manager-dashboard', role: 'manager', path: '/dashboard', expect: ['Karyawan'] },
  { name: '11-manager-team', role: 'manager', path: '/team', expect: ['Tim'] },
  { name: '12-manager-reports', role: 'manager', path: '/reports', expect: ['Laporan'] },
  { name: '13-manager-reports-summary', role: 'manager', path: '/reports', expect: ['Rekap'], tab: 'Rekap per Karyawan' },
  { name: '14-manager-corrections', role: 'manager', path: '/corrections', expect: ['Koreksi'] },
  { name: '15-spv-team', role: 'spv', path: '/team', expect: ['Tim'] },
  { name: '16-spv-reports', role: 'spv', path: '/reports', expect: ['Laporan'] },
  { name: '17-spv-corrections', role: 'spv', path: '/corrections', expect: ['Koreksi'] },
  { name: '20-admin-dashboard', role: 'admin', path: '/dashboard', expect: ['Karyawan'] },
  { name: '21-admin-users', role: 'admin', path: '/admin/users', expect: ['Karyawan'] },
  { name: '22-admin-departments', role: 'admin', path: '/admin/departments', expect: ['Departemen'] },
  { name: '23-admin-offices', role: 'admin', path: '/admin/offices', expect: ['Kantor'] },
  { name: '24-admin-holidays', role: 'admin', path: '/admin/holidays', expect: ['Libur'] },
  { name: '25-admin-workhours', role: 'admin', path: '/admin/work-hours', expect: ['Jadwal'] },
  { name: '26-admin-photos', role: 'admin', path: '/admin/photos', expect: ['Foto'] },
  { name: '27-admin-audit', role: 'admin', path: '/admin/audit', expect: ['Audit'] },
  { name: '28-admin-reports', role: 'admin', path: '/reports', expect: ['Laporan'] },
  { name: '29-admin-team', role: 'admin', path: '/team', expect: ['Tim'] },
  { name: '30-admin-corrections', role: 'admin', path: '/corrections', expect: ['Koreksi'] },
  { name: '31-admin-profile', role: 'admin', path: '/profile', expect: ['Data Diri'] },
];

async function login(page, creds) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
  const inputs = await page.$$('input');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type(creds.login);
  await inputs[1].click({ clickCount: 3 });
  await inputs[1].type(creds.password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    page.keyboard.press('Enter'),
  ]);
  await new Promise((r) => setTimeout(r, 2000));
  return page.url();
}

async function clickTab(page, label) {
  const handles = await page.$$('button');
  for (const h of handles) {
    const t = (await page.evaluate((e) => e.textContent || '', h)).trim();
    if (t.includes(label)) {
      await h.click();
      await new Promise((r) => setTimeout(r, 2000));
      return true;
    }
  }
  return false;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,1000', '--force-device-scale-factor=1'],
  });

  // public login page
  {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: `${OUT}/01-login.png` });
    const txt = await page.evaluate(() => document.body.innerText);
    console.log(`OK 01-login  ${txt.includes('Masuk') || txt.includes('Login') ? 'content-ok' : 'CONTENT-CHECK'}`);
    await ctx.close();
  }

  for (const role of ['user', 'manager', 'spv', 'admin']) {
    const items = SHOTS.filter((s) => s.role === role);
    if (!items.length) continue;
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const landed = await login(page, accounts[role]);
    console.log(`--- ${role} logged in -> ${landed}`);
    for (const item of items) {
      try {
        await page.goto(`${BASE}${item.path}`, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 1200));
        if (item.tab) {
          const ok = await clickTab(page, item.tab);
          if (!ok) console.log(`    (tab "${item.tab}" not found for ${item.name})`);
        }
        await page.screenshot({ path: `${OUT}/${item.name}.png` });
        const txt = await page.evaluate(() => document.body.innerText);
        const missing = item.expect.filter((e) => !txt.includes(e));
        const url = page.url();
        console.log(
          `${missing.length ? 'CHECK' : 'OK   '} ${item.name.padEnd(28)} url=${url.replace(BASE, '')} ${missing.length ? 'missing=' + missing.join(',') : 'content-ok'}`
        );
      } catch (e) {
        console.log(`ERR  ${item.name}: ${e.message}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });