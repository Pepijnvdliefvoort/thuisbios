# Phone remote: set up and use

The Thuisbios Remote is a web app for your phone. You browse your movies and shows on the phone
and press play: the movie starts on the TV. It also works as a remote while the TV plays.

You need: the Windows PC with Jellyfin running, the TV with the Thuisbios app, and your phone, all on
the same home Wi-Fi.

Want to use it away from home too? See [tailscale.md](tailscale.md) after this guide.

## 1. Start the remote on the PC

Do this once, and again after every update of the project.

1. Open a terminal (PowerShell) in the project folder (`thuisbios`).
2. Run `npm ci` and wait until it finishes.
3. Run `npm run build -w apps/remote`.
4. Run `npm run preview -w apps/remote`. It prints the addresses it serves on. Leave this window
   open: if you close it, the remote stops working.
5. Windows may ask whether Node.js may use the network. Choose **Private networks** and press
   **Allow access**. Without this, the phone cannot reach the PC.

## 2. Connect the TV and the phone

The TV only needs to be connected once. After that it shows a slideshow of your movies and shows,
and you pick everything on the phone.

1. Open Thuisbios on the TV. It shows a **6-digit code** and a **QR code**. Leave it on screen.
2. On the phone, scan the QR code with the camera and open the link. If you rather type it: open
   `http://192.168.1.192:4174` in the phone's browser (Safari on iPhone, Chrome on Android), tap
   **Connect a TV** and type the code.
3. If the phone asks you to sign in, do that once with just your Jellyfin username and password. The
   server is found automatically. Only if it says it can't reach the server, tap **Change server** and
   type the address of your Jellyfin server, for example `http://192.168.1.192:8096`.
4. The phone says **TV connected** and the TV starts its slideshow. Done.
5. Add the remote to the home screen so it opens like an app:
   - iPhone: tap the **Share** button in Safari, then **Add to Home Screen**.
   - Android: tap the **menu** (three dots) in Chrome, then **Add to Home screen** or
     **Install app**.

From now on, open the remote on the phone, pick a movie and press **Play on TV**. The chip at the top
right shows the TV with a green dot. Tap the chip to pick a TV if you have more than one, or to
connect another TV.

## What the buttons do

- **Play on TV**: starts the movie or episode from the beginning on the TV.
- **Resume on TV (12:34)**: continues where you stopped. It only shows when there is a saved spot.
- **Play from start**: starts over, even when there is a saved spot.
- **Show on TV**: opens the details page of this title on the TV, without playing.
- **Play button next to an episode**: plays that episode on the TV.
- **Mini player** (above the tabs while the TV plays): play/pause, and tap it to open the full
  **Now Playing** screen.
- **Now Playing**: drag the slider to jump to another moment (the TV jumps when you let go),
  **-10** and **+10** skip ten seconds, the arrows go to the previous or next episode, and the
  square stops playback.

Volume stays on the TV remote for now: a web page on the phone cannot change the TV's volume.

## Troubleshooting

- **The TV is not listed.** Check that Thuisbios is open on the TV and that it shows the slideshow,
  not a code. If it still shows a code, connect it: tap **Connect a TV** on the phone and type the
  code. The TV shows up on the phone within a few seconds.
- **"That code is wrong or has expired."** The code on the TV changes after a few minutes. Type the
  code that is on the TV right now, or scan the QR code again.
- **"Quick Connect is turned off."** Open the Jellyfin dashboard on the PC, go to **General** and
  switch on **Quick Connect**, then try again.
- **"Can't reach the server."** Check that the PC is on, that Jellyfin is running, and that the phone
  is on the same Wi-Fi (not mobile data). Try opening `http://192.168.1.192:8096` in the phone's
  browser: you should see the Jellyfin page.
- **The page does not open at all.** Check that the window from step 1.4 is still open and that you
  allowed Node.js on private networks. If the PC's address is no longer `192.168.1.192`, use the
  address the preview command prints.
- **"TV did not respond."** The TV went to sleep or lost its connection. Wake it, reload the
  Thuisbios page on the TV and try again.
- **After an update the phone shows the old version.** Close the remote completely and open it again.
