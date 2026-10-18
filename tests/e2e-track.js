// Tests drawings that follow the play: positions on several frames, gliding between them.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const APP = 'file://' + path.resolve(__dirname, '../index.html');
const VID = path.resolve(__dirname, 'test.webm');
const OUT = path.resolve(__dirname, 'out-track'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (n, c, x = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(APP);
  await page.setInputFiles('#fileInput', VID);
  await page.waitForFunction(() => document.querySelector('#video').readyState >= 1); await sleep(300);
  const kb = page.keyboard;
  const seekTo = async t => { await page.evaluate(t => seek(t), t); await page.waitForFunction(() => !video.seeking); await sleep(50); };
  const box = async () => page.locator('#drawCanvas').boundingBox();
  // canvas units -> page pixels
  const toPage = async ([x, y]) => { const b = await box(); const w = await page.evaluate(() => drawCanvas.width); const h = await page.evaluate(() => drawCanvas.height); return [b.x + x * b.width / w, b.y + y * b.height / h]; };
  const drag = async (from, to) => { await page.mouse.move(...from); await page.mouse.down(); await page.mouse.move(...to, { steps: 6 }); await page.mouse.up(); };

  // 1. Draw an arrow at 60s and save
  await seekTo(60); await kb.press('d');
  let b = await box();
  await drag([b.x + b.width * 0.6, b.y + b.height * 0.6], [b.x + b.width * 0.4, b.y + b.height * 0.7]);
  await page.click('#drawText'); await kb.type('Attack the gap'); await kb.press('Enter'); await sleep(200);
  let n = await page.evaluate(() => state.notes.find(n => n.vec));
  ok('Arrow saved as a drawing with one position', n && n.vec.keys.length === 1 && n.text === 'Attack the gap' && Math.abs(n.t - 60) < 0.05);

  // 2. Re-open it: D on its frame opens it for editing with the Adjust tool
  await seekTo(60); await kb.press('d');
  ok('D on a drawing opens it for editing', await page.evaluate(() => state.draw && state.draw.noteId && state.draw.tool === 'move'));
  // step forward one second with frame steps
  for (let i = 0; i < 30; i++) await kb.press('Period');
  await page.waitForFunction(() => !video.seeking);
  const t1 = await page.evaluate(() => video.currentTime);
  ok('Frame stepping works in draw mode', Math.abs(t1 - 61) < 0.05, `(t=${t1.toFixed(3)})`);
  // drag the tail (start) and the head (end) to new spots
  let pts = await page.evaluate(() => vecShapes(state.draw.vec, video.currentTime)[0].pts);
  await drag(await toPage(pts[0]), await toPage([pts[0][0] + 120, pts[0][1] - 40]));
  pts = await page.evaluate(() => vecShapes(state.draw.vec, video.currentTime)[0].pts);
  await drag(await toPage(pts[1]), await toPage([pts[1][0] + 150, pts[1][1] - 20]));
  let v = await page.evaluate(() => state.draw.vec);
  ok('Dragging ends adds a second position', v.keys.length === 2 && Math.abs(v.keys[1].t - 61) < 0.05, `(${v.keys.length} positions)`);
  const p0 = v.keys[0].pts[0], p1 = v.keys[1].pts[0];
  ok('Both ends moved on the new frame only', Math.abs(p1[0][0] - p0[0][0] - 120) < 3 && Math.abs(p1[1][0] - p0[1][0] - 150) < 3, JSON.stringify([p0, p1]));
  // drag the whole arrow by its middle at 61.5
  await kb.press('ArrowRight'); await page.waitForFunction(() => !video.seeking);
  pts = await page.evaluate(() => vecShapes(state.draw.vec, video.currentTime)[0].pts);
  const mid = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  await drag(await toPage(mid), await toPage([mid[0] + 50, mid[1] + 30]));
  v = await page.evaluate(() => state.draw.vec);
  const k2 = v.keys.find(k => Math.abs(k.t - 61.5) < 0.05);
  ok('Dragging the middle moves the whole arrow', k2 && Math.abs(k2.pts[0][0][0] - pts[0][0] - 50) < 3 && Math.abs(k2.pts[0][1][1] - pts[1][1] - 30) < 3);
  // keep until 62.5 with K
  await seekTo(62.5); await kb.press('k');
  v = await page.evaluate(() => state.draw.vec);
  ok('K keeps the drawing on screen until here', v.keys.length === 4 && Math.abs(v.keys[3].t - 62.5) < 0.05);
  // undo then redo-by-K
  await kb.press('z'); ok('Undo removes the last change', (await page.evaluate(() => state.draw.vec.keys.length)) === 3);
  await kb.press('k');
  await page.screenshot({ path: path.join(OUT, 'editing.png') });
  // [ jumps to previous position
  await kb.press('BracketLeft'); await page.waitForFunction(() => !video.seeking);
  ok('[ jumps to the previous position', Math.abs(await page.evaluate(() => video.currentTime) - 61.5) < 0.05);
  await kb.press('Enter'); await sleep(200);
  n = await page.evaluate(() => state.notes.find(n => n.vec));
  ok('Saved: one note, 4 positions, text kept', n.vec.keys.length === 4 && n.text === 'Attack the gap' && (await page.evaluate(() => state.notes.filter(n => n.vec).length)) === 1);

  // 3. Playback: pauses at start, then glides and stays until the last position
  await seekTo(59.5); await page.evaluate(() => video.play()); await sleep(1200);
  let st = await page.evaluate(() => ({ paused: video.paused, t: video.currentTime, shown: !drawShowCanvas.hidden }));
  ok('Pauses on the drawing at its first position', st.paused && Math.abs(st.t - 60) < 0.05 && st.shown, JSON.stringify(st));
  await page.evaluate(() => { video.playbackRate = 0.5; }); await kb.press('Space');
  const seen = []; const t0 = Date.now();
  while (Date.now() - t0 < 6500) {
    seen.push(await page.evaluate(() => ({ t: video.currentTime, shown: !drawShowCanvas.hidden })));
    await sleep(100);
  }
  const during = seen.filter(s => s.t > 60.2 && s.t < 62.4), after = seen.filter(s => s.t > 62.8);
  ok('Stays visible while it follows the play (60–62.5s)', during.length > 10 && during.every(s => s.shown), `(${during.length} samples)`);
  ok('Disappears after its last position', after.length > 0 && after.every(s => !s.shown), `(${after.length} samples)`);
  // mid-way position is interpolated
  const midPts = await page.evaluate(() => { const n = state.notes.find(n => n.vec); return [vecPts(n.vec, 60.5)[0], n.vec.keys[0].pts[0], n.vec.keys[1].pts[0]]; });
  const [m, a, c] = midPts;
  ok('Half-way between positions the arrow is half-way', Math.abs(m[0][0] - (a[0][0] + c[0][0]) / 2) < 0.5 && Math.abs(m[1][0] - (a[1][0] + c[1][0]) / 2) < 0.5);
  await page.evaluate(() => { video.pause(); video.playbackRate = 1; });
  await seekTo(61.25); await sleep(150);
  await page.screenshot({ path: path.join(OUT, 'playback-mid.png') });

  // 4. Survives reload and JSON round trip; PNG export still works
  const before = await page.evaluate(() => JSON.stringify(state.notes.find(n => n.vec).vec));
  await page.reload(); await page.setInputFiles('#fileInput', VID); await page.waitForFunction(() => document.querySelector('#video').readyState >= 1); await sleep(300);
  ok('Positions survive reload', before === await page.evaluate(() => JSON.stringify((state.notes.find(n => n.vec) || {}).vec)));
  const json = await page.evaluate(() => toJSON());
  await page.evaluate(() => { state.notes = []; saveNotes(); renderAll(); });
  const f = path.join(OUT, 'b.json'); fs.writeFileSync(f, json);
  await page.setInputFiles('#importInput', f); await sleep(300);
  ok('Positions survive JSON backup + import', before === await page.evaluate(() => JSON.stringify((state.notes.find(n => n.vec) || {}).vec)));
  ok('No JS errors', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(1); });
