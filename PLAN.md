# Build Plan: Basketball Game Note Logger

## Goal
A single-file browser app (`index.html`, no build step, no server, no install) for reviewing full basketball game videos on a Mac. While watching, the user logs timestamped notes and tags quickly, then filters, reviews and exports them. Video files stay local; nothing is uploaded anywhere.

**Context:** The user is a recreational player reviewing their own games. They're on macOS, so Windows-only tools like Kinovea are out, and pro tools like Dartfish/Hudl cost too much. iMovie subtitles are too clunky. This app is the fast full-game tagging tool those options lack. It is **not** a Dartfish clone: skip computer vision, player tracking and live capture.

## Constraints
- One `index.html` with inline CSS/JS. Vanilla JS, no frameworks, no CDN dependencies.
- Must work by double-clicking the file in Chrome and Safari (`file://`).
- Load video with `<input type="file">` + `URL.createObjectURL`. Formats are whatever the browser plays (MP4/H.264, MOV).
- Persist notes in `localStorage`, keyed by video filename + duration, so reopening the same video restores its notes.
- Keyboard-first: the user should rarely need the mouse while watching.

## Version 1 features (build these)

### 1. Player
- Open a local video file (button + drag-and-drop).
- Controls: play/pause, speed 0.25× / 0.5× / 1× / 1.5× / 2×, frame step back/forward (assume 30fps, 1/30s), jump ±5s and ±15s.
- Loop between A/B points.

### 2. Fast note entry
- Press `N`: pause the video and focus a note input. The timestamp is captured when `N` is pressed.
- Enter saves the note and resumes playback. Esc cancels and resumes.
- **Lead time:** setting, default 3s, subtracted from the stamp, since you notice a play after it happens.
- **Quick tags:** one keypress drops a tagged marker without pausing. Shift+key = tag + open the note input.
- Default tags (user-editable in a settings panel, each with name, hotkey and colour):
  - `1` My shot (made)
  - `2` My shot (missed)
  - `3` Good defense
  - `4` Turnover / mistake
  - `5` Good decision
  - `6` Learn from this (pro/teammate)
  - `7` On court
  - `8` Off court (tags 7 and 8 work as a pair and feed minutes played)

### 3. Timeline
- A bar under the video with colour-coded markers per note/tag. Click a marker to seek.
- Hovering a marker shows the note text.

### 4. Notes sidebar
- Chronological list: timestamp, tag chip, text. Click to seek. Edit text/tag inline, delete with confirmation.
- Filter by tag (multi-select) and search text.
- **Playlist mode:** play only the filtered moments in sequence. Each clip runs from stamp −2s to +6s; make both values configurable.

### 5. Drawing (telestration)
- Press `D`: pause and show a canvas overlay sized to the video.
- Tools: arrow, circle, line, freehand. 3–4 colours. Undo, clear.
- Save drawing: attach it to a note at that timestamp, stored as a data URL. Show it when that note is selected or playback passes that time (hold ~3s).
- Export the current frame + drawing as PNG.

### 6. Stats summary
- Panel with counts per tag, FG made/attempts and %, and minutes played (from On/Off court pairs).

### 7. Export / import
- `.srt` and `.vtt`: each note becomes a subtitle cue (`[Tag] text`) lasting 4s, or until the next note if sooner.
- `.csv`: time, tag, note.
- `.md`: game summary (stats block + notes grouped by tag, with timestamps).
- `.json`: full backup, re-importable.
- **ffmpeg helper:**
  - Show a copyable command to burn the `.srt` into a copy of the video: `ffmpeg -i game.mp4 -vf subtitles=game.srt out.mp4`.
  - Show copyable commands to cut each filtered moment into clips: `-ss`/`-to` with `-c copy`.

## Keyboard map (show it with the `?` key)
| Key | Action |
|---|---|
| Space | Play/pause |
| ← / → | ±5s |
| Shift+← / → | ±15s |
| , / . | Frame back/forward |
| [ / ] | Speed down/up |
| N | Note |
| 1–8 | Quick tag |
| Shift+1–8 | Tag + note |
| D | Draw mode |
| A / B / L | Set loop A, set loop B, toggle loop |
| ? | Help |

Ignore hotkeys while a text input is focused, except Enter and Esc.

## Layout
- Desktop: video (left, ~70%) with the timeline under it; notes sidebar (right). Stats and export behind tabs or buttons in the sidebar header.
- Dark theme by default (easier on the eyes for long sessions). Make sure light mode also works.
- Below ~800px wide, stack the sidebar under the video.

## Out of scope for version 1
SimulCam/StroMotion-style overlays, player tracking, multi-camera, live capture, cloud sync, accounts, side-by-side comparison (candidate for version 2), in-browser clip cutting via ffmpeg.wasm (version 2).

## Done when
- Opening the file in Chrome lets you load an MP4 and log 20+ notes using only the keyboard.
- Notes survive a page reload.
- The exported `.srt` plays correctly over the video in VLC/QuickTime.
- CSV/MD/JSON exports are correct, and a JSON import restores everything.
- Filter + playlist mode plays only the selected moments.
- A drawing saves, reappears at its timestamp, and exports as PNG.
- Stats panel numbers match the tags.

**Testing:** generate a test video with `ffmpeg -f lavfi -i testsrc=duration=120:size=1280x720:rate=30 -pix_fmt yuv420p test.mp4` and drive the app in a headless browser (Playwright) to check each "done" item. Report anything that couldn't be checked automatically.

## Version 2 ideas (don't build yet)
- Side-by-side synced comparison of two videos.
- In-browser clip export (ffmpeg.wasm).
- Multi-game dashboard: stats trends across games.
- Shareable read-only notes page for a coach or teammate.
