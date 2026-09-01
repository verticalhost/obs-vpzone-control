# VPZONE OAuth configuration

## End users

No token is generated manually. Click **Connect with VPZONE**, sign in on VPZONE, and approve access. VPZONE Control exchanges the authorization code and refreshes tokens in the background.

## Maintainers and forks

One public OAuth application can serve every user of a distributed VPZONE Control build. Each user signs in with their own account while using the same public application identifier.

Create an OAuth application in the VPZONE developer portal with these settings:

- Client type: public application without a client secret.
- Flow: Authorization Code with PKCE S256.
- Exact redirect URL: `http://localhost:4876/api/auth/callback`.
- Scopes: `profile:read channel:write chat:read chat:write stream:read`.

Copy only the public **Client ID**. To use another Client ID without modifying source code, set `VPZONE_CLIENT_ID` before starting the application:

```powershell
$env:VPZONE_CLIENT_ID = "your-public-client-id"
npm start
```

The project does not require a `client_secret`. Never include a secret in JavaScript, GitHub, or a public Windows executable.

If the `PORT` environment variable changes the local port, the redirect URL registered with VPZONE must use the exact same port.

## Sign-in lifecycle

1. The local server generates a state value, PKCE verifier, and S256 challenge.
2. The browser redirects to VPZONE's authorization page.
3. VPZONE returns a temporary code to the local callback.
4. The server exchanges the code and verifier for an access token and refresh token.
5. Refresh-token rotation occurs automatically when needed.

Tokens are stored in `data/config.json` for source builds and `%APPDATA%\VPZONE Control` for packaged builds. Both locations are excluded from Git and must remain private.

## Stream key access

The `stream:read` scope is what lets the dock configure the OBS streaming settings. It was added in 2.1.0, so accounts that signed in with an earlier version must sign in again before **Apply to OBS** works. The dock says so when that is the case.

Alongside the tokens, the service writes `runtime.json`, holding a random token regenerated on every start. Only the native plugin reads that file, and it authorises the single local route that returns the stream key. The key never reaches the dock web interface, which sees only a masked value and the ingest host.

`VPZONE_API` points the service at a different API base. It exists for testing against a staging deployment and should be left unset in production.
