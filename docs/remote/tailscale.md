# Use Thuisbios away from home (Tailscale)

With this set up you can open the Thuisbios on your phone anywhere: on mobile data, at a
friend's place, on holiday. It stays private: only your own devices that are signed in to your
Tailscale account can reach it. Nothing on your server is opened to the internet.

You need: the Linux home server from [linux-docker.md](../server/linux-docker.md) working at home
(Jellyfin on port 8096, the phone app on port 4174 and the TV page on port 4173). Tailscale is a
free app that links your own devices into one private network.

Throughout this guide, `<server>` is the name of your server in Tailscale and `<tailnet>` is the
name of your Tailscale network, so the full address is `<server>.<tailnet>.ts.net`. You find your
own values on the **Machines** page of the Tailscale admin console
(<https://login.tailscale.com/admin/machines>), or by running `tailscale status` on the server.

The old Windows PC setup works the same way: install Tailscale for Windows and run the same
`tailscale serve` commands in PowerShell (without `sudo`).

## 1. One-time settings on the Tailscale website

Why: the phone needs a secure (`https`) address, and Tailscale makes that for you once these two
switches are on.

1. Open <https://login.tailscale.com/admin/dns> and sign in.
2. Check that **MagicDNS** is on. Switch it on if it is not.
3. Under **HTTPS Certificates**, press **Enable HTTPS** and confirm.
4. Open the **Machines** page and check that your server is listed. Note its name and the
   tailnet name, which together make `<server>.<tailnet>.ts.net`.

## 2. Install Tailscale on the server

On the Linux server, run:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

`tailscale up` prints a link. Open it in a browser and sign in with your Tailscale account. Then
run `tailscale status` to check that the server is listed.

## 3. Set up the phone

1. Install the **Tailscale** app (App Store or Play Store).
2. Sign in with the same account as on the server.
3. Leave Tailscale switched on. It uses very little battery.

## 4. Share the app and Jellyfin over Tailscale

Why: this tells Tailscale to hand out two secure addresses on your server's name: one for the app
and one for Jellyfin.

1. On the server, run these two commands, one after the other:

   ```bash
   sudo tailscale serve --bg --https=443 http://localhost:4174
   sudo tailscale serve --bg --https=8920 http://localhost:8096
   ```

2. Run `tailscale serve status` to check. It lists both addresses. The setting is kept after a
   restart of the server.

To undo everything, run `sudo tailscale serve reset`.

The first visit can take a few seconds, because Tailscale makes the certificate then.

## 5. Keep the server running

If the server sleeps, Thuisbios cannot reach it. A home server normally stays on; if yours
suspends, turn that off in its power settings. Jellyfin and the Docker containers start by
themselves and update through the timer described in [linux-docker.md](../server/linux-docker.md).

## 6. Open Thuisbios on the phone

1. On the phone, with Tailscale on, open `https://<server>.<tailnet>.ts.net`.
2. Sign in once with your Jellyfin username and password. The server address is filled in for you
   (`https://<server>.<tailnet>.ts.net:8920`).
3. Add it to the home screen (iPhone: **Share > Add to Home Screen**; Android: menu > **Install
   app**).

Use this address from now on, at home too. At home Tailscale connects straight over your Wi-Fi, so
it is just as fast. The plain home address `http://<server-ip>:4174` is a separate copy of the app
with its own sign-in; you can stop using it.

## 7. Make the TV's QR code open the same app

Why: the QR code on the TV should open the app you installed, not the plain home copy.

1. On the TV, open the TV page with the remote address added:
   `http://<server-ip>:4173/?remote=https://<server>.<tailnet>.ts.net`
2. Scan the QR code as usual. It now opens the Tailscale address.

The TV itself keeps using the home address; it does not need Tailscale.

## Good to know

- Watching on the phone away from home uses mobile data. A full movie can use several gigabytes.
- Playing on the TV only works when the TV is on at home, whatever your phone does.

## Troubleshooting

- **The page does not open.** Check that Tailscale is switched on in the phone app, and that the
  server is on. On the server, run `docker compose ps` in `/opt/thuisbios` and check that the
  `remote` container is running.
- **"Blocked request. This host is not allowed".** Thuisbios on the server is still an old version.
  Update it with `sudo systemctl start thuisbios-update.service`, then try again.
- **A certificate or "not secure" error.** HTTPS Certificates are not switched on yet: do step 1.3,
  then try again after a minute.
- **Thuisbios opens but cannot sign in or load the library.** Run `tailscale serve status` on the
  server and check that port 8920 points to `http://localhost:8096`.
