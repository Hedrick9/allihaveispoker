import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';
import * as Spotify from '../spotify';

export default function Jukebox({ onClose, isHost, myName, nowPlaying, nextUp: externalQueue, jamLink: initialJamLink, requests }) {
  const [connected, setConnected]     = useState(Spotify.isAuthenticated());
  const [track, setTrack]             = useState(nowPlaying);
  const [nextUp, setNextUp]           = useState(externalQueue || []);
  const [jamLink, setJamLink]         = useState(initialJamLink || '');
  const [query, setQuery]             = useState('');
  const [results, setResults]         = useState([]);
  const [searching, setSearching]     = useState(false);
  const [connecting, setConnecting]   = useState(false);
  const [requestText, setRequestText] = useState('');
  const [toast, setToast]             = useState(null);
  const [showControls, setShowControls] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => { setTrack(nowPlaying); }, [nowPlaying]);
  useEffect(() => { setNextUp(externalQueue || []); }, [externalQueue]);
  useEffect(() => { setJamLink(initialJamLink || ''); }, [initialJamLink]);

  // Host: poll Spotify every 15s
  useEffect(() => {
    if (!isHost || !connected) return;
    async function poll() {
      try {
        const [np, q] = await Promise.all([Spotify.getNowPlaying(), Spotify.getQueue()]);
        setTrack(np);
        setNextUp(q);
        socket.emit('jukebox:now-playing', np);
        socket.emit('jukebox:queue', q);
      } catch (e) {
        if (e.message.includes('Not authenticated')) setConnected(false);
      }
    }
    poll();
    pollRef.current = setInterval(poll, 15000);
    return () => clearInterval(pollRef.current);
  }, [isHost, connected]);

  // Host: answer search requests from non-hosts
  useEffect(() => {
    if (!isHost || !connected) return;
    async function onSearchFor({ query: q, fromId }) {
      try {
        const res = await Spotify.search(q);
        socket.emit('jukebox:search-results', { results: res, toId: fromId });
      } catch {
        socket.emit('jukebox:search-results', { results: [], toId: fromId });
      }
    }
    socket.on('jukebox:search-for', onSearchFor);
    return () => socket.off('jukebox:search-for', onSearchFor);
  }, [isHost, connected]);

  // Non-host: receive search results
  useEffect(() => {
    if (isHost) return;
    function onResults({ results: res }) {
      setResults(res);
      setSearching(false);
    }
    socket.on('jukebox:search-results', onResults);
    return () => socket.off('jukebox:search-results', onResults);
  }, [isHost]);

  async function handleConnect() {
    if (!crypto.subtle) {
      showToast('Spotify requires HTTPS — use https://allihaveispoker.com');
      return;
    }
    setConnecting(true);
    try { await Spotify.initiateAuth(); }
    catch (e) {
      showToast(`Login failed: ${e.message}`);
      setConnecting(false);
    }
  }

  async function doHostSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try { setResults(await Spotify.search(query)); }
    catch { showToast('Search failed'); }
    setSearching(false);
  }

  function addTrack(t) {
    Spotify.addToQueue(t.uri)
      .then(() => {
        socket.emit('jukebox:queued', { name: t.name, artist: t.artist });
        showToast(`Added: ${t.name}`);
        setResults([]);
        setQuery('');
      })
      .catch(e => showToast(e.message.includes('404') ? 'Open Spotify on a device first' : 'Could not queue'));
  }

  function doGuestSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    socket.emit('jukebox:search', { query: query.trim() });
    const t = setTimeout(() => {
      setSearching(false);
      showToast('Host may not be connected to Spotify');
    }, 8000);
    socket.once('jukebox:search-results', () => clearTimeout(t));
  }

  function requestTrack(t) {
    socket.emit('jukebox:request', { uri: t.uri, name: t.name, artist: t.artist, albumArt: t.albumArt, requestedBy: myName });
    showToast(`Queued: ${t.name}`);
    setResults([]);
    setQuery('');
  }

  function sendTextRequest(e) {
    e.preventDefault();
    if (!requestText.trim()) return;
    socket.emit('jukebox:request', { name: requestText.trim(), requestedBy: myName });
    setRequestText('');
    showToast('Request sent!');
  }

  function broadcastJam() {
    if (!jamLink.trim()) return;
    socket.emit('jukebox:jam-link', { url: jamLink.trim() });
    showToast('Jam link shared!');
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const SearchResults = ({ onAdd }) => (
    <div className="jk-results">
      {results.map(t => (
        <div key={t.uri} className="jk-result">
          {t.albumArt && <img className="jk-result-art" src={t.albumArt} alt="" />}
          <div className="jk-result-info">
            <div className="jk-result-name">{t.name}</div>
            <div className="jk-result-artist">{t.artist}</div>
          </div>
          <button className="jk-result-add" onClick={() => onAdd(t)}>+</button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="jk-cabinet" onClick={e => e.stopPropagation()}>
        <button className="jk-close-btn" onClick={onClose}>✕</button>

        {/* ── Domed arch header ── */}
        <div className="jk-arch">
          <div className="jk-arch-title">JUKEBOX</div>
          <div className="jk-arch-notes">♪ ♫ ♪</div>
        </div>

        <div className="jk-body">

          {/* ── CRT now-playing screen ── */}
          <div className="jk-screen">
            <div className="jk-screen-label">◆ NOW PLAYING ◆</div>
            {track ? (
              <div className="jk-np">
                {track.albumArt && <img className="jk-np-art" src={track.albumArt} alt="" />}
                <div className="jk-np-info">
                  <div className="jk-np-name">{track.name}</div>
                  <div className="jk-np-artist">{track.artist}</div>
                  <div className="jk-np-status">{track.isPlaying ? '▶ PLAYING' : '⏸ PAUSED'}</div>
                </div>
              </div>
            ) : (
              <div className="jk-np-empty">NO TRACK LOADED</div>
            )}
          </div>

          {/* ── Next up queue ── */}
          <div className="jk-queue-panel">
            <div className="jk-panel-label">◆ NEXT UP ◆</div>
            {nextUp.length > 0 ? (
              <div className="jk-queue-list">
                {nextUp.map((t, i) => (
                  <div key={t.uri || i} className="jk-queue-item">
                    <span className="jk-queue-num">{i + 1}</span>
                    {t.albumArt && <img className="jk-queue-art" src={t.albumArt} alt="" />}
                    <div className="jk-queue-info">
                      <div className="jk-queue-name">{t.name}</div>
                      <div className="jk-queue-artist">{t.artist}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="jk-queue-empty">Queue is empty</div>
            )}
          </div>

          {/* ── Jam link ── */}
          {(isHost || initialJamLink) && (
            <div className="jk-jam-section">
              {isHost ? (
                <div className="jk-jam-host">
                  <input className="form-input jk-jam-input" placeholder="Paste Spotify Jam link…" value={jamLink} onChange={e => setJamLink(e.target.value)} />
                  <button className="btn-sm-gold" onClick={broadcastJam}>Share</button>
                </div>
              ) : (
                <a className="jk-jam-link-btn" href={initialJamLink} target="_blank" rel="noreferrer">
                  🎧 Join the Spotify Jam →
                </a>
              )}
            </div>
          )}

          {/* ── Controls toggle ── */}
          <button className="jk-controls-toggle" onClick={() => setShowControls(v => !v)}>
            {showControls ? '▲ Hide Controls' : '▼ Search & Request'}
          </button>

          {showControls && (
            <div className="jk-controls">
              {isHost ? (
                <>
                  {!connected ? (
                    <button className="jk-spotify-btn" onClick={handleConnect} disabled={connecting}>
                      {connecting ? 'Opening Spotify…' : '🎵 Connect Spotify'}
                    </button>
                  ) : (
                    <>
                      <form className="jk-search-row" onSubmit={doHostSearch}>
                        <input className="form-input" style={{ flex: 1 }} placeholder="Search Spotify…" value={query} onChange={e => setQuery(e.target.value)} />
                        <button className="btn-sm-gold" type="submit" disabled={searching}>{searching ? '…' : 'Go'}</button>
                      </form>
                      {results.length > 0 && <SearchResults onAdd={addTrack} />}
                    </>
                  )}
                  {requests?.length > 0 && (
                    <div className="jk-requests">
                      <div className="jk-requests-label">REQUESTS</div>
                      {requests.map((r, i) => (
                        <div key={i} className="jk-request-item">
                          <span>{r.name}</span>
                          {r.artist && <span className="jk-request-meta"> · {r.artist}</span>}
                          <span className="jk-request-meta"> — {r.requestedBy}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <form className="jk-search-row" onSubmit={doGuestSearch}>
                    <input className="form-input" style={{ flex: 1 }} placeholder="Search Spotify…" value={query} onChange={e => setQuery(e.target.value)} />
                    <button className="btn-sm-gold" type="submit" disabled={searching}>{searching ? '…' : 'Search'}</button>
                  </form>
                  {results.length > 0 && <SearchResults onAdd={requestTrack} />}
                  <div className="jk-divider">or type a request</div>
                  <form className="jk-search-row" onSubmit={sendTextRequest}>
                    <input className="form-input" style={{ flex: 1 }} placeholder="Song name…" value={requestText} onChange={e => setRequestText(e.target.value)} />
                    <button className="btn-sm-gold" type="submit">Send</button>
                  </form>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer (toast only) ── */}
        {toast && (
          <div className="jk-footer">
            <div className="jk-toast">{toast}</div>
          </div>
        )}

      </div>
    </div>
  );
}
