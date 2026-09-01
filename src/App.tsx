import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Channel, ChatEvent, Settings, StreamStatus } from './types'

const isFrench = (navigator.languages?.[0] || navigator.language || 'en').toLowerCase().startsWith('fr')
const locale = isFrench ? 'fr-CA' : 'en-US'
const t = (french: string, english: string) => isFrench ? french : english
document.documentElement.lang = isFrench ? 'fr' : 'en'

const baseTitle = document.title
const applyCommand = 'vpzone:apply-stream'

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(body.error || `${t('Erreur', 'Error')} ${response.status}`), { code: body.code || '' })
  return body
}

type AlertKind = 'pixels' | 'subscription' | 'gift' | 'raid' | 'follow' | 'clip' | 'points'
type AlertItem = { id: string; kind: AlertKind; username: string; title: string; detail: string; ts: number; avatar?: string }
type AlertPrefs = { volume: number; duration: number; enabled: Record<AlertKind, boolean> }
type DockName = 'control' | 'chat' | 'alerts'

const alertLabels: Record<AlertKind, string> = { pixels: t('Dons / Pixels', 'Donations / Pixels'), subscription: t('Abonnements', 'Subscriptions'), gift: t('Cadeaux', 'Gifts'), raid: 'Raids', follow: 'Follows', clip: 'Clips', points: t('Points de chaîne', 'Channel points') }
const defaultPrefs: AlertPrefs = { volume: 70, duration: 6, enabled: { pixels: true, subscription: true, gift: true, raid: true, follow: true, clip: true, points: true } }

const streamMessages: Record<string, string> = {
  streaming_active: t('Arrêtez la diffusion avant de reconfigurer OBS.', 'Stop streaming before reconfiguring OBS.'),
  reauth_required: t('Reconnectez-vous pour autoriser la configuration automatique.', 'Reconnect to enable automatic stream setup.'),
  auth_required: t('Connectez-vous à VPZONE dans le dock Control.', 'Connect to VPZONE in the Control dock.'),
  service_unavailable: t('Le service local VPZONE est introuvable.', 'The local VPZONE service is unavailable.'),
  stream_key_unavailable: t('VPZONE n’a pas fourni de clé de diffusion.', 'VPZONE did not provide a stream key.'),
  service_create_failed: t('OBS a refusé de créer le service de diffusion.', 'OBS refused to create the streaming service.'),
  no_plugin: t('Ouvrez ce panneau depuis le dock VPZONE Control dans OBS.', 'Open this panel from the VPZONE Control dock in OBS.'),
  request_failed: t('Le service local n’a pas répondu.', 'The local service did not respond.'),
  stream_key_unsupported: t('Cette version de VPZONE n’expose pas encore la clé de diffusion.', 'This VPZONE version does not expose the stream key yet.'),
}
const streamMessage = (code: string, fallback = '') => streamMessages[code] || fallback || t('Configuration impossible.', 'Configuration failed.')

function playAlertTone(volume: number) {
  try { const context = new AudioContext(); const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(620, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + .18); gain.gain.setValueAtTime(Math.max(0, volume) / 500, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .45); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .45); oscillator.onended = () => void context.close() } catch { /* audio may be disabled in the browser source */ }
}

function readPrefs(): AlertPrefs {
  try { return { ...defaultPrefs, ...JSON.parse(localStorage.getItem('vpz-alert-prefs') || '{}') } } catch { return defaultPrefs }
}

function eventToAlert(event: ChatEvent): AlertItem | null {
  const meta = event.metadata || {}
  const systemKind = String(meta.kind || '')
  if (event.type === 'system' && systemKind === 'pixels_cheer') return { id: event.id, kind: 'pixels', username: event.username, title: `${Number(meta.amount || 0).toLocaleString(locale)} Pixels`, detail: String(meta.message || event.body), ts: event.ts }
  if (event.type === 'subscription') return { id: event.id, kind: 'subscription', username: event.username, title: t('Nouvel abonnement', 'New subscription'), detail: event.body, ts: event.ts }
  if (event.type === 'gift') return { id: event.id, kind: 'gift', username: event.username, title: t('Abonnement cadeau', 'Gift subscription'), detail: event.body, ts: event.ts }
  if (event.type === 'raid') return { id: event.id, kind: 'raid', username: event.username, title: `Raid${meta.viewer_count ? ` · ${meta.viewer_count} ${t('spectateurs', 'viewers')}` : ''}`, detail: event.body, ts: event.ts }
  if (event.type === 'follow') return { id: event.id, kind: 'follow', username: event.username, title: t('Nouveau follow', 'New follow'), detail: event.body, ts: event.ts }
  if (event.type === 'clip') return { id: event.id, kind: 'clip', username: event.username, title: t('Nouveau clip', 'New clip'), detail: event.body, ts: event.ts }
  if (event.type === 'system' && systemKind.startsWith('channel_points_')) return { id: event.id, kind: 'points', username: event.username, title: t('Récompense de points', 'Points reward'), detail: event.body, ts: event.ts }
  return null
}

