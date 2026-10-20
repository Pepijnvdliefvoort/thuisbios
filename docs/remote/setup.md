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

- **Volume button** (speaker icon on the Now Playing screen, and **TV volume** in the TV sheet at the
  top right): opens a panel from the bottom with a slider for the TV volume, a speaker icon to mute
  or un-mute, and the volume as a number. It only shows after the one-time setup below.

## Requesting a movie or show

When something is not in the library, anyone signed in can ask for it. On **Search**, a search with no
results offers **Not in the library? Request it** (the form is prefilled with what you typed), and
**Request a movie or show** is always at the bottom of the Search screen and the Requests screen. The
form takes a title, and optionally a year, Movie or Show, and a note. Nothing is downloaded: a request
is only a note for the owner.

The **Requests** tab shows **My requests** with their state (**Waiting**, **Added**, **Not added**),
and open ones can be withdrawn. When the signed-in Jellyfin user is an administrator, the tab shows
everyone's requests instead: open ones first, with **Added** and **Dismiss** buttons, and handled ones
under **Handled** (where **Reopen** undoes a choice). A red number on the Requests tab counts the open
requests; it is read when the app starts and when you come back to it. Other users get no number.

The requests are stored in `.thuisbios/requests.json` next to `samsung-tv.json`, never in the project.
Nothing needs setting up. If Jellyfin is not at `http://localhost:8096` as seen from the PC, set
`THUISBIOS_JELLYFIN_URL` before starting the remote.

## Volume button

A web page on the phone cannot talk to the TV by itself, so the PC passes the volume on to the TV.
This is built into the same program that serves the remote (step 1.4), so there is nothing extra to
keep running. You set it up once.

1. Find the TV's address. On the TV press **Settings**, then go to **General**, **Network**,
   **Network Status** and **IP Settings**. Write down the **IP Address**, for example `192.168.1.156`.
2. Switch the TV on. On the PC open a terminal (PowerShell) in the project folder and run
   `npm run tv:setup -w apps/remote -- 192.168.1.156`, with your own address instead of
   `192.168.1.156`.
3. Look at the TV. It asks whether the PC may connect. Press **Allow** with the TV remote. You have
   one minute.
4. The terminal says **Paired. The volume button on the phone now works.** During the check the
   volume goes up one step and then down one step, so you can hear it work. Just before that it says
   either **The TV reports volume 14** (the slider will show the real volume) or that the volume is
   not reported (the slider still works, but shows an approximate level).
5. Reload the remote on the phone. A speaker button appears on the Now Playing screen, and a
   **TV volume** button in the **Your TV** sheet (tap the chip at the top right) so you can also use
   it when nothing plays. You do not need to restart anything.

Tap the button and a panel slides up from the bottom. Drag the slider to set the volume; the number
on the right follows your finger and the TV changes while you drag. Tap the speaker icon on the left
to mute or un-mute (it shows a crossed-out speaker while muted). Close the panel by tapping outside
it, dragging it down or pressing **Close**.

If the TV sends its sound to a soundbar, the TV's own volume does not matter and the slider cannot
read the soundbar. Then the slider works by pressing the TV's volume keys for you, and the panel
says **Approximate level**: the number is the level the PC remembers, and a big jump takes a few
seconds because the keys are pressed one by one. If the real volume was changed with another remote,
the number can be off. See Troubleshooting if the slider moves but the sound does not change.

The address and the pairing are saved in `.thuisbios/samsung-tv.json` in your user folder on the PC,
never in the project. Only phones that are signed in to Jellyfin can use the button, and they can
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
- **The volume button is missing.** Run the setup from the Volume button section, then reload the
  remote. They also stay hidden when the remote is opened from something other than the PC program
  from step 1.4.
- **"Can't reach the TV. Is it on?"** Switch the TV on (standby is not enough on some TVs) and try
  again. If the TV's address changed, run the setup again with the new address.
- **"The TV blocked the volume control."** Probably Deny was pressed, or Allow was missed. On the TV
  go to **Settings**, **General**, **External Device Manager**, **Device Connection Manager**,
  **Device List**. Set **Thuisbios Remote** to **Allow**, or remove it, and run the setup again.
- **"Volume control isn't set up on the PC yet."** Run the setup from the Volume button section.
- **The slider moves but the sound doesn't change.** The TV is probably sending its sound to a
  soundbar, and the TV's own volume is not what you hear. Tell the PC to use the TV's volume keys
  instead, which the soundbar follows:
  1. On the PC open File Explorer, type `%USERPROFILE%\.thuisbios` in the address bar and press
     Enter. This is the folder `C:\Users\<you>\.thuisbios`, where `<you>` is your Windows user name.
  2. Right-click `samsung-tv.json`, choose **Open with** and then **Notepad**.
  3. The file looks like `{ "host": "192.168.1.156", "token": "..." }` spread over a few lines. Add
     a line `"volumeMode": "relative",` right after the opening `{`, so it becomes:

     ```json
     {
       "volumeMode": "relative",
       "host": "192.168.1.156",
       "token": "..."
     }
     ```

  4. Save the file (Ctrl+S) and close Notepad. No restart is needed: open the volume panel again and
     it says **Approximate level**. To go back, delete that line.
- **The number on the slider is wrong ("Approximate level").** The PC only remembers the level it set
  last, so changing the volume with the TV remote makes it drift. Drag the slider once to the level
  you hear; from then on it is right again.
- **After an update the phone shows the old version.** Close the remote completely and open it again.
