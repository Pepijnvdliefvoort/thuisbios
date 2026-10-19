# TV app: set up, install and test (phase 2)

Goal of phase 2: prove on the real TV (Samsung UE49NU7100, 2018) that our own app can be
installed, that the remote's arrow keys work, that Jellyfin video plays (direct play and
transcoded), and find out whether the volume buttons reach the soundbar.

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
   copy apps\tv\.env.example apps\tv\.env   # optional: put your Jellyfin address in it
   npm run build -w apps/tv
   ```

3. In `apps/tv/.env` set `VITE_JELLYFIN_URL=http://<PC IP>:8096` before building if you want the
   app to show your server at once. You can also type the address on the TV when the app starts.
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
(HLS) video, and the Tizen volume functions do not exist there; for those, use the TV.

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
4. When the app asks for the server address, enter `http://<PC IP>:8096`.
5. Sign in with Quick Connect: on your phone or PC open Jellyfin, click your profile picture →
   **Quick Connect**, enter the code shown on the TV and press **Authorize**.
6. The first press of any remote button switches the browser to full screen, which hides the
   address bar. If the Back button leaves full screen, the next button press switches it back.
7. Bookmark the page in the TV's browser so you can open it quickly next time.

To see which remote buttons reach the app, open `http://<PC IP>:4173/?debug`, or press the yellow
**C** button on the remote. A box in the corner lists the last buttons received and counts pointer
moves and clicks; press yellow again to hide it. Typing a "c" in the server address field does not
toggle it.

In this browser the remote works as a mouse, not as a keyboard:

- Outside the player, each press of an arrow key jumps the highlight to the next item in that
  direction, like a real D-pad. Press **OK** to open the highlighted item. The pointer itself is
  hidden, only the highlight is visible. Typing in the server address field still works. On a
  desktop, add `?dpad` to the URL to try this mode with a mouse (the plain mouse keeps hover and
  click otherwise).
- While a movie plays, move the pointer left or right with the arrows to jump back or forward 10
  seconds. A short "-10 s" or "+10 s" appears. Press **OK** to pause and show the buttons (Back to
  list, back 10 seconds, Play/Pause, forward 30 seconds). Moving the pointer up or down also shows
  them. They hide by themselves after 4 seconds while playing, and stay visible while paused. The
  pointer is hidden while the buttons are hidden and comes back with them. With `?debug` the box
  also shows the last seek decision (for example `seek: dx=-12 dy=0 -> -10s`) or, outside the
  player, the last move (for example `nav: dx=12 dy=0 -> right`).
- **RETURN** goes back to the movie list.

Subtitles: when a movie has text subtitles (SRT, ASS, embedded text), a **CC** button appears next
to the playback buttons. Each press cycles Off, track 1, track 2 and so on, back to Off. Image
subtitles (PGS, dvdsub) are not supported yet; if a movie only has those, the button shows
"CC: n/a" and is disabled.

## 9. What to test

Start the app. On first start it asks for the Jellyfin address and shows a **Quick Connect code**.
On your phone open the Jellyfin app, go to **Settings**, **Quick Connect**, and type the code. The
TV then signs in by itself.

Tick off every line and write down what happened (also if it fails: the exact message helps).

- [ ] **Install**: the app starts from the apps panel on the TV.
- [ ] **Sign in**: the code appears, entering it on the phone logs the TV in, the movie row appears
  with posters.
- [ ] **D-pad**: left and right move the highlight along the posters, up and down reach the
  "Volume test" and "Sign out" buttons and back. The highlighted poster grows slightly.
- [ ] **Direct play**: play a movie that should direct play (for example Big Buck Bunny as
  H.264 + AAC). The overlay says **DirectPlay**. Picture and sound work.
- [ ] **Transcode**: play the movie with DTS audio (for example from the test library). The overlay
  says **Transcode** (or DirectStream) with audio like `dts -> ac3`. Picture and sound work.
- [ ] **Forced transcode**: while a movie plays press the **yellow** key. The picture restarts as
  Transcode and plays.
- [ ] **Remote keys in the player**: Play/Pause button on the remote pauses and resumes. Left and
  right (or fast forward and rewind) jump 10 seconds. **Green** hides the overlay. **Back** leaves the
  player.
- [ ] **Progress**: after leaving the player, open the Jellyfin web UI on the PC. The movie shows a
  partial progress bar ("resume").
- [ ] **4K or HDR file** (if you have one): note whether it plays, stutters, or turns into a
  transcode.
- [ ] **Volume test**: press the **red** key (or the button) on the movie list. Press **Volume up**
  and **Volume down** with a movie not playing, then **Mute**. Look at the result lines on screen
  and listen: does the **soundbar** volume change, or only the TV's own speaker level? Does the
  soundbar's display react? Write down which buttons work. Also press **Read volume**: the
  number should change after Volume up.

Results of the volume test decide how phase 4 handles volume (see the "Is TV volume reachable?"
section in [docs/plan.md](../plan.md)). If the soundbar does not follow, that is a valid outcome:
phase 4 then uses Samsung's network remote API instead.

## Troubleshooting

- **The app shows a white or black screen**: use Debug Project (step 8) and read the console.
- **"Could not start Quick Connect"**: the TV cannot reach the PC. Check the address (including
  `:8096`), that Jellyfin runs, and that the Windows Firewall rule from phase 1 is active. Check
  that Quick Connect is switched on in the Jellyfin dashboard.
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
