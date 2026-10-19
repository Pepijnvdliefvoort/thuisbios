# TV app: set up, install and test (phase 2)

Goal of phase 2: prove on the real TV (Samsung UE49NU7100, 2018) that our own app can be
installed, that the remote's arrow keys work, that Jellyfin video plays (direct play and
transcoded).

You need: the Windows PC with Jellyfin running ([phase 1](../server/windows-setup.md)), the TV on
the same home network, a Samsung account (free), Node.js 22 and Visual Studio Code on the PC.

Samsung replaced the old Tizen Studio program by a **Tizen extension for Visual Studio Code**.
This guide uses that extension. Samsung may rename buttons between versions; where this guide
says "may look slightly different" it describes the most likely flow that we could not check
against the extension itself.

Words used here:

- **Tizen**: the operating system of Samsung TVs. Apps for it are web pages in a package.
- **Tizen extension**: the Visual Studio Code add-on from Samsung that installs apps on the TV.
  Its side panel has *Baseline Tools*, *Actions* and *Active Targets*.
- **Developer Mode**: a switch on the TV that lets your PC install your own apps.
- **Certificate**: a digital signature. The TV only accepts apps signed with a certificate that
  knows this TV.
- **DUID**: the TV's unique ID. The certificate is tied to it.
- **`.wgt`**: the packaged app, like a `.msi` installer.

## 1. Install the Tizen extension in VS Code

1. Open <https://developer.tizen.org/development/tizen-studio/download> (Samsung's Tizen tools
   page). The **Tizen** extension for Visual Studio Code is marked *Recommended*.
2. Or do it inside VS Code: open the **Extensions** view (`Ctrl+Shift+X`), search for **Tizen**
   and click **Install** on the one published by Samsung.
3. A **Tizen** icon appears in the left activity bar. Click it. The panel shows:
   - **Baseline Tools**: Package Manager, Emulator Manager, Device Manager, Certificate Manager.
   - **Actions**: Create Project, Build Project, Run Project, Debug Project.
   - **Active Targets**: Project, Device, Certificate (they say "missing" or "No Active ..."
     until you finish this guide).

The only other download on that page is "Tizen SDK 10 with CLI installer". You only need it for the
optional command line route at the end of this guide.

## 2. Find the PC's IP address

Open PowerShell on the PC (the one Jellyfin runs on) and run `ipconfig`. Look for
**IPv4 Address** (for example `192.168.1.50`) and write it down. Phase 1 already asked you to
give the PC a fixed address in the router.

You will also need the TV's address (step 5). On the TV press **Settings**, then **General**,
**Network**, **Network Status**, **IP Settings** and write down the **IP Address** (for example
`192.168.1.60`). If the menu names differ, look for "Network status" in the settings. Giving the
TV a fixed address in the router saves you from changing it later.

## 3. Install the TV packages (Package Manager)

1. In the Tizen panel, under **Baseline Tools**, click **Package Manager**.
2. Wait until the list of packages loads (this needs internet).
3. Install the package for Samsung TVs, named something like **TV Extensions** (any version of
   4.0 or newer works for our 2018 TV; take the newest).
4. Install the **Samsung Certificate Extension** (it may be called "Samsung certificate").
5. Wait until the installation finishes. Names and layout may look slightly different; pick the
   entries with "TV" and "Samsung certificate" in the name.

## 4. Turn on Developer Mode on the TV

1. Press **Home** on the remote and go to **Apps** (the apps panel).
2. Using the remote, type **1 2 3 4 5**. If your remote has no number keys, press the button that
   shows an on-screen number pad and type the digits there.
3. A **Developer mode** window opens. Switch **Developer mode** to **On**.
4. In **Host PC IP** type the PC's IP address from step 2 (not the TV's).
5. Press **OK**.
6. Restart the TV fully: hold the power button on the remote until the TV restarts, or unplug
   it for 30 seconds. Developer Mode stays on afterwards.

## 5. Add and connect the TV (Device Manager)

1. In the Tizen panel click **Device Manager** (under **Baseline Tools**).
2. Add a new device (a **+** or "Add device" button; the Remote Device Manager may be a separate
   window).
3. Fill in a name (for example `Living room TV`), the **TV's** IP address from step 2 and leave
   the port at `26101`. Confirm.
