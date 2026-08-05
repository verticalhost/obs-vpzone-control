# Installing VPZONE Control in OBS

VPZONE Control is a local web application displayed inside an OBS browser dock. It is not a Chrome extension.

## Windows portable build

In the GitHub release **Assets** section, download `VPZONE-Control.exe` or the archive named `VPZONE-Control-v…-Windows-x64.zip`. Do not download GitHub's automatic **Source code** archives.

Run `VPZONE-Control.exe` and leave its console window open while using OBS. The executable contains the server, interface, and Node runtime. Chrome, Electron, and a separate Node.js installation are not required.

1. Open **Docks → Custom Browser Docks** in OBS.
2. Add a dock named `VPZONE Control`.
3. Enter `http://127.0.0.1:4876` as its URL.
4. Click **Connect with VPZONE** and approve the requested permissions.

VPZONE opens its official sign-in page. The VPZONE password is never entered in VPZONE Control. After approval, VPZONE redirects to `http://localhost:4876/api/auth/callback`.

## OAuth tokens

End users must not create, copy, or paste tokens. The sign-in button uses OAuth 2.1 with PKCE to obtain a temporary access token and rotate the refresh token automatically.

The packaged build stores its session in `%APPDATA%\VPZONE Control`. Treat this directory as sensitive and never share it.

## Alerts in an OBS scene

Add a transparent **Browser Source** using `http://127.0.0.1:4876/?overlay=alerts`.

## Source installation

1. Install Node.js 20 or newer.
2. Clone or download the repository.
3. Run `npm install` and `npm run build`.
4. Start the service with `npm start`.

The source build stores its local session in `data/config.json`, which is excluded from Git.
