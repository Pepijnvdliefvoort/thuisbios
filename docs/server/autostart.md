# Start Thuisbios automatically with Windows

## What it does

After this one-time setup, the TV page and the phone app start by themselves when the PC starts,
even before you sign in, and without any windows. Jellyfin and Tailscale already start by
themselves, so after this nothing needs to be opened by hand.

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

## After an update

When there is a new version of the project:

1. Open PowerShell as administrator and go to the project folder (steps 2 and 3 above).
2. Run `git pull`.
3. Run the same setup script again.

It stops the servers, builds the new version and starts them again.

## Keep the PC awake

The PC must stay on, and must not go to sleep, or nothing works. Open **Settings** >
**System** > **Power & battery** > **Screen and sleep** and set **When plugged in, put my device
to sleep after** to **Never**. The screen itself may still turn off.

Restarts for Windows Update are fine: everything comes back by itself. If the PC is shut down,
nothing works until it is switched on again.

## Where to look when something is wrong

- Log files: open File Explorer, click the address bar, type `%USERPROFILE%\.thuisbios\logs` and
  press Enter. `tv.log` belongs to the TV page and `remote.log` to the phone app.
- Task Scheduler: open the Start menu, type `Task Scheduler`, open it and choose **Task Scheduler
  Library** > **Thuisbios**. You see the two tasks there. Right-click a task to run or end it.

## Turn it off

Open PowerShell as administrator, go to the project folder and run:

```powershell
.\server\scripts\Uninstall-ThuisbiosAutostart.ps1
```

Your log files and settings are kept. You can still start the servers by hand with
`npm run preview`.

## Troubleshooting

- **A page does not open.** Wait a minute after starting the PC. Then look at the log file (see
  above). If that does not help, run the setup script again.
- **The setup says `npm ci` failed or a file is in use.** Close any old PowerShell windows that
  run `npm run preview`, then run the setup script again.
- **The volume button stopped working.** The phone app now runs in the background under your own
  Windows account, so your earlier TV setup still applies. Only run `npm run tv:setup -w apps/remote` again if
  the TV's address changed.
