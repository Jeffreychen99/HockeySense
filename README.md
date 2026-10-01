# HockeySense

A local hockey film room that turns game clips into timestamped coaching, skating observations, and a practice plan that builds across reviews.

Project preferences and lessons from user feedback are recorded in [AGENTS.md](AGENTS.md). Read them before changing the coaching behavior or review experience.

## Run

Requires Python 3.10+ and FFmpeg (including `ffprobe`). No Python or JavaScript packages are required.

```sh
# macOS, if FFmpeg is not installed:
brew install ffmpeg

# Set this in your shell; never put the key in browser code or commit it.
export OPENAI_API_KEY='your-key'
python3 server.py
```

Open http://localhost:8765. The portal binds only to the local computer. Set `PORT` to change the port, `OPENAI_MODEL` to select a vision model supporting structured Responses output (default: `gpt-4.1`), or `HOCKEYSENSE_DATA` to change the data directory. Restart after backend changes. Existing shell environment variables are used; `.env` files are not automatically loaded.

## Workflow

1. Create a player profile with position and experience. Optionally add separate **play like** and **skate like** goals, including the specific traits you admire.
2. Drag one video anywhere onto the page, or use **Upload a clip**. Upload MP4, MOV, WebM, or another FFmpeg-readable video, up to 500 MB. Videos are converted to browser-friendly H.264 MP4 without audio. A smaller replay copy is also prepared for smooth viewing, with frequent keyframes for faster seeking; the higher-resolution copy is retained for analysis. Short clips are recommended; large files take longer to prepare.
3. Identify yourself before analyzing: click **Select myself**, click your body in the paused frame, and confirm **This is me**; or enter both jersey color and number. Add appearance or starting-location notes if helpful. Analysis is disabled until you choose one of these methods. A red box on the reference image anchors the model to your selected player; supplied jersey details constrain identity. The marker is an identification aid, not an automatic tracking overlay.
4. The entire clip is selected by default; optionally adjust the interval. Press Analyze once. Frames, player context, role-model goals, and up to three prior reports for that player are sent to OpenAI in small sequential sections. All sections finish before the report is published. Progress and rate-limit waits are shown; you may leave the page and return while the server runs. Calls use `store: false`; API usage is billed to your configured account.
5. Playback buffers ahead of time and reuses the loaded clip. Use **Full detail** beside the speed control to switch to the higher-resolution copy without losing your position. Play the sequence normally, or enable optional pauses at teaching moments. Select a moment or timeline marker to jump to its timestamp; use slower playback for review.
6. Open **Practice plan** for recurring categories, actionable drills, measurable goals, and practice checkoffs. **Clip library** restores saved clips and reports.

## Analysis boundaries

Analysis decodes the chosen interval once and caches approximately one frame per second with its actual source timestamp. It reviews sections containing at most ten new frames plus preceding/reference context, covering the whole selected timeline. Every section must complete before a report is marked ready. This is sampled visual review, not examination of every video frame: brief touches, strides, player identity, and puck movement can still be missed. Skating feedback is limited to visible evidence, not pose estimation or biomechanical measurement. Confidence and visibility limitations appear in the final report. If the player cannot be identified, the coach is instructed to withhold unsupported moments and drills.

Completed section reports are checkpointed. Temporary request limits and connection failures retry automatically (up to five attempts per section, honoring Retry-After up to 180 seconds; larger delays stop with guidance). Credit/quota errors do not retry. After a retry or server restart, unchanged analyses reuse completed sections and cached frames. Model, profile, interval, or player-identification changes start a fresh review. Progress shows actual completed sections, not an estimated completion time. Stage timings are saved with the clip for diagnostics.

Role-model suggestions use general model knowledge, not reference footage or live athlete research. They are labeled separately from observations of your play. Category recurrence counts distinct clips with medium/high-confidence observations; it is a prioritization aid, not a longitudinal performance score. Reanalyzing an unchanged clip reuses completed sections; changing the review settings creates a fresh report. Starting analysis resets practice checkoffs. Profile edits affect future analyses; saved reports retain the goals used when analyzed.

## Storage and architecture

- `server.py`: standard-library HTTP server, SQLite persistence, upload conversion, asynchronous analysis, Responses API integration, strict report validation, and seekable video serving.
- `web/`: responsive vanilla HTML, CSS, and JavaScript.
- `tests/`: deterministic tests for report validation, isolation of profile history, model-request context, and restart recovery.
- `data/`: local SQLite database and uploaded videos, ignored by Git. No key is saved here.
- `hockey.mp4`: original sample video, preserved from the old project.

The obsolete SDL/OpenCV feature-point experiment has been removed. This is a single-user localhost application, not an authenticated hosted service. One analysis worker processes small requests sequentially to reduce rate-limit contention. Section checkpoints persist in SQLite; interrupted reviews resume when the server starts again. Upload conversion is synchronous. The UI uses Google Fonts when available, with local fallbacks.

## Tests

```sh
python3 -m unittest discover -s tests -v
node --check web/app.js # optional JavaScript syntax check
node --test tests/*.cjs # review-button and playback checks
```

Official API references: [image inputs](https://developers.openai.com/api/docs/guides/images-vision) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## API account errors

If coaching fails, the error card links directly to the relevant OpenAI API billing, limits, or project settings page. Use the organization that owns the server's API key. Credit/quota errors require an account change before retrying; temporary rate limits are retried automatically with a visible waiting stage; exhausted retries expose recovery links. Older generic 429 failures offer both billing and limits links because their original error details were not retained. No billing settings are changed by HockeySense.

## Evidence-based review selection

New reviews require explicit visual evidence, a concrete game situation, an assessment, and an impact rating for every proposed correction. Positive, uncertain, low-confidence, and empty-evidence candidates are excluded from coaching moments. These are model assessments and structural checks, not independent proof of visual accuracy. Drills must reference retained moment timestamps; orphaned recommendations are dropped.

The summary shows up to five actual correction titles ranked by impact and confidence, with expandable timestamped details. Praise stays in a separate collapsed section. Earlier reports remain stored but are excluded from current coaching, practice counts, and model history until reanalyzed with the new evidence format. This avoids treating earlier speculative advice as established recurring weaknesses.
