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
| X | Dead time start / end (timeouts, free throws, breaks) |
| C | Highlight clip start / end |

Notes are stamped 3 seconds early by default (change "lead time" in Settings), since you usually react after the play.

## Getting a video from YouTube

Click **⬇ Get video** and paste a link to a video or playlist. The app writes a [yt-dlp](https://github.com/yt-dlp/yt-dlp) command: paste it into Terminal and the video is saved to `~/Movies/Game Reviewer` (you can change this), then the folder opens. One-time setup: `brew install yt-dlp ffmpeg`.

The command prefers YouTube's own H.264 MP4, so most videos need no re-encoding. Only VP9/AV1-only videos (often 4K) get converted. Re-running a playlist skips videos you already have. Only download videos you're allowed to.

## Condensed game and highlight reel

In the **Edit** tab:

- **Dead time:** press `X` when a timeout, free throws or a break starts and `X` again when play resumes. Tick "Skip dead time while playing" to preview the condensed game.
- **Highlight reel:** press `C` at the start and end of a play, or turn notes into clips (all notes, the current filter, or ✂ on a single note). Trim, reorder and caption clips, then "Preview reel".
- **Make the video:** choose subtitles (burned in, a track you can switch on/off, or none) and download the script. In Terminal, type `sh `, drag the script in, type a space, drag in the folder that holds the video, and press Return. The new video is saved next to the original. Needs ffmpeg (`brew install ffmpeg`).

Cuts are frame-accurate, because each part is re-encoded. A full game takes a few minutes.

## Getting your notes out

- **Subtitles (.srt):** put `game.srt` next to `game.mp4` and VLC shows your notes on screen. For QuickTime, use the "subtitle track" ffmpeg command in the Export tab.
- **Spreadsheet (.csv)** and **summary (.md)** with stats.
- **Backup (.json):** notes live in this browser only, so download a backup after each game. Import restores everything.
- **Clips:** the Export tab gives ffmpeg commands that cut each (filtered) moment into its own file.

## Tests

```sh
cd tests
ffmpeg -f lavfi -i testsrc=duration=120:size=1280x720:rate=30 -pix_fmt yuv420p -c:v libvpx-vp9 -b:v 300k test.webm
npm i -g playwright && node e2e.js && node e2e-edit.js
```

The tests use WebM because headless Chromium can't decode H.264; real Chrome and Safari play MP4 fine.

See [PLAN.md](PLAN.md) for the full spec and version 2 ideas.
