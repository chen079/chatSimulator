import React, { useState, useRef, useLayoutEffect, useEffect, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import {
  Plus, Smile, MoreHorizontal, Image as ImageIcon, Gift, Clock3, Trash2, Download,
  Users, Search, MessageCircle, User, Box, Compass, Smartphone, Menu, Phone, Video,
  Folder, Scissors, Mic, Hash, Gamepad2, Star, ChevronLeft, ChevronRight, BellOff,
  Camera, Monitor, Wifi, BatteryLow, Minus, Square, X, Pin, Clock, ChevronDown,
  CirclePlus, Ear, Sticker, Pencil, ArrowUpFromLine, AlignJustify
} from 'lucide-react';
import './styles.css';

/* ── Local persistence (IndexedDB; images are data URLs so they never leave the browser) ── */
const DB_NAME = 'chat-lab', STORE = 'state', STATE_KEY = 'current';

let dbPromise;
function openDB() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idb(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

const loadState = () => idb('readonly', s => s.get(STATE_KEY)).catch(e => { console.warn('读取本地存档失败', e); return null; });
const saveState = state => idb('readwrite', s => s.put(state, STATE_KEY)).then(() => true, e => { console.warn('自动保存失败', e); return false; });
const clearState = () => idb('readwrite', s => s.delete(STATE_KEY)).catch(() => {});

const ME = '我';
const seed = [
  { name: '林檎', avatar: '林', preview: '晚安，明天见！', time: '22:48',
    messages: [
      { text: '你到家了吗？', time: '22:42' },
      { text: '刚到，今天辛苦啦！', me: true, time: '22:44' },
      { text: '晚安，明天见！', time: '22:48' },
    ] },
  { name: '摸鱼小分队', avatar: '摸', preview: '阿杰：这个方案绝了', time: '昨天', group: true, members: 6, muted: true,
    messages: [
      { text: '这个方案绝了', time: '18:20', sender: '阿杰' },
      { text: '周末一起吃火锅？', me: true, time: '18:32' },
      { text: '好啊好啊！', time: '18:35', sender: '小美' },
    ] },
  { name: '妈妈', avatar: '妈', preview: '记得带伞', time: '周一',
    messages: [{ text: '记得带伞', time: '08:04' }] },
  { name: '王同学', avatar: '王', preview: '你看看', time: '10/02',
    messages: [{ text: '你看看', time: '10:02' }] },
];

/* Unread = messages from the other side after my last reply (system lines and time dividers don't count) */
function countUnread(c) {
  let n = 0;
  for (let i = c.messages.length - 1; i >= 0; i--) {
    const m = c.messages[i];
    if (m.me) break;
    if (m.type !== 'system' && m.type !== 'divider') n++;
  }
  return n;
}
const unreadTotal = chats => chats.reduce((n, c) => n + (c.muted ? 0 : c.unread || 0), 0);

/* Scales a fixed-size design to fit its container width */
function Stage({ w, h, natural, innerRef, children }) {
  const wrap = useRef(null);
  const [fitZ, setZ] = useState(1);
  const z = natural ? 1 : fitZ; // exports render at 1:1 so measurements aren't scaled
  useLayoutEffect(() => {
    const el = wrap.current;
    const fit = () => setZ(Math.min(1, el.clientWidth / w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={wrap} className="stage" style={{ height: h * z }}>
      <div ref={innerRef} style={{ width: w, height: h, zoom: z }}>{children}</div>
    </div>
  );
}

const Ctx = createContext({ myAvatar: null, pickImage: () => {}, insertAt: null, setInsertAt: () => {} });

function Avatar({ text, img, className = '' }) {
  return (
    <div className={'av ' + className}>
      {img ? <img src={img} alt="" draggable={false} /> : text}
    </div>
  );
}

const RATIOS = [['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['16:9', 16 / 9]];

/* Pan + zoom cropper. Calls onDone(dataUrl) / onCancel(). */
function Cropper({ src, ratios, maxOut, title, onDone, onCancel, allowOriginal }) {
  const [ratio, setRatio] = useState(ratios[0][1]);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [nat, setNat] = useState(null);
  const drag = useRef(null);

  useEffect(() => {
    const im = new window.Image();
    im.onload = () => setNat({ w: im.naturalWidth, h: im.naturalHeight, el: im });
    im.src = src;
  }, [src]);

  const BOX = 320;
  const W = ratio >= 1 ? BOX : Math.round(BOX * ratio);
  const H = ratio >= 1 ? Math.round(BOX / ratio) : BOX;
  const base = nat ? Math.max(W / nat.w, H / nat.h) : 1;
  const scale = base * zoom;
  const clamp = o => {
    if (!nat) return o;
    const mx = Math.max(0, (nat.w * scale - W) / 2), my = Math.max(0, (nat.h * scale - H) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  const pos = clamp(off);

  const down = e => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, o: pos };
  };
  const move = e => {
    if (!drag.current) return;
    const d = drag.current;
    setOff(clamp({ x: d.o.x + e.clientX - d.x, y: d.o.y + e.clientY - d.y }));
  };
  const up = () => { drag.current = null; };
  const wheel = e => setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.002)));

  const done = () => {
    const sw = W / scale, sh = H / scale;
    const sx = -(W / 2 + pos.x) / scale + nat.w / 2;
    const sy = -(H / 2 + pos.y) / scale + nat.h / 2;
    const k = Math.min(1, maxOut / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(nat.el, sx, sy, sw, sh, 0, 0, c.width, c.height);
    onDone(c.toDataURL('image/jpeg', 0.92));
  };

  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="crop-view" style={{ width: W, height: H }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel}>
          {nat && <img src={src} alt="" draggable={false}
            style={{ width: nat.w * scale, height: nat.h * scale,
              transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />}
          <i className="grid-h" /><i className="grid-v" />
        </div>
        {ratios.length > 1 && (
          <div className="seg">
            {ratios.map(([l, r]) => (
              <button key={l} className={ratio === r ? 'active' : ''} onClick={() => setRatio(r)}>{l}</button>
            ))}
          </div>
        )}
        <label className="zoom">缩放
          <input type="range" min="1" max="4" step="0.01" value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))} />
        </label>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel}>取消</button>
          {allowOriginal && <button className="ghost" onClick={() => onDone(src)}>使用原图</button>}
          <button className="primary" onClick={done} disabled={!nat}>确定</button>
        </div>
      </div>
    </div>
  );
}

/* ─── MsgEditModal: edit/delete a single message ─── */
function MsgEditModal({ m, onSave, onDelete, onClose }) {
  const [text, setText] = useState(m.text || '');
  const [me, setMe] = useState(!!m.me);
  const [sender, setSender] = useState(m.sender || '');
  const isSpecial = m.type && m.type !== 'text';
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal msg-edit-modal" onClick={e => e.stopPropagation()}>
        <h3>编辑消息</h3>
        {!isSpecial && (
          <>
            <textarea className="msg-edit-ta" value={text} onChange={e => setText(e.target.value)} rows={4} />
            <div className="seg" style={{ alignSelf: 'stretch' }}>
              <button className={me ? '' : 'active'} onClick={() => setMe(false)}>对方</button>
              <button className={me ? 'active' : ''} onClick={() => setMe(true)}>我</button>
            </div>
            {!me && <input type="text" placeholder="发言人（群聊可填）" value={sender}
              onChange={e => setSender(e.target.value)} style={{ width: '100%', border: '1px solid #ddd', borderRadius: 6, padding: '7px 10px', font: '13px inherit' }} />}
          </>
        )}
        {isSpecial && <p style={{ color: '#888', fontSize: 13, margin: 0 }}>该消息类型不支持文字编辑，可直接删除。</p>}
        <div className="modal-actions" style={{ width: '100%', justifyContent: 'space-between' }}>
          <button className="ghost" style={{ color: '#e94b35', borderColor: '#f5c0b8' }} onClick={onDelete}>删除</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ghost" onClick={onClose}>取消</button>
            {!isSpecial && <button className="primary" onClick={() => onSave({ ...m, text, me, sender: me ? undefined : sender || undefined })}>保存</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Hover actions on a message; filtered out of exports */
function MsgActions({ idx, onEdit, onInsertAfter }) {
  const { insertAt } = useContext(Ctx);
  return (
    <span className="msg-actions">
      <button title="在这条消息后插入" className={insertAt === idx + 1 ? 'on' : ''}
        onClick={e => { e.stopPropagation(); onInsertAfter(idx); }}><ArrowUpFromLine size={12} style={{ transform: 'rotate(180deg)' }} /></button>
      <button title="编辑 / 删除" onClick={e => { e.stopPropagation(); onEdit(idx); }}><Pencil size={12} /></button>
    </span>
  );
}

function Bubble({ m, idx, chat, isGroup, showTime, mobile, onEdit, onInsertAfter }) {
  const { myAvatar } = useContext(Ctx);
  if (m.type === 'divider') return (
    <div className="divider msg-row-wrap">
      <span>{m.text}</span>
      {onEdit && <MsgActions idx={idx} onEdit={onEdit} onInsertAfter={onInsertAfter} />}
    </div>
  );
  if (m.type === 'system') return (
    <div className="sys msg-row-wrap">
      <span>{m.text}</span>
      {onEdit && <MsgActions idx={idx} onEdit={onEdit} onInsertAfter={onInsertAfter} />}
    </div>
  );
  const body =
    m.type === 'redpacket' ? <div className="redpacket"><b>🧧 {m.text}</b><span>红包</span></div> :
    m.type === 'image' ? (m.src ? <img className="imgmsg" src={m.src} alt="" draggable={false} /> : <div className="imgph"><ImageIcon size={36} /></div>) :
    <div className="bubble">{m.text}</div>;
  return (
    <div className={'row ' + (m.me ? 'me' : '') + ' msg-row-wrap'}>
      {onEdit && <MsgActions idx={idx} onEdit={onEdit} onInsertAfter={onInsertAfter} />}
      {!m.me && <Avatar text={chat.avatar} img={chat.avatarImg} />}
      <div className="col">
        {!m.me && (isGroup || mobile) && (isGroup ? m.sender : null) && <span className="sender">{m.sender}</span>}
        <div className="line">
          {body}
          {showTime && m.time && <span className="mtime">{m.time}</span>}
        </div>
      </div>
      {m.me && <Avatar text={ME} img={myAvatar} className="mine" />}
    </div>
  );
}

function Messages({ chat, isGroup, showTime, mobile, onEdit, onInsertAfter }) {
  const { insertAt, setInsertAt } = useContext(Ctx);
  const ref = useRef(null);
  const n = chat.messages.length;
  const inserting = insertAt != null && insertAt < n;
  useLayoutEffect(() => {
    // follow new messages to the bottom, but not while inserting mid-conversation
    if (!inserting) ref.current.scrollTop = ref.current.scrollHeight;
  }, [n]);
  return (
    <div className="msgs" ref={ref}>
      {chat.messages.map((m, i) => (
        <React.Fragment key={i}>
          {inserting && i === insertAt && (
            <div className="ins-mark no-export">
              <span>新消息将插入到这里</span>
              <button onClick={() => setInsertAt(null)}>取消</button>
            </div>
          )}
          <Bubble m={m} idx={i} chat={chat} isGroup={isGroup} showTime={showTime} mobile={mobile}
            onEdit={onEdit} onInsertAfter={onInsertAfter} />
        </React.Fragment>
      ))}
    </div>
  );
}

/* ───────── Desktop ───────── */
function Desktop({ theme, chats, active, setActive, chat, isGroup, showTime, input, setInput, send, onEdit, onInsertAfter }) {
  const qq = theme === 'qq';
  const { myAvatar, pickImage } = useContext(Ctx);
  const total = unreadTotal(chats);
  const railIcons = qq
    ? [MessageCircle, User, Star, Hash, Gamepad2, Compass, Box, Gamepad2]
    : [MessageCircle, User, Box, Compass];
  return (
    <div className={'win t-' + theme}>
      <div className="rail">
        {qq ? <div className="rail-top-qq" /> : <Avatar text={ME} img={myAvatar} className="rail-me" />}
        <div className="rail-icons">
          {railIcons.map((I, i) => (
            <div key={i} className={'rail-i ' + (i === 0 ? 'on' : '')}>
              <I size={22} />
              {i === 0 && !qq && total > 0 && <em className="badge">{total > 99 ? '99+' : total}</em>}
              {qq && (i === 2 || i === 3) && <em className="dot" />}
            </div>
          ))}
        </div>
        <div className="rail-bottom">
          <Smartphone size={20} /><Menu size={20} />
        </div>
      </div>

      <div className="main">
      {!qq && <div className="titlebar"><Pin size={14} /><Minus size={16} /><Square size={12} /><X size={17} /></div>}
      <div className="body">
      <div className="clist">
        {qq ? (
          <div className="search-row">
            <div className="search"><Search size={15} /> 搜索</div>
            <div className="plus"><Plus size={16} /></div>
          </div>
        ) : (
          <div className="list-head">
            <div className="search"><Search size={15} /> 搜索</div>
            <div className="plus"><Plus size={16} /></div>
          </div>
        )}
        <div className="items">
          {chats.map((c, i) => (
            <div key={i} className={'citem ' + (i === active ? 'on' : '')} onClick={() => setActive(i)}>
              <div className="avwrap">
                <Avatar text={c.avatar} img={c.avatarImg} />
                {c.muted && c.unread > 0 && <em className="dot" />}
              </div>
              <div className="ctext">
                <div className="ctop"><strong>{c.name}</strong><span>{c.time}</span></div>
                <div className="cbot">
                  <small>{c.preview}</small>
                  {c.muted ? <BellOff size={13} /> : c.unread ? <em className="cnt">{c.unread > 99 ? '99+' : c.unread}</em> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pane">
        <div className="pane-head">
          <strong>{chat.name}{isGroup ? `(${chat.members || 6})` : ''}</strong>
          <div className="pane-actions">
            {qq ? <><Phone size={19} /><Video size={19} /><Monitor size={19} /><CirclePlus size={19} /><MoreHorizontal size={19} /></>
                : <><span className="act-dd"><MessageCircle size={18} /><ChevronDown size={12} /></span><Phone size={18} /><MoreHorizontal size={18} /></>}
          </div>
        </div>
        <Messages chat={chat} isGroup={isGroup} showTime={showTime} onEdit={onEdit} onInsertAfter={onInsertAfter} />
        {!qq ? (
          <div className="inputbox wx">
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} />
            <div className="toolbar">
              <Smile size={19} /><Box size={19} /><Folder size={19} />
              <ImageIcon size={19} className="clickable" onClick={() => pickImage('img-me')} />
              <span className="act-dd"><Scissors size={19} /><ChevronDown size={12} /></span><Mic size={19} />
              <span className="grow" />
              <button className={'send' + (input.trim() ? ' ready' : '')} onClick={send}>发送</button>
            </div>
          </div>
        ) : (
        <div className="inputbox">
          <div className="toolbar">
            <Smile size={20} />
            {qq ? <><Scissors size={20} /><Folder size={20} /><ImageIcon size={20} className="clickable" onClick={() => pickImage('img-me')} /><Mic size={20} /></>
                : <><Folder size={20} /><ImageIcon size={20} className="clickable" onClick={() => pickImage('img-me')} /><Scissors size={20} /><Mic size={20} /></>}
            <span className="grow" />
            {qq && <Clock size={19} />}
          </div>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())} />
          <button className="send" onClick={send}>发送{qq && <><i /><ChevronDown size={14} /></>}</button>
        </div>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}

/* ───────── Mobile ───────── */
function StatusBar() {
  return (
    <div className="status">
      <span className="clock">16:45</span>
      <div className="island" />
      <span className="sicons"><Wifi size={16} /><BatteryLow size={22} /></span>
    </div>
  );
}

function Mobile({ theme, chats, setActive, chat, isGroup, showTime, input, setInput, send, page, setPage, onEdit, onInsertAfter }) {
  const qq = theme === 'qq';
  const { myAvatar, pickImage } = useContext(Ctx);
  const total = unreadTotal(chats);
  const tabs = qq
    ? [[MessageCircle, '消息'], [Hash, '频道'], [User, '联系人'], [Compass, '动态']]
    : [[MessageCircle, '微信'], [User, '通讯录'], [Compass, '发现'], [User, '我']];

  return (
    <div className={'mob t-' + theme}>
      <StatusBar />
      {page === 'list' ? (
        <>
          {qq ? (
            <div className="mhead qq-list-head">
              <Avatar text={ME} img={myAvatar} className="big" />
              <div><b>{ME}</b><small><i className="online" />在线 - WiFi</small></div>
              <Plus size={28} />
            </div>
          ) : (
            <div className="mhead center"><b>微信{total ? `(${total})` : ''}</b>
              <span className="r"><Search size={22} /><CirclePlus size={22} /></span></div>
          )}
          <div className="mlist">
            {qq && <div className="win-login"><Monitor size={22} /> 已登录 Windows <ChevronRight size={18} /></div>}
            {chats.map((c, i) => (
              <div key={i} className="mitem" onClick={() => { setActive(i); setPage('chat'); }}>
                <div className="avwrap">
                  <Avatar text={c.avatar} img={c.avatarImg} />
                  {c.unread > 0 && (qq || !c.muted) ? <em className="cnt">{c.unread > 99 ? '99+' : c.unread}</em> : null}
                  {!qq && c.unread > 0 && c.muted ? <em className="dot" /> : null}
                </div>
                <div className="mtext">
                  <div className="mtop"><strong>{c.name}</strong><span>{c.time}</span></div>
                  <div className="mbot"><small>{c.preview}</small>{c.muted && <BellOff size={15} />}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="mhead chat-head">
            <button onClick={() => setPage('list')} className="back"><ChevronLeft size={26} />{total > 0 && <em>{total}</em>}</button>
            <b>{chat.name}{isGroup ? `(${chat.members || 6})` : ''}{qq && <Ear size={16} className="ear" />}</b>
            <span className="r">{qq ? <Menu size={24} /> : <MoreHorizontal size={24} />}</span>
          </div>
          <Messages chat={chat} isGroup={isGroup} showTime={showTime} mobile onEdit={onEdit} onInsertAfter={onInsertAfter} />
          {qq ? (
            <div className="qq-bottom">
              <div className="chips">
                {['作业', '文件', '相册', '精华消息'].map(t => <span key={t}>{t}</span>)}
              </div>
              <div className="qq-input">
                <input value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), send())} />
                <button className="send" onClick={send} disabled={!input.trim()}>发送</button>
              </div>
              <div className="qq-icons"><Mic size={26} /><ImageIcon size={26} className="clickable" onClick={() => pickImage('img-me')} /><Camera size={26} /><Sticker size={26} /><Smile size={26} /><CirclePlus size={26} /></div>
            </div>
          ) : (
            <div className="wx-bottom">
              <Mic size={28} />
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), send())} />
              <Smile size={28} /><CirclePlus size={28} className="clickable" onClick={() => pickImage('img-me')} />
            </div>
          )}
        </>
      )}
      {page === 'list' && (
        <div className="tabbar">
          {tabs.map(([I, label], i) => (
            <div key={i} className={'tab ' + (i === 0 ? 'on' : '')}>
              <I size={26} />{i === 0 && total > 0 && <em className="badge">{total}</em>}
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="homebar" />
    </div>
  );
}

/* ───────── App ───────── */
function App() {
  const [hydrated, setHydrated] = useState(false);
  const [chats, setChats] = useState(seed);
  const [active, setActive] = useState(0);
  const [input, setInput] = useState('');
  const [showTime, setShowTime] = useState(false);
  const [platform, setPlatform] = useState('desktop');
  const [theme, setTheme] = useState('wechat');
  const [page, setPage] = useState('chat');
  const [myAvatar, setMyAvatar] = useState(null);
  const [crop, setCrop] = useState(null);
  const [asOther, setAsOther] = useState(false);
  const [senderName, setSenderName] = useState('阿杰');

  /* hydrate from IndexedDB on first mount */
  useEffect(() => {
    (async () => {
      const s = await loadState();
      if (s) {
        if (s.chats?.length) { setChats(s.chats); setActive(Math.min(s.active || 0, s.chats.length - 1)); }
        if (s.showTime != null) setShowTime(s.showTime);
        if (s.platform) setPlatform(s.platform);
        if (s.theme) setTheme(s.theme);
        if (s.myAvatar) setMyAvatar(s.myAvatar);
        if (s.asOther != null) setAsOther(s.asOther);
        if (s.senderName != null) setSenderName(s.senderName);
      }
      setHydrated(true);
    })();
  }, []);

  /* auto-save after hydration; images are data URLs so they stay in the browser */
  const [saveStatus, setSaveStatus] = useState('saved');
  useEffect(() => {
    if (!hydrated) return;
    setSaveStatus('saving');
    const t = setTimeout(async () => {
      const ok = await saveState({ chats, active, showTime, platform, theme, myAvatar, asOther, senderName });
      setSaveStatus(ok ? 'saved' : 'error');
    }, 500);
    return () => clearTimeout(t);
  }, [hydrated, chats, active, showTime, platform, theme, myAvatar, asOther, senderName]);

  const resetAll = async () => {
    if (!confirm('确定要清除所有本地保存的内容并恢复默认示例吗？此操作不可撤销。')) return;
    await clearState();
    setChats(seed); setActive(0); setShowTime(false); setPlatform('desktop');
    setTheme('wechat'); setMyAvatar(null); setAsOther(false); setSenderName('阿杰');
  };
  const fileRef = useRef(null);
  const kindRef = useRef(null);
  const chat = chats[active];
  const isGroup = !!chat.group;

  const patchChat = p => setChats(cs => cs.map((c, i) => i === active ? { ...c, ...p } : c));
  const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  /* message editing: editIdx opens the modal, insertAt redirects new messages */
  const [editIdx, setEditIdx] = useState(null);
  const [insertAt, setInsertAt] = useState(null);
  useEffect(() => { setEditIdx(null); setInsertAt(null); }, [active]);

  /* Adds msg at the insert cursor (advancing it) or at the end. Only end-appends update the list preview. */
  const addMsg = (msg, preview) => {
    const msgs = chat.messages;
    if (insertAt != null && insertAt < msgs.length) {
      patchChat({ messages: [...msgs.slice(0, insertAt), msg, ...msgs.slice(insertAt)] });
      setInsertAt(insertAt + 1);
    } else {
      patchChat({ messages: [...msgs, msg],
        ...(preview != null ? { preview, time: msg.time || chat.time } : {}) });
    }
  };
  const saveMsg = (i, m) => {
    patchChat({ messages: chat.messages.map((x, j) => j === i ? m : x) });
    setEditIdx(null);
  };
  const deleteMsg = i => {
    patchChat({ messages: chat.messages.filter((_, j) => j !== i) });
    if (insertAt != null && i < insertAt) setInsertAt(insertAt - 1);
    setEditIdx(null);
  };

  const send = () => {
    if (!input.trim()) return;
    const text = input.trim();
    const msg = asOther
      ? { text, time: now(), ...(isGroup ? { sender: senderName } : {}) }
      : { text, me: true, time: now() };
    addMsg(msg, asOther && isGroup && senderName ? `${senderName}：${text}` : text);
    setInput('');
  };
  const quick = type => {
    const msg =
      type === 'redpacket' ? (asOther
        ? { type, text: '恭喜发财，大吉大利', ...(isGroup ? { sender: senderName } : {}) }
        : { type, text: '恭喜发财，大吉大利', me: true }) :
      type === 'system' ? { type, text: '你撤回了一条消息' } :
      type === 'divider' ? { type, text: now() } :
      { type: 'image', me: true };
    addMsg(msg, type === 'redpacket' ? '[红包]' : null);
  };
  const pickImage = kind => { kindRef.current = kind; fileRef.current.click(); };
  const onFile = e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const kind = kindRef.current;
    const r = new FileReader();
    r.onload = () => setCrop({ src: r.result, kind });
    r.readAsDataURL(f);
  };
  const cropDone = url => {
    const { kind } = crop;
    setCrop(null);
    if (kind === 'avatar-me') setMyAvatar(url);
    else if (kind === 'avatar-contact') patchChat({ avatarImg: url });
    else {
      const me = kind === 'img-me';
      const msg = { type: 'image', src: url, me, time: now(),
        ...(!me && isGroup ? { sender: senderName } : {}) };
      addMsg(msg, '[图片]');
    }
  };
  const add = () => {
    setChats(cs => [{ name: '新会话', avatar: '新', preview: '开始聊天吧', time: '刚刚', messages: [] }, ...cs]);
    setActive(0);
  };

  /* ── Export ──
     'shot': the window exactly as currently scrolled.
     'long': the window grown to fit every message. */
  const stageRef = useRef(null);
  const [exporting, setExporting] = useState(null);
  const exportImage = async mode => {
    if (exporting) return;
    setEditIdx(null);
    setExporting(mode);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const node = stageRef.current.firstElementChild;
    const msgs = node.querySelector('.msgs');
    const first = msgs && msgs.querySelector(':scope > :not(.no-export)');
    const cls = mode === 'long' ? 'export-long' : 'export-shot';
    // a cloned node loses its scroll position, so bake the scroll offset into a margin
    const scrollTop = msgs ? msgs.scrollTop : 0;
    if (mode === 'shot' && first) first.style.marginTop = `-${scrollTop}px`;
    node.classList.add(cls);
    try {
      await new Promise(r => requestAnimationFrame(r));
      const url = await toPng(node, {
        pixelRatio: 2,
        width: node.offsetWidth,
        height: node.offsetHeight,
        filter: n => !(n.classList && (n.classList.contains('no-export') || n.classList.contains('msg-actions'))),
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = `${chat.name || 'chat'}-${mode === 'long' ? '长图' : '截图'}.png`;
      a.click();
    } catch (err) {
      alert('导出失败：' + (err && err.message ? err.message : err));
    } finally {
      node.classList.remove(cls);
      if (first) first.style.marginTop = '';
      if (msgs && mode === 'shot') msgs.scrollTop = scrollTop;
      setExporting(null);
    }
  };

  const onEdit = i => setEditIdx(i);
  const onInsertAfter = i => setInsertAt(cur => (cur === i + 1 ? null : i + 1));

  // the open chat counts as read; others count from their messages
  const chatsView = chats.map((c, i) => ({ ...c, unread: i === active ? 0 : countUnread(c) }));
  const common = { theme, chats: chatsView, active, setActive, chat, isGroup, showTime, input, setInput, send, onEdit, onInsertAfter };

  return (
    <Ctx.Provider value={{ myAvatar, pickImage, insertAt, setInsertAt }}>
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="mark">◉</span> CHAT / LAB <em>梗图工坊</em></div>
        <div className="actions">
          <span className="save-status">
            {saveStatus === 'saving' ? '保存中…' : saveStatus === 'error' ? '⚠ 保存失败' : '✓ 已自动保存'}
          </span>
          <button className="ghost" onClick={resetAll}><Trash2 size={14} /> 重置</button>
          <button className="ghost" onClick={() => patchChat({ messages: [] })}><Trash2 size={14} /> 清空画布</button>
          <button className="ghost" disabled={!!exporting} onClick={() => exportImage('shot')}>
            <Download size={14} /> {exporting === 'shot' ? '导出中…' : '导出截图'}</button>
          <button className="primary" disabled={!!exporting} onClick={() => exportImage('long')}>
            <AlignJustify size={14} /> {exporting === 'long' ? '导出中…' : '导出长图'}</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="side-title">会话<button onClick={add}><Plus size={17} /></button></div>
          {chats.map((c, i) => (
            <div className={'side-item ' + (i === active ? 'active' : '')} key={i} onClick={() => setActive(i)}>
              <div className="mini-avatar">{c.avatar}</div>
              <div className="chat-copy"><strong>{c.name}</strong><small>{c.preview}</small></div>
              <div className="side-item-right">
                <span>{c.time}</span>
                <button className="del-btn" title="删除会话" onClick={e => {
                  e.stopPropagation();
                  if (chats.length === 1) return;
                  const next = chats.filter((_, j) => j !== i);
                  setChats(next);
                  setActive(i < active ? active - 1 : Math.min(active, next.length - 1));
                }}><X size={13} /></button>
              </div>
            </div>
          ))}
        </aside>

        <section className="editor">
          <div className="section-heading">
            <div><span className="eyebrow">CANVAS 01</span><h1>聊天记录模拟器</h1></div>
            <div className="heading-tools">
            <div className="seg" title="输入框发出的消息由谁发送">
              <button className={!asOther ? 'active' : ''} onClick={() => setAsOther(false)}>我发送</button>
              <button className={asOther ? 'active' : ''} onClick={() => setAsOther(true)}>对方发送</button>
            </div>
            <div className="seg">
              <button className={platform === 'desktop' ? 'active' : ''} onClick={() => setPlatform('desktop')}><Monitor size={12} /> 电脑版</button>
              <button className={platform === 'mobile' ? 'active' : ''} onClick={() => { setPlatform('mobile'); setPage('chat'); }}><Smartphone size={12} /> 手机版</button>
            </div>
            </div>
          </div>
          <div className="preview">
            {platform === 'desktop'
              ? <Stage w={960} h={600} natural={!!exporting} innerRef={stageRef}><Desktop {...common} /></Stage>
              : <Stage w={390} h={780} natural={!!exporting} innerRef={stageRef}><Mobile {...common} page={page} setPage={setPage} /></Stage>}
          </div>
        </section>

        <aside className="controls">
          <span className="eyebrow">PROPERTIES</span>
          <h2>编辑面板</h2>

          <div className="panel">
            <label>界面风格</label>
            <div className="seg">
              <button className={theme === 'wechat' ? 'active' : ''} onClick={() => setTheme('wechat')}>微信</button>
              <button className={theme === 'qq' ? 'active' : ''} onClick={() => setTheme('qq')}>QQ</button>
            </div>
          </div>

          <div className="panel">
            <label>联系人 / 群名称</label>
            <input type="text" value={chat.name} onChange={e => patchChat({ name: e.target.value })} />
            <div className="avatar-row">
              <Avatar text={chat.avatar} img={chat.avatarImg} className="ctl" />
              <input type="text" maxLength="1" value={chat.avatar} onChange={e => patchChat({ avatar: e.target.value })} />
              <button className="mini-btn" onClick={() => pickImage('avatar-contact')}>上传头像</button>
              {chat.avatarImg && <button className="mini-btn" onClick={() => patchChat({ avatarImg: null })}>清除</button>}
            </div>
            <label className="check">
              <input type="checkbox" checked={isGroup} onChange={e => patchChat({ group: e.target.checked })} />
              <Users size={12} /> 群聊（显示发言人）
            </label>
            <label className="check">
              <input type="checkbox" checked={!!chat.muted} onChange={e => patchChat({ muted: e.target.checked })} />
              消息免打扰
            </label>
          </div>

          <div className="panel">
            <label>发送身份（预览里输入框发出的消息）</label>
            <div className="seg">
              <button className={!asOther ? 'active' : ''} onClick={() => setAsOther(false)}>我</button>
              <button className={asOther ? 'active' : ''} onClick={() => setAsOther(true)}>对方</button>
            </div>
            {asOther && isGroup && (
              <input type="text" style={{ marginTop: 8 }} placeholder="发言人昵称" value={senderName}
                onChange={e => setSenderName(e.target.value)} />
            )}
          </div>

          <div className="panel">
            <label>我的头像</label>
            <div className="avatar-row">
              <Avatar text={ME} img={myAvatar} className="ctl mine" />
              <button className="mini-btn" onClick={() => pickImage('avatar-me')}>上传头像</button>
              {myAvatar && <button className="mini-btn" onClick={() => setMyAvatar(null)}>清除</button>}
            </div>
          </div>

          <div className="panel">
            <label>会话列表</label>
            <div className="time-row">
              <input type="text" value={chat.time} onChange={e => patchChat({ time: e.target.value })} />
            </div>
            <p className="hint">未读数按消息自动计算：对方在我最后一条回复之后发的消息数（当前打开的会话视为已读，免打扰会话只显示红点、不计入总数）。</p>
            <label className="check">
              <input type="checkbox" checked={showTime} onChange={e => setShowTime(e.target.checked)} />
              显示每条消息时间
            </label>
          </div>

          <div className="panel">
            <label>快捷插入</label>
            <div className="quick-grid">
              <button onClick={() => quick('redpacket')}><Gift size={13} /> 红包</button>
              <button onClick={() => pickImage('img-me')}><ImageIcon size={13} /> 我发图片</button>
              <button onClick={() => pickImage('img-other')}><ImageIcon size={13} /> 对方发图片</button>
              <button onClick={() => quick('system')}>⌁ 系统消息</button>
              <button onClick={() => quick('divider')}><Clock3 size={13} /> 时间线</button>
            </div>
          </div>
        </aside>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
      {editIdx != null && chat.messages[editIdx] && (
        <MsgEditModal key={editIdx} m={chat.messages[editIdx]}
          onSave={m => saveMsg(editIdx, m)}
          onDelete={() => deleteMsg(editIdx)}
          onClose={() => setEditIdx(null)} />
      )}
      {crop && (
        <Cropper
          src={crop.src}
          title={crop.kind.startsWith('avatar') ? '裁剪头像' : '裁剪图片'}
          ratios={crop.kind.startsWith('avatar') ? [['1:1', 1]] : RATIOS}
          maxOut={crop.kind.startsWith('avatar') ? 256 : 1280}
          allowOriginal={!crop.kind.startsWith('avatar')}
          onDone={cropDone}
          onCancel={() => setCrop(null)}
        />
      )}
    </div>
    </Ctx.Provider>
  );
}

createRoot(document.getElementById('root')).render(<App />);
