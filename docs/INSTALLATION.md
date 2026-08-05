# Installing VPZONE Control in OBS

VPZONE Control is a native OBS plugin with an embedded dock. It is not a Chrome extension and it does not use OBS's Custom Browser Docks configuration.

## Windows installer

Download `VPZONE-Control-Setup-…-Windows-x64.exe` from the GitHub release **Assets** section. Close OBS, run the installer, approve the Windows administrator prompt, and leave **Launch OBS Studio** selected. The installer:

1. Installs `obs-vpzone-control.dll` in the standard OBS plugin directory.
2. Installs the lightweight VPZONE Control service as plugin data.
3. Removes only the obsolete VPZONE Control Custom Browser Dock created by versions 1.x.
4. Opens OBS when installation finishes.

The plugin starts its local service silently with OBS and stops it when OBS closes. In OBS, select **Docks → VPZONE Control**. No URL needs to be entered manually.

Click **Connect with VPZONE** and approve the requested permissions. VPZONE opens its official sign-in page; the VPZONE password is never entered in VPZONE Control. After approval, VPZONE redirects to `http://localhost:4876/api/auth/callback`.

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
