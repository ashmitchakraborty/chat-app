import { useState, useEffect, useRef, useCallback } from "react";

class MockWebSocket {
  constructor(url, onMessage, onOpen, onClose) {
    this.url = url;
    this.channel = new BroadcastChannel("chat_room");
    this.onMessage = onMessage;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.readyState = 0;
    setTimeout(() => {
      this.readyState = 1;
      if (this.onOpen) this.onOpen();
    }, 400);
    this.channel.onmessage = (event) => {
      if (this.onMessage) this.onMessage(event.data);
    };
  }
  send(data) { this.channel.postMessage(data); }
  close() {
    this.readyState = 3;
    this.channel.close();
    if (this.onClose) this.onClose();
  }
}

const USER_COLORS = ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98D8C8","#F7DC6F"];
const colorMap = {};
let colorIdx = 0;
function getUserColor(name) {
  if (!colorMap[name]) { colorMap[name] = USER_COLORS[colorIdx % USER_COLORS.length]; colorIdx++; }
  return colorMap[name];
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function MessageBubble({ msg, isMine }) {
  const color = getUserColor(msg.user);
  return (
    <div style={{ display:"flex", flexDirection: isMine ? "row-reverse" : "row", alignItems:"flex-end", gap:"8px", marginBottom:"16px", animation:"slideIn 0.25s cubic-bezier(0.34,1.56,0.64,1)" }}>
      <div style={{ width:"36px", height:"36px", borderRadius:"50%", background:color, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"14px", fontWeight:"700", color:"#1a1a2e", boxShadow:`0 0 0 2px #1a1a2e, 0 0 0 4px ${color}40` }}>
        {msg.user[0].toUpperCase()}
      </div>
      <div style={{ maxWidth:"68%", display:"flex", flexDirection:"column", alignItems: isMine ? "flex-end" : "flex-start" }}>
        {!isMine && <span style={{ fontSize:"11px", fontWeight:"600", color, marginBottom:"4px", fontFamily:"'Space Mono', monospace" }}>{msg.user}</span>}
        <div style={{ background: isMine ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "rgba(255,255,255,0.07)", border: isMine ? "none" : "1px solid rgba(255,255,255,0.1)", color:"#fff", padding:"10px 14px", borderRadius: isMine ? "18px 18px 4px 18px" : "18px 18px 18px 4px", fontSize:"14px", lineHeight:"1.5", wordBreak:"break-word" }}>
          {msg.text}
        </div>
        <span style={{ fontSize:"10px", color:"rgba(255,255,255,0.35)", marginTop:"4px", fontFamily:"'Space Mono', monospace" }}>{formatTime(msg.ts)}</span>
      </div>
    </div>
  );
}

function SystemMessage({ text }) {
  return (
    <div style={{ textAlign:"center", margin:"12px 0" }}>
      <span style={{ fontSize:"11px", color:"rgba(255,255,255,0.35)", background:"rgba(255,255,255,0.05)", padding:"4px 12px", borderRadius:"20px", fontFamily:"'Space Mono', monospace" }}>{text}</span>
    </div>
  );
}

function TypingIndicator({ typers }) {
  if (typers.length === 0) return null;
  const label = typers.length === 1 ? `${typers[0]} is typing` : `${typers.join(", ")} are typing`;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"8px" }}>
      <div style={{ display:"flex", gap:"3px", alignItems:"center" }}>
        {[0,1,2].map(i => <div key={i} style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#667eea", animation:`bounce 1.2s ${i*0.2}s ease-in-out infinite` }} />)}
      </div>
      <span style={{ fontSize:"11px", color:"rgba(255,255,255,0.4)", fontFamily:"'Space Mono', monospace" }}>{label}...</span>
    </div>
  );
}

