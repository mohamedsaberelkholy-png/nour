# Nour Local

Nour is a local-first personal assistant MVP with a polished browser portal, persistent memory, reminders, system and file tools, guarded command execution, voice-input readiness, and an LLM connection dashboard.

## Run

Requires Node.js 20 or later (no package installation is needed).

```powershell
cd jarvis-local
node server/index.js
```

Open `http://127.0.0.1:4111` in a browser. The service deliberately listens only on localhost; it is not exposed to your network.

### Access from a phone browser

To use Nour from a phone on the same Wi-Fi network, start it with a LAN binding from PowerShell:

```powershell
$env:NOUR_BIND_HOST='0.0.0.0'
node server/index.js
```

Find the desktop computer's IPv4 address with `ipconfig`, then open `http://DESKTOP_IP:4111` on the phone. If Windows Firewall asks, allow Node.js on your private network. Nour no longer uses pairing codes. For different networks, use a private VPN such as Tailscale or a properly secured HTTPS reverse proxy; do not expose the unauthenticated service directly to the public internet. Stop the LAN-bound process and restart Nour normally to return to localhost-only access.

## Desktop and Android app

Nour is now an installable Progressive Web App. On desktop Chrome or Edge, visit the local address and choose **Install Nour** (or use the browser’s install icon in the address bar). It opens in its own app window and caches the interface for offline use.

On Android, open Nour from a browser on the device and choose **Install app** / **Add to Home Screen**. A local-only assistant must have its companion server on the same device; its current default binding deliberately prevents a phone from reaching your computer over the network. This preserves the safety boundary. To make a true Android APK with on-device tooling, install an Android build toolchain and add a native service/runtime; none is present on this machine, so no trustworthy APK can be compiled here yet.

### Native Android client

The `android/` directory contains a native Java Android client for the structured Nour API. It is intentionally a client, not a WebView: chat, tasks, reminders, approvals, connection status, service URL settings, and first-run setup use native Android views and HTTP calls. Android does not permit silent installation of arbitrary apps or APKs, so setup requests notification permission through the system and verifies the Nour service instead of bypassing Android controls. Build it with Android Studio or Gradle after installing Android SDK 35 and JDK 17:

```powershell
cd android
gradlew assembleDebug
```

The emulator default is `http://10.0.2.2:4111`. A physical phone needs an explicitly reachable Nour host and corresponding service configuration; the default Nour server remains localhost-only by design. The native client does not claim computer-control access unless it can reach that local service.

## What works

- **Command Center**: conversational commands and an approachable interface.
- **Memory**: say `remember I prefer dark mode`; memory persists in `data/nour.json`.
- **System information**: ask “show system status.”
- **File search**: ask “find file package”; search is bounded to the app workspace by default.
- **Reminders**: say `remind me to stretch at 2026-10-01 09:00`; due reminders update whenever the portal polls or is refreshed.
- **Commands**: use `run: Get-ChildItem`. Potentially destructive actions require an explicit browser confirmation before execution.
- **Voice-ready interface**: the microphone control uses the browser Web Speech API when it is available.
- **LLM dashboard**: configure an OpenAI-compatible base URL, model, and optional key. General conversation falls back to the configured model after local intent handling. Compatible local inference servers work too.

## Safety model

Nour is local-only (bound to `127.0.0.1`). The tool layer handles local actions; the LLM cannot trigger tools through its response. Destructive command patterns are held for human confirmation. The LLM key is saved only in local `data/nour.json` and is redacted from every browser API response. Treat that file as sensitive and do not commit it. This MVP uses local JSON storage; production should use the operating-system credential vault.

## Architecture

```
public/            Browser portal (single-page UI)
server/index.js    Local HTTP API and static-file server
server/assistant   Local intent router and optional LLM fallback
server/tools       System info, scoped search, and command approval boundary
server/llm         OpenAI-compatible connection adapter
server/store       Persistent JSON memory, reminders, and activity log
test/              Node built-in test suite
```

Add capabilities by implementing narrowly scoped functions in `server/tools.js`, exposing only intentional assistant intents, and keeping irreversible changes behind an approval flow.

## Test

```powershell
node --test
```

## Render deployment

The repository includes `render.yaml` for a Node web service. In Render, create a Blueprint from this repository, set `NOUR_AUTH_PASSWORD` to your private Nour password, and deploy. Render supplies `PORT`; the Blueprint binds Nour to `0.0.0.0` and generates `NOUR_CREDENTIAL_KEY` for encrypted credentials. Open the resulting HTTPS `onrender.com` URL on the phone and enter the same password when Nour asks.

The free Render plan has ephemeral storage, so local memories, tasks, and uploaded data can be lost during a redeploy or restart. Attach a persistent disk on a paid web service and mount it at `/opt/render/project/src/data` if durable local storage is required.

To keep the hosted assistant out of fallback mode, set `NOUR_LLM_PROVIDER`, `NOUR_LLM_BASE_URL`, `NOUR_LLM_MODEL`, and `NOUR_LLM_API_KEY` in Render. The API key is read as a secret environment variable and is never committed to the repository.
