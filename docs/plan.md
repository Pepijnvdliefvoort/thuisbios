# Thuisbios plan (v1, proof of concept)

Status: v1.1, updated with Pepijn's answers, 2026-10-19. No code yet.

## 0. Decisions (confirmed 2026-10-19)

- **Host:** Pepijn's Windows PC with an NVIDIA RTX 4060 Ti. Jellyfin is **installed natively on Windows** (not Docker) with **NVENC hardware transcoding**. The 4060 Ti encodes H.264/HEVC easily, so even PGS burn-in or DTS-to-AC3 conversion is no problem.
- **Phone remote:** a **PWA** for now, built so it can become a store app later. Plan: keep all logic in shared TS packages and wrap the PWA with **Capacitor** when going native (same code, real iOS/Android app). A MAUI rewrite stays possible because the Jellyfin API is the contract.
- **Media:** none ready yet. Phase 1 uses a small test set (see section 6).
- **Audio:** TV sound goes through a **soundbar**, so phone volume control needs extra care (see section 4).
- **Repo:** private GitHub repo `thuisbios` under Pepijn's account.

## 1. What we're building

| Part | What it is | Runs on |
|---|---|---|
| **Media server** | Jellyfin: library scanning, metadata/artwork, users, watch progress, streaming and transcoding | Your PC (PoC) |
| **TV app** | Custom Netflix-style web app for Tizen, talking to the Jellyfin API | Samsung UE49NU7100 |
| **Phone remote** | Search, browse, "play on TV", play/pause/seek/next/prev, volume | iPhone and Android |