4. Switch the **Connection** toggle of the TV on. The TV may show a popup asking to allow the
   connection; accept it.
5. Check the panel: under **Active Targets**, **Device** should now show your TV instead of
   "No Active Device". If it does not, select the TV in the Device Manager list and choose
   "set active" (may look slightly different).

## 6. Create a Samsung certificate (Certificate Manager)

Do this once. The TV must be connected (step 5) so its DUID is known.

1. Click **Certificate Manager** under **Baseline Tools**, then add a new certificate (**+**).
2. Choose **Samsung** (not "Tizen") and the device type **TV**.
3. Choose to create a new author certificate. Fill in a name (for example `thuisbios`), a
   password and your details. Remember the password.
4. Choose the **Public** privilege level.
5. Sign in with your Samsung account when asked (create a free one if you do not have one).
6. On the page listing devices tick your TV (its DUID is shown, it was added when you connected
   it). Finish.
7. Select the new certificate and set it as active. Under **Active Targets**, **Certificate**
   should now show its name instead of "No Active Certificate".

The certificate is stored on this PC. Never commit it to Git (the repo ignores `*.p12` files, but
be careful anyway). Certificates expire after some time (often a year). When the app stops
installing, create a new certificate the same way and install again.

## 7. Build our app and select it as the project

1. Open the repository folder in VS Code (**File**, **Open Folder**).
2. Open a terminal in VS Code (**Terminal**, **New Terminal**) and run:

   ```powershell
   npm install
   npm run build -w apps/tv
   ```

3. Nothing needs configuring: the TV page finds Jellyfin at `http://<PC IP>:8096` and the phone app
   at `http://<PC IP>:4174` from the address it was opened on. Only if they live elsewhere, copy
   `apps\tv\.env.example` to `apps\tv\.env` and set `VITE_JELLYFIN_URL` and `VITE_REMOTE_URL`
   before building (for development you can also add `?server=` and `?remote=` to the page address).
4. The result is the folder `apps/tv/dist`. It holds the web app plus `config.xml` (the Tizen app
   description) and `icon.png`. This folder is the Tizen project.
5. Make the extension use it. The extension works on a project folder that contains
   `config.xml`, so the Project target must point at `apps/tv/dist`. The most likely flow:
   open `apps/tv/dist` as its own folder (**File**, **Open Folder**; or **File**, **Add Folder to
   Workspace**) and look at **Active Targets**, **Project**: it should change from
   "null (missing)" to the project name (`Thuisbios`). If it stays "missing", click the
   **Project** item and choose the `apps/tv/dist` folder (may look slightly different). We could
   not verify this step; what to look for is simply that **Project** is no longer "missing".
6. After every code change run `npm run build -w apps/tv` again. The folder `apps/tv/dist` is
   replaced, so reselect or reopen the project if the extension lost it.

You can also run the app in a desktop browser first: `npm run dev -w apps/tv`, then open
<http://localhost:5173>. The arrow keys move focus, Enter selects, Esc or Backspace is Back, and
R, G, Y, B are the red, green, yellow and blue keys. The browser cannot play the transcoded
(HLS) video; for that, use the TV.

## 8. Run on the TV and debug

1. Check **Active Targets**: Project, Device and Certificate must all be filled in.
2. Under **Actions** click **Run Project**. The extension packages and signs the app with the
   active certificate, installs it on the TV and starts it. If you are asked, accept a firewall
   prompt (Windows asks once) and choose **Build Project** first if Run does not build.
3. Next time you can also start **Thuisbios** from the TV's apps panel.
4. To debug click **Debug Project**. A Chrome-like inspector window (console, network, elements)
   opens, connected to the app on the TV.
5. In the console, `window.tizen` tells you whether the Tizen functions exist. The app also shows
   a small debug overlay while playing a video (method, codecs, resolution).

## Run in the TV's web browser (no install)

Use this route when the app cannot be installed on the TV. Newer Samsung certificates (2025) are
rejected by this 2018 TV (install error 118012), so the app runs in the TV's built-in browser
instead. Nothing is installed on the TV.

1. On the PC, in the project folder, run `npm run build -w apps/tv` and then
   `npm run preview -w apps/tv`. Leave this window open while you watch.
