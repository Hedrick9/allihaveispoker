import React, { useState, useEffect, useRef } from 'react';
import socket from '../socket';

export default function Chat({ messages, myId }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const prevLen = useRef(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    const newCount = messages.length - prevLen.current;
    if (newCount > 0 && !open) setUnread(u => u + newCount);
    prevLen.current = messages.length;
  }, [messages.length, open]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages.length]);

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    socket.emit('chat:message', trimmed);
    setText('');
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-panel">
          <div className="chat-panel-header">Chat</div>
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">No messages yet</div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.playerId === myId ? 'chat-msg-me' : ''}`}>
                <span className="chat-msg-name">{m.name}</span>
                <span className="chat-msg-text">{m.text}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="chat-input-row">
            <input
              className="chat-input"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Say something…"
              maxLength={200}
              autoFocus
            />
            <button className="chat-send-btn" onClick={send}>↑</button>
          </div>
        </div>
      )}
      <button className="overlay-btn chat-btn" onClick={() => setOpen(o => !o)}>
        💬
        {unread > 0 && <span className="unread-badge">{unread}</span>}
      </button>
    </div>
  );
}
