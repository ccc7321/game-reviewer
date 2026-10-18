// Tests the Journal tab and auto-saving to a folder. The folder picker is replaced
// by the browser's private file system (a real, persistent directory handle).
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const http = require('http');
const ROOT = path.resolve(__dirname, '..');
const VID = path.resolve(__dirname, 'test.webm');
const OUT = path.resolve(__dirname, 'out-journal'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (n, c, x = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Serve the app over http so the private file system is available.
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
const APP = () => `http://127.0.0.1:${server.address().port}/index.html`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle('Basketball Journal', { create: true });
    };
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  const open = async () => {
    await page.setInputFiles('#fileInput', VID);
    await page.waitForFunction(() => document.querySelector('#video').readyState >= 1); await sleep(600);
  };
  const readFolder = name => page.evaluate(async name => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Basketball Journal');
    try { return await (await (await dir.getFileHandle(name)).getFile()).text(); } catch { return null; }
  }, name);
  const kb = page.keyboard;

  await page.goto(APP()); await open();
  ok('Folder button offers setup', (await page.textContent('#folderBtn')).includes('Save to a folder'));
  // Notes made before connecting a folder
  await page.evaluate(() => seek(30)); await kb.press('1'); await kb.press('n'); await kb.type('Early note'); await kb.press('Enter');
  await page.evaluate(() => video.pause());
  await page.click('#folderBtn'); await sleep(1500);
  ok('Folder connected', (await page.textContent('#folderBtn')).includes('Saved to Basketball Journal'), await page.textContent('#folderBtn'));
  let j = JSON.parse(await readFolder('test.notes.json') || '{}');
  ok('Existing notes written to folder on connect', j.notes && j.notes.length === 2, `(${j.notes && j.notes.length})`);

  // Journal entry
  await page.click('[data-tab=journal]');
  ok('Date defaults to the video file date', /^\d{4}-\d\d-\d\d$/.test(await page.inputValue('#jDate')));
  await page.fill('#jDate', '2026-10-12');
  await page.fill('#jOpp', 'Hawks'); await page.fill('#jResult', 'W 54–48');
  await page.fill('[data-j=felt]', 'Legs heavy in Q1, better after warming up.\nConfident shooting.');
  await page.fill('[data-j=good]', 'Attacked the gap twice.');
  await page.fill('[data-j=work]', 'Keep attacking the gap when the defender is closing out.');
  // A note typed after the journal: Esc leaves the text box so shortcuts work again
  await kb.press('Escape');
  ok('Esc leaves the journal box', await page.evaluate(() => document.activeElement === document.body));
  await page.evaluate(() => seek(60)); await kb.press('n'); await kb.type('Should have attacked the gap'); await kb.press('Enter'); await page.evaluate(() => video.pause());
  await sleep(1500);
  const md = await readFolder('test.journal.md');
  fs.writeFileSync(path.join(OUT, 'test.journal.md'), md || '');
  ok('Journal .md written with title from date/opponent/result', md && md.startsWith('# 2026-10-12 · vs Hawks · W 54–48'));
  ok('Journal .md has entries, game log and stats', md && md.includes('## How I felt') && md.includes('Confident shooting.') && md.includes('## What to work on') && md.includes('## Game log') && md.includes('Should have attacked the gap') && md.includes('## Stats'));
  j = JSON.parse(await readFolder('test.notes.json'));
  ok('Notes .json includes journal and new note', j.journal.opponent === 'Hawks' && j.notes.length === 3);
  await page.screenshot({ path: path.join(OUT, 'journal-tab.png') });

  // Reload: same browser
  await page.reload(); await open();
  ok('After reload: folder still connected', (await page.textContent('#folderBtn')).includes('Saved to'), await page.textContent('#folderBtn'));
  await page.click('[data-tab=journal]');
  ok('After reload: journal restored', (await page.inputValue('#jOpp')) === 'Hawks' && (await page.inputValue('[data-j=good]')) === 'Attacked the gap twice.');

  // Browser data wiped (localStorage cleared), folder survives
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await open(); await sleep(500);
  const n = await page.evaluate(() => state.notes.length);
  ok('Browser data cleared: notes come back from folder', n === 3, `(${n})`);
  await page.click('[data-tab=journal]');
  ok('Browser data cleared: journal comes back from folder', (await page.inputValue('#jResult')) === 'W 54–48');

  // Folder copy newer than browser copy (e.g. edited in another browser)
  const edited = JSON.parse(await readFolder('test.notes.json'));
  edited.notes.push({ id: 'x1', t: 90, tag: 'made', text: 'Added elsewhere' }); edited.savedAt = Date.now() + 60000;
  await page.evaluate(async txt => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('Basketball Journal');
    const w = await (await dir.getFileHandle('test.notes.json')).createWritable(); await w.write(txt); await w.close();
  }, JSON.stringify(edited));
  await page.reload(); await open(); await sleep(500);
  ok('Newer folder copy wins', (await page.evaluate(() => state.notes.map(n => n.text))).includes('Added elsewhere'));

  // Permission lost after restart: shows Reconnect, saving resumes after click
  await page.evaluate(() => {
    const q = FileSystemHandle.prototype.queryPermission;
    FileSystemHandle.prototype.queryPermission = async () => 'prompt';
    FileSystemHandle.prototype.requestPermission = async () => { FileSystemHandle.prototype.queryPermission = q; return 'granted'; };
  });
  await page.evaluate(() => initFolder()); await sleep(200);
  ok('Lost permission shows Reconnect', (await page.textContent('#folderBtn')).includes('Reconnect'));
  await page.evaluate(() => { seek(100); }); await kb.press('2'); await sleep(1200);
  let j2 = JSON.parse(await readFolder('test.notes.json'));
  ok('No folder writes while disconnected', j2.notes.length === 4, `(${j2.notes.length})`);
  await page.click('#folderBtn'); await sleep(1500);
  j2 = JSON.parse(await readFolder('test.notes.json'));
  ok('After Reconnect, folder catches up', j2.notes.length === 5 && (await page.textContent('#folderBtn')).includes('Saved to'), `(${j2.notes.length})`);

  ok('No JS errors', errors.length === 0, errors.join(' | '));

  // Browser without folder support (Safari/Firefox)
  const ctx2 = await browser.newContext();
  await ctx2.addInitScript(() => { delete window.showDirectoryPicker; });
  const p2 = await ctx2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await p2.goto(APP()); await sleep(300);
  await p2.click('[data-tab=journal]');
  ok('Unsupported browser: button hidden, hint shown', (await p2.isHidden('#folderBtn')) && (await p2.textContent('#folderStatus')).includes('Chrome and Edge') && e2.length === 0);

  console.log(results.join('\n'));
  await browser.close(); server.close();
})().catch(e => { console.log(results.join('\n')); console.error(e); server.close(); process.exit(1); });
