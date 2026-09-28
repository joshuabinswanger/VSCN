# Motion works: loops, GIFs and video links

2026-09-23. From member feedback: *"GIF-Bilder können aktuell nicht hochgeladen
werden. Das wäre für Animation und Motion-Design toll."* and *"Es wäre ebenfalls
toll, wenn man über einen Link (z. B. zu Vimeo oder YouTube) eine Animation
hochladen könnte."* Josh: *"if we create videos and GIFs, I want to make it
efficient"*, and later *"i want to also have the option for people to upload a
thumbnail themselves."*

This design was written on 2026-09-23 and its decisions made in conversation
that day. **Release 1 (embeds + member thumbnails) was built the same day**
(branch `feat/motion-embeds`); see "Release 1 as built" at the end for where the
build departed from the text above. Release 2 (loops, GIFs) is not built. The
questions still open for Josh are listed at the end.

## What was decided

| Question | Answer |
|---|---|
| Do we serve GIFs? | No. A GIF is accepted as an **upload** and converted into a looping video. Nothing on the site ever serves `image/gif`. |
| Short motion work | A **loop**: uploaded, converted on the server, hosted on Firebase Storage like our images. |
| Long motion work | An **embed**: a YouTube or Vimeo link. We host no video, only a thumbnail. |
| Mux / Cloudflare Stream? | Not now. Both would be almost free at our scale, but loops don't benefit from streaming and embeds make long films free. Revisit only if members ask to upload long films directly. |
| Video formats | **AV1 first, H.264 as fallback**, in the same `<video>`. Not VP9 (a middle step, patchy in Safari), not HEVC (licensing, partial Chrome/Firefox support), not animated AVIF/WebP (decoded in software, can't be paused). |
| Thumbnails | Automatic by default: the first frame for a loop, the platform thumbnail for an embed. The member can **upload their own**, which replaces the automatic one, and can remove it again. |
| Moderation | A loop, and a member-uploaded thumbnail, go through moderation like any image. The thumbnail is what the wall shows, so it's the part most people see. |

## The central idea: every work still has a still image

Today a work is an `images/{id}` record whose `storagePath` points at one WebP.
Wall tiles, member pages, the lightbox, JSON-LD, the admin console, the
moderation queue and the Astro build all read that one WebP.

**The design keeps that true.** A loop or an embed is the same record with the
same `storagePath`. The WebP at that path is the work's **poster**, the still
image that everything above already knows how to show. Motion is an optional
extra on top, read only by the places that can play it. Anything that doesn't
learn about motion keeps working, because it just shows the poster.

This is what keeps the change small: galleries, ordering, tags, captions, the
eight-work cap, moderation scores, hiding and deletion all stay as they are.

## Data model

One new field on `images/{id}`, set by the server only:

```ts
media?: "still" | "loop" | "embed"   // absent = "still", so every existing record is valid unchanged
```

Per kind:

- **loop**: `durationMs` (int). The two video files sit next to the poster by
  convention, so no path fields are stored:
  `users/{uid}/gallery/{id}.av1.mp4` and `users/{uid}/gallery/{id}.h264.mp4`.
- **embed**: `embed: { provider: "youtube" | "vimeo", videoId: string, hash?: string }`.
  `hash` holds Vimeo's `h=` parameter for unlisted videos. We store the id, not
  the URL, so a link can only ever become the embed URL we build ourselves.
- **both**: `posterSource: "auto" | "member"`. The automatic poster is kept at
  `users/{uid}/gallery/{id}.auto.webp`, so removing a member thumbnail restores
  it without calling YouTube again or re-encoding.

Rules (`validImage` in `firestore.rules`): add `media`, `durationMs`, `embed`
and `posterSource` to the `hasOnly` list. `validImage` runs **once per image
write**, not eight times per save, so these checks don't hit the gallery's
evaluation-budget problem (see `documentation/20260903-gallery-rules-budget.md`).
The client may **keep** these fields on a caption save but never **change**
them. Compare against `resource.data`, the same way `ownerUid` and
`storagePath` are protected.

`status` gains **`processing`** (a loop being converted) and **`failed`**
(conversion refused or crashed). Both are written only by the server. The
client-side rule must still accept a caption save on a record that is in
either state.

## Loops: the conversion pipeline

### Upload

1. The member picks a GIF, MP4, MOV or WebM. Nothing is compressed in the
   browser, since canvas would keep only the first frame. The client checks the
   type and a size cap (proposal: **50 MB**) before any bytes move.
2. `authorizeImageUpload` gains a `media: "loop"` request. It allocates the
   record as `status: "uploading"`, `media: "loop"`, plus a permit for
   `pending/{uid}/gallery/{id}.src`.
3. `storage.rules`: a second `pending` match for `.src` objects, with the
   allowed content types (`image/gif`, `video/mp4`, `video/quicktime`,
   `video/webm`) and the 50 MB cap. Same permit check as the WebP path.
4. The member doesn't wait. `completeImageUpload` sets `status: "processing"`
   and returns straight away. The editor row shows "Converting…" and watches
   the record with `onSnapshot`.

### Convert

A new function **`convertLoop`** (2nd gen), triggered when a
`pending/…/*.src` object is finalized. Proposal: 2 GiB memory, 300 s timeout,
`maxInstances: 2`.

1. **Probe** with `ffprobe`. Refuse anything longer than the loop cap
   (proposal: **20 s**), anything with no video stream, or dimensions above
   10000. A refusal sets `status: "failed"` and a `failReason` the editor can
   put into a sentence.
2. **Scale** to at most **1920 px on the long edge**, with no upscaling.
3. **Encode twice, audio stripped** (loops play muted, so they carry no sound):
   - AV1 with `libsvtav1` (preset ~8, CRF ~35), `+faststart`. SVT-AV1 is fast
     enough for 20 s clips. `libaom` would not be.
   - H.264 with `libx264` (`-preset slow -crf 23 -pix_fmt yuv420p`, profile
     high), `+faststart`. This is the file every device can play.
   - Which of the two bitrates to keep is tuned in step 1 of the build. The
     goal is a typical 10 s loop of a few MB per file.
4. **Poster**: the first frame as WebP at the same dimensions, written to both
   `{id}.webp` and `{id}.auto.webp`. The record gets `width`/`height` from the
   probe, so geometry-dependent code (wall layout, PhotoSwipe) needs no changes.
5. Copy all three files to `users/{uid}/gallery/` with the same cache headers
   as images (`immutable` for UUID ids). Set `status: "live"`, write
   `durationMs`, delete the `.src` file, and request a rebuild the same way an
   image upload does.

**The one build risk:** we need an ffmpeg with `libsvtav1` inside Cloud
Functions. `ffmpeg-static` ships a prebuilt binary. Step 1 of the build must
check that binary has SVT-AV1. If it doesn't, the fallback is a small Cloud Run
service with its own container: same trigger, same outputs, more deploy
machinery.

### Stored-object cap

`MAX_STORED_OBJECTS = 20` in `functions/src/uploads.ts` counts **objects**, and
a loop is four (`.webp`, `.auto.webp`, `.av1.mp4`, `.h264.mp4`). Eight loops
would make 32 and be refused. The cap has to count **works** (records) rather
than files, or the three extra files of a loop must not count. Counting records
is the cleaner fix and keeps the cap meaning what it was meant to mean.

**Done in release 1**, not left for loops: `MAX_STORED_WORKS = 20` now counts
`images/` records (`reserveWork` in `functions/src/uploads.ts`), because an
embed already owns two objects and a member with eight video works swapping a
couple of thumbnails would have hit a file cap that eight stills never came
near.

## Embeds: YouTube and Vimeo

1. The member pastes a link into a new "Add a video link" field in the gallery
   editor.
2. A new callable **`resolveEmbed`** parses it on the server. It accepts
   `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `vimeo.com/{id}`
   and `vimeo.com/{id}/{hash}`, and refuses everything else with a clear
   sentence.
3. It asks the platform's **oEmbed** endpoint (no API key needed) for the title,
   size and thumbnail. That also tells us whether the video exists and allows
   embedding. It downloads the largest thumbnail, converts it to WebP and
   stores it as the poster (`{id}.webp` + `{id}.auto.webp`), just like a loop.
   This is the only place the server needs an image library: add `sharp` to
   `functions/package.json`, which the functions don't have today.
4. The record is written `live`, with `media: "embed"` and `embed: {…}`. The
   oEmbed title pre-fills `caption` only if the caption is empty.

The visitor's browser never contacts YouTube or Vimeo until they press play.
The thumbnail is served from our own Storage.

## Member-uploaded thumbnails

- **Where:** a "Replace thumbnail" action on loop and embed rows, and "Use
  automatic thumbnail" once one has been replaced.
- **How:** the existing image path. Client-side WebP, 4K cap, `pending/` →
  `completeImageUpload`. The difference is that the target is an **existing**
  work's poster rather than a new record.
- **Shared mechanics:** this is the same operation as the "Replace image" task
  running in its own session (task "Let members replace a work's image in
  place"). **Build this on top of that one, not beside it.** Two points it has
  to settle apply here too:
  - **Cache.** Public objects use `max-age=31536000, immutable`. A new poster
    written to the *same* path would be hidden by caches for a year, so a
    replaced poster needs a new object name (a version suffix). That means the
    `storagePath == …/{imageId}.webp` binding in `validImage` and
    `storage.rules` has to allow a versioned name.
  - **Moderation.** A replaced poster re-enters the moderation queue. Whatever
    the replace-image task decides for replaced stills applies here too.
- `posterSource` becomes `"member"`. Removing the thumbnail copies
  `{id}.auto.webp` back as a new version and sets `posterSource: "auto"`.
- **As settled by the replace-image task (PR #76) and built on:** there is no
  version suffix. A replaced picture is a **new record with a new id** that
  inherits the work's words, because the id IS the filename; the
  `storagePath == …/{imageId}.webp` binding stays exactly as it is in both
  rulesets. For a video work the new record also inherits `media`/`embed`, and
  `completeImageUpload` copies `{old}.auto.webp` to `{new}.auto.webp`. "Use
  automatic thumbnail" is the same move in the other direction
  (`restoreAutoPoster`). **Moderation:** ratings reset, a hide carries over —
  Josh's decision for replaced stills, applied unchanged.

## Playback

### The wall (/community), where performance matters most

Thirty videos playing at once is what would make the site slow. The rules:

- A loop tile renders `<video muted loop playsinline preload="none" poster="…">`
  with an AV1 `<source>` first and H.264 second. Until it plays, it costs
  exactly what an image tile costs: one poster.
- One shared `IntersectionObserver` starts a loop when it is mostly in view and
  **pauses** it when it leaves. At most **4** loops play at once (the ones
  closest to the centre of the screen). The rest show their poster.
- **`prefers-reduced-motion: reduce`**: nothing autoplays. Tiles show the
  poster with a small play mark, and play when tapped.
- **Save-Data or a 2G/3G connection** (`navigator.connection`): same as
  reduced motion.
- An embed tile is always just its poster with a play mark. It never loads an
  iframe on the wall.
- The browser pane freezes animation timelines (see
  [`browser-pane-frozen-timeline`](agent-memory/browser-pane-frozen-timeline.md)). Check playback with Playwright, which does
  drive the clock ([`playwright-drives-the-animation-clock`](agent-memory/playwright-drives-the-animation-clock.md)).

### Lightbox (PhotoSwipe) and member pages

- PhotoSwipe gets two custom slide types via its `contentLoad` hook: `loop`
  (the same `<video>`, autoplaying because opening the lightbox shows intent)
  and `embed` (poster + play button; the iframe is created on press and
  **destroyed** when the slide is left, so no player keeps running).
- The embed URL is always built from the stored id: `https://www.youtube-nocookie.com/embed/{id}`
  or `https://player.vimeo.com/video/{id}?dnt=1` (+ `&h={hash}`). It is never
  the URL the member typed.
- Member pages use the same components, so no separate code path.

### Structured data

Loops and embeds become `VideoObject` in the JSON-LD of `src/lib/seo.ts`, with
`thumbnailUrl` (the poster), `uploadDate`, `duration`, and `contentUrl` (loops)
or `embedUrl` (embeds), and the same `creator` link that images carry. Search
engines do show video results, and the attribution rule of
[`seo-attribution-structured-data`](agent-memory/seo-attribution-structured-data.md) carries over.

## Privacy

- The wall and member pages send **nothing** to YouTube or Vimeo until a
  visitor presses play. oEmbed and thumbnail fetches happen server-side, once,
  when the member saves.
- On play, the visitor's browser loads the platform's player. `youtube-nocookie`
  and Vimeo's `dnt=1` reduce what that sets, but the privacy page
  (`src/pages/[...lang]/privacy.astro`) still needs a paragraph, in both
  languages, naming YouTube and Vimeo as a third party that is contacted when
  someone plays an embedded video.
- Loop conversion runs in our own Cloud Functions, so no new processor is
  added. Its region should match the functions we already deploy; check before
  building whether the Storage bucket's region makes a different function
  region better for transfer.

## Cost, roughly

- **Embeds:** free. We store one thumbnail per work.
- **Loops:** conversion is a few tens of seconds of 2 GiB function time per
  upload, fractions of a cent. Storage is two small MP4s plus two WebPs per
  loop, a few MB. Delivery is ordinary Storage egress; `preload="none"`,
  play-on-view and the cap of 4 keep it close to what visitors actually watch.
- For comparison (list prices 2026-09): Mux charges $0.003 per stored minute
  per month with 100,000 delivery minutes free; Cloudflare Stream charges $5 per
  1,000 stored minutes and $1 per 1,000 delivered. Neither is needed for loops
  of 20 s or less.

## Build order

Two releases. Each is useful on its own.

**Release 1: embeds + member thumbnails.** No conversion, lowest risk, and it
covers long films straight away.
1. Data model + rules (`media`, `embed`, `posterSource`), with rules tests for
   "client can't change `media`/`embed`".
2. `resolveEmbed` + `sharp`, with unit tests for the URL parser (every accepted
   form, and a list of refused ones).
3. Editor: "Add a video link", embed rows, "Replace thumbnail", built on the
   replace-image mechanics.
4. Wall, lightbox and member-page embed slides; JSON-LD `VideoObject`.
5. Privacy paragraph, EN + DE.

**Release 2: loops (and with them, GIFs).**
1. **Spike first:** confirm an ffmpeg with `libsvtav1` runs inside Cloud
   Functions, and tune both CRF values on real motion-design samples (a GIF, a
   flat-colour animation, a noisy 3D render). If it doesn't run, switch to
   Cloud Run before writing anything else.
2. `status: processing/failed`, the `.src` path in `storage.rules`, stored-
   object cap counting records.
3. `convertLoop`.
4. Editor: GIF/video accepted by the file picker, "Converting…" row state,
   failure sentences.
5. Wall playback rules (observer, cap of 4, reduced motion, Save-Data), lightbox
   `loop` slide.
6. Walk it with Playwright on dev: upload a GIF, see it convert, see it play on
   the wall and stop off-screen, see reduced motion show the poster.

As always: **rules before or with hosting**. The new client writes fields the
old ruleset doesn't know, and `hasOnly` refuses the whole save silently
([`firestore-rules-hasonly-gotcha`](agent-memory/firestore-rules-hasonly-gotcha.md)). CI deploys rules ahead of hosting, but a
new callable does not ride along with a hosting release
([`admin-console-ux-pass`](agent-memory/admin-console-ux-pass.md)), so the functions deploy has to be planned.

## Open questions for Josh

1. **Maximum loop length.** Proposed: 20 s. Longer pieces go on YouTube/Vimeo.
2. **Maximum loop resolution.** Proposed: 1920 px long edge. 4K loops would
   roughly quadruple storage and delivery for a difference few people see on a
   wall tile.
3. **Sound.** Proposed: loops never have sound (stripped on conversion). Pieces
   with sound belong on YouTube/Vimeo.
4. **Upload size cap for the source file.** Proposed: 50 MB. A 20 s ProRes
   export can exceed that; members would export H.264 or GIF first.
5. **Do motion works share the eight-work gallery cap?** Proposed: yes, a work
   is a work.
6. ~~**Do YouTube Shorts and unlisted Vimeo count?**~~ **Decided 2026-09-23:**
   yes to both — `youtube.com/shorts/{id}` and `vimeo.com/{id}/{hash}` are
   accepted by `resolveEmbed`. **Instagram Reels are out:** Meta's oEmbed needs
   an app token that has passed Meta's app review, which is more machinery than
   one more provider is worth now.

## Release 1 as built (2026-09-23)

Where the build had to choose something the text above did not say:

- **Posters come at the video's own aspect ratio.** YouTube's oEmbed answers
  with `hqdefault` (480×360, letterboxed) and `maxresdefault` is always 16:9 —
  a Short arrives as an upright picture in a wide frame, padded either with
  black or with a *blurred copy of itself*, which no trim can find. The
  undocumented `i.ytimg.com/vi/{id}/oar2.jpg` is the thumbnail at the
  original aspect (1080×1920 for a Short, 1920×1080 for a film), so it is
  tried first; `maxresdefault` and `hqdefault` follow, with black bars trimmed.
  Vimeo's thumbnail URL ends in a size its CDN re-renders, so `_1920` is asked
  for. Thumbnails are fetched only from `i.ytimg.com` / `i.vimeocdn.com`, with
  redirects refused.
- **The oEmbed title pre-fills the caption** of the new work (≤ 140).
- **Unverified accounts cannot add video links.** Their one slot is for their
  one picture, and a video work is always a fresh uuid record.
- **`uploadDate` in the VideoObject is when the work was added to VSCN**, from
  the record's `createdAt` (exported by `scripts/export-site-data.mjs`), because
  YouTube's oEmbed does not say when the video was published.
- **The player is `youtube-nocookie.com/embed/{id}` / `player.vimeo.com/video/{id}?dnt=1`,**
  built from the stored id with `autoplay=1` added (the iframe only exists
  after a press). The iframe keeps the origin as referrer: YouTube refuses to
  play an embed that arrives with none.
- **Deploying:** `resolveEmbed` and `restoreAutoPoster` are new callables and
  the upload pair changed; CI ships rules + hosting only. Deploy them by hand
  before (or with) the hosting release. On this machine the CLI's 10-second
  functions discovery times out: prefix the deploy with
  `FUNCTIONS_DISCOVERY_TIMEOUT=60`.
