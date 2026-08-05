# VPZONE Control for OBS

A lightweight local OBS browser dock for updating a VPZONE channel title and category, reading and sending chat messages, and displaying real-time alerts.

## Installation

Download `VPZONE-Control-Setup-…-Windows-x64.exe` from [GitHub Releases](https://github.com/verticalhost/obs-vpzone-control/releases) and run it while OBS is closed. The installer registers the dock, starts the lightweight local service, and can launch OBS. Node.js and Chrome are not required. See the complete [installation guide](docs/INSTALLATION.md).

After installation, open OBS and select **Docks → VPZONE Control**. Manual dock creation is no longer required.

Click **Connect with VPZONE** in the dock and approve access. The channel slug is discovered automatically from the signed-in account.

The application uses OAuth 2.1 Authorization Code with PKCE S256 and automatic refresh-token rotation. End users never generate, copy, or paste a token. Maintainers using their own OAuth application can follow the [OAuth configuration guide](docs/OAUTH.md).

The Windows build uses Node SEA instead of Electron, so it does not bundle a second browser. The v1.0.1 startup test used approximately 47 MB of RAM and 0.14 seconds of CPU time; idle usage remains minimal.

## OBS alerts

The dock receives donations/Pixels, subscriptions, gifts, raids, follows, clips, and channel-point rewards in real time. The **Alerts** tab controls enabled event types, volume, duration, and test alerts.

Add this transparent URL as an OBS **Browser Source**:

`http://127.0.0.1:4876/?overlay=alerts`

## Development

Install Node.js 20 or newer, then run `npm install`.

- `npm run dev` starts Vite on `http://127.0.0.1:5173` and the local API service on port 4876.
- `npm run check` runs ESLint and TypeScript checks.
- `npm run build` builds the frontend.
- `npm run build:windows` creates the Windows x64 executable and ZIP archive.
- `npm run test:windows` launches the packaged executable on an isolated port and verifies both the API and embedded interface.

OAuth configuration and tokens are stored locally. Source runs use `data/config.json`; packaged builds use `%APPDATA%\VPZONE Control`. Both locations must remain private. The Windows installer registers the OBS dock in the current OBS user configuration (`user.ini` on OBS 32+).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Never publish `data/`, OAuth tokens, client secrets, or `.env` files. The public OAuth Client ID included in this application is not a secret.

## License

Distributed under the [GNU General Public License v2.0 or later](LICENSE), matching the OBS plug-in ecosystem requirements.
