// Tests for dead time, highlight clips, previews and the generated ffmpeg scripts.
// Needs test.webm (see README) and ffmpeg on PATH.
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const APP = 'file://' + path.resolve(__dirname, '../index.html');
const VID = path.resolve(__dirname, 'test.webm');
const OUT = path.resolve(__dirname, 'out-edit'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const probeDur = f => parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 '${f}'`).toString());

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(APP);
  await page.setInputFiles('#fileInput', VID);
  await page.waitForFunction(() => document.querySelector('#video').readyState >= 1);
  await sleep(300);
  const kb = page.keyboard;
  const seekTo = async t => { await page.evaluate(t => seek(t), t); await page.waitForFunction(() => !video.seeking); };
  const dl = async fn => { const [d] = await Promise.all([page.waitForEvent('download'), fn()]); const p = path.join(OUT, d.suggestedFilename()); await d.saveAs(p); return p; };

  // Mark dead time with X
  await seekTo(20); await kb.press('x');
  ok('Pending label shows', (await page.textContent('#pendingLabel')).includes('Dead time from 0:20'));
  await seekTo(30); await kb.press('x');
  await seekTo(50); await kb.press('x'); await seekTo(65); await kb.press('x');
  let cuts = await page.evaluate(() => state.cuts.map(c => [c.start, c.end]));
  ok('Two dead-time parts marked', JSON.stringify(cuts) === '[[20,30],[50,65]]', JSON.stringify(cuts));
  // Esc cancels a pending range
  await seekTo(80); await kb.press('x'); await kb.press('Escape');
  ok('Esc cancels pending dead time', (await page.evaluate(() => state.cuts.length)) === 2 && !(await page.textContent('#pendingLabel')));

  // Notes to show as subtitles
  await seekTo(13); await kb.press('n'); await kb.type('Before first timeout'); await kb.press('Enter'); await page.evaluate(() => video.pause());
  await seekTo(40); await kb.press('n'); await kb.type('Between timeouts'); await kb.press('Enter'); await page.evaluate(() => video.pause());
  await seekTo(26); await kb.press('n'); await kb.type('Inside dead time'); await kb.press('Enter'); await page.evaluate(() => video.pause());
  await seekTo(93); await kb.press('1'); // made shot at 90
  await seekTo(73); await kb.press('2'); // missed shot at 70

  // Clips: one via C, two from notes
  await seekTo(100); await kb.press('c'); await seekTo(106); await kb.press('c');
  await page.click('[data-tab=edit]');
  await page.click('[data-tab=notes]'); await page.click('[data-ftag=made]'); await page.click('[data-ftag=missed]');
  await page.click('[data-tab=edit]');
  await page.click('#clipsFromNotes');
  let clips = await page.evaluate(() => state.clips.map(c => [+c.start.toFixed(2), +c.end.toFixed(2), c.caption]));
  ok('Clips from C key and notes', clips.length === 3, JSON.stringify(clips));
  // reorder: move last (made shot 88-96) to top, caption, trim
  await page.locator('#clipList .range').nth(2).locator('[data-act=up]').click();
  await page.locator('#clipList .range').nth(1).locator('[data-act=up]').click();
  const cap = page.locator('#clipList .range').nth(0).locator('input[data-f=caption]');
  await cap.fill('Pull-up from the elbow'); await cap.press('Enter');
  await page.locator('#clipList .range').nth(0).locator('[data-act="end-"]').click();
  await page.locator('#clipList .range').nth(0).locator('[data-act="end-"]').click();
  clips = await page.evaluate(() => state.clips.map(c => [+c.start.toFixed(2), +c.end.toFixed(2), c.caption]));
  ok('Reorder, caption and trim', clips[0][0] === 88 && clips[0][1] === 95 && clips[0][2] === 'Pull-up from the elbow', JSON.stringify(clips));
  ok('Condensed summary', (await page.textContent('#cutSummary')).includes('condensed game 1:35'), await page.textContent('#cutSummary'));
  await page.screenshot({ path: path.join(OUT, 'edit-tab.png') });

  // Skip dead time preview
  await page.check('#skipDead');
  const samples = [];
  for (const from of [17, 47]) {
    await seekTo(from); await page.evaluate(() => { video.playbackRate = 2; video.play(); });
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) { samples.push(await page.evaluate(() => video.seeking ? -1 : video.currentTime)); await sleep(80); }
    await page.evaluate(() => video.pause());
  }
  const inside = samples.filter(t => t >= 0 && ((t > 20.3 && t < 29.8) || (t > 50.3 && t < 64.8)));
  ok('Skip dead time preview jumps over cuts', inside.length === 0 && Math.max(...samples) > 66, `(${samples.length} samples, max ${Math.max(...samples).toFixed(1)}, inside ${inside.length})`);
  await page.uncheck('#skipDead');

  // Reel preview plays clips in custom order
  await page.click('#previewReel');
  const order = []; const t1 = Date.now();
  while (Date.now() - t1 < 25000) {
    const s = await page.evaluate(() => ({ pl: !!state.playlist, i: state.playlist && state.playlist.i, t: video.currentTime }));
    if (!s.pl) break; if (order[order.length - 1] !== s.i) order.push(s.i); await sleep(100);
  }
  ok('Reel preview plays clips in reel order', JSON.stringify(order) === '[0,1,2]', JSON.stringify(order));

  // Persistence and JSON round trip
  const before = await page.evaluate(() => JSON.stringify([state.cuts, state.clips]));
  await page.reload(); await page.setInputFiles('#fileInput', VID); await page.waitForFunction(() => document.querySelector('#video').readyState >= 1); await sleep(300);
  ok('Dead time and clips survive reload', before === await page.evaluate(() => JSON.stringify([state.cuts, state.clips])));
  await page.click('[data-tab=export]');
  const json = await dl(() => page.click('[data-export=json]'));
  await page.evaluate(() => { state.cuts = []; state.clips = []; saveNotes(); renderAll(); });
  await page.setInputFiles('#importInput', json); await sleep(400);
  ok('JSON import restores dead time and clips', before === await page.evaluate(() => JSON.stringify([state.cuts, state.clips])));

  // Scripts, all three subtitle modes
  await page.click('[data-tab=edit]');
  const scripts = {};
  for (const mode of ['burn', 'soft', 'none']) {
    await page.check(`#subMode input[value=${mode}]`);
    for (const kind of ['condensed', 'reel']) {
      const f = await dl(() => page.click(kind === 'condensed' ? '#buildCondensed' : '#buildReel'));
      const dest = path.join(OUT, `${kind}-${mode}.sh`); fs.renameSync(f, dest); scripts[`${kind}-${mode}`] = dest;
    }
  }
  ok('No JS errors', errors.length === 0, errors.join(' | '));
  await browser.close();

  // Run the scripts with real ffmpeg, from a different folder, passing the video folder
  const work = path.join(OUT, 'videos'); fs.mkdirSync(work);
  fs.copyFileSync(VID, path.join(work, 'test.webm'));
  for (const [name, sh] of Object.entries(scripts)) {
    try { execSync(`cd / && sh '${sh}' '${work}'`, { stdio: 'pipe' }); }
    catch (e) { ok(`Script ${name} runs`, false, e.stderr.toString().slice(-400)); continue; }
    const kind = name.split('-')[0];
    const outFile = path.join(work, kind === 'condensed' ? 'test-condensed.mp4' : 'test-highlights.mp4');
    const d = probeDur(outFile);
    const want = kind === 'condensed' ? 95 : 7 + 8 + 6;
    ok(`Script ${name}: output length ${want}s`, Math.abs(d - want) < 0.3, `(${d.toFixed(2)}s)`);
    if (name === 'condensed-soft' || name === 'reel-soft') {
      const srt = execSync(`ffmpeg -v error -i '${outFile}' -map 0:s -f srt -`).toString();
      fs.writeFileSync(path.join(OUT, name + '.srt'), srt);
      if (name === 'condensed-soft') {
        // note at 37s source -> 27s output (10s cut before it); "Inside dead time" must be gone
        ok('Soft subs retimed past cuts', /00:00:27,\d{3} --> .*\nBetween timeouts/.test(srt) && !srt.includes('Inside dead time'), '');
      } else ok('Reel soft subs: caption on first clip at 0s', /^1\n00:00:00,000 --> 00:00:07,000\nPull-up from the elbow/.test(srt));
    }
    if (name === 'condensed-burn') execSync(`ffmpeg -v error -y -ss 28 -i '${outFile}' -frames:v 1 '${OUT}/condensed-burn-28s.png'`);
    if (name === 'reel-burn') execSync(`ffmpeg -v error -y -ss 2 -i '${outFile}' -frames:v 1 '${OUT}/reel-burn-2s.png'`);
    fs.renameSync(outFile, path.join(OUT, `${name}.mp4`));
  }
  ok('Temp folders cleaned up', fs.readdirSync(work).length === 1, JSON.stringify(fs.readdirSync(work)));
  console.log(results.join('\n'));
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(1); });