/* Each dock is its own CEF browser, so every view opens its own gateway connection.
 * The gateway replays history on connect, so nothing is lost by connecting more than once. */
function useChannelSocket(slug: string, token: string, onEvent: (event: ChatEvent) => void) {
  const [status, setStatus] = useState(t('Connexion…', 'Connecting…'))
  const socket = useRef<WebSocket | null>(null), lastTs = useRef(0), retry = useRef(0), timer = useRef<number | undefined>(undefined)
  const handler = useRef(onEvent)
  useEffect(() => { handler.current = onEvent }, [onEvent])
  const connect = useCallback(() => {
    if (!slug) return
    const params = new URLSearchParams({ channel: slug }); if (token) params.set('token', token); if (lastTs.current) params.set('since', String(lastTs.current))
    const ws = new WebSocket(`wss://chat.vpzone.tv/ws?${params}`); socket.current = ws; setStatus(t('Connexion…', 'Connecting…'))
    ws.onopen = () => { retry.current = 0; setStatus(t('Connecté', 'Connected')) }
    ws.onmessage = ({ data }) => { try { const event = JSON.parse(data) as ChatEvent; lastTs.current = Math.max(lastTs.current, event.ts || 0); handler.current(event) } catch { /* additive frames are ignored safely */ } }
    ws.onclose = e => { setStatus(e.code === 1008 ? t('Accès refusé', 'Access denied') : t('Reconnexion…', 'Reconnecting…')); if (e.code !== 1008) timer.current = window.setTimeout(connect, Math.min(30000, 1000 * 2 ** retry.current++)) }
    ws.onerror = () => ws.close()
  }, [slug, token])
  useEffect(() => { connect(); return () => { window.clearTimeout(timer.current); socket.current?.close(1000) } }, [connect])
  const send = useCallback((frame: object) => { if (socket.current?.readyState !== WebSocket.OPEN) return false; socket.current.send(JSON.stringify(frame)); return true }, [])
  return { status, send }
}

/* Slug and chat token needed by the chat and alerts docks, which have no settings UI. */
function useSession() {
  const [session, setSession] = useState<{ ready: boolean; slug: string; chatToken: string; error: string }>({ ready: false, slug: '', chatToken: '', error: '' })
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const settings = await api<Settings>('/api/settings')
        if (!settings.authenticated) throw new Error(t('Connectez-vous dans le dock VPZONE Control.', 'Sign in from the VPZONE Control dock.'))
        const bootstrap = await api<{ slug: string; chatToken: string }>('/api/bootstrap')
        if (!cancelled) setSession({ ready: true, slug: bootstrap.slug, chatToken: bootstrap.chatToken, error: '' })
      } catch (error) { if (!cancelled) setSession({ ready: false, slug: '', chatToken: '', error: (error as Error).message }) }
    })()
    return () => { cancelled = true }
  }, [])
  return session
}

