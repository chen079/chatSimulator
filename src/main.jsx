import React, { useState, useRef, useLayoutEffect, useEffect, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Plus, Smile, MoreHorizontal, Image as ImageIcon, Gift, Clock3, Trash2, Download,
  Users, Search, MessageCircle, User, Box, Compass, Smartphone, Menu, Phone, Video,
  Folder, Scissors, Mic, Hash, Gamepad2, Star, ChevronLeft, ChevronRight, BellOff,
  Camera, Monitor, Wifi, BatteryLow, Minus, Square, X, Pin, Clock, ChevronDown,
  CirclePlus, Ear, Sticker
} from 'lucide-react';
import './styles.css';

const ME = '我';
const seed = [
  { name: '林檎', avatar: '林', preview: '晚安，明天见！', time: '22:48', unread: 2,
    messages: [
      { text: '你到家了吗？', time: '22:42' },
      { text: '刚到，今天辛苦啦！', me: true, time: '22:44' },
      { text: '晚安，明天见！', time: '22:48' },
    ] },
  { name: '摸鱼小分队', avatar: '摸', preview: '阿杰：这个方案绝了', time: '昨天', group: true, members: 6, muted: true, unread: 12,
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

/* Scales a fixed-size design to fit its container width */
function Stage({ w, h, children }) {
  const wrap = useRef(null);
  const [z, setZ] = useState(1);
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
      <div style={{ width: w, height: h, zoom: z }}>{children}</div>
    </div>
  );
}

const Ctx = createContext({ myAvatar: null, pickImage: () => {} });

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

function Bubble({ m, chat, isGroup, showTime, mobile }) {
  const { myAvatar } = useContext(Ctx);
  if (m.type === 'divider') return <div className="divider">{m.text}</div>;
  if (m.type === 'system') return <div className="sys">{m.text}</div>;
  const body =
    m.type === 'redpacket' ? <div className="redpacket"><b>🧧 {m.text}</b><span>红包</span></div> :
    m.type === 'image' ? (m.src ? <img className="imgmsg" src={m.src} alt="" draggable={false} /> : <div className="imgph"><ImageIcon size={36} /></div>) :
    <div className="bubble">{m.text}</div>;
  return (
    <div className={'row ' + (m.me ? 'me' : '')}>
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

function Messages({ chat, isGroup, showTime, mobile }) {
  const ref = useRef(null);
  useLayoutEffect(() => { ref.current.scrollTop = ref.current.scrollHeight; }, [chat.messages.length]);
  return (
    <div className="msgs" ref={ref}>
      {chat.messages.map((m, i) => <Bubble key={i} m={m} chat={chat} isGroup={isGroup} showTime={showTime} mobile={mobile} />)}
    </div>
  );
}

/* ───────── Desktop ───────── */
function Desktop({ theme, chats, active, setActive, chat, isGroup, showTime, input, setInput, send }) {
  const qq = theme === 'qq';
  const { myAvatar, pickImage } = useContext(Ctx);
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
              {i === 0 && !qq && <em className="badge">17</em>}
              {qq && (i === 2 || i === 3) && <em className="dot" />}
            </div>
          ))}
        </div>
        <div className="rail-bottom">
          <Smartphone size={20} /><Menu size={20} />
        </div>
      </div>

      <div className="clist">
        <div className="search-row">
          <div className="search"><Search size={15} /> 搜索</div>
          <div className="plus"><Plus size={16} /></div>
        </div>
        <div className="items">
          {chats.map((c, i) => (
            <div key={i} className={'citem ' + (i === active ? 'on' : '')} onClick={() => setActive(i)}>
              <Avatar text={c.avatar} img={c.avatarImg} />
              <div className="ctext">
                <div className="ctop"><strong>{c.name}</strong><span>{c.time}</span></div>
                <div className="cbot">
                  <small>{c.preview}</small>
                  {c.muted ? <BellOff size={13} /> : c.unread ? <em className="cnt">{c.unread}</em> : null}
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
                : <><MessageCircle size={18} /><Phone size={18} /><MoreHorizontal size={18} /></>}
          </div>
        </div>
        <div className="winctl"><Pin size={13} /><Minus size={15} /><Square size={13} /><X size={16} /></div>
        <Messages chat={chat} isGroup={isGroup} showTime={showTime} />
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

function Mobile({ theme, chats, setActive, chat, isGroup, showTime, input, setInput, send, page, setPage }) {
  const qq = theme === 'qq';
  const { myAvatar, pickImage } = useContext(Ctx);
  const total = chats.reduce((n, c) => n + (c.muted ? 0 : c.unread || 0), 0);
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
                  {qq && c.unread ? <em className="cnt">{c.unread}</em> : null}
                  {!qq && c.unread && !c.muted ? <em className="dot" /> : null}
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
          <Messages chat={chat} isGroup={isGroup} showTime={showTime} mobile />
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
  const [chats, setChats] = useState(seed);
  const [active, setActive] = useState(0);
  const [input, setInput] = useState('');
  const [showTime, setShowTime] = useState(false);
  const [platform, setPlatform] = useState('desktop');
  const [theme, setTheme] = useState('wechat');
  const [page, setPage] = useState('chat');
  const [myAvatar, setMyAvatar] = useState(null);
  const [crop, setCrop] = useState(null);
  const fileRef = useRef(null);
  const kindRef = useRef(null);
  const chat = chats[active];
  const isGroup = !!chat.group;

  const patchChat = p => setChats(cs => cs.map((c, i) => i === active ? { ...c, ...p } : c));
  const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const send = () => {
    if (!input.trim()) return;
    const msg = { text: input.trim(), me: true, time: now() };
    patchChat({ messages: [...chat.messages, msg], preview: msg.text, time: msg.time });
    setInput('');
  };
  const quick = type => {
    const msg =
      type === 'redpacket' ? { type, text: '恭喜发财，大吉大利', me: true } :
      type === 'system' ? { type, text: '你撤回了一条消息' } :
      type === 'divider' ? { type, text: now() } :
      { type: 'image', me: true };
    patchChat({ messages: [...chat.messages, msg] });
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
      const msg = { type: 'image', src: url, me, time: now() };
      patchChat({ messages: [...chat.messages, msg], preview: '[图片]', time: msg.time });
    }
  };
  const add = () => {
    setChats(cs => [{ name: '新会话', avatar: '新', preview: '开始聊天吧', time: '刚刚', messages: [] }, ...cs]);
    setActive(0);
  };

  const common = { theme, chats, active, setActive, chat, isGroup, showTime, input, setInput, send };

  return (
    <Ctx.Provider value={{ myAvatar, pickImage }}>
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="mark">◉</span> CHAT / LAB <em>梗图工坊</em></div>
        <div className="actions">
          <button className="ghost" onClick={() => patchChat({ messages: [] })}><Trash2 size={14} /> 清空画布</button>
          <button className="primary"><Download size={14} /> 导出图片</button>
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
            <div className="seg">
              <button className={platform === 'desktop' ? 'active' : ''} onClick={() => setPlatform('desktop')}><Monitor size={12} /> 电脑版</button>
              <button className={platform === 'mobile' ? 'active' : ''} onClick={() => { setPlatform('mobile'); setPage('chat'); }}><Smartphone size={12} /> 手机版</button>
            </div>
          </div>
          <div className="preview">
            {platform === 'desktop'
              ? <Stage w={960} h={600}><Desktop {...common} /></Stage>
              : <Stage w={390} h={780}><Mobile {...common} page={page} setPage={setPage} /></Stage>}
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
              <input type="text" value={chat.unread || ''} placeholder="未读数"
                onChange={e => patchChat({ unread: parseInt(e.target.value) || 0 })} />
            </div>
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
