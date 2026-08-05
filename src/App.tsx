import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Category, Channel, ChatEvent, Settings } from './types'

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Erreur ${response.status}`)
  return body
}

type AlertKind = 'pixels' | 'subscription' | 'gift' | 'raid' | 'follow' | 'clip' | 'points'
type AlertItem = { id: string; kind: AlertKind; username: string; title: string; detail: string; ts: number; avatar?: string }
type AlertPrefs = { volume: number; duration: number; enabled: Record<AlertKind, boolean> }

const alertLabels: Record<AlertKind, string> = { pixels: 'Dons / Pixels', subscription: 'Abonnements', gift: 'Cadeaux', raid: 'Raids', follow: 'Follows', clip: 'Clips', points: 'Points de chaîne' }
const defaultPrefs: AlertPrefs = { volume: 70, duration: 6, enabled: { pixels: true, subscription: true, gift: true, raid: true, follow: true, clip: true, points: true } }

function playAlertTone(volume: number) {
  try { const context = new AudioContext(); const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(620, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + .18); gain.gain.setValueAtTime(Math.max(0, volume) / 500, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .45); oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .45); oscillator.onended = () => void context.close() } catch { /* audio may be disabled in the browser source */ }
}

function eventToAlert(event: ChatEvent): AlertItem | null {
  const meta = event.metadata || {}
  const systemKind = String(meta.kind || '')
  if (event.type === 'system' && systemKind === 'pixels_cheer') return { id: event.id, kind: 'pixels', username: event.username, title: `${Number(meta.amount || 0).toLocaleString('fr-CA')} Pixels`, detail: String(meta.message || event.body), ts: event.ts }
  if (event.type === 'subscription') return { id: event.id, kind: 'subscription', username: event.username, title: 'Nouvel abonnement', detail: event.body, ts: event.ts }
  if (event.type === 'gift') return { id: event.id, kind: 'gift', username: event.username, title: 'Abonnement cadeau', detail: event.body, ts: event.ts }
  if (event.type === 'raid') return { id: event.id, kind: 'raid', username: event.username, title: `Raid${meta.viewer_count ? ` · ${meta.viewer_count} spectateurs` : ''}`, detail: event.body, ts: event.ts }
  if (event.type === 'follow') return { id: event.id, kind: 'follow', username: event.username, title: 'Nouveau follow', detail: event.body, ts: event.ts }
  if (event.type === 'clip') return { id: event.id, kind: 'clip', username: event.username, title: 'Nouveau clip', detail: event.body, ts: event.ts }
  if (event.type === 'system' && systemKind.startsWith('channel_points_')) return { id: event.id, kind: 'points', username: event.username, title: 'Récompense de points', detail: event.body, ts: event.ts }
  return null
}

function Icon({ name }: { name: 'bell' | 'chat' | 'people' | 'send' | 'settings' | 'link' | 'play' }) {
  const paths = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    chat: <path d="M4 5h16v11H8l-4 4V5Z"/>, people: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M15 15c4 0 6 2 6 5"/></>,
    send: <path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14"/>, settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/></>, play: <path d="m8 5 11 7-11 7V5Z"/>,
  }
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function SettingsPanel({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const [error, setError] = useState('')
  const save = async (e: FormEvent) => { e.preventDefault(); setError(''); try { await api('/api/settings', { method: 'PUT', body: '{}' }); if (!initial.authenticated) window.location.assign('/api/auth/login'); else onSaved() } catch (err) { setError((err as Error).message) } }
  return <main className="setup"><div className="brand"><b>VPZONE</b> Control</div><div className="setup-mark">VP</div><h1>Connecter votre compte</h1><p>Gérez votre stream, votre chat et vos alertes depuis un seul dock OBS.</p><form onSubmit={save}><small className="oauth-help">Connexion sécurisée par VPZONE OAuth. Aucun mot de passe ni clé API n’est demandé.</small>{error && <div className="error">{error}</div>}<button className="primary">{initial.authenticated ? 'Retourner au dock' : 'Se connecter avec VPZONE'}</button></form></main>
}

function MessageBody({ event }: { event: ChatEvent }) {
  if (!event.emoteMap) return <>{event.body}</>
  return <>{event.body.split(/(\s+)/).map((bit, i) => event.emoteMap?.[bit] ? <img className="emote" src={event.emoteMap[bit]} alt={bit} key={i} /> : bit)}</>
}

function Chat({ slug, token, onAlert, hidden }: { slug: string; token: string; onAlert: (alert: AlertItem) => void; hidden: boolean }) {
  const [events, setEvents] = useState<ChatEvent[]>([]), [status, setStatus] = useState('Connexion…'), [viewers, setViewers] = useState(0)
  const [pinned, setPinned] = useState<ChatEvent | null>(null), [draft, setDraft] = useState(''), [reply, setReply] = useState<ChatEvent | null>(null)
  const socket = useRef<WebSocket | null>(null), lastTs = useRef(0), retry = useRef(0), timer = useRef<number | undefined>(undefined), list = useRef<HTMLDivElement>(null)
  const connect = useCallback(() => {
    const params = new URLSearchParams({ channel: slug }); if (token) params.set('token', token); if (lastTs.current) params.set('since', String(lastTs.current))
    const ws = new WebSocket(`wss://chat.vpzone.tv/ws?${params}`); socket.current = ws; setStatus('Connexion…')
    ws.onopen = () => { retry.current = 0; setStatus('Connecté') }
    ws.onmessage = ({ data }) => { try { const event = JSON.parse(data) as ChatEvent; lastTs.current = Math.max(lastTs.current, event.ts || 0); const alert = eventToAlert(event); if (alert) onAlert(alert); if (event.type === 'presence') return setViewers(event.count || 0); if (event.type === 'clear_chat') return setEvents([]); if (event.type === 'delete_message') return setEvents(old => old.filter(x => x.id !== event.metadata?.messageId)); if (event.type === 'pin_update') return setPinned((event.metadata?.pinned as ChatEvent) || null); setEvents(old => old.some(x => x.id === event.id) ? old : [...old.slice(-299), event]) } catch { /* additive frames are ignored safely */ } }
    ws.onclose = e => { setStatus(e.code === 1008 ? 'Accès refusé' : 'Reconnexion…'); if (e.code !== 1008) timer.current = window.setTimeout(connect, Math.min(30000, 1000 * 2 ** retry.current++)) }
    ws.onerror = () => ws.close()
  }, [slug, token, onAlert])
  useEffect(() => { connect(); return () => { window.clearTimeout(timer.current); socket.current?.close(1000) } }, [connect])
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }) }, [events])
  const send = (e: FormEvent) => { e.preventDefault(); const body = draft.trim(); if (!body || socket.current?.readyState !== WebSocket.OPEN) return; socket.current.send(JSON.stringify({ type: 'msg', body, nonce: crypto.randomUUID(), ...(reply ? { reply_to: reply.id } : {}) })); setDraft(''); setReply(null) }
  return <section className={`chat workspace ${hidden ? 'is-hidden' : ''}`}><div className="chat-meta"><span><Icon name="people" />{viewers.toLocaleString('fr-CA')}</span><span className="socket-state"><i className={status === 'Connecté' ? 'online' : ''}/>{status}</span></div>
    {pinned && <div className="pinned"><small>MESSAGE ÉPINGLÉ PAR {pinned.username.toUpperCase()}</small><div>{pinned.body}</div></div>}
    <div className="messages" ref={list} aria-live="polite">{events.length === 0 && <div className="empty"><Icon name="chat"/><b>Le chat est prêt</b><span>Les nouveaux messages apparaîtront ici.</span></div>}{events.map(event => <button className={`message ${event.type !== 'msg' ? 'system' : ''}`} key={event.id} onClick={() => event.type === 'msg' && setReply(event)}><time>{new Date(event.ts).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}</time><span className="badges">{event.is_owner ? '◆' : event.is_mod ? '◇' : event.is_subscriber ? '★' : ''}</span><strong style={{ color: event.color || undefined }}>{event.username}</strong><span><MessageBody event={event}/></span></button>)}</div>
    {reply && <div className="reply"><span>Réponse à <b>@{reply.username}</b><small>{reply.body.slice(0, 90)}</small></span><button onClick={() => setReply(null)} aria-label="Annuler la réponse">×</button></div>}
    <form className="composer" onSubmit={send}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Écrire un message…" maxLength={500}/><button aria-label="Envoyer" disabled={!draft.trim()}><Icon name="send"/></button></form>
  </section>
}

