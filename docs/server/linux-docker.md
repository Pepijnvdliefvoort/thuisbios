# Run Thuisbios on a Linux home server (Docker)

## What it does

The TV page (port 4173) and the phone app (port 4174) run as two Docker containers on a Linux
server, next to a Jellyfin that is installed natively on the same machine (port 8096). Both apps
find Jellyfin on the same host, so nothing has to be configured in the apps.

New releases arrive by themselves:

1. A release PR is merged into `main` and release-please creates the `vX.Y.Z` tag and release.
2. The `docker` job in `release-please.yml` builds the image and pushes it to GitHub Container
   Registry as `ghcr.io/pepijnvdliefvoort/thuisbios:vX.Y.Z` and `:latest`.
3. On the server, a systemd timer runs `docker compose pull` and `docker compose up -d` every 30
   minutes. The containers are only recreated when the image changed, which takes a few seconds.
   A movie that is already playing keeps playing, because the video comes from Jellyfin.

Nothing is built on the server. A release that does not build never reaches it, because the image
is only pushed after the build worked. Like the Windows update task, it follows releases, not
`develop`.

The files are in [`server/linux`](../../server/linux): `compose.yaml`, `thuisbios-update.service`
and `thuisbios-update.timer`. The commands below assume the login user is `polm` (uid 1000) and the
server is `192.168.1.127`; change them if yours differ.

## One-time setup

### 1. Jellyfin

Jellyfin must run on the server with your media, users and (optionally) the Intro Skipper plugin
([intro-skipper.md](intro-skipper.md)). For hardware transcoding on an AMD APU, open Jellyfin's
**Dashboard** > **Playback** > **Transcoding**, choose **Video Acceleration API (VAAPI)** with device
`/dev/dri/renderD128`, and add the Jellyfin user to the `render` group:

```bash
sudo usermod -aG render jellyfin
sudo systemctl restart jellyfin
```

### 2. Docker

Install Docker Engine with the compose plugin from Docker's own repository (see the
[Docker documentation](https://docs.docker.com/engine/install/ubuntu/)). On Linux Mint the Ubuntu
codename comes from `/etc/upstream-release/lsb-release`; on plain Ubuntu use `/etc/os-release` and
`$VERSION_CODENAME` instead:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/upstream-release/lsb-release && echo "$DISTRIB_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker polm   # log out and in again afterwards
```

After logging in again, `docker compose version` prints a version number.

### 3. Thuisbios

```bash
mkdir -p ~/.thuisbios                 # settings; must exist before the first start
sudo mkdir -p /opt/thuisbios
sudo curl -fsSL -o /opt/thuisbios/compose.yaml \
  https://raw.githubusercontent.com/Pepijnvdliefvoort/thuisbios/main/server/linux/compose.yaml
cd /opt/thuisbios
docker compose up -d
docker compose ps
```

Open `http://192.168.1.127:4174` on the phone and `http://192.168.1.127:4173` in the TV browser. If
the firewall is on (`sudo ufw status`), open the ports first:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 4173,4174 proto tcp
```

The image on GHCR must be public, so the server can pull it without signing in. After the first
release with this image, open the repository on GitHub > **Packages** > **thuisbios** > **Package
settings** and set the visibility to **Public** (once).

### 4. Pair the TV and save the Jellyfin API key

Both commands run inside the phone app's container and write to `~/.thuisbios`:

```bash
cd /opt/thuisbios
docker compose run --rm remote npm run tv:setup -w apps/remote -- 192.168.1.156
docker compose run --rm remote npm run jellyfin:setup -w apps/remote
docker compose restart remote
```

Use the TV's own address. Accept the pairing prompt on the TV.

### 5. Automatic updates

```bash
sudo curl -fsSL -o /etc/systemd/system/thuisbios-update.service \
  https://raw.githubusercontent.com/Pepijnvdliefvoort/thuisbios/main/server/linux/thuisbios-update.service
sudo curl -fsSL -o /etc/systemd/system/thuisbios-update.timer \
  https://raw.githubusercontent.com/Pepijnvdliefvoort/thuisbios/main/server/linux/thuisbios-update.timer
sudo systemctl daemon-reload
sudo systemctl enable --now thuisbios-update.timer
systemctl list-timers thuisbios-update.timer
```

### 6. Turn off the Windows PC setup

When everything works on the server, run `.\server\scripts\Uninstall-ThuisbiosAutostart.ps1` on the
PC (see [autostart.md](autostart.md)), so the PC no longer runs its own copy. Update the TV bookmark
and add the phone app to the home screen again from the server's address.

## Everyday use

| What | Command (in `/opt/thuisbios`) |
|---|---|
| Update right now | `sudo systemctl start thuisbios-update.service` |
| Which version runs | `docker compose images` |
| Logs | `docker compose logs -f remote` (or `tv`); updates: `journalctl -u thuisbios-update` |
| Restart | `docker compose restart` |
| Stop | `docker compose down` |

## Go back to an older release

Replace `latest` with the version you want (for example `v0.11.1`) in both `image:` lines of
`/opt/thuisbios/compose.yaml`, then run `docker compose up -d`. The update timer keeps that version
until you change it back to `latest`.

## Troubleshooting

- **The phone app cannot sign in.** Check that Jellyfin answers on the server: `curl http://localhost:8096/health`.
- **`docker compose pull` says `denied` or `unauthorized`.** The package on GHCR is still private, see step 3.
- **The volume button does not work.** Pair the TV again (step 4) and check `docker compose logs remote`.
- **Settings are not saved.** `~/.thuisbios` must exist and belong to `polm` (uid 1000) before the first start. Fix it with `sudo chown -R 1000:1000 ~/.thuisbios`.