2. Open the TV's **Internet** app. It may not be pinned on the Home bar: find it via **Home** →
   **Apps**, or from the PC with `tizen run -p org.tizen.browser -t <device name>`.
3. In the TV's browser go to `http://<PC IP>:4173`. Use the PC's Wi-Fi or LAN IP address (see
   section 2), not the Tailscale one.
4. The TV shows a Quick Connect code and a QR code at once. On your phone, scan the QR code (it
   opens the Thuisbios phone app and signs the TV in), or open the Thuisbios phone app and enter the
   code. A new code appears by itself when the old one expires.
5. The first press of any remote button switches the browser to full screen, which hides the
   address bar. If the Back button leaves full screen, the next button press switches it back.
6. Bookmark the page in the TV's browser so you can open it quickly next time.

To see which remote buttons reach the app, open `http://<PC IP>:4173/?debug`, or press the yellow
**C** button on the remote. A box in the corner lists the last buttons received and counts pointer
moves and clicks; press yellow again to hide it.

In this browser the remote works as a mouse, not as a keyboard:

- Outside the player, each press of an arrow key jumps the highlight to the next item in that
  direction, like a real D-pad. Press **OK** to open the highlighted item. If the highlight is ever lost (for example
  right after full screen turns on), the next **OK** or arrow press only brings it back. The pointer itself is
  hidden, only the highlight is visible. On a
  desktop, add `?dpad` to the URL to try this mode with a mouse (the plain mouse keeps hover and
  click otherwise).
- The player uses the same arrows, **OK** and **RETURN**, through one state machine (the keyboard
  arrows, Enter, Escape/Backspace and the media keys do the same on a desktop). It has two modes:
  - **Watching** (controls hidden): left or right jumps back or forward 10 seconds. Repeated
    presses add up in a round badge on that side of the screen ("-10", "-20", "-30"), which fades
    about 0.8 seconds after the last press. Up or down shows the controls with focus on
    Play/Pause. **OK** pauses and shows the controls (or resumes a paused movie). **RETURN** leaves
    the player. The media keys (play, pause, play/pause, fast forward, rewind, stop) do what they say.
  - **Controls** (visible): the arrows move the highlight between the back arrow, the progress
    bar, back 10 seconds, Play/Pause, forward 10 seconds and the CC button; **OK** activates the
    highlighted one. They hide by themselves after 4 seconds without input while playing and stay
    visible while paused. **RETURN** hides them first, a second **RETURN** leaves the player.
  - **Progress bar**: when highlighted, left and right move the position 10 seconds per press. The
    target time shows on the bar and the jump happens about 0.6 seconds after the last press. Up
    or down leave the bar.
  - With `?debug` the corner box also shows what the player decided for the last direction (for
    example `player: right [watching] -> seekBy(10)`) or, outside the player, the last move (for
    example `nav: dx=12 dy=0 -> right`). The movie and stream details are only shown with
    `?debug`; press the green key to toggle them.
- Full screen: the first press of a button or click asks for full screen. The app also tries on the
  first pointer move, but browsers normally refuse that without a button press or click; if it is
  refused, nothing is lost and the next press still works.

Subtitles: when a movie has text subtitles (SRT, ASS, embedded text), a **CC** button appears at
the right of the control row. Each press cycles Off, track 1, track 2 and so on, back to Off.
Image subtitles (PGS, dvdsub) are not supported yet; if a movie only has those, a greyed-out CC
button shows "n/a".

## 9. What to test

Start the app. On first start it shows a **Quick Connect code** and a QR code. Scan the QR code
with your phone (or enter the code in the Thuisbios phone app). The TV then signs in by itself and
shows the screensaver, a slideshow of your library. You pick what to watch on the phone.

Tick off every line and write down what happened (also if it fails: the exact message helps).

- [ ] **Install**: the app starts from the apps panel on the TV.
- [ ] **Sign in**: the code and QR code appear, scanning the QR code with the phone logs the TV in,
  the screensaver appears (slow backdrops with title, year and a clock).
- [ ] **Screensaver**: OK shows "Sign out" and "Close"; left and right move between them and the
  menu hides itself after 10 seconds.
