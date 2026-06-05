import React, { useState } from 'react';
import socket from '../socket';

export default function SettingsModal({ settings, onChange, onClose, isHost, gameConfig }) {
  const [bigBlind, setBigBlind] = useState(String(gameConfig?.bigBlind ?? 20));
  const [saved, setSaved] = useState(false);

  function applyConfig() {
    const bb = parseInt(bigBlind, 10);
    if (isNaN(bb) || bb < 2) return;
    socket.emit('room:config-update', { bigBlind: bb });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Settings</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <div className="settings-label">Hand Timer</div>
          <div className="settings-row">
            <button
              className={`toggle-btn ${settings.timerEnabled ? 'active' : ''}`}
              onClick={() => onChange({ ...settings, timerEnabled: !settings.timerEnabled })}
            >
              {settings.timerEnabled ? 'Enabled' : 'Disabled'}
            </button>
            {settings.timerEnabled && (
              <div className="timer-opts">
                {[15, 30, 60].map(s => (
                  <button
                    key={s}
                    className={`timer-opt ${settings.timerSeconds === s ? 'active' : ''}`}
                    onClick={() => onChange({ ...settings, timerSeconds: s })}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="settings-hint-text">Auto-folds when the timer expires on your turn.</div>
        </div>

        {isHost && (
          <div className="settings-section">
            <div className="settings-label">
              Big Blind <span className="settings-hint">— takes effect next hand</span>
            </div>
            <div className="settings-row">
              <input
                className="form-input settings-bb-input"
                type="number"
                value={bigBlind}
                onChange={e => setBigBlind(e.target.value)}
                min={2}
                step={2}
              />
              <button className="btn-sm-gold" onClick={applyConfig}>
                {saved ? 'Saved ✓' : 'Apply'}
              </button>
            </div>
            <div className="settings-hint-text">Small blind will be set to half the big blind.</div>
          </div>
        )}
      </div>
    </div>
  );
}
