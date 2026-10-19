# TV app: set up, install and test (phase 2)

Goal of phase 2: prove on the real TV (Samsung UE49NU7100, 2018) that our own app can be
installed, that the remote's arrow keys work, that Jellyfin video plays (direct play and
transcoded), and find out whether the volume buttons reach the soundbar.

You need: the Windows PC with Jellyfin running ([phase 1](../server/windows-setup.md)), the TV on
the same home network, a Samsung account (free), and Node.js 22 on the PC.

Words used here:

- **Tizen**: the operating system of Samsung TVs. Apps for it are web pages in a package.
- **Tizen Studio**: Samsung's free program (like Visual Studio) to install apps on the TV.
- **Developer Mode**: a switch on the TV that lets your PC install your own apps.
- **Certificate**: a digital signature. The TV only accepts apps signed with a certificate that
  knows this TV.
- **DUID**: the TV's unique ID. The certificate is tied to it.
- **`.wgt`**: the packaged app, like a `.msi` installer.

## 1. Find the PC's and the TV's IP address

You need two addresses.

PC (the one Jellyfin runs on): open PowerShell and run `ipconfig`. Look for **IPv4 Address**
(for example `192.168.1.50`). Phase 1 already asked you to give it a fixed address in the router.

TV: press **Settings** on the remote, then **General**, **Network**, **Network Status**,
**IP Settings**. Write down the **IP Address** (for example `192.168.1.60`). If the menu names
differ on your TV, look for "Network status" in the settings. Giving the TV a fixed address in the
router (like for the PC) saves you from changing it later.

## 2. Install Tizen Studio on the PC

1. Download the Windows installer from <https://developer.tizen.org/development/tizen-studio/download>
   and run it. Keep the default folder (`C:\tizen-studio`).
2. Start **Package Manager** (the installer offers this at the end, or find it in the Start menu).
3. On the **Main SDK** tab make sure **Tizen SDK tools** is installed (it is by default).
4. Open the **Extension SDK** tab and click **Install** next to:
   - **TV Extensions-4.0** (or the closest version in the list; newer ones also work for our TV).
   - **Samsung Certificate Extension**.
5. Wait until the installation finishes, then close Package Manager.

Tizen Studio also needs Java; the installer tells you if something is missing and where to get it.

## 3. Turn on Developer Mode on the TV

1. Press **Home** on the remote, go to **Apps** (the apps panel).
2. Using the remote, type **1 2 3 4 5**. If your remote has no number keys, press the button that
   shows an on-screen number pad and type the digits there.
3. A **Developer mode** window opens. Switch **Developer mode** to **On**.
4. In **Host PC IP** type the PC's IP address from step 1 (not the TV's).
5. Press **OK**, then switch the TV fully off and on again (restart). Developer Mode stays on
   after this; the TV shows "Develop mode" in the apps panel.

## 4. Connect the TV in Tizen Studio

1. Start **Tizen Studio**. Choose any workspace folder when it asks.
2. Open **Tools**, **Device Manager**.
3. Click the **Remote Device Manager** button, then the **+** button.
4. Fill in a name (for example `Living room TV`), the **TV's** IP address (step 1) and leave
   the port at `26101`. Click **Add**.
5. Switch the **Connection** toggle of your TV on. The TV may show a popup asking to allow the
   connection; accept it. The device is now listed as connected.

If the toggle does not stay on: check that the TV and PC are on the same network, the TV was
restarted after step 3, and Windows Firewall is not blocking Tizen Studio (allow it when Windows
asks).

## 5. Create a Samsung certificate

Do this once. The TV must be connected (step 4) so its DUID is known.

1. Open **Tools**, **Certificate Manager**, then click the **+** button.
2. Choose **Samsung** (not "Tizen"), then **TV**, then **Next**.
3. Choose **Create a new author certificate**. Fill in a name (for example `thuisbios`), a
   password and your details. Remember the password. **Next**.
4. Choose the **Public** privilege level. **Next**.
5. Sign in with your Samsung account when asked (create one for free if you do not have one).
6. On the page listing devices, tick your TV (its DUID is shown, it was added when you connected
   it). **Next**, then **Finish**.

The certificate is stored on this PC. Never commit it to Git (the repo ignores `*.p12` files, but
be careful anyway). Certificates expire after some time (often a year). When the app stops
installing, create a new certificate the same way and install again.

## 6. Build the app

Open PowerShell in the repository folder:

```powershell
npm install
copy apps\tv\.env.example apps\tv\.env   # optional: put your Jellyfin address in it
npm run build -w apps/tv
```

In `apps/tv/.env` set `VITE_JELLYFIN_URL=http://<PC IP>:8096` so the app already shows your
server. You can also type the address on the TV when the app starts.

The result is the folder `apps/tv/dist`. It holds the web app plus `config.xml` (the Tizen app
description) and `icon.png`.

You can also run the app in a desktop browser first: `npm run dev -w apps/tv`, then open
<http://localhost:5173>. The arrow keys move focus, Enter selects, Esc or Backspace is Back, and
R, G, Y, B are the red, green, yellow and blue keys. The browser cannot play the transcoded
(HLS) video, and the Tizen volume functions do not exist there; for those, use the TV.

## 7. Package, sign and install on the TV

Choose one way. Way A uses clicks, way B uses commands.

### Way A: Tizen Studio

1. **File**, **Import**, **Tizen**, **Tizen Project**, **Next**.
2. Choose **Select root directory** and browse to `apps\tv\dist` in the repository. Tick the
   project, leave **Copy projects into workspace** on, **Finish**.
3. Right-click the project, **Build Signed Package**. Check that the signing profile is your
   certificate (**Tools**, **Certificate Manager**, select it and click **Set as active**).
4. Right-click the project, **Run As**, **Tizen Web Application**. Studio installs the app on the
   connected TV and starts it.

Importing a copy means you must import again after each rebuild. Alternatively delete the project
in Studio and import it again.

### Way B: command line

The `tizen` and `sdb` commands live in `C:\tizen-studio\tools\ide\bin` and `C:\tizen-studio\tools`.
Add both folders to your PATH, or run them with the full path.

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
The `.wgt` file is never committed (it is in `.gitignore`).

After installing, find **Thuisbios** in the TV's apps panel. Start it from there next time.

## 8. Debugging on the TV

- In Tizen Studio right-click the project, **Debug As**, **Tizen Web Application**. A Chrome-like
  developer window (console, network tab, elements) opens, connected to the app on the TV.
- Errors then show in the console. Typing `window.tizen` in the console tells you if the Tizen
  functions exist.
- The app also shows a small debug overlay while playing a video (method, codecs, resolution).

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

- **The app shows a white or black screen**: connect the debugger (step 8) and read the console.
- **"Could not start Quick Connect"**: the TV cannot reach the PC. Check the address (including
  `:8096`), that Jellyfin runs, and that the Windows Firewall rule from phase 1 is active. Check
  that Quick Connect is switched on in the Jellyfin dashboard.
- **Install fails with a certificate error**: the certificate does not contain this TV's DUID
  (create a new certificate with the TV connected) or has expired.
- **Install fails with "already installed" or a signature error**: uninstall Thuisbios on the TV
  first (apps panel, select the app, **Delete**) and install again.
