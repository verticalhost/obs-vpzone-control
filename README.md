# VPZONE Control for OBS

A lightweight native OBS plugin that configures OBS for your VPZONE channel, updates the stream title and category, reads and sends chat messages, and displays real-time alerts. It registers three independent docks: **VPZONE Control**, **VPZONE Chat**, and **VPZONE Alerts**.

## Installation

Download `VPZONE-Control-Setup-…-Windows-x64.exe` from [GitHub Releases](https://github.com/verticalhost/obs-vpzone-control/releases), close OBS, and run the installer. Windows asks for administrator access because OBS plugins are installed beside OBS itself. Node.js and Chrome are not required. See the complete [installation guide](docs/INSTALLATION.md).

After installation, open OBS and pick the panels you want from **Docks → VPZONE Control / VPZONE Chat / VPZONE Alerts**. Manual dock creation is no longer required.

Click **Connect with VPZONE** in the dock and approve access. The channel slug is discovered automatically from the signed-in account.

The application uses OAuth 2.1 Authorization Code with PKCE S256 and automatic refresh-token rotation. End users never generate, copy, or paste a token. Maintainers using their own OAuth application can follow the [OAuth configuration guide](docs/OAUTH.md).

The native plugin uses OBS's existing browser engine and a Node SEA background service instead of Electron, so it does not bundle a second browser. The service starts with OBS and stops when OBS closes.

## Streaming setup

The Control dock reads your VPZONE ingest host and stream key and writes them into OBS as a Custom streaming service, so the key is never displayed, copied, or pasted by hand.

Nothing is written until you click **Apply to OBS**, and the plugin refuses to touch the settings while a stream is live. If OBS was configured for another platform, applying replaces that configuration. The same action is available under **Tools → Configure VPZONE streaming**.

This requires the `stream:read` scope introduced in 2.1.0. Accounts that signed in with an earlier version have to sign in again; the dock says so when that is the case.

## OBS alerts

The Alerts dock receives donations/Pixels, subscriptions, gifts, raids, follows, clips, and channel-point rewards in real time, and controls enabled event types, volume, duration, and test alerts.

Add this transparent URL as an OBS **Browser Source**:

`http://127.0.0.1:4876/?overlay=alerts`

## Development

Install Node.js 20 or newer, then run `npm install`.

- `npm run dev` starts Vite on `http://127.0.0.1:5173` and the local API service on port 4876. Each dock has its own route: `/?dock=control`, `/?dock=chat`, `/?dock=alerts`.
- `npm run check` runs ESLint and TypeScript checks.
- `npm run build` builds the frontend.
- `npm run build:windows` creates the embedded Windows x64 service used by the native plugin.
- `npm run test:windows` launches the packaged executable on an isolated port and verifies both the API and embedded interface.

OAuth configuration and tokens are stored locally. Source runs use `data/config.json`; packaged builds use `%APPDATA%\VPZONE Control`. Both locations must remain private. The native plugin registers its docks through the OBS frontend API and does not create Custom Browser Dock entries.

The route that returns the stream key is the one local route requiring authentication: the service generates a token at startup into `runtime.json`, and only the native plugin reads it. The dock web interface never receives the key.

Changing `server/index.js` requires republishing the service executable, because `CMakeLists.txt` downloads it from a GitHub release and pins its SHA256. Run `npm run build:windows`, upload the result, then update both the URL and the hash.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Never publish `data/`, OAuth tokens, client secrets, or `.env` files. The public OAuth Client ID included in this application is not a secret.

## License

Distributed under the [GNU General Public License v2.0 or later](LICENSE), matching the OBS plug-in ecosystem requirements.
