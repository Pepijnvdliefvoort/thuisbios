# Jellyfin on Windows: setup guide (phase 1)

Goal of phase 1: Jellyfin runs on the Windows PC with a small test library, and a movie plays in
a browser on the PC and in the official Jellyfin app on a phone. Jellyfin runs natively (not in
Docker) so it can use the NVIDIA RTX 4060 Ti (NVENC) directly.

The commands below use Windows PowerShell or PowerShell 7. Where it matters, the repo scripts in
[`server/scripts`](../../server/scripts) do the work for you.

## 0. What the TV can and cannot play

The target TV is the 2018 Samsung UE49NU7100 (Tizen 4.0). It direct-plays H.264 and HEVC
(including HDR10) with AAC, AC3 and E-AC3 audio. It cannot play DTS or TrueHD, and image
subtitles (PGS) force a transcode. Its LAN port is 100 Mbit/s. The GPU handles the rest, but
files that direct play keep the PC idle, so prefer those formats when you collect media.

## 1. Install Jellyfin Server

Official page: <https://jellyfin.org/docs/general/installation/windows/>.

Option A, installer (what the official docs describe): download the latest Windows installer
(`.exe`) from <https://jellyfin.org/downloads/server> and run it.

Option B, winget: a `Jellyfin.Server` package exists in the winget community repository (it was
found in public winget indexes; the winget CLI itself was not available when this guide was
written). Check before installing:

```powershell
winget search Jellyfin
winget install --id Jellyfin.Server --exact
```

If the id is not listed, use option A. The guide targets Jellyfin 10.10 or newer; menu labels
can shift slightly between versions.

### Service or tray app

| | Windows service | Tray app only |
|---|---|---|
| Starts | at boot, before anyone logs in | when you log in |
| Survives logging out | yes | no |
| Runs as | a service account (Local System by default) | your own user |
| Media folder access | the service account must be able to read the folders | you already can |

Recommendation: **install as a service**. The TV and phone then work after a reboot without
anybody logging in to the PC. The official docs list the service option with a caveat, so if you
hit permission trouble, the tray app is a valid fallback.

In the installer, tick the option to install Jellyfin as a service and keep the default
account (Local System) for a private home PC. Folder access:

- The service account reads local drives (for example `D:\Thuisbios\Media`) without extra work
  when you use the default Local System account. If you pick a limited account such as
  Network Service, grant it read access: right-click the folder, Properties, Security, Edit,
  Add, then add the account with Read and Execute.
- A service does **not** see mapped network drives (`Z:`). Use UNC paths
  (`\\nas\media`) and make sure the service account can authenticate to the share.
- Jellyfin only needs read access to media. It writes metadata to its own data folder
  (`C:\ProgramData\Jellyfin\Server` for the service install). You can also let it save artwork and
  NFO files next to the media, which then needs write access; the default is to store them in its
  own data folder.

After installation Jellyfin listens on port 8096. Open <http://localhost:8096> on the PC.

## 2. Media folder layout

Pick a root; it is configurable everywhere. This guide uses `D:\Thuisbios\Media`.

```text
D:\Thuisbios\Media\
  Movies\
  Shows\
```

Create it with the script (no administrator rights needed):

```powershell
.\server\scripts\New-MediaLibrary.ps1 -Root D:\Thuisbios\Media
```

### Naming conventions

Jellyfin matches metadata (artwork, plot, cast) by name. Follow
<https://jellyfin.org/docs/general/server/media/movies/> and
<https://jellyfin.org/docs/general/server/media/shows/>.

```text
Movies\Inception (2010)\Inception (2010).mkv
Movies\Inception (2010)\Inception (2010).nl.srt          external Dutch subtitles
Movies\Inception (2010)\Inception (2010).en.forced.srt   forced English subtitles
Shows\Breaking Bad\Season 01\Breaking Bad S01E01.mkv
Shows\Breaking Bad\Season 01\Breaking Bad S01E02.mkv
Shows\Breaking Bad\Season 02\Breaking Bad S02E01.mkv
```

- One folder per movie, named `Title (Year)`; the file has the same name.
- One folder per series, a `Season 01` folder per season, files `Show S01E01.ext`.
- Do not put movies and shows in the same library folder.
- Avoid `<>:"/\|?*` in names; replace a colon with a dash.
- The helper functions in `server/scripts/Thuisbios.Media.psm1` produce these names.

Prefer H.264 or HEVC video, AAC, AC3 or E-AC3 audio and external `.srt` subtitles for this TV.

## 3. First-run wizard

At <http://localhost:8096> the wizard asks for:

