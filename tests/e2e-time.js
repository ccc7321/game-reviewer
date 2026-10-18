// Tests note timing: lead time only while playing, and adjusting a note's time later.
const { chromium } = require('playwright');
const path = require('path');
const APP = 'file://' + path.resolve(__dirname, '../index.html');
const VID = path.resolve(__dirname, 'test.webm');
const results = []; const ok = (n, c, x = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.goto(APP); await page.setInputFiles('#fileInput', VID);
  await page.waitForFunction(() => document.querySelector('#video').readyState >= 1); await sleep(300);
  const kb = page.keyboard;
  const seekTo = async t => { await page.evaluate(t => seek(t), t); await page.waitForFunction(() => !video.seeking); };
  const note = text => page.evaluate(text => state.notes.find(n => n.text === text), text);

  await seekTo(40); await kb.press('n'); await kb.type('paused note'); await kb.press('Enter'); await page.evaluate(() => video.pause());
  ok('Paused: note keeps the exact time', Math.abs((await note('paused note')).t - 40) < 0.01, `(${(await note('paused note')).t})`);
  await seekTo(40); await kb.press('3'); 
  ok('Paused: quick tag keeps the exact time', (await page.evaluate(() => state.notes.some(n => n.tag === 'defense' && Math.abs(n.t - 40) < 0.01))));
  await seekTo(50); await page.evaluate(() => video.play()); await sleep(500);
  await kb.press('n'); const at = await page.evaluate(() => video.currentTime);
  await page.click('#entryEarlier'); await page.click('#entryEarlier'); await page.click('#entryLater');
  ok('Entry shows the stamp and −1s/+1s change it', (await page.textContent('#entryTime')) === fmtLocal(at - 3 - 1));
  await kb.type('playing note'); await kb.press('Enter'); await page.evaluate(() => video.pause());
  ok('Playing: lead time + adjustment applied', Math.abs((await note('playing note')).t - (at - 4)) < 0.05, `(${(await note('playing note')).t.toFixed(2)} vs ${(at - 4).toFixed(2)})`);

  // Select a note: time editor appears
  let n = await note('paused note');
  await page.click(`.note[data-id="${n.id}"] .time`);
  ok('Selecting a note shows the time editor', await page.isVisible(`.note[data-id="${n.id}"] .tedit`));
  await page.click(`.note[data-id="${n.id}"] [data-tadj="1"]`);
  await page.click(`.note[data-id="${n.id}"] [data-tadj="1"]`);
  await page.click(`.note[data-id="${n.id}"] [data-tadj="-0.1"]`);
  n = await note('paused note');
  ok('+1s / −0.1 move the note', Math.abs(n.t - 41.9) < 0.01, `(${n.t})`);
  ok('Video follows the note', Math.abs(await page.evaluate(() => video.currentTime) - 41.9) < 0.05);
  await seekTo(33.3);
  await page.click(`.note[data-id="${n.id}"] [data-tnow]`);
  n = await note('paused note');
  ok('Move to video time', Math.abs(n.t - 33.3) < 0.01, `(${n.t})`);
  ok('List re-sorted and editor still on the note', await page.isVisible(`.note[data-id="${n.id}"] .tedit`));
  const order = await page.evaluate(() => state.notes.map(n => n.t));
  ok('Notes stay in time order', order.every((t, i) => !i || order[i - 1] <= t));

  // A drawing that follows the play moves with its note
  await page.evaluate(() => {
    const n = addNote({ t: 70, text: 'tracked', vec: { w: 960, h: 540, shapes: [{ type: 'line', color: '#fff', w: 4 }], keys: [{ t: 70, pts: [[[1, 1], [9, 9]]] }, { t: 72, pts: [[[5, 5], [20, 20]]] }] } });
    state.selectedId = n.id; renderAll();
  });
  const tr = await note('tracked');
  await page.click(`.note[data-id="${tr.id}"] [data-tadj="-1"]`);
  const tr2 = await note('tracked');
  ok('Drawing positions move with the note', tr2.t === 69 && tr2.vec.keys[0].t === 69 && tr2.vec.keys[1].t === 71);
  await page.reload(); await page.setInputFiles('#fileInput', VID); await page.waitForFunction(() => document.querySelector('#video').readyState >= 1); await sleep(300);
  ok('New times survive reload', Math.abs((await note('paused note')).t - 33.3) < 0.01);
  ok('No JS errors', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n')); await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(1); });
function fmtLocal(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t % 1) * 10); return `${m}:${String(s).padStart(2, '0')}.${d}`; }