export default function ChatApp() {
  const [username, setUsername] = useState("");
  const [joined, setJoined] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [wsReady, setWsReady] = useState(false);
  const [typers, setTypers] = useState([]);
  const [onlineCount, setOnlineCount] = useState(1);
  const wsRef = useRef(null);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const isTyping = useRef(false);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, typers]);

  const connect = useCallback((name) => {
    const ws = new MockWebSocket("wss://chat.example.com/room/general",
      (data) => {
        if (data.type === "message") setMessages(prev => [...prev, data]);
        else if (data.type === "join") { setMessages(prev => [...prev, { type:"system", text:`${data.user} joined the room`, ts:Date.now() }]); setOnlineCount(c => c+1); }
        else if (data.type === "leave") { setMessages(prev => [...prev, { type:"system", text:`${data.user} left the room`, ts:Date.now() }]); setOnlineCount(c => Math.max(1,c-1)); }
        else if (data.type === "typing") { if (data.user !== name) { setTypers(prev => prev.includes(data.user) ? prev : [...prev, data.user]); setTimeout(() => setTypers(prev => prev.filter(u => u !== data.user)), 2000); } }
      },
      () => { setWsReady(true); ws.send({ type:"join", user:name, ts:Date.now() }); },
      () => setWsReady(false)
    );
    wsRef.current = ws;
  }, []);

  useEffect(() => { return () => wsRef.current?.close(); }, []);

  const handleJoin = () => {
    const name = nameInput.trim();
    if (!name) return;
    setUsername(name);
    setJoined(true);
    connect(name);
    setTimeout(() => {
      setMessages([
        { type:"system", text:"Welcome to #general", ts:Date.now() },
        { type:"message", user:"ChatBot", text:`Hey ${name}! Welcome 👋 Open this in another tab to chat in real-time!`, ts:Date.now() },
      ]);
    }, 600);
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text || !wsReady) return;
    const msg = { type:"message", user:username, text, ts:Date.now() };
    setMessages(prev => [...prev, msg]);
    wsRef.current?.send(msg);
    setInput("");
    isTyping.current = false;
  };

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (!isTyping.current) { isTyping.current = true; wsRef.current?.send({ type:"typing", user:username }); }
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => { isTyping.current = false; }, 1500);
  };

  if (!joined) {
    return (
      <>
        <style>{globalStyles}</style>
        <div style={styles.loginWrap}>
          <div style={styles.loginCard}>
            <div style={styles.logoMark}>💬</div>
            <h1 style={styles.loginTitle}>ChatWave</h1>
            <p style={styles.loginSub}>Real-time messaging · WebSocket powered</p>
            <input style={styles.nameInput} type="text" placeholder="Choose your username..." value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleJoin()} autoFocus maxLength={20} />
            <button style={styles.joinBtn} onClick={handleJoin}>Join Room →</button>
            <p style={styles.hint}>💡 Open in multiple tabs to simulate real-time chat</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{globalStyles}</style>
      <div style={styles.appWrap}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarLogo}>💬 ChatWave</div>
          <div style={styles.sidebarSection}>CHANNELS</div>
          <div style={styles.channelItem}># general</div>
          <div style={{ flex:1 }} />
          <div style={styles.userChip}>
            <div style={{ width:8, height:8, borderRadius:"50%", background: wsReady ? "#4ECDC4" : "#FF6B6B" }} />
            <span style={{ fontSize:13, color:"rgba(255,255,255,0.7)" }}>{username}</span>
          </div>
        </aside>
        <main style={styles.main}>
          <header style={styles.header}>
            <div>
              <span style={{ fontWeight:700, fontSize:16 }}># general</span>
              <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginLeft:12 }}>Real-time chat room</span>
            </div>
            <div style={styles.onlineBadge}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:"#4ECDC4" }} />
              <span style={{ fontSize:12 }}>{onlineCount} online</span>
              <span style={{ fontSize:12, color: wsReady ? "#4ECDC4" : "#FF6B6B", marginLeft:8 }}>{wsReady ? "● Connected" : "○ Connecting..."}</span>
            </div>
          </header>
          <div style={styles.messageArea}>
            {messages.map((msg, i) => msg.type === "system" ? <SystemMessage key={i} text={msg.text} /> : <MessageBubble key={i} msg={msg} isMine={msg.user === username} />)}
            <TypingIndicator typers={typers} />
            <div ref={bottomRef} />
          </div>
          <div style={styles.inputBar}>
            <textarea style={styles.textArea} placeholder="Message #general..." value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} rows={1} disabled={!wsReady} />
            <button style={{ ...styles.sendBtn, opacity: input.trim() && wsReady ? 1 : 0.4 }} onClick={sendMessage} disabled={!input.trim() || !wsReady}>➤</button>
          </div>
        </main>
      </div>
    </>
  );
}

