# Use the remote away from home (Tailscale)

With this set up you can open the Thuisbios Remote on your phone anywhere: on mobile data, at a
friend's place, on holiday. It stays private: only your own devices that are signed in to your
Tailscale account can reach it. Nothing on your PC is opened to the internet.

You need: the setup from [setup.md](setup.md) working at home, and Tailscale installed on the PC
(it already is). Tailscale is a free app that links your own devices into one private network.

## 1. One-time settings on the Tailscale website

Why: the phone needs a secure (`https`) address, and Tailscale makes that for you once these two
switches are on.

1. Open <https://login.tailscale.com/admin/dns> and sign in.
2. Check that **MagicDNS** is on. Switch it on if it is not.
3. Under **HTTPS Certificates**, press **Enable HTTPS** and confirm.
4. Open the **Machines** page and check that your PC is listed as `pepijn-pc`. Its full name is
   `pepijn-pc.tail0c4ac1.ts.net`, which this guide uses everywhere.

## 2. Set up the phone

1. Install the **Tailscale** app (App Store or Play Store).
2. Sign in with the same account as on the PC.
3. Leave Tailscale switched on. It uses very little battery.

## 3. Set up the PC

Why: this tells Tailscale to hand out two secure addresses on your PC's name: one for the remote
and one for Jellyfin.

1. Open PowerShell.
2. Run these two commands, one after the other:

   ```powershell
   tailscale serve --bg --https=443 http://localhost:4174
   tailscale serve --bg --https=8920 http://localhost:8096
   ```

3. Run `tailscale serve status` to check. It lists both addresses. The setting is kept after a
   restart of the PC.

To undo everything, run `tailscale serve reset`.

The first visit can take a few seconds, because Tailscale makes the certificate then.

## 4. Keep the PC awake

If the PC sleeps, the remote cannot reach it.

1. Open Windows **Settings > System > Power & battery** (Windows 11).
2. Open **Screen and sleep**.
3. Set **When plugged in, put my device to sleep after** to **Never**. The screen may still turn
   off, that is fine.

Jellyfin runs on its own. The window with `npm run preview -w apps/remote` must stay open, as before.

## 5. Open the remote on the phone

1. On the phone, with Tailscale on, open `https://pepijn-pc.tail0c4ac1.ts.net`.
2. Sign in once with your Jellyfin username and password. The server address is filled in for you
   (`https://pepijn-pc.tail0c4ac1.ts.net:8920`).
3. Add it to the home screen (iPhone: **Share > Add to Home Screen**; Android: menu > **Install
   app**).

Use this address from now on, at home too. At home Tailscale connects straight over your Wi-Fi, so
it is just as fast. The old address `http://192.168.1.192:4174` is a separate copy of the app with
its own sign-in; you can stop using it.

## 6. Make the TV's QR code open the same app

Why: the QR code on the TV should open the app you installed, not the old copy.

1. On the TV, open the TV page with the remote address added:
   `http://192.168.1.192:4173/?remote=https://pepijn-pc.tail0c4ac1.ts.net`
2. Scan the QR code as usual. It now opens the Tailscale address.

The TV itself keeps using the home address; it does not need Tailscale.

## Good to know

- Watching on the phone away from home uses mobile data. A full movie can use several gigabytes.
- Playing on the TV only works when the TV is on at home, whatever your phone does.

## Troubleshooting

- **The page does not open.** Check that Tailscale is switched on in the phone app, and that the PC
  is on and awake with the `npm run preview` window open.
- **"Blocked request. This host is not allowed".** The remote on the PC is still an old version. In
  the project folder run `npm ci`, `npm run build -w apps/remote` and `npm run preview -w apps/remote`
  again.
- **A certificate or "not secure" error.** HTTPS Certificates are not switched on yet: do step 1.3,
  then try again after a minute.
- **The remote opens but cannot sign in or load the library.** Run `tailscale serve status` on the PC
  and check that port 8920 points to `http://localhost:8096`.
