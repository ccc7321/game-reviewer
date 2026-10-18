const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const APP = 'file://' + path.resolve(__dirname, '../index.html');
const VID = path.resolve(__dirname, 'test.webm');
const OUT = path.resolve(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const results = []; const ok = (name, cond, extra='') => { results.push(`${cond?'PASS':'FAIL'}  ${name} ${extra}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type()==='error' && errors.push(m.text()));
  page.on('dialog', d => d.accept());
  const load = async () => { await page.setInputFiles('#fileInput', VID); await page.waitForFunction(() => document.querySelector('#video').readyState >= 1 && !document.querySelector('#empty').hidden === false); await sleep(300); };
  const ct = () => page.evaluate(() => document.querySelector('#video').currentTime);
  const notes = () => page.evaluate(() => state.notes);
  const dl = async (fn) => { const [d] = await Promise.all([page.waitForEvent('download'), fn()]); const p = path.join(OUT, d.suggestedFilename()); await d.saveAs(p); return p; };

  await page.goto(APP); await load();
  await page.screenshot({ path: path.join(OUT, 'loaded.png') });

  // 1. keyboard-only logging, 20+ notes
  const kb = page.keyboard;
  await kb.press('Space'); await sleep(1500);
  ok('Space plays', !(await page.evaluate(() => video.paused)));
  for (let i = 0; i < 12; i++) {
    await kb.press('ArrowRight');                // +5s
    await kb.press(String((i % 6) + 1));         // quick tag 1-6
    await sleep(150);
  }
  const playingAfterTags = !(await page.evaluate(() => video.paused));
  ok('Quick tags do not pause', playingAfterTags);
  // N notes
  for (let i = 0; i < 6; i++) {
    await kb.press('ArrowRight');
    const before = await ct();
    await kb.press('n');
    ok(`N pauses (#${i})`, await page.evaluate(() => video.paused && document.activeElement.id === 'entryText'));
    await kb.type(`Note number ${i} with "quotes", commas`);
    await kb.press('Enter'); await sleep(200);
    const last = (await notes()).find(n => n.text === `Note number ${i} with "quotes", commas`);
    if (i === 0) ok('Lead time 3s applied', last && Math.abs(last.t - (before - 3)) < 0.35, `(stamp ${last && last.t.toFixed(2)} vs ${(before-3).toFixed(2)})`);
    if (i === 0) ok('Enter resumes playback', !(await page.evaluate(() => video.paused)));
  }
  // Esc cancels
  const cnt0 = (await notes()).length;
  await kb.press('n'); await kb.type('cancel me'); await kb.press('Escape'); await sleep(150);
  ok('Esc cancels note', (await notes()).length === cnt0 && !(await page.evaluate(() => video.paused)));
  // Shift+digit = tag + note
  await kb.press('Shift+Digit1'); await kb.type('pull-up jumper'); await kb.press('Enter'); await sleep(150);
  ok('Shift+1 tags and opens note', (await notes()).some(n => n.tag === 'made' && n.text === 'pull-up jumper'));
  // On/off court
  await page.evaluate(() => { video.pause(); });
  await page.evaluate(() => seek(10)); await sleep(100); await kb.press('7');
  await page.evaluate(() => seek(43)); await sleep(100); await kb.press('8');
  await page.evaluate(() => seek(73)); await sleep(100); await kb.press('7');
  await page.evaluate(() => seek(103)); await sleep(100); await kb.press('8');
  const all = await notes();
  ok('20+ notes logged by keyboard', all.length >= 20, `(${all.length})`);

  // other controls
  await page.evaluate(() => seek(50)); await sleep(100);
  await kb.press(']'); ok('] speeds up', await page.evaluate(() => video.playbackRate) === 1.5);
  await kb.press('['); await kb.press('['); ok('[ slows down', await page.evaluate(() => video.playbackRate) === 0.5);
  await kb.press(']');
  let t0 = await ct(); await kb.press('Period'); await sleep(100); const t1 = await ct();
  ok('. steps one frame', Math.abs(t1 - t0 - 1/30) < 0.01, `(${(t1-t0).toFixed(4)})`);
  t0 = await ct(); await kb.press('Shift+ArrowLeft'); await sleep(100);
  ok('Shift+← jumps 15s', Math.abs((t0 - await ct()) - 15) < 0.05);
  // loop
  await page.evaluate(() => seek(20)); await sleep(100); await kb.press('a');
  await page.evaluate(() => seek(22)); await sleep(100); await kb.press('b');
  await kb.press('l'); await kb.press('Space'); await sleep(3500);
  const lt = await ct(); ok('A/B loop keeps playback inside 20–22s', lt >= 19.9 && lt <= 22.2, `(${lt.toFixed(2)})`);
  await kb.press('l'); await kb.press('Space');
  // help
  await kb.press('Shift+Slash'); ok('? opens help', await page.isVisible('#help')); await page.screenshot({ path: path.join(OUT, 'help.png') }); await kb.press('Escape');

  // 2. reload persistence
  const beforeReload = JSON.stringify((await notes()).map(n => [n.t, n.tag, n.text]));
  await page.reload(); await load();
  const afterReload = JSON.stringify((await notes()).map(n => [n.t, n.tag, n.text]));
  ok('Notes survive reload', beforeReload === afterReload, `(${(await notes()).length} notes)`);

  // 5. stats
  const counts = await page.evaluate(() => { const c = {}; state.notes.forEach(n => c[n.tag] = (c[n.tag]||0)+1); return c; });
  const statsText = await page.evaluate(() => document.querySelector('#statsBox').innerText);
  const made = counts.made||0, missed = counts.missed||0;
  ok('Stats FG matches tags', statsText.includes(`${made}/${made+missed}`) && statsText.includes((made/(made+missed)*100).toFixed(1)+'%'), `(${made}/${made+missed})`);
  ok('Minutes played = (43-10)+(103-73)-lead adjustments = 63s → 1:03', statsText.includes('1:03'), '');

  // 3/4. exports
  await page.click('[data-tab=export]');
  const srt = await dl(() => page.click('[data-export=srt]'));
  const vtt = await dl(() => page.click('[data-export=vtt]'));
  const csv = await dl(() => page.click('[data-export=csv]'));
  const md = await dl(() => page.click('[data-export=md]'));
  const json = await dl(() => page.click('[data-export=json]'));
  const srtTxt = fs.readFileSync(srt, 'utf8');
  const cues = srtTxt.trim().split(/\n\n/);
  const n = (await notes()).length;
  ok('SRT has one cue per note', cues.length === n, `(${cues.length}/${n})`);
  ok('SRT format valid', cues.every((c, i) => { const l = c.split('\n'); return l[0] == String(i+1) && /^\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}$/.test(l[1]) && l[2]; }));
  ok('SRT cue ≤4s and not past next note', (() => { const ts = cues.map(c => c.split('\n')[1].split(' --> ').map(s => { const [h,m,r]=s.split(':'); return +h*3600 + +m*60 + parseFloat(r.replace(',','.')); })); return ts.every(([a,b],i) => b > a && b - a <= 4.001 && (!ts[i+1] || ts[i+1][0] <= a || b <= ts[i+1][0] + 0.001)); })());
  ok('SRT label like [Tag] text', /\[My shot \(made\)\] pull-up jumper/.test(srtTxt));
  ok('VTT header', fs.readFileSync(vtt, 'utf8').startsWith('WEBVTT'));
  const csvTxt = fs.readFileSync(csv, 'utf8');
  ok('CSV rows = notes + header, quotes escaped', csvTxt.trim().split('\r\n').length === n + 1 && csvTxt.includes('"Note number 0 with ""quotes"", commas"'));
  const mdTxt = fs.readFileSync(md, 'utf8');
  ok('MD has stats and grouped notes', mdTxt.includes('## Stats') && mdTxt.includes('### My shot (made)') && mdTxt.includes(`${made}/${made+missed}`));
  fs.copyFileSync(srt, path.join(OUT, 'test.srt'));

  // 6. drawing
  await page.evaluate(() => seek(60)); await sleep(300);
  await kb.press('d'); ok('D opens draw mode', await page.isVisible('#drawCanvas'));
  const box = await page.locator('#drawCanvas').boundingBox();
  await page.mouse.move(box.x + box.width*0.2, box.y + box.height*0.7); await page.mouse.down();
  await page.mouse.move(box.x + box.width*0.6, box.y + box.height*0.3, { steps: 8 }); await page.mouse.up();
  await kb.press('2');
  await page.mouse.move(box.x + box.width*0.6, box.y + box.height*0.2); await page.mouse.down();
  await page.mouse.move(box.x + box.width*0.8, box.y + box.height*0.5, { steps: 8 }); await page.mouse.up();
  await page.screenshot({ path: path.join(OUT, 'draw.png') });
  await page.click('#drawText'); await kb.type('Should have cut here'); await kb.press('Enter'); await sleep(200);
  const dn = (await notes()).find(n => n.drawing);
  ok('Drawing saved to a note', !!dn && dn.text === 'Should have cut here' && Math.abs(dn.t - 60) < 0.1, dn ? `(${Math.round(dn.drawing.length/1024)} KB)` : '');
  await page.evaluate(() => seek(10)); await sleep(300);
  ok('Drawing hidden away from its time', await page.evaluate(() => document.querySelector('#drawShow').hidden));
  // Default: playback pauses on the drawing's frame, Space continues and hides it
  await page.evaluate(() => seek(58.5)); await sleep(100); await page.evaluate(() => video.play()); await sleep(2500);
  const st = await page.evaluate(() => ({ paused: video.paused, t: video.currentTime, shown: !document.querySelector('#drawShow').hidden }));
  ok('Playback pauses on the drawing and shows it', st.paused && Math.abs(st.t - 60) < 0.05 && st.shown, JSON.stringify(st));
  await page.screenshot({ path: path.join(OUT, 'drawshow.png') });
  await kb.press('Space'); await sleep(1200);
  const st2 = await page.evaluate(() => ({ paused: video.paused, t: video.currentTime, shown: !document.querySelector('#drawShow').hidden }));
  ok('Space continues and the drawing disappears', !st2.paused && st2.t > 60.5 && !st2.shown, JSON.stringify(st2));
  // Timed mode: keeps playing, shows for the set seconds
  await page.evaluate(() => { video.pause(); settings.drawMode = 'timed'; settings.drawHold = 1.5; });
  await page.evaluate(() => seek(59.5)); await sleep(100); await page.evaluate(() => video.play()); await sleep(900);
  ok('Timed mode shows drawing while playing', await page.evaluate(() => !video.paused && !document.querySelector('#drawShow').hidden), `(t=${(await ct()).toFixed(2)})`);
  await sleep(1800);
  ok('Timed mode hides after the set seconds', await page.evaluate(() => document.querySelector('#drawShow').hidden), `(t=${(await ct()).toFixed(2)})`);
  await page.evaluate(() => { video.pause(); settings.drawMode = 'pause'; });
  await page.click('[data-tab=notes]');
  const png = await dl(() => page.click(`.note[data-id="${dn.id}"] [data-png]`));
  ok('PNG export downloaded', fs.statSync(png).size > 1000, path.basename(png));
  fs.copyFileSync(png, path.join(OUT, 'frame-export.png'));

  // 5. filter + playlist
  await page.click('[data-ftag=made]');
  const madeNotes = await page.evaluate(() => filteredNotes().map(n => n.t));
  const clips = await page.evaluate(() => buildClips(filteredNotes()).map(c => [c.start, c.end]));
  ok('Filter shows only made shots', (await page.locator('#noteList .note').count()) === madeNotes.length);
  await page.screenshot({ path: path.join(OUT, 'filtered.png') });
  await page.evaluate(() => { video.playbackRate = 2; });
  await page.click('#playlistBtn');
  const samples = []; const start = Date.now();
  while (Date.now() - start < 30000) {
    const s = await page.evaluate(() => ({ t: video.currentTime, pl: !!state.playlist, seeking: video.seeking }));
    if (!s.pl) break; if (!s.seeking) samples.push(s.t); await sleep(100);
  }
  const outside = samples.filter(t => !clips.some(([a, b]) => t >= a - 0.15 && t <= b + 0.25));
  ok('Playlist plays only filtered clips', samples.length > 20 && outside.length === 0, `(${samples.length} samples, ${outside.length} outside, ${clips.length} clips)`);
  ok('Playlist finishes and stops', !(await page.evaluate(() => !!state.playlist)));
  const visited = clips.map(([a,b]) => samples.some(t => t >= a && t <= b));
  ok('Playlist visits every clip', visited.every(Boolean), JSON.stringify(visited));
  await page.click('[data-fclear]');

  // 4. JSON import restores everything
  const snapshot = JSON.stringify(await notes());
  await page.evaluate(() => { state.notes = []; saveNotes(); renderAll(); });
  ok('Cleared', (await notes()).length === 0);
  await page.setInputFiles('#importInput', json); await sleep(500);
  // backup json was exported before drawing; compare with that
  const backup = JSON.parse(fs.readFileSync(json, 'utf8'));
  ok('JSON import restores all notes', JSON.stringify(await notes()) === JSON.stringify(backup.notes), `(${(await notes()).length})`);
  // full round trip including drawing
  await page.evaluate(s => { state.notes = JSON.parse(s); saveNotes(); renderAll(); }, snapshot);
  await page.click('[data-tab=export]');
  const json2 = await dl(() => page.click('[data-export=json]'));
  await page.evaluate(() => { state.notes = []; saveNotes(); renderAll(); });
  await page.setInputFiles('#importInput', json2); await sleep(500);
  ok('JSON round trip incl. drawing', JSON.stringify(await notes()) === snapshot);

  // commands
  const cmds = await page.evaluate(() => [cmdTrack.value, cmdBurn.value, cmdClips.value.split('\n')[0]]);
  fs.writeFileSync(path.join(OUT, 'cmds.txt'), cmds.join('\n'));

  // layouts
  await page.click('[data-tab=notes]');
  await page.screenshot({ path: path.join(OUT, 'desktop-dark.png') });
  await page.click('#themeBtn'); await sleep(100);
  await page.screenshot({ path: path.join(OUT, 'desktop-light.png') });
  await page.click('#themeBtn');
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(300);
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  ok('No horizontal scroll at phone width', !hscroll);
  await page.screenshot({ path: path.join(OUT, 'mobile.png'), fullPage: true });

  ok('No JS errors', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(1); });