function AlertsPanel({ alerts, hidden }: { alerts: AlertItem[]; hidden: boolean }) {
  const [prefs, setPrefs] = useState<AlertPrefs>(() => { try { return { ...defaultPrefs, ...JSON.parse(localStorage.getItem('vpz-alert-prefs') || '{}') } } catch { return defaultPrefs } })
  const [copied, setCopied] = useState(false)
  useEffect(() => { localStorage.setItem('vpz-alert-prefs', JSON.stringify(prefs)) }, [prefs])
  const overlayUrl = `${location.origin}/?overlay=alerts`
  const test = () => { playAlertTone(prefs.volume); const channel = new BroadcastChannel('vpzone-alerts'); channel.postMessage({ id: crypto.randomUUID(), kind: 'pixels', username: 'Lordwaffl3', title: '1 000 Pixels', detail: 'Merci pour le stream !', ts: Date.now() }); channel.close() }
  const copy = async () => { await navigator.clipboard.writeText(overlayUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }
  const setEnabled = (kind: AlertKind, value: boolean) => setPrefs(p => ({ ...p, enabled: { ...p.enabled, [kind]: value } }))
  return <section className={`alerts workspace ${hidden ? 'is-hidden' : ''}`}><div className="alert-settings"><h2>Configuration des alertes</h2><label>Volume <b>{prefs.volume}%</b><input type="range" min="0" max="100" value={prefs.volume} onChange={e => setPrefs(p => ({ ...p, volume: Number(e.target.value) }))}/></label><label>Durée <b>{prefs.duration}s</b><input type="range" min="2" max="15" value={prefs.duration} onChange={e => setPrefs(p => ({ ...p, duration: Number(e.target.value) }))}/></label><div className="alert-actions"><button onClick={copy}><Icon name="link"/>{copied ? 'Copié' : 'URL OBS'}</button><button className="accent" onClick={test}><Icon name="play"/>Tester</button></div></div>
    <div className="alert-history"><h2>Dernières alertes <span>{alerts.length}</span></h2>{alerts.length === 0 ? <div className="empty alert-empty"><Icon name="bell"/><b>Aucune alerte récente</b><span>Les dons, abonnements et raids apparaîtront ici.</span></div> : alerts.map(alert => <article className={`alert-row ${alert.kind}`} key={alert.id}><div className="event-avatar">{alert.username.slice(0,1).toUpperCase()}</div><div><b>{alert.username}</b><strong>{alert.title}</strong>{alert.detail && <small>{alert.detail}</small>}</div><time>{new Date(alert.ts).toLocaleTimeString('fr-CA',{hour:'2-digit',minute:'2-digit'})}</time></article>)}</div>
    <div className="alert-types"><h2>Types d’alertes actifs</h2>{(Object.keys(alertLabels) as AlertKind[]).map(kind => <label key={kind}><span>{alertLabels[kind]}</span><input type="checkbox" checked={prefs.enabled[kind]} onChange={e => setEnabled(kind,e.target.checked)}/><i/></label>)}</div>
  </section>
}

function AlertOverlay() {
  const [current, setCurrent] = useState<AlertItem | null>(null), queue = useRef<AlertItem[]>([]), busy = useRef(false)
  const show = useCallback((alert: AlertItem) => { let prefs = defaultPrefs; try { prefs = { ...defaultPrefs, ...JSON.parse(localStorage.getItem('vpz-alert-prefs') || '{}') } } catch { /* defaults */ } if (prefs.enabled?.[alert.kind] === false) return; queue.current.push(alert); if (busy.current) return; const next = () => { const item = queue.current.shift(); if (!item) { busy.current = false; setCurrent(null); return } busy.current = true; setCurrent(item); playAlertTone(prefs.volume); window.setTimeout(() => { setCurrent(null); window.setTimeout(next, 450) }, prefs.duration * 1000) }; next() }, [])
  useEffect(() => { const broadcast = new BroadcastChannel('vpzone-alerts'); broadcast.onmessage = e => show(e.data as AlertItem); let ws: WebSocket | null = null; let stopped = false; void api<{ slug: string; chatToken: string }>('/api/bootstrap').then(b => { if (stopped) return; const params = new URLSearchParams({ channel: b.slug, token: b.chatToken }); ws = new WebSocket(`wss://chat.vpzone.tv/ws?${params}`); ws.onmessage = e => { try { const alert = eventToAlert(JSON.parse(e.data)); if (alert) show(alert) } catch { /* ignore */ } } }); return () => { stopped = true; broadcast.close(); ws?.close() } }, [show])
  return <main className="overlay-stage">{current && <div className={`overlay-alert ${current.kind}`}><div className="overlay-orbit"><div className="overlay-avatar">{current.avatar ? <img src={current.avatar} alt=""/> : current.username.slice(0,1).toUpperCase()}</div></div><strong>{current.username}</strong><h1>{current.title}</h1>{current.detail && <p>{current.detail}</p>}</div>}</main>
}

export default function App() {
  const isOverlay = new URLSearchParams(location.search).get('overlay') === 'alerts'
  const isPreview = new URLSearchParams(location.search).get('preview') === '1'
  const [settings, setSettings] = useState<Settings | null>(isPreview ? { slug: 'lordwaffl3', clientId: '', authenticated: true, profile: { username: 'lordwaffl3', display_name: 'Lordwaffl3' } } : null), [editing, setEditing] = useState(false), [channel, setChannel] = useState<Channel | null>(isPreview ? { slug: 'lordwaffl3', title: 'On découvre les nouveautés VPZONE !', category: 'Just Chatting', is_live: true, viewer_count: 1240, owner: { username: 'lordwaffl3', display_name: 'Lordwaffl3' } } : null)
  const [categories, setCategories] = useState<Category[]>(isPreview ? [{ name: 'Just Chatting' }, { name: 'Apex Legends' }] : []), [title, setTitle] = useState(isPreview ? 'On découvre les nouveautés VPZONE !' : ''), [category, setCategory] = useState(isPreview ? 'Just Chatting' : ''), [chatToken, setChatToken] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false), [tab, setTab] = useState<'chat'|'alerts'>('chat'), [alerts, setAlerts] = useState<AlertItem[]>(isPreview ? [{ id: 'preview-1', kind: 'pixels', username: 'PixelMaster', title: '5 000 Pixels', detail: 'Excellent stream !', ts: Date.now() - 120000 }, { id: 'preview-2', kind: 'subscription', username: 'CyberNinja99', title: 'Nouvel abonnement', detail: 'Premier mois !', ts: Date.now() - 300000 }] : [])
  const load = useCallback(async () => { const s = await api<Settings>('/api/settings'); setSettings(s); if (!s.clientId || !s.authenticated) return setEditing(true); try { const b = await api<{ channel: Channel; categories: Category[]; chatToken: string }>('/api/bootstrap'); setChannel(b.channel); setCategories(b.categories); setTitle(b.channel.title || ''); setCategory(b.channel.category || ''); setChatToken(b.chatToken); setEditing(false) } catch (e) { setNotice((e as Error).message); setEditing(true) } }, [])
  useEffect(() => { if (!isOverlay && !isPreview) void load() }, [load, isOverlay, isPreview])
  const receiveAlert = useCallback((alert: AlertItem) => setAlerts(old => old.some(x => x.id === alert.id) ? old : [alert, ...old].slice(0, 50)), [])
  const saveChannel = async (e: FormEvent) => { e.preventDefault(); setLoading(true); setNotice(''); try { const r = await api<{ data: Channel }>('/api/channel', { method: 'PATCH', body: JSON.stringify({ title, category }) }); setChannel(old => ({ ...old, ...r.data } as Channel)); setNotice('Stream mis à jour'); window.setTimeout(() => setNotice(''), 2500) } catch (err) { setNotice((err as Error).message) } finally { setLoading(false) } }
  const options = useMemo(() => categories.map(c => c.name), [categories])
  if (isOverlay) return <AlertOverlay/>
  if (!settings) return <div className="splash">VPZONE</div>
  if (editing) return <SettingsPanel initial={settings} onSaved={() => void load()}/>
  const owner = channel?.owner, avatar = owner?.avatar_url || settings.profile?.avatar_url, displayName = owner?.display_name || owner?.username || settings.profile?.display_name || settings.profile?.username || settings.slug
  return <div className="app"><header className="top"><div className="brand"><b>VPZONE</b><span>Control</span></div><div className="top-actions"><span className="connected"><i/>CONNECTÉ</span><button className="gear" onClick={() => setEditing(true)} aria-label="Paramètres"><Icon name="settings"/></button></div></header>
    <section className="channel"><div className="identity">{avatar ? <img className="avatar" src={avatar} alt={`Avatar de ${displayName}`}/> : <div className="avatar fallback">{displayName.slice(0,1).toUpperCase()}</div>}<div><b>{displayName}</b><small>/{settings.slug}</small></div></div><span className={channel?.is_live ? 'live' : 'offline'}><i/>{channel?.is_live ? 'EN DIRECT' : 'HORS LIGNE'}</span></section>
    <nav className="tabs"><button className={tab==='chat'?'active':''} onClick={() => setTab('chat')}><Icon name="chat"/>Chat</button><button className={tab==='alerts'?'active':''} onClick={() => setTab('alerts')}><Icon name="bell"/>Alertes{alerts.length>0&&<em>{alerts.length}</em>}</button></nav>
    <form className="editor" onSubmit={saveChannel}><label>Titre du stream<div className="field"><input value={title} onChange={e => setTitle(e.target.value)} maxLength={140} required/><small>{title.length}/140</small></div></label><label>Catégorie<input list="categories" value={category} onChange={e => setCategory(e.target.value)} maxLength={80} required/><datalist id="categories">{options.map(x => <option key={x} value={x}/>)}</datalist></label><button className="primary" disabled={loading}>{loading ? 'Mise à jour…' : 'Mettre à jour'}</button>{notice && <div className="notice">{notice}</div>}</form>
    <div className="workspaces"><Chat slug={settings.slug} token={chatToken} onAlert={receiveAlert} hidden={tab!=='chat'}/><AlertsPanel alerts={alerts} hidden={tab!=='alerts'}/></div>
  </div>
}
