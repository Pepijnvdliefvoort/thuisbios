# Scrub preview thumbnails (trickplay)

The phone app shows a small preview frame above the time while you drag the scrub bar. The frames are
Jellyfin's own trickplay images (Jellyfin 10.9 or newer). Jellyfin has to create them first:

1. Open the Jellyfin dashboard, then Libraries, and open each movie and show library.
2. In the library settings, turn on "Enable trickplay image extraction". Optionally also turn on
   "Extract trickplay images during the library scan" so new items get them when they are added.
3. Save, then go to Dashboard, Scheduled Tasks, and run "Generate Trickplay Images" once for the existing
   library. This can take a long time on a big library. Later items are picked up by the same task.

An item without trickplay images simply shows the time while scrubbing, like before.
