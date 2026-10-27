# Start Thuisbios automatically with Windows

## What it does

After this one-time setup, the TV page and the phone app start by themselves when the PC starts,
even before you sign in, and without any windows. Jellyfin and Tailscale already start by
themselves, so after this nothing needs to be opened by hand. The same setup also keeps the
project up to date by itself (see [Automatic updates](#automatic-updates)).

It uses Task Scheduler, which is part of Windows. No extra software is needed.

## One-time setup

1. Close any open PowerShell windows that run `npm run preview`.
2. Open PowerShell as administrator: open the Start menu, type `PowerShell`, right-click it and
   choose **Run as administrator**.
3. Go to the project folder:

   ```powershell
   cd C:\Users\pepij\Documents\Repos\thuisbios
   ```

4. Run the setup script:

   ```powershell
   .\server\scripts\Install-ThuisbiosAutostart.ps1
   ```

   If Windows says running scripts is disabled, run this instead:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\server\scripts\Install-ThuisbiosAutostart.ps1
   ```

The first time it takes a few minutes, because it installs and builds everything. At the end it
shows the addresses of the TV page and the phone app.

## Check that it works

Open the TV page on the TV and the phone app on your phone, as usual. To be sure it also works
after a restart, restart the PC, wait a minute or two without signing in, and try again.

## Automatic updates

The setup also adds a third task, **Update**. A few minutes after the PC starts, and then every
hour, it checks GitHub for a new release of Thuisbios. Most of the time there is nothing new and
nothing happens. When there is a new release, it:

1. downloads it and builds it,
2. restarts the TV page and the phone app.

This takes a few minutes. During that time the TV page and the phone app cannot be opened. A
movie that is already playing keeps playing, because the video comes from Jellyfin and not from
these two pages.

If the update fails, it goes back to the previous version by itself, starts the pages again and
writes what went wrong in the log.

It follows the **releases**, the stable versions, and not the work in progress on `develop`. In
git the project folder will therefore say `HEAD detached at vX.Y.Z`. That is normal.

To turn this on, run the setup script once more (see
[One-time setup](#one-time-setup)). It needs Git for Windows, which is already installed if you
cloned the project with git. The setup tells you if it is missing. It also looks for a new release
right away.

### Update right now

Open the Start menu, type `Task Scheduler`, open it, choose **Task Scheduler Library** >
**Thuisbios**, right-click **Update** and choose **Run**. Or open PowerShell as administrator, go
to the project folder and run:

```powershell
.\server\scripts\Update-Thuisbios.ps1
```

The script writes what it does to `update.log` (see below).

### Turn off automatic updates

Run the setup script again with `-NoAutoUpdate`. This removes the Update task:

```powershell
.\server\scripts\Install-ThuisbiosAutostart.ps1 -NoAutoUpdate
```

### Update by hand

If you prefer to do it yourself (or the Update task is off):

1. Open PowerShell as administrator and go to the project folder (steps 2 and 3 above).
2. Run `git fetch --tags` and then `git checkout vX.Y.Z`, with the number of the release you want.
3. Run the setup script again. It stops the servers, builds that version and starts them again.

## Keep the PC awake

The PC must stay on, and must not go to sleep, or nothing works. Open **Settings** >
**System** > **Power & battery** > **Screen and sleep** and set **When plugged in, put my device
to sleep after** to **Never**. The screen itself may still turn off.

Restarts for Windows Update are fine: everything comes back by itself. If the PC is shut down,
nothing works until it is switched on again.

## Where to look when something is wrong

- Log files: open File Explorer, click the address bar, type `%USERPROFILE%\.thuisbios\logs` and
  press Enter. `tv.log` belongs to the TV page, `remote.log` to the phone app and `update.log`
  to the automatic updates.
- Task Scheduler: open the Start menu, type `Task Scheduler`, open it and choose **Task Scheduler
  Library** > **Thuisbios**. You see the three tasks there (TV page, Phone app and Update). Right-click a task to run or end it.

## Turn it off

Open PowerShell as administrator, go to the project folder and run:

```powershell
.\server\scripts\Uninstall-ThuisbiosAutostart.ps1
```

This also removes the Update task. Your log files and settings are kept. You can still start the servers by hand with
`npm run preview`.

## Troubleshooting

- **A page does not open.** Wait a minute after starting the PC. Then look at the log file (see
  above). If that does not help, run the setup script again.
- **The setup says `npm ci` failed or a file is in use.** Close any old PowerShell windows that
  run `npm run preview`, then run the setup script again.
- **The volume button stopped working.** The phone app now runs in the background under your own
  Windows account, so your earlier TV setup still applies. Only run `npm run tv:setup -w apps/remote` again if
  the TV's address changed.
- **The update does not happen.** Open `update.log` and read the last lines. `Could not reach
  GitHub` means there is no internet right now; it tries again an hour later.
- **`update.log` says there are local changes.** Something in the project folder was edited by
  hand, and the update will not overwrite it. Open PowerShell in the project folder and run
  `git checkout -- .` to undo those changes. The next check then updates normally.
- **`update.log` says it went back to the previous version.** The new release did not build.
  Everything keeps working on the old version. Tell the developer, with the last lines of
  `update.log`.
- **There is no Update task in Task Scheduler.** Run the setup script again (without
  `-NoAutoUpdate`).