1. **Display language**: your choice (English or Nederlands).
2. **Administrator user and password**: use a strong password and store it in your password
   manager. Never commit it.
3. **Media libraries**: add them now or later (section 4).
4. **Preferred metadata language**: Dutch, country Netherlands.
5. **Remote access**: leave "Allow remote connections to this server" enabled for LAN use
   (the phone is "remote" from Jellyfin's point of view) and do not forward any port on the
   router. Remote access from outside the house is out of scope for this phase.

## 4. Add libraries

Dashboard > Libraries > Add Media Library:

| Content type | Display name | Folder |
|---|---|---|
| Movies | Movies | `D:\Thuisbios\Media\Movies` |
| Shows | Shows | `D:\Thuisbios\Media\Shows` |

In each library, set **Preferred download language** to `Dutch` and **Country/Region** to
`Netherlands` (Dutch titles and plots, falling back to English where Dutch is missing). Keep
"Enable real time monitoring" on so new files appear by themselves. Leave the default metadata
providers (TheMovieDb, TheTVDB) on. Scan with Dashboard > Libraries > Scan All Libraries.

## 5. Test media

Test media is never committed to git. Install ffmpeg once and generate the set:

```powershell
winget install Gyan.FFmpeg
# open a NEW PowerShell window so PATH updates, then:
.\server\scripts\Get-TestMedia.ps1 -MediaRoot D:\Thuisbios\Media
```

Downloads (about 650 MB) come from `download.blender.org`: Big Buck Bunny (2008) and Tears of
Steel (2012), both Creative Commons Attribution 3.0, (c) Blender Foundation. The script builds:

| Item | Tests |
|---|---|
| Big Buck Bunny (2008), H.264 + AAC, MP4 | plain direct play |
| Tears of Steel (2012), HEVC 10-bit + AAC, MKV | HEVC direct play on the TV |
| Thuisbios Test DTS (2024), DTS-only audio | audio transcode (video can stay direct) |
| Thuisbios Test Subtitles (2024), `.nl.srt` and `.en.srt` | external subtitles |
| Thuisbios Test Show, S01E01 to S01E03 | Next Up and auto-play next episode |

Try `-WhatIf` first to see what it would do. Without ffmpeg the script only downloads and tells
you how to install it. PGS (image) subtitles cannot be generated by the script; use a real
Blu-ray rip later to test that case. After the scan, check that Jellyfin recognised every item.

## 6. Hardware transcoding with NVENC (RTX 4060 Ti)

1. Install a current NVIDIA driver (clean install, from nvidia.com). Jellyfin 10.10 and 10.11
   need driver 522.25 or newer on Windows. No monitor is required.
2. Dashboard > Playback > Transcoding:
   - **Hardware acceleration**: `Nvidia NVENC`.
   - **Enable hardware decoding for**: tick H264, HEVC, MPEG2, VC1, VP8, VP9, AV1, HEVC 10 bit
     and VP9 10 bit. The Ada Lovelace GPU decodes all of these; AV1 matters because the TV
     cannot play AV1, so the GPU decodes it and re-encodes to H.264. The RExt (4:4:4) options
     are rarely needed.
   - **Enable hardware encoding**: on.
   - **Allow encoding in HEVC format**: on. The 4060 Ti encodes HEVC, and the TV decodes it.
     Leave AV1 encoding off, the TV cannot play it.
   - **Enable enhanced NVDEC decoder**: on (needed for Dolby Vision tone mapping).
   - **Enable Tone mapping**: on, so HDR files that must be transcoded do not look washed out.
     Leave the other tone-mapping settings at their defaults. (VPP tone mapping is Intel only.)
   - **Allow subtitle extraction on the fly**: on.
3. Save, then check it works: play a video in the browser, choose a lower quality (Settings,
   Quality) to force a transcode, and open Task Manager > Performance > GPU. The Video Encode
   and Video Decode engines should show activity. Dashboard > Activity or the playback info
   overlay shows "Transcoding".

Option names come from Jellyfin 10.10 and the official NVIDIA docs
(<https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/nvidia>);
the exact labels may differ a little in your version. Consumer GPUs limit simultaneous NVENC
sessions, which is not a concern for a household.

## 7. Quick Connect and users

- Dashboard > General: make sure **Enable Quick Connect on this server** is ticked. This lets
  the TV app and phone sign in with a short code, approved from another signed-in device, without
  typing a password with the remote.
- Dashboard > Users > Add User: one user per person, with a name and password, **Allow this
  user to access all libraries** (or choose libraries). The admin account is for the dashboard;
  create a normal user for daily watching. Users become the profile picker in the TV app later.

## 8. Windows networking

1. **Fixed LAN IP**: set a DHCP reservation for the PC in the router (by MAC address), so the
   address never changes. Prefer this over a manual static IP on the PC. Note the IP, for
   example `192.168.1.50`.
2. **Wired Ethernet**: connect the PC with a cable, not Wi-Fi. 4K files can need 50 Mbit/s or
   more. The TV's own port is 100 Mbit/s, which is enough for most files but tight for full
   UHD Blu-ray remuxes.
3. **Network profile**: Settings > Network & Internet > Ethernet > set the network profile to
   **Private**. The firewall rules below only apply to the Private profile.
4. **Firewall**: from an elevated PowerShell (Run as administrator):

   ```powershell
   .\server\scripts\Set-JellyfinFirewall.ps1 -WhatIf   # preview
   .\server\scripts\Set-JellyfinFirewall.ps1
   ```

   It creates (or updates) inbound rules for **TCP 8096** (web UI, API, streaming) and
   **UDP 7359** (client auto-discovery), Private profile, local subnet only. Run it again any
   time, it does not create duplicates. `-Remove` deletes the rules. The installer may also have
   added its own rule; a duplicate allow rule is harmless.
5. **Power**: Settings > System > Power & battery > Screen, sleep & hibernate timeouts: set
   **When plugged in, put my device to sleep after** to **Never**. The screen may still turn
   off. A sleeping PC is an unreachable server. Also, in Control Panel > Power Options > your
   plan > Change advanced settings, turn off "Allow hybrid sleep" and hibernation timers, and
   in Device Manager > your Ethernet adapter > Power Management, untick "Allow the computer
   to turn off this device to save power". Windows Update restarts can still reboot the PC; with
   the service install Jellyfin comes back by itself.

## 9. Verify (phase 1 done criteria)

1. Server check from the PC:

   ```powershell
   .\server\scripts\Test-JellyfinServer.ps1
   .\server\scripts\Test-JellyfinServer.ps1 -Server 192.168.1.50   # use your LAN IP
   ```

   It prints the server name and version and exits non-zero on failure. Run the second form
   from another computer to prove LAN reachability.
2. **Browser on the PC**: open <http://localhost:8096>, sign in, play Big Buck Bunny.
3. **Phone**: connect the phone to the same Wi-Fi, install the official **Jellyfin** app (App
   Store or Google Play), and add the server. It should find the server automatically through
   discovery (UDP 7359); otherwise type `http://192.168.1.50:8096`. Sign in and play a movie.
   To try Quick Connect, choose Quick Connect in the app and approve the code in the web client
   (user menu > Quick Connect).
4. Play the DTS item and the subtitle item and confirm audio and `nl` subtitles work (the web
   client may transcode DTS audio, that is expected).

When the browser and the phone both play, phase 1 is complete.

## 10. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `localhost:8096` does not open | Service not running: open `services.msc`, start **Jellyfin Server**. For the tray app, start it from the Start menu. |
| Works on the PC, not on the phone | Network profile is Public, or the firewall rule is missing. Run `Set-JellyfinFirewall.ps1` as administrator; check the phone is on the same Wi-Fi (not guest Wi-Fi, no client isolation on the router, no VPN). |
| Phone app does not find the server | Discovery uses UDP 7359 and broadcast, which some routers block. Add the server manually with the IP and port. |
| Library is empty | The service account cannot read the folder (grant Read access, section 1) or the path is a mapped drive (use a UNC path). Check Dashboard > Logs. |
| Items not recognised or wrong poster | Fix the folder and file name (`Title (Year)`), then Refresh Metadata > Replace all, or Identify the item in the web UI. |
| Hardware transcode is not used | Driver too old or hardware acceleration set to None. Check the transcode log in Dashboard > Logs (look for `h264_nvenc`). Run `nvidia-smi` in a terminal to confirm the driver works. |
| HDR transcode looks gray | Enable Tone mapping and hardware decoding for HEVC 10 bit (section 6). |
| Playback stutters on the PC itself | Large 4K file over Wi-Fi, or the drive is slow. Use wired Ethernet and a local drive. |
| `Get-TestMedia.ps1` says ffmpeg missing | `winget install Gyan.FFmpeg`, then open a new PowerShell window. |
| DTS test file has no sound in a browser | Expected: browsers cannot play DTS, so Jellyfin transcodes audio. If it fails, check ffmpeg in Dashboard > Logs. |
| Script blocked by execution policy | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or run `powershell -ExecutionPolicy Bypass -File .\script.ps1`. |
| PC is unreachable after a while | It went to sleep. Fix the power settings in section 8. |