function Icon({ name }: { name: 'bell' | 'chat' | 'people' | 'send' | 'settings' | 'link' | 'play' | 'cast' }) {
  const paths = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    chat: <path d="M4 5h16v11H8l-4 4V5Z"/>, people: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M15 15c4 0 6 2 6 5"/></>,
    send: <path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14"/>, settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/></>, play: <path d="m8 5 11 7-11 7V5Z"/>,
    cast: <><path d="M3 17a4 4 0 0 1 4 4M3 13a8 8 0 0 1 8 8M3 5h18v10h-6"/><circle cx="3.5" cy="20.5" r="1"/></>,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function SettingsPanel({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const [error, setError] = useState('')
  const save = async (e: FormEvent) => { e.preventDefault(); setError(''); try { await api('/api/settings', { method: 'PUT', body: '{}' }); if (!initial.authenticated) window.location.assign('/api/auth/login'); else onSaved() } catch (err) { setError((err as Error).message) } }
  return <main className="setup"><div className="brand"><b>VPZONE</b> Control</div><div className="setup-mark">VP</div><h1>{t('Connecter votre compte', 'Connect your account')}</h1><p>{t('Gérez votre stream, votre chat et vos alertes depuis OBS.', 'Manage your stream, chat, and alerts from OBS.')}</p><form onSubmit={save}><small className="oauth-help">{t('Connexion sécurisée par VPZONE OAuth. Aucun mot de passe ni clé API n’est demandé.', 'Secure sign-in with VPZONE OAuth. No password or API key is requested.')}</small>{error && <div className="error">{error}</div>}<button className="primary">{initial.authenticated ? t('Retourner au dock', 'Return to dock') : t('Se connecter avec VPZONE', 'Connect with VPZONE')}</button></form></main>
}

function MessageBody({ event }: { event: ChatEvent }) {
  if (!event.emoteMap) return <>{event.body}</>
  return <>{event.body.split(/(\s+)/).map((bit, i) => event.emoteMap?.[bit] ? <img className="emote" src={event.emoteMap[bit]} alt={bit} key={i} /> : bit)}</>
}

function Chat({ slug, token }: { slug: string; token: string }) {
  const [events, setEvents] = useState<ChatEvent[]>([]), [viewers, setViewers] = useState(0)
  const [pinned, setPinned] = useState<ChatEvent | null>(null), [draft, setDraft] = useState(''), [reply, setReply] = useState<ChatEvent | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const receive = useCallback((event: ChatEvent) => {
    if (event.type === 'presence') return setViewers(event.count || 0)
    if (event.type === 'clear_chat') return setEvents([])
    if (event.type === 'delete_message') return setEvents(old => old.filter(x => x.id !== event.metadata?.messageId))
    if (event.type === 'pin_update') return setPinned((event.metadata?.pinned as ChatEvent) || null)
    setEvents(old => old.some(x => x.id === event.id) ? old : [...old.slice(-299), event])
  }, [])
  const { status, send } = useChannelSocket(slug, token, receive)
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }) }, [events])
  const submit = (e: FormEvent) => { e.preventDefault(); const body = draft.trim(); if (!body) return; if (!send({ type: 'msg', body, nonce: crypto.randomUUID(), ...(reply ? { reply_to: reply.id } : {}) })) return; setDraft(''); setReply(null) }
  return <section className="chat workspace"><div className="chat-meta"><span><Icon name="people" />{viewers.toLocaleString(locale)}</span><span className="socket-state"><i className={status === t('Connecté', 'Connected') ? 'online' : ''}/>{status}</span></div>
    {pinned && <div className="pinned"><small>{t('MESSAGE ÉPINGLÉ PAR', 'MESSAGE PINNED BY')} {pinned.username.toUpperCase()}</small><div>{pinned.body}</div></div>}
    <div className="messages" ref={list} aria-live="polite">{events.length === 0 && <div className="empty"><Icon name="chat"/><b>{t('Le chat est prêt', 'Chat is ready')}</b><span>{t('Les nouveaux messages apparaîtront ici.', 'New messages will appear here.')}</span></div>}{events.map(event => <button className={`message ${event.type !== 'msg' ? 'system' : ''}`} key={event.id} onClick={() => event.type === 'msg' && setReply(event)}><time>{new Date(event.ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time><span className="badges">{event.is_owner ? '◆' : event.is_mod ? '◇' : event.is_subscriber ? '★' : ''}</span><strong style={{ color: event.color || undefined }}>{event.username}</strong><span><MessageBody event={event}/></span></button>)}</div>
    {reply && <div className="reply"><span>{t('Réponse à', 'Replying to')} <b>@{reply.username}</b><small>{reply.body.slice(0, 90)}</small></span><button onClick={() => setReply(null)} aria-label={t('Annuler la réponse', 'Cancel reply')}>×</button></div>}
    <form className="composer" onSubmit={submit}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder={t('Écrire un message…', 'Write a message…')} maxLength={500}/><button aria-label={t('Envoyer', 'Send')} disabled={!draft.trim()}><Icon name="send"/></button></form>
  </section>
}

function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  const [prefs, setPrefs] = useState<AlertPrefs>(readPrefs)
  const [copied, setCopied] = useState(false)
  useEffect(() => { localStorage.setItem('vpz-alert-prefs', JSON.stringify(prefs)) }, [prefs])
  const overlayUrl = `${location.origin}/?overlay=alerts`
  const test = () => { playAlertTone(prefs.volume); const channel = new BroadcastChannel('vpzone-alerts'); channel.postMessage({ id: crypto.randomUUID(), kind: 'pixels', username: 'Lordwaffl3', title: '1 000 Pixels', detail: t('Merci pour le stream !', 'Thanks for the stream!'), ts: Date.now() }); channel.close() }
  const copy = async () => { await navigator.clipboard.writeText(overlayUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }
  const setEnabled = (kind: AlertKind, value: boolean) => setPrefs(p => ({ ...p, enabled: { ...p.enabled, [kind]: value } }))
  return <section className="alerts workspace"><div className="alert-settings"><h2>{t('Configuration des alertes', 'Alert settings')}</h2><label>{t('Volume', 'Volume')} <b>{prefs.volume}%</b><input type="range" min="0" max="100" value={prefs.volume} onChange={e => setPrefs(p => ({ ...p, volume: Number(e.target.value) }))}/></label><label>{t('Durée', 'Duration')} <b>{prefs.duration}s</b><input type="range" min="2" max="15" value={prefs.duration} onChange={e => setPrefs(p => ({ ...p, duration: Number(e.target.value) }))}/></label><div className="alert-actions"><button onClick={copy}><Icon name="link"/>{copied ? t('Copié', 'Copied') : 'OBS URL'}</button><button className="accent" onClick={test}><Icon name="play"/>{t('Tester', 'Test')}</button></div></div>
    <div className="alert-history"><h2>{t('Dernières alertes', 'Latest alerts')} <span>{alerts.length}</span></h2>{alerts.length === 0 ? <div className="empty alert-empty"><Icon name="bell"/><b>{t('Aucune alerte récente', 'No recent alerts')}</b><span>{t('Les dons, abonnements et raids apparaîtront ici.', 'Donations, subscriptions, and raids will appear here.')}</span></div> : alerts.map(alert => <article className={`alert-row ${alert.kind}`} key={alert.id}><div className="event-avatar">{alert.username.slice(0,1).toUpperCase()}</div><div><b>{alert.username}</b><strong>{alert.title}</strong>{alert.detail && <small>{alert.detail}</small>}</div><time>{new Date(alert.ts).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit'})}</time></article>)}</div>
    <div className="alert-types"><h2>{t('Types d’alertes actifs', 'Active alert types')}</h2>{(Object.keys(alertLabels) as AlertKind[]).map(kind => <label key={kind}><span>{alertLabels[kind]}</span><input type="checkbox" checked={prefs.enabled[kind]} onChange={e => setEnabled(kind,e.target.checked)}/><i/></label>)}</div>
  </section>
}

/* OBS streaming settings can only be written by the native plugin. The dock asks for it
 * through the document title, which the plugin observes, and the plugin answers with an event. */
function StreamingPanel() {
  const [status, setStatus] = useState<StreamStatus | null>(null)
  const [result, setResult] = useState<{ status: string; code: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)

  useEffect(() => {
    let cancelled = false
    void api<StreamStatus>('/api/stream-status')
      .then(value => { if (!cancelled) setStatus(value) })
      .catch((error: Error & { code?: string }) => { if (!cancelled) setStatus({ available: false, code: error.code, error: error.message }) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const listener = (event: Event) => {
      pending.current = false
      setBusy(false)
      setResult((event as CustomEvent<{ status: string; code: string }>).detail)
    }
    window.addEventListener('vpzone-stream-result', listener)
    return () => window.removeEventListener('vpzone-stream-result', listener)
  }, [])

  const apply = () => {
    setResult(null); setBusy(true); pending.current = true
    /* The title is restored so a second click changes it again and re-triggers the plugin. */
    document.title = applyCommand
    window.setTimeout(() => { document.title = baseTitle }, 300)
    window.setTimeout(() => { if (pending.current) { pending.current = false; setBusy(false); setResult({ status: 'error', code: 'no_plugin' }) } }, 8000)
  }

  if (!status) return <section className="streaming"><h2><Icon name="cast"/>{t('Diffusion', 'Streaming')}</h2><small>{t('Vérification…', 'Checking…')}</small></section>

  return <section className="streaming">
    <h2><Icon name="cast"/>{t('Diffusion', 'Streaming')}</h2>
    {status.available
      ? <><dl className="stream-facts"><div><dt>{t('Serveur', 'Server')}</dt><dd>{status.ingest_host}</dd></div><div><dt>{t('Clé', 'Key')}</dt><dd className="masked">{status.key_masked}</dd></div></dl>
          <button className="primary" onClick={apply} disabled={busy}>{busy ? t('Configuration…', 'Configuring…') : t('Configurer OBS', 'Apply to OBS')}</button>
          <small>{t('Remplace les réglages Diffusion d’OBS par ceux de votre chaîne VPZONE.', 'Replaces the OBS streaming settings with your VPZONE channel.')}</small></>
      : <div className="error">{streamMessage(status.code || '', status.error)}</div>}
    {result && <div className={result.status === 'applied' ? 'notice' : 'error'}>{result.status === 'applied' ? t('OBS est configuré pour VPZONE.', 'OBS is configured for VPZONE.') : streamMessage(result.code)}</div>}
  </section>
}

function AlertOverlay() {
  const [current, setCurrent] = useState<AlertItem | null>(null), queue = useRef<AlertItem[]>([]), busy = useRef(false)
  const [session, setSession] = useState<{ slug: string; chatToken: string }>({ slug: '', chatToken: '' })
  const show = useCallback((alert: AlertItem) => { const prefs = readPrefs(); if (prefs.enabled?.[alert.kind] === false) return; queue.current.push(alert); if (busy.current) return; const next = () => { const item = queue.current.shift(); if (!item) { busy.current = false; setCurrent(null); return } busy.current = true; setCurrent(item); playAlertTone(prefs.volume); window.setTimeout(() => { setCurrent(null); window.setTimeout(next, 450) }, prefs.duration * 1000) }; next() }, [])
  useEffect(() => { const broadcast = new BroadcastChannel('vpzone-alerts'); broadcast.onmessage = e => show(e.data as AlertItem); let stopped = false; void api<{ slug: string; chatToken: string }>('/api/bootstrap').then(b => { if (!stopped) setSession({ slug: b.slug, chatToken: b.chatToken }) }).catch(() => { /* the overlay stays idle until the dock signs in */ }); return () => { stopped = true; broadcast.close() } }, [show])
  const receive = useCallback((event: ChatEvent) => { const alert = eventToAlert(event); if (alert) show(alert) }, [show])
  useChannelSocket(session.slug, session.chatToken, receive)
  return <main className="overlay-stage">{current && <div className={`overlay-alert ${current.kind}`}><div className="overlay-orbit"><div className="overlay-avatar">{current.avatar ? <img src={current.avatar} alt=""/> : current.username.slice(0,1).toUpperCase()}</div></div><strong>{current.username}</strong><h1>{current.title}</h1>{current.detail && <p>{current.detail}</p>}</div>}</main>
}

function ChatDock() {
  const session = useSession()
  if (session.error) return <div className="dock-notice">{session.error}</div>
  if (!session.ready) return <div className="splash">VPZONE</div>
  return <div className="app dock-chat"><Chat slug={session.slug} token={session.chatToken}/></div>
}

function AlertsDock({ preview }: { preview: boolean }) {
  const session = useSession()
  const [alerts, setAlerts] = useState<AlertItem[]>(preview ? [{ id: 'preview-1', kind: 'pixels', username: 'PixelMaster', title: '5 000 Pixels', detail: 'Excellent stream !', ts: Date.now() - 120000 }, { id: 'preview-2', kind: 'subscription', username: 'CyberNinja99', title: t('Nouvel abonnement', 'New subscription'), detail: 'Premier mois !', ts: Date.now() - 300000 }] : [])
  const receive = useCallback((event: ChatEvent) => { const alert = eventToAlert(event); if (alert) setAlerts(old => old.some(x => x.id === alert.id) ? old : [alert, ...old].slice(0, 50)) }, [])
  useChannelSocket(preview ? '' : session.slug, session.chatToken, receive)
  if (!preview && session.error) return <div className="dock-notice">{session.error}</div>
  if (!preview && !session.ready) return <div className="splash">VPZONE</div>
  return <div className="app dock-alerts"><AlertsPanel alerts={alerts}/></div>
}

function ControlDock({ preview }: { preview: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(preview ? { slug: 'lordwaffl3', clientId: '', authenticated: true, profile: { username: 'lordwaffl3', display_name: 'Lordwaffl3' } } : null)
  const [editing, setEditing] = useState(false)
  const [channel, setChannel] = useState<Channel | null>(preview ? { slug: 'lordwaffl3', title: 'On découvre les nouveautés VPZONE !', category: 'Just Chatting', is_live: true, viewer_count: 1240, owner: { username: 'lordwaffl3', display_name: 'Lordwaffl3' } } : null)
  const [categories, setCategories] = useState<Category[]>(preview ? [{ name: 'Just Chatting' }, { name: 'Apex Legends' }] : [])
  const [title, setTitle] = useState(preview ? 'On découvre les nouveautés VPZONE !' : ''), [category, setCategory] = useState(preview ? 'Just Chatting' : '')
  const [notice, setNotice] = useState(''), [loading, setLoading] = useState(false)

  const load = useCallback(async () => { const s = await api<Settings>('/api/settings'); setSettings(s); if (!s.clientId || !s.authenticated) return setEditing(true); try { const b = await api<{ channel: Channel; categories: Category[] }>('/api/bootstrap'); setChannel(b.channel); setCategories(b.categories); setTitle(b.channel.title || ''); setCategory(b.channel.category || ''); setEditing(false) } catch (e) { setNotice((e as Error).message); setEditing(true) } }, [])
  useEffect(() => { if (!preview) void load() }, [load, preview])

  const saveChannel = async (e: FormEvent) => { e.preventDefault(); setLoading(true); setNotice(''); try { const r = await api<{ data: Channel }>('/api/channel', { method: 'PATCH', body: JSON.stringify({ title, category }) }); setChannel(old => ({ ...old, ...r.data } as Channel)); setNotice(t('Stream mis à jour', 'Stream updated')); window.setTimeout(() => setNotice(''), 2500) } catch (err) { setNotice((err as Error).message) } finally { setLoading(false) } }
  const options = useMemo(() => categories.map(c => c.name), [categories])

  if (!settings) return <div className="splash">VPZONE</div>
  if (editing) return <SettingsPanel initial={settings} onSaved={() => void load()}/>
  const owner = channel?.owner, avatar = owner?.avatar_url || settings.profile?.avatar_url
  const displayName = owner?.display_name || owner?.username || settings.profile?.display_name || settings.profile?.username || settings.slug
  return <div className="app dock-control"><header className="top"><div className="brand"><b>VPZONE</b><span>Control</span></div><div className="top-actions"><span className="connected"><i/>{t('CONNECTÉ', 'CONNECTED')}</span><button className="gear" onClick={() => setEditing(true)} aria-label={t('Paramètres', 'Settings')}><Icon name="settings"/></button></div></header>
    <section className="channel"><div className="identity">{avatar ? <img className="avatar" src={avatar} alt={`${t('Avatar de', 'Avatar for')} ${displayName}`}/> : <div className="avatar fallback">{displayName.slice(0,1).toUpperCase()}</div>}<div><b>{displayName}</b><small>/{settings.slug}</small></div></div><span className={channel?.is_live ? 'live' : 'offline'}><i/>{channel?.is_live ? t('EN DIRECT', 'LIVE') : t('HORS LIGNE', 'OFFLINE')}</span></section>
    <form className="editor" onSubmit={saveChannel}><label>{t('Titre du stream', 'Stream title')}<div className="field"><input value={title} onChange={e => setTitle(e.target.value)} maxLength={140} required/><small>{title.length}/140</small></div></label><label>{t('Catégorie', 'Category')}<input list="categories" value={category} onChange={e => setCategory(e.target.value)} maxLength={80} required/><datalist id="categories">{options.map(x => <option key={x} value={x}/>)}</datalist></label><button className="primary" disabled={loading}>{loading ? t('Mise à jour…', 'Updating…') : t('Mettre à jour', 'Update')}</button>{notice && <div className="notice">{notice}</div>}</form>
    <StreamingPanel/>
  </div>
}

export default function App() {
  const params = new URLSearchParams(location.search)
  const preview = params.get('preview') === '1'
  if (params.get('overlay') === 'alerts') return <AlertOverlay/>
  const dock = (params.get('dock') || 'control') as DockName
  if (dock === 'chat') return <ChatDock/>
  if (dock === 'alerts') return <AlertsDock preview={preview}/>
  return <ControlDock preview={preview}/>
}