- [ ] **Show on TV**: "Show on TV" on the phone opens the details page. A partly watched movie
  offers "Resume from ..." and "Play from start"; a series shows seasons and episodes.
- [ ] **Return key**: Return in the player goes to the details page (or the screensaver) and may
  leave full screen; press OK to get full screen back. On the screensaver full screen may end. With `?debug`
  the overlay shows the back decisions.
- [ ] **Direct play**: play a movie that should direct play (for example Big Buck Bunny as
  H.264 + AAC). The overlay says **DirectPlay**. Picture and sound work.
- [ ] **Transcode**: play the movie with DTS audio (for example from the test library). The overlay
  says **Transcode** (or DirectStream) with audio like `dts -> ac3`. Picture and sound work.
- [ ] **Forced transcode**: while a movie plays press the **yellow** key. The picture restarts as
  Transcode and plays.
- [ ] **Remote keys in the player**: Play/Pause button on the remote pauses and resumes. Left and
  right (or fast forward and rewind) jump 10 seconds and the badge adds them up. **Green** toggles the overlay (shown with `?debug`). **Back** leaves the
  player.
- [ ] **Progress**: after leaving the player, open the Jellyfin web UI on the PC. The movie shows a
  partial progress bar ("resume").
- [ ] **Phone remote**: with the TV signed in, open the Jellyfin app on the phone and pick the TV as
  the playback target. Playing a title starts it on the TV, pause, seek and stop from the phone
  work, and the phone's progress bar follows. Next and previous episode work for a series.
  Sending a title to the TV opens its details page. With `?debug` the overlay shows the socket
  state and the last command.
- [ ] **4K or HDR file** (if you have one): note whether it plays, stutters, or turns into a
  transcode.

The TV's own volume buttons control the soundbar, so the app needs no volume screen.

## Troubleshooting

- **The app shows a white or black screen**: use Debug Project (step 8) and read the console.
- **"Can't reach the Jellyfin server"**: the TV cannot reach the PC. The TV retries every 10
  seconds. Check that the PC is on, that Jellyfin runs, that the TV page was opened with the PC's
  address (Jellyfin is expected on port 8096 of that same address) and that the Windows Firewall
  rule from phase 1 is active. Check that Quick Connect is switched on in the Jellyfin dashboard.
- **Device not found or will not connect**: the TV and PC must be on the same Wi-Fi or LAN. The
  IP in the TV's Developer Mode window must equal the PC's current IP (`ipconfig`, it may have
  changed), and the TV must have been fully restarted afterwards. Check the TV's own IP too
  (it may have changed) and that Windows Firewall is not blocking VS Code or `sdb`.
- **Active Targets still shows "missing" or "No Active ..."**: fix the one that is empty:
  Project (step 7), Device (step 5) or Certificate (step 6).
- **Install fails with a certificate error**: the certificate does not contain this TV's DUID
  (create a new certificate with the TV connected) or has expired.
- **Install fails with "already installed" or a signature error**: uninstall Thuisbios on the TV
  first (apps panel, select the app, **Delete**) and install again.

## Appendix: command line (optional)

The extension uses the Tizen command line tools internally. You can also use them yourself. Get
"Tizen SDK 10 with CLI installer" from the same Tizen tools page. Afterwards the `tizen` and `sdb`
commands live in the `tools\ide\bin` and `tools` folders of the install folder. Add both
to your PATH, or run them with the full path.

```powershell
sdb connect 192.168.1.60            # the TV's IP
sdb devices                         # shows the device name, e.g. UE49NU7100 or 192.168.1.60:26101
tizen security-profiles list        # shows the name of your certificate profile

$env:TIZEN_PROFILE = "thuisbios"    # the profile name from the line above
npm run package -w apps/tv          # signs and packages apps/tv/dist into apps/tv/build/Thuisbios.wgt

tizen install -n Thuisbios.wgt -t <device from sdb devices> -- apps/tv/build
tizen run -p ThuisBio01.Thuisbios -t <device from sdb devices>
```

`npm run package` just calls `tizen package -t wgt -s <profile> -o apps/tv/build -- apps/tv/dist`.
The certificate profile must exist for the CLI (the extension's Certificate Manager normally
creates it; if `security-profiles list` is empty, create one with the CLI). The `.wgt` file is
never committed (it is in `.gitignore`).