const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f1a; font-family: 'DM Sans', sans-serif; }
  @keyframes slideIn { from { opacity:0; transform:translateY(12px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
  @keyframes bounce { 0%,60%,100% { transform:translateY(0); } 30% { transform:translateY(-6px); } }
  @keyframes fadeIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
  textarea:focus { outline:none; } input:focus { outline:none; } button:hover { filter:brightness(1.1); }
  ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:transparent; } ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:4px; }
`;

const styles = {
  loginWrap: { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"radial-gradient(ellipse at 30% 40%, #1a1a3e 0%, #0f0f1a 70%)" },
  loginCard: { background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"24px", padding:"48px 40px", width:"380px", textAlign:"center", backdropFilter:"blur(20px)", animation:"fadeIn 0.4s ease", boxShadow:"0 32px 80px rgba(0,0,0,0.5)" },
  logoMark: { fontSize:"48px", marginBottom:"16px" },
  loginTitle: { fontSize:"32px", fontWeight:"700", color:"#fff", marginBottom:"8px", fontFamily:"'Space Mono', monospace" },
  loginSub: { fontSize:"13px", color:"rgba(255,255,255,0.4)", marginBottom:"32px" },
  nameInput: { width:"100%", padding:"14px 18px", borderRadius:"12px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"#fff", fontSize:"15px", marginBottom:"12px", fontFamily:"'DM Sans', sans-serif" },
  joinBtn: { width:"100%", padding:"14px", borderRadius:"12px", border:"none", background:"linear-gradient(135deg, #667eea, #764ba2)", color:"#fff", fontSize:"16px", fontWeight:"700", cursor:"pointer", fontFamily:"'Space Mono', monospace", marginBottom:"20px" },
  hint: { fontSize:"12px", color:"rgba(255,255,255,0.25)" },
  appWrap: { display:"flex", height:"100vh", background:"#0f0f1a", overflow:"hidden" },
  sidebar: { width:"220px", background:"#111127", display:"flex", flexDirection:"column", padding:"20px 12px", borderRight:"1px solid rgba(255,255,255,0.06)", flexShrink:0 },
  sidebarLogo: { fontFamily:"'Space Mono', monospace", fontWeight:"700", color:"#fff", fontSize:"16px", padding:"8px 8px 24px" },
  sidebarSection: { fontSize:"10px", fontWeight:"700", color:"rgba(255,255,255,0.25)", letterSpacing:"1.5px", padding:"0 8px 8px" },
  channelItem: { padding:"8px 12px", borderRadius:"8px", color:"#fff", fontSize:"14px", background:"rgba(102,126,234,0.2)", cursor:"pointer" },
  userChip: { display:"flex", alignItems:"center", gap:"8px", padding:"10px 12px", background:"rgba(255,255,255,0.04)", borderRadius:"10px", border:"1px solid rgba(255,255,255,0.06)" },
  main: { flex:1, display:"flex", flexDirection:"column", overflow:"hidden" },
  header: { padding:"16px 24px", borderBottom:"1px solid rgba(255,255,255,0.06)", display:"flex", justifyContent:"space-between", alignItems:"center", background:"rgba(255,255,255,0.02)", color:"#fff" },
  onlineBadge: { display:"flex", alignItems:"center", gap:"6px", color:"rgba(255,255,255,0.5)" },
  messageArea: { flex:1, overflowY:"auto", padding:"24px 24px 8px" },
  inputBar: { padding:"16px 24px", borderTop:"1px solid rgba(255,255,255,0.06)", display:"flex", gap:"12px", alignItems:"flex-end", background:"rgba(255,255,255,0.02)" },
  textArea: { flex:1, padding:"12px 16px", borderRadius:"12px", border:"1px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.06)", color:"#fff", fontSize:"14px", resize:"none", fontFamily:"'DM Sans', sans-serif", lineHeight:"1.5" },
  sendBtn: { width:"44px", height:"44px", borderRadius:"12px", border:"none", background:"linear-gradient(135deg, #667eea, #764ba2)", color:"#fff", fontSize:"18px", cursor:"pointer", flexShrink:0, transition:"opacity 0.2s" },
};