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

- **Volume buttons** (Now Playing screen and the TV sheet at the top right): volume down, mute and
  volume up for the TV. They only show after the one-time setup below.

## Volume buttons

A web page on the phone cannot talk to the TV by itself, so the PC passes the volume buttons on to
the TV. This is built into the same program that serves the remote (step 1.4), so there is nothing
extra to keep running. You set it up once.

1. Find the TV's address. On the TV press **Settings**, then go to **General**, **Network**,
   **Network Status** and **IP Settings**. Write down the **IP Address**, for example `192.168.1.156`.
2. Switch the TV on. On the PC open a terminal (PowerShell) in the project folder and run
   `npm run tv:setup -w apps/remote -- 192.168.1.156`, with your own address instead of
   `192.168.1.156`.
3. Look at the TV. It asks whether the PC may connect. Press **Allow** with the TV remote. You have
   one minute.
4. The terminal says **Paired. The volume buttons on the phone now work.** During the check the
   volume goes up one step and then down one step, so you can hear it work.
5. Reload the remote on the phone. Three volume buttons appear on the Now Playing screen, and in the
   **Your TV** sheet (tap the chip at the top right) so you can also use them when nothing plays.
   You do not need to restart anything.

The buttons: the left one lowers the volume, the middle one mutes or un-mutes, the right one raises
it. One tap is one step. If a soundbar is connected to the TV with HDMI ARC, it follows these keys,
so the buttons change the soundbar volume too.

The address and the pairing are saved in `.thuisbios/samsung-tv.json` in your user folder on the PC,
never in the project. Only phones that are signed in to Jellyfin can use the buttons, and they can
only change the volume.

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
- **The volume buttons are missing.** Run the setup from the Volume buttons section, then reload the
  remote. They also stay hidden when the remote is opened from something other than the PC program
  from step 1.4.
- **"Can't reach the TV. Is it on?"** Switch the TV on (standby is not enough on some TVs) and try
  again. If the TV's address changed, run the setup again with the new address.
- **"The TV blocked the volume control."** Probably Deny was pressed, or Allow was missed. On the TV
  go to **Settings**, **General**, **External Device Manager**, **Device Connection Manager**,
  **Device List**. Set **Thuisbios Remote** to **Allow**, or remove it, and run the setup again.
- **"Volume control isn't set up on the PC yet."** Run the setup from the Volume buttons section.
- **After an update the phone shows the old version.** Close the remote completely and open it again.