Key idea: **Jellyfin is the backend.** It already has users, progress tracking, search, image resizing, transcoding and a remote-control (sessions) API. For the PoC we write no custom server code; we only write two clients. A small ASP.NET Core service can come later if Jellyfin ever falls short (it fits your C# background).

```text
 Phone remote ──HTTP + WebSocket──▶ Jellyfin (PC) ◀──HTTP + WebSocket── TV app
      │                                                                     ▲
      └─────── optional: Samsung TV control API (power on, launch app) ─────┘
```

## 2. The TV: what a 2018 NU7100 can and can't do

The UE49NU7100 is a 2018 model running **Tizen 4.0**. That shapes almost every technical decision.

**Web engine.** Tizen 4.0's browser engine is based on roughly **Chromium 56** (2017).

- Modern JS (optional chaining `?.`, `??`, class fields, top-level await) is **not** supported natively. We write TypeScript and compile down to ES2017 or lower, with a few polyfills.
- CSS Grid and Flexbox work. `backdrop-filter`, heavy blur, big box-shadows and large animated layers are slow or unsupported; the Netflix "glass" look must be faked with gradients.
- The CPU and RAM are modest. Rows of posters must be lazy-loaded, images requested at the exact size needed (Jellyfin resizes for us: `?maxWidth=300&quality=80`), and only transforms/opacity animated.

**Video and audio (direct play, no transcoding needed):**

- Video: H.264 and HEVC (H.265) up to 4K60, including HDR10 and HLG. VP9 is generally supported. AV1 is **not**.
- Containers: MP4, MKV, TS via the native player.
- Audio: AAC, MP3, AC3 (Dolby Digital), E-AC3 (DD+). **DTS and Dolby TrueHD are not supported** on 2018 Samsung TVs, so files with only DTS/TrueHD audio will need the audio transcoded (cheap; video can still pass through).
- Subtitles: text subtitles (SRT, VTT, ASS converted) are fine. **Image subtitles (PGS from Blu-ray rips, VobSub) force a full video transcode** to burn them in, which is heavy on the PC.

**Player choice.** Tizen offers HTML5 `<video>` and Samsung's own **AVPlay** API. Plan: start with HTML5 video plus a Jellyfin device profile that describes exactly the codecs above, so Jellyfin decides direct play vs. transcode for us. Switch to AVPlay only if we hit limits (it handles MKV audio track switching and 4K HDR more reliably). This is the first thing to verify in phase 2.

**Sideloading.** The app is installed via Tizen Studio in Developer Mode (Apps panel, type `12345` on the remote, enter your PC's IP). It needs a **Samsung certificate** (free, created in Tizen Studio's Certificate Manager with a Samsung account) tied to the TV's DUID. Certificates expire after a while and then need re-signing and reinstalling; fine for personal use.

Reference: the open-source `jellyfin-tizen` app proves Jellyfin works on this generation of TV. We won't use it as the UI, but its device profile is a useful starting point.

## 3. TV app design

**Tech stack (recommendation):** TypeScript + **Preact** (or Solid), built with **Vite** using the legacy plugin to target Chromium 56. Light enough for the TV, but component-based so the UI stays manageable. Alternatives: plain TypeScript (lighter, more work) or Lightning/Blits (WebGL TV framework; fast but a steeper learning curve).

**Focus/D-pad navigation** is the core UX problem on a TV. We'll use a spatial navigation library (e.g. `@noriginmedia/norigin-spatial-navigation`, which works with Preact via compat) so arrow keys move focus naturally between rows and cards. Remote keys (Back, Play/Pause, colored keys, media keys) must be registered with `tizen.tvinputdevice`.

**Screens (Netflix-inspired):**

1. **Profile picker** (one Jellyfin user per family member, avatars).
2. **Home**: big hero banner (backdrop + logo + "Play"), then horizontal rows: Continue Watching, Next Up (series), Recently Added, Movies, Series, per-genre rows.
3. **Detail page**: backdrop, logo/title, year, runtime, rating, overview, Play / Resume / Restart, cast; for series a season selector and episode list with progress bars.
4. **Player**: minimal overlay (title, scrub bar with thumbnails if Jellyfin trickplay images are enabled, audio/subtitle picker), "Next episode" countdown, skip intro (needs a Jellyfin plugin).
5. **Search**: on-screen keyboard as fallback, but the phone is the main way to search.

**Login:** Quick Connect (Jellyfin feature: TV shows a code, approve it on the phone) so you never type a password with the remote.

## 4. Phone remote: how it talks to the TV

**Recommendation: use Jellyfin's sessions (remote control) API as the channel.** Both apps connect to Jellyfin; the phone never talks to the TV directly for playback.

How it works:

1. The TV app opens a WebSocket to Jellyfin and reports its **capabilities** (supports remote control; accepts Play, Playstate, SetVolume, VolumeUp/Down, Mute, DisplayContent, SendString, etc.).
2. The phone calls `GET /Sessions` to find the "Thuisbios TV" session.
3. The phone sends commands:
   - `POST /Sessions/{id}/Playing?itemIds=...&playCommand=PlayNow` → TV starts the movie/episode
   - `POST /Sessions/{id}/Playing/Pause` / `Unpause` / `NextTrack` / `PreviousTrack` / `Seek?seekPositionTicks=...`
   - `POST /Sessions/{id}/Command` with `SetVolume`, `VolumeUp`, `VolumeDown`, `ToggleMute`
   - `DisplayContent` → TV opens a detail page you picked on the phone ("show it on the TV first")
4. The TV app receives each command over its WebSocket and acts on it. The phone gets live "now playing" state (position, title, paused) from the same session data.

**Is TV volume reachable?** Yes, while our app is open: the TV app receives the `SetVolume`/`VolumeUp` command and calls Tizen's `tizen.tvaudiocontrol` API, which changes the real TV volume. **Soundbar caveat (applies to you):** with a soundbar the TV volume API may only change the TV's internal speaker level. If the soundbar is on HDMI-ARC with Anynet+ (HDMI-CEC) enabled, the TV's own volume keys are forwarded to the soundbar, so the reliable route is to send real `KEY_VOLUP`/`KEY_VOLDOWN`/`KEY_MUTE` keys through Samsung's local control API (below). We test both routes in the phase 2 spike and pick whichever actually moves the soundbar. If the soundbar is on optical, neither may work and volume stays on its own remote.

**What Jellyfin can't do: turn the TV on or launch our app.** For that there is Samsung's own local control API (WebSocket on port 8001/8002 of the TV, the same one apps like SmartThings use): it can send remote keys (including volume, even when our app is closed), launch an installed app by ID, and Wake-on-LAN can power the TV on if "Power on with mobile" is enabled. The first connection shows an "Allow" prompt on the TV. Because of your soundbar this API may be the volume route, so **its volume part moves into phase 4**; power-on and launching the app stay optional extras in phase 5. A browser PWA can't open raw WebSockets to the TV with a self-signed certificate, so these calls go through a tiny relay on the PC (a Jellyfin plugin or a small ASP.NET Core service, in C#).

### Phone app technology: options

| Option | Pros | Cons |
|---|---|---|
| **PWA** (web app, "Add to Home Screen") — *recommended for PoC* | One codebase for iPhone and Android, no app stores, no Mac, no Apple developer account; served from your PC; shares TypeScript API code with the TV app | Not a "real" app (no store listing), limited background behavior, iOS PWAs are somewhat restricted |
| **.NET MAUI** (C#) | Your home language; real native apps | **Building for iPhone requires a Mac**; free Apple provisioning expires every 7 days, otherwise $99/year; MAUI tooling can be rough |
| **Flutter / React Native (Expo)** | Mature, polished native apps; Expo can build iOS in the cloud | New language/framework to learn (Dart or React) |

My recommendation: **start as a PWA** (Preact + TS, same stack as the TV app, sharing a `jellyfin-client` package). If you later want a store-quality app, wrap it or rebuild in MAUI/Expo; the Jellyfin API logic stays the same.

## 5. Hosting on your PC (proof of concept)

**Decided: install Jellyfin natively on Windows** rather than in Docker. Docker on Windows runs inside WSL2, where reading media from Windows drives is slow and GPU transcoding is harder to set up (NVIDIA works via WSL2; Intel QSV/AMD largely don't). On Linux, Docker is the better choice. Your library and settings can later move to a dedicated home server or NAS.

Caveats to know:

- **The PC must be on and awake** to watch. Turn off sleep while Jellyfin is in use, or accept it as a PoC limitation.
- **Network:** give the PC a fixed LAN IP (DHCP reservation in your router), use wired Ethernet if possible (4K remuxes can exceed 80 Mbit/s; the TV's own LAN port is only 100 Mbit/s, which is enough for most files but tight for full UHD Blu-ray remuxes). Allow Jellyfin's port (8096) through Windows Firewall for private networks.
- **Transcoding** uses your CPU/GPU. With a reasonably modern GPU (NVIDIA NVENC, Intel QSV, AMD AMF) enable hardware acceleration in Jellyfin. Good file choices (H.264/HEVC + AAC/AC3 + SRT subs) mean almost everything direct-plays and the PC barely works.
- **Remote access** (outside the house) is out of scope for the PoC. When wanted, Tailscale is the simplest and safest; no ports opened to the internet.
- **Phone remote over HTTPS:** a PWA installable on iPhone needs HTTPS for some features. On the LAN we can either skip install features for the PoC or use Tailscale's built-in HTTPS certificates. Decide in phase 4.

## 6. Media library conventions

Jellyfin naming, as in the project brief.

```text
Movies/Inception (2010)/Inception (2010).mkv
Shows/Breaking Bad/Season 01/Breaking Bad S01E01.mkv
```

Tips for this TV: prefer HEVC or H.264 video, AAC/AC3/E-AC3 audio (add an AC3 track to DTS-only files), external `.srt` subtitles (`Inception (2010).nl.srt`). **Test set for phase 1 (no media yet):** a handful of files covering the cases that matter on this TV: H.264 + AAC MP4, HEVC 4K HDR MKV, a file with DTS audio, one with PGS subtitles, and a short 3-episode "series" for Next Up/auto-next. Freely licensed open movies (Big Buck Bunny, Sintel, Tears of Steel from the Blender Foundation) cover most of this; your own rips can fill in the rest.

## 7. Phases

| Phase | Goal | Done when |
|---|---|---|
| **1. Server** | Jellyfin running on your PC with part of your library | You can browse and play in a browser on the PC and in the official Jellyfin app on your phone |
| **2. TV spike** | Prove the platform | Tizen Studio set up, certificate made, a "hello world" app with D-pad focus installed on the TV, and one movie (direct play) + one transcoded file playing via HTML5 video (or AVPlay) |
| **3. TV MVP** | Usable app | Quick Connect login, profile picker, home rows, detail page, playback with resume and progress reporting |
| **4. Phone remote MVP** | Phone controls the TV | PWA with search, browse, "Play on TV", play/pause/seek/next/prev, live now-playing view, and volume that reaches the soundbar |
| **5. Polish** | Feels like Netflix | Series flow (Next Up, auto-next, skip intro), audio/subtitle switching, trickplay thumbnails, transitions, optional Samsung power-on/launch from phone, upload flow, then remote access and the move off the PC |

Phase 2 is deliberately a spike: it de-risks the TV's old engine and player before we invest in UI.

## 8. Repository layout (suggestion)

One Git repo (monorepo, pnpm workspaces):

```text
thuisbios/
  packages/jellyfin-client/   shared typed API client (generated from Jellyfin's OpenAPI spec)
  apps/tv/                    Tizen app (Preact + TS + Vite, config.xml, icons)
  apps/remote/                phone PWA (Preact + TS + Vite)
  server/                     Jellyfin install notes / docker-compose, device profile
  docs/
```

Jellyfin publishes an OpenAPI spec, so the API client can be generated (similar to NSwag in .NET).

## 9. Open questions

All first-round questions are answered (section 0). Next up: create the repo, then phase 1.
