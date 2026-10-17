# Game Reviewer

A single-file browser app for reviewing your own basketball games. Log timestamped notes and tags while you watch, draw on frames, see your stats, and export everything. Nothing is uploaded: the video plays from your computer and notes are saved in your browser.

## Use it

1. Download [`index.html`](index.html) (or clone this repo).
2. Double-click it to open in Chrome or Safari.
3. Drag a game video (MP4 or MOV) onto the page.
4. Press `?` to see the keyboard shortcuts.

| Key | Action |
|---|---|
| Space | Play / pause |
| ← / → | Back / forward 5s (Shift: 15s) |
| , / . | Frame back / forward |
| [ / ] | Slower / faster |
| N | Write a note (pauses; Enter saves, Esc cancels) |
| 1–8 | Quick tag without pausing (Shift: tag + note) |
| D | Draw on the frame |
| A / B / L | Loop start / end / toggle |

Notes are stamped 3 seconds early by default (change "lead time" in Settings), since you usually react after the play.

## Getting your notes out

- **Subtitles (.srt):** put `game.srt` next to `game.mp4` and VLC shows your notes on screen. For QuickTime, use the "subtitle track" ffmpeg command in the Export tab.
- **Spreadsheet (.csv)** and **summary (.md)** with stats.
- **Backup (.json):** notes live in this browser only, so download a backup after each game. Import restores everything.
- **Clips:** the Export tab gives ffmpeg commands that cut each (filtered) moment into its own file.

## Tests

```sh
cd tests
ffmpeg -f lavfi -i testsrc=duration=120:size=1280x720:rate=30 -pix_fmt yuv420p -c:v libvpx-vp9 -b:v 300k test.webm
npm i -g playwright && node e2e.js
```

The tests use WebM because headless Chromium can't decode H.264; real Chrome and Safari play MP4 fine.

See [PLAN.md](PLAN.md) for the full spec and version 2 ideas.
