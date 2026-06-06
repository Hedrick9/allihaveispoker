const CLIENT_ID = '1706c2d626964a94afe544118a8ed75e';
const REDIRECT_URI = window.location.origin;
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';

function b64url(arr) {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return b64url(arr);
}

async function generateChallenge(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(hash));
}

export async function initiateAuth() {
  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);
  sessionStorage.setItem('sp_verifier', verifier);
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  });
  window.location.href = `https://accounts.spotify.com/authorize?${p}`;
}

export async function handleCallback(code) {
  const verifier = sessionStorage.getItem('sp_verifier');
  sessionStorage.removeItem('sp_verifier');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || 'Spotify auth failed');
  saveTokens(data);
}

function saveTokens({ access_token, refresh_token, expires_in }) {
  localStorage.setItem('sp_token', access_token);
  if (refresh_token) localStorage.setItem('sp_refresh', refresh_token);
  localStorage.setItem('sp_expiry', String(Date.now() + expires_in * 1000));
}

export async function getToken() {
  const token = localStorage.getItem('sp_token');
  const expiry = Number(localStorage.getItem('sp_expiry'));
  if (token && Date.now() < expiry - 60_000) return token;

  const refresh = localStorage.getItem('sp_refresh');
  if (!refresh) return null;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  });
  const data = await res.json();
  if (!data.access_token) { clearAuth(); return null; }
  saveTokens(data);
  return data.access_token;
}

export function isAuthenticated() {
  return !!(localStorage.getItem('sp_token') && localStorage.getItem('sp_expiry'));
}

export function clearAuth() {
  ['sp_token', 'sp_refresh', 'sp_expiry'].forEach(k => localStorage.removeItem(k));
}

async function api(path, opts = {}) {
  const token = await getToken();
  if (!token) throw new Error('Not authenticated with Spotify');
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...opts.headers },
  });
  if (!res.ok) throw new Error(`Spotify ${res.status}`);
  // Queue and other endpoints return 204 No Content — treat any body-read
  // failure as a successful null rather than an error, since the API call worked.
  try {
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function search(query) {
  const data = await api(`/search?${new URLSearchParams({ q: query, type: 'track', limit: 5 })}`);
  return data.tracks.items.map(t => ({
    uri: t.uri,
    name: t.name,
    artist: t.artists.map(a => a.name).join(', '),
    albumArt: t.album.images[2]?.url || t.album.images[0]?.url,
  }));
}

export async function getNowPlaying() {
  const data = await api('/me/player/currently-playing');
  if (!data?.item) return null;
  return {
    name: data.item.name,
    artist: data.item.artists.map(a => a.name).join(', '),
    albumArt: data.item.album.images[1]?.url,
    isPlaying: data.is_playing,
  };
}

export async function addToQueue(uri) {
  await api(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' });
}

export async function getQueue() {
  const data = await api('/me/player/queue');
  if (!data) return [];
  return (data.queue || []).slice(0, 4).map(t => ({
    uri: t.uri,
    name: t.name,
    artist: t.artists.map(a => a.name).join(', '),
    albumArt: t.album.images[2]?.url || t.album.images[0]?.url,
  }));
}
