# Skip intro with the Intro Skipper plugin

## What it does

Thuisbios can show a "Skip intro" button during the opening credits of a series episode, on the
TV and on the phone. Jellyfin does not know where an intro starts and ends by itself. The free
Intro Skipper plugin finds it and writes the times into Jellyfin. Without the plugin the apps
work as before and simply show no button.

It compares the sound of the episodes in the same season and looks for the part they share, which
is usually the theme song. So:

- A season needs at least two episodes. A show with one episode gets no markers.
- Very short test clips may not get markers, because there is not enough audio to compare.
- It is not perfect. Sometimes an intro is missed or starts a few seconds early or late.

## Next episode card

The same markers drive the "Next episode" card at the end of an episode. The plugin can also detect
the credits. When it has, the card appears when the credits start and counts down 5 seconds before
the next episode plays. Without credits markers the card shows 5 seconds before the end of the
video. Either way you can press Cancel on the TV or the phone.

## One-time setup

You do this on the Windows PC, in the Jellyfin web page (`http://localhost:8096`), signed in as
the administrator.

1. Check the Jellyfin version. Open the **Dashboard** (the menu at the top left). The version is
   shown on the first page. The current Intro Skipper needs Jellyfin **10.11.11 or newer**. If your
   version is older, update Jellyfin first (download the new installer from jellyfin.org and run it;
   your library and settings are kept), then come back here.
2. Go to **Dashboard** > **Plugins** > **Repositories**. On some versions this is under
   **Catalog**, behind the settings (gear) button.
3. Choose **New repository** (the plus button) and fill in:
   - **Repository name**: `Intro Skipper`
   - **Repository URL**: `https://intro-skipper.org/manifest.json`

   Save it.
4. Go to **Catalog**, find **Intro Skipper** (you may need to look under **General**) and choose
   **Install**. Pick the newest version.
5. Restart Jellyfin. On Windows, close the Jellyfin icon in the system tray (bottom right, you may
   need the small arrow) and start Jellyfin again from the Start menu. If Jellyfin runs as a
   service, restart that service in **Services** instead.

## Let it analyse your shows

After the restart, the plugin looks at your shows by itself. This takes a while for a big
library, because it listens to the audio of every episode.

To start it right away: **Dashboard** > **Scheduled Tasks**. Look for a task from Intro Skipper
about detecting or analyzing media segments and press the play button next to it. Otherwise just
wait, it also runs on its own.

New episodes are checked when they are added to the library.

## Check that it works

1. On the phone, play an episode on the TV, from a show that has at least two episodes in the
   season and has been analysed.
2. When the intro starts, a **Skip intro** button appears at the bottom right of the TV. With the
   controls hidden, pressing **OK** on the remote presses it. With the controls shown, move to the
   button with the arrows and press OK. The video jumps to the end of the intro.
3. On the phone, the Now Playing screen shows a **Skip intro** button above the playback buttons
   while the intro plays. When the phone plays the video itself, the button is on the video. On an
   iPhone the video opens in the iPhone's own full screen player, which cannot show the button.

No button? Wait for the analysis to finish (see the task under **Scheduled Tasks**), or try
another show.

## Troubleshooting

- **The plugin is not in the Catalog.** Check that the repository URL is typed exactly as above and
  that the PC has internet. Check the Jellyfin version too: the plugin does not show for versions
  that are too old.
- **Everything is installed but no button ever appears.** Open **Dashboard** > **Plugins** and check
  that Intro Skipper is listed as **Active**. If it says it needs a restart, restart Jellyfin.
- **The button shows at the wrong moment.** The detection guessed wrong for that episode. This is
  a limit of the plugin. It does not harm anything: skipping just goes to the end of what it found.
