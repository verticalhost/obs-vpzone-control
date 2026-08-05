import express from 'express'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { isSea } from 'node:sea'

const packaged = isSea()
const root = packaged ? path.dirname(process.execPath) : path.resolve(process.env.VPZONE_APP_ROOT || process.cwd())
const dataDir = packaged
  ? path.join(process.env.APPDATA || root, 'VPZONE Control')
  : path.join(root, 'data')
const configFile = path.join(dataDir, 'config.json')
const port = Number(process.env.PORT || 4876)
const VPZONE_API = 'https://vpzone.tv/api/v1'
const OAUTH_TOKEN_URL = 'https://vpzone.tv/api/oauth/token'
const OAUTH_AUTHORIZE_URL = 'https://vpzone.tv/oauth/authorize'
const REDIRECT_URI = `http://localhost:${port}/api/auth/callback`
const SCOPES = 'profile:read channel:write chat:read chat:write'
const DEFAULT_CLIENT_ID = '0f556d63-08c1-4c79-9e56-e2b0e01710ab'

async function readConfig() {
  try { return JSON.parse(await fs.readFile(configFile, 'utf8')) } catch { return {} }
}

async function writeConfig(config) {
  await fs.mkdir(dataDir, { recursive: true })
  await fs.writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600 })
}

function clean(value, max = 200) { return typeof value === 'string' ? value.trim().slice(0, max) : '' }
function configuredClientId(c) { return c.clientId || process.env.VPZONE_CLIENT_ID || DEFAULT_CLIENT_ID }
function publicConfig(c) { return { slug: c.slug || '', clientId: configuredClientId(c), authenticated: Boolean(c.accessToken || c.refreshToken), profile: c.profile || null } }

function base64url(value) { return value.toString('base64url') }

async function exchangeToken(fields) {
  const config = await readConfig()
  const response = await fetch(OAUTH_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: configuredClientId(config), ...fields }) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(payload?.error_description || payload?.error || 'Échange OAuth refusé.'), { status: response.status })
  return payload
}

async function accessToken() {
  const config = await readConfig()
  if (config.accessToken && Number(config.expiresAt) > Date.now() + 60_000) return config.accessToken
  if (!config.refreshToken) throw Object.assign(new Error('Connexion VPZONE requise.'), { status: 401 })
  try {
    const tokens = await exchangeToken({ grant_type: 'refresh_token', refresh_token: config.refreshToken })
    const next = { ...config, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000, scope: tokens.scope }
    await writeConfig(next)
    return next.accessToken
  } catch (error) {
    await writeConfig({ ...config, accessToken: '', refreshToken: '', expiresAt: 0, profile: null })
    throw error
  }
}

async function vpz(pathname, init = {}) {
  const token = await accessToken()
  const response = await fetch(`${VPZONE_API}${pathname}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } })
  const payload = await response.json().catch(() => ({ error: 'Réponse VPZONE illisible.' }))
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || payload?.message || `Erreur VPZONE (${response.status})`), { status: response.status, payload })
  return payload
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '32kb' }))

app.get('/api/settings', async (_req, res) => res.json(publicConfig(await readConfig())))
app.put('/api/settings', async (req, res) => {
  const current = await readConfig()
  const next = {
    ...current,
    clientId: clean(req.body.clientId, 100) || configuredClientId(current),
  }
  if (!next.clientId) return res.status(400).json({ error: 'Le client ID OAuth est requis.' })
  await writeConfig(next)
  res.json(publicConfig(next))
})
app.get('/api/auth/login', async (_req, res) => {
  const config = await readConfig()
  const clientId = configuredClientId(config)
  if (!clientId) return res.redirect('/?auth_error=client_id_missing')
  const state = base64url(crypto.randomBytes(24)), verifier = base64url(crypto.randomBytes(48)), challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  await writeConfig({ ...config, oauthPending: { state, verifier, createdAt: Date.now() } })
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT_URI, scope: SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256' })
  res.redirect(`${OAUTH_AUTHORIZE_URL}?${params}`)
})
app.get('/api/auth/callback', async (req, res) => {
  try {
    const config = await readConfig(), pending = config.oauthPending
    if (!pending || pending.state !== req.query.state || Date.now() - pending.createdAt > 10 * 60_000) throw new Error('État OAuth expiré ou invalide.')
    if (!req.query.code) throw new Error(clean(req.query.error_description || req.query.error, 300) || 'Autorisation refusée.')
    const tokens = await exchangeToken({ grant_type: 'authorization_code', code: String(req.query.code), redirect_uri: REDIRECT_URI, code_verifier: pending.verifier })
    const next = { ...config, oauthPending: undefined, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000, scope: tokens.scope }
    await writeConfig(next)
    const me = await vpz('/me')
    const profile = me.data?.profile || null
    const user = profile?.username ? await vpz(`/users/${encodeURIComponent(profile.username)}`) : null
    const slug = user?.data?.channel?.slug || ''
    await writeConfig({ ...next, profile, slug })
    res.redirect('/?auth=success')
  } catch (error) { res.redirect(`/?auth_error=${encodeURIComponent(error.message)}`) }
})
app.post('/api/auth/logout', async (_req, res) => { const config = await readConfig(); await writeConfig({ ...config, accessToken: '', refreshToken: '', expiresAt: 0, profile: null }); res.json({ ok: true }) })
app.get('/api/bootstrap', async (_req, res, next) => {
  try {
    const config = await readConfig()
    if (!config.slug) return res.status(400).json({ error: 'Aucune chaîne VPZONE n’est associée à ce compte.' })
    const [channel, categories] = await Promise.all([vpz(`/channels/${encodeURIComponent(config.slug)}`), vpz('/categories?limit=100')])
    res.json({ channel: channel.data, categories: categories.data || [], slug: config.slug, chatToken: await accessToken(), chatTokenType: 'token' })
  } catch (error) { next(error) }
})
app.patch('/api/channel', async (req, res, next) => {
  try {
    const config = await readConfig()
    const title = clean(req.body.title, 140), category = clean(req.body.category, 80)
    if (!title || !category) return res.status(400).json({ error: 'Le titre et la catégorie sont requis.' })
    const payload = await vpz(`/channels/${encodeURIComponent(config.slug)}`, { method: 'PATCH', body: JSON.stringify({ title, category }) })
    res.json(payload)
  } catch (error) { next(error) }
})
app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message, details: error.payload }))
app.use(express.static(path.join(root, 'dist')))
app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')))
app.listen(port, '127.0.0.1', () => console.log(`VPZONE Control: http://127.0.0.1:${port}`))
