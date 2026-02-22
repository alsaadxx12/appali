import React, { useState, useEffect, useRef } from 'react';
import {
    ArrowRight, Send, Search, Users, MessageCircle, Loader2,
    Smile, Paperclip, Image as ImageIcon, X, Trash2, Edit3, Check,
    Clock, Download, FileText, Camera, EyeOff, CheckCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../firebase';
import {
    collection, doc, getDocs, addDoc, query, where, orderBy,
    onSnapshot, serverTimestamp, Timestamp, setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface ChatUser { id: string; name: string; avatar?: string; department?: string; online?: boolean; lastSeen?: Timestamp; }
interface Message { id: string; text: string; senderId: string; senderName: string; createdAt: Timestamp | null; edited?: boolean; deleted?: boolean; type?: 'text' | 'image' | 'file'; fileUrl?: string; fileName?: string; fileSize?: string; disappearAfter?: number; readBy?: Record<string, boolean>; }
interface Conversation { id: string; participants: string[]; participantNames: Record<string, string>; lastMessage?: string; lastMessageAt?: Timestamp; readBy?: Record<string, Timestamp>; lastSenderId?: string; }
interface Props { onBack: () => void; }

const EMOJI_CATS = [
    { id: 's', icon: '😀', emojis: ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😜', '🤗', '😎', '🥳', '🤩', '😏', '😢', '😭', '😡', '🤯', '😴', '🤔', '🙄', '😱', '🤫', '🤐', '😷', '💀', '👻', '👽', '🤖', '💩', '🥺'] },
    { id: 'h', icon: '👋', emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👋', '👏', '🙌', '🤝', '🙏', '💪', '👊', '✊', '🫶', '❤️‍🔥', '💯', '🔥'] },
    { id: 'l', icon: '❤️', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '♥️', '🫀', '💋'] },
    { id: 'o', icon: '📎', emojis: ['📱', '💻', '📸', '🎥', '📞', '📧', '📝', '📋', '📌', '📎', '✂️', '🔑', '🔒', '💡', '⏰', '📅', '💼', '📁', '🗂️', '✅'] },
    { id: 'f', icon: '🍕', emojis: ['☕', '🍵', '🧃', '🍕', '🍔', '🍟', '🌮', '🍣', '🍰', '🎂', '🍩', '🍪', '🍫', '🍿', '🥤', '🍦', '🥗', '🍜', '🥘', '🧁'] },
    { id: 'n', icon: '🌙', emojis: ['☀️', '🌙', '⭐', '🌟', '✨', '⚡', '🔥', '💧', '🌊', '🌈', '❄️', '🌸', '🌺', '🌻', '🍀', '🌲', '🌴', '🐦', '🦋', '🐾'] },
];
const DISAPPEAR = [{ l: 'إيقاف', v: 0 }, { l: '10 ث', v: 10 }, { l: '30 ث', v: 30 }, { l: '1 د', v: 60 }, { l: '5 د', v: 300 }];

export default function ChatPage({ onBack }: Props) {
    const { user } = useAuth();
    const uid = user?.id || '';
    const [activeChat, setActiveChat] = useState<{ convId: string; otherUser: ChatUser } | null>(null);
    const [convs, setConvs] = useState<Conversation[]>([]);
    const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
    const [msgs, setMsgs] = useState<Message[]>([]);
    const [newMsg, setNewMsg] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [usersLoaded, setUsersLoaded] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const inpRef = useRef<HTMLInputElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const imgRef = useRef<HTMLInputElement>(null);
    const [showEmoji, setShowEmoji] = useState(false);
    const [emojiCat, setEmojiCat] = useState('s');
    const [showAttach, setShowAttach] = useState(false);
    const [ctxMsg, setCtxMsg] = useState<Message | null>(null);
    const [ctxPos, setCtxPos] = useState({ x: 0, y: 0 });
    const [editMsg, setEditMsg] = useState<Message | null>(null);
    const [editTxt, setEditTxt] = useState('');
    const [disappear, setDisappear] = useState(0);
    const [showDisappear, setShowDisappear] = useState(false);
    const [otherOnline, setOtherOnline] = useState(false);
    const [otherLastSeen, setOtherLastSeen] = useState<Timestamp | null>(null);
    const [imgPreview, setImgPreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [showDeleteConv, setShowDeleteConv] = useState<string | null>(null);

    // Load users
    useEffect(() => { if (!uid) return; (async () => { try { const s = await getDocs(collection(db, 'users')); setAllUsers(s.docs.filter(d => d.id !== uid).map(d => ({ id: d.id, name: d.data().name || 'مستخدم', avatar: d.data().avatar, department: d.data().department, online: d.data().online === true, lastSeen: d.data().lastSeen }))); } catch (e) { } setUsersLoaded(true); })(); }, [uid]);

    // Load convs
    useEffect(() => { if (!uid) return; const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid), orderBy('lastMessageAt', 'desc')); const u = onSnapshot(q, s => { setConvs(s.docs.map(d => ({ id: d.id, ...d.data() } as Conversation))); setLoading(false); }, () => setLoading(false)); return () => u(); }, [uid]);

    // Load messages + mark as read
    useEffect(() => {
        if (!activeChat) { setMsgs([]); return; }
        const q = query(collection(db, 'conversations', activeChat.convId, 'messages'), orderBy('createdAt', 'asc'));
        const u = onSnapshot(q, s => {
            const m: Message[] = s.docs.map(d => ({ id: d.id, ...d.data() } as Message));
            setMsgs(m);
            setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            // Mark as read
            setDoc(doc(db, 'conversations', activeChat.convId), {
                readBy: { [uid]: serverTimestamp() }
            }, { merge: true }).catch(() => { });
            // Mark individual messages as read
            m.forEach(msg => {
                if (msg.senderId !== uid && (!msg.readBy || !msg.readBy[uid])) {
                    updateDoc(doc(db, 'conversations', activeChat.convId, 'messages', msg.id), {
                        [`readBy.${uid}`]: true
                    }).catch(() => { });
                }
            });
        });
        return () => u();
    }, [activeChat?.convId, uid]);

    // Other user online
    useEffect(() => { if (!activeChat) return; const u = onSnapshot(doc(db, 'users', activeChat.otherUser.id), s => { if (s.exists()) { const d = s.data(); setOtherOnline(d.online === true); setOtherLastSeen(d.lastSeen || null); } }); return () => u(); }, [activeChat?.otherUser.id]);

    // Disappearing msgs
    useEffect(() => { const i = setInterval(() => setMsgs(p => p.map(m => m.disappearAfter && m.disappearAfter > 0 && m.createdAt && (Date.now() - m.createdAt.toDate().getTime()) / 1000 > m.disappearAfter ? { ...m, deleted: true, text: '💨 رسالة ذاتية الاختفاء' } : m)), 2000); return () => clearInterval(i); }, []);

    // Close ctx
    useEffect(() => { const h = () => setCtxMsg(null); if (ctxMsg) window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, [ctxMsg]);

    const openChatWith = async (tu: ChatUser) => {
        const ex = convs.find(c => c.participants.includes(tu.id) && c.participants.includes(uid));
        if (ex) { setActiveChat({ convId: ex.id, otherUser: tu }); return; }
        if (!user) return;
        try {
            const r = await addDoc(collection(db, 'conversations'), { participants: [uid, tu.id], participantNames: { [uid]: user.name, [tu.id]: tu.name }, lastMessage: '', lastMessageAt: serverTimestamp(), createdAt: serverTimestamp(), lastSenderId: uid });
            setActiveChat({ convId: r.id, otherUser: tu });
        } catch (e) { console.error(e); }
    };

    const openExisting = (c: Conversation) => {
        const oid = c.participants.find(p => p !== uid) || '';
        const on = c.participantNames?.[oid] || 'مستخدم';
        setActiveChat({ convId: c.id, otherUser: allUsers.find(u => u.id === oid) || { id: oid, name: on } });
    };

    const sendMessage = async (opts?: { type?: string; fileUrl?: string; fileName?: string; fileSize?: string }) => {
        if ((!newMsg.trim() && !opts?.fileUrl) || !activeChat || !user) return;
        setSending(true); const t = newMsg.trim(); setNewMsg(''); setShowEmoji(false);
        try {
            const d: any = { text: opts?.type === 'image' ? '📷 صورة' : opts?.type === 'file' ? `📎 ${opts.fileName}` : t, senderId: uid, senderName: user.name, createdAt: serverTimestamp(), type: opts?.type || 'text', readBy: { [uid]: true } };
            if (opts?.fileUrl) d.fileUrl = opts.fileUrl; if (opts?.fileName) d.fileName = opts.fileName; if (opts?.fileSize) d.fileSize = opts.fileSize;
            if (disappear > 0) d.disappearAfter = disappear;
            await addDoc(collection(db, 'conversations', activeChat.convId, 'messages'), d);
            await setDoc(doc(db, 'conversations', activeChat.convId), { lastMessage: d.text, lastMessageAt: serverTimestamp(), lastSenderId: uid }, { merge: true });
        } catch (e) { console.error(e); }
        setSending(false); inpRef.current?.focus();
    };

    const doEdit = async () => {
        if (!editMsg || !editTxt.trim() || !activeChat) return;
        try { await updateDoc(doc(db, 'conversations', activeChat.convId, 'messages', editMsg.id), { text: editTxt.trim(), edited: true }); await setDoc(doc(db, 'conversations', activeChat.convId), { lastMessage: editTxt.trim() }, { merge: true }); } catch (e) { }
        setEditMsg(null); setEditTxt('');
    };

    const doDelete = async (m: Message) => {
        if (!activeChat) return;
        try { await updateDoc(doc(db, 'conversations', activeChat.convId, 'messages', m.id), { deleted: true, text: 'تم حذف هذه الرسالة' }); } catch (e) { }
        setCtxMsg(null);
    };

    const deleteConversation = async (convId: string) => {
        try { await deleteDoc(doc(db, 'conversations', convId)); } catch (e) { console.error(e); }
        setShowDeleteConv(null);
        if (activeChat?.convId === convId) setActiveChat(null);
    };

    const doUpload = async (f: File, t: 'image' | 'file') => {
        if (!activeChat || !user) return; setUploading(true); setShowAttach(false);
        try { const p = `chat/${activeChat.convId}/${Date.now()}_${f.name}`; const r = ref(storage, p); await uploadBytes(r, f); const url = await getDownloadURL(r); const sz = f.size > 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${(f.size / 1024).toFixed(0)} KB`; await sendMessage({ type: t, fileUrl: url, fileName: f.name, fileSize: sz }); } catch (e) { }
        setUploading(false);
    };

    const gi = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2);
    const ft = (ts: Timestamp | null | undefined) => { if (!ts) return ''; const d = ts.toDate(), df = Date.now() - d.getTime(); if (df < 60000) return 'الآن'; if (df < 3600000) return `${Math.floor(df / 60000)} د`; if (df < 86400000) return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }); return d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' }); };
    const fls = (ts: Timestamp | null) => { if (!ts) return 'غير متصل'; const df = Date.now() - ts.toDate().getTime(); if (df < 60000) return 'آخر ظهور: الآن'; if (df < 3600000) return `آخر ظهور: منذ ${Math.floor(df / 60000)} د`; return `آخر ظهور: ${ts.toDate().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`; };
    const con = (c: Conversation) => { const o = c.participants.find(p => p !== uid) || ''; return c.participantNames?.[o] || 'مستخدم'; };

    // Date separator helper
    const getDateLabel = (ts: Timestamp | null) => {
        if (!ts) return '';
        const d = ts.toDate();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diff = (today.getTime() - msgDay.getTime()) / 86400000;
        if (diff === 0) return 'اليوم';
        if (diff === 1) return 'أمس';
        return d.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };

    const css = `@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}@keyframes msgIn{from{opacity:0;transform:scale(.92) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}.eg{display:grid;grid-template-columns:repeat(8,1fr);gap:2px}.eb{font-size:22px;padding:6px;border-radius:8px;background:none;border:none;cursor:pointer;transition:all .15s;text-align:center}.eb:hover,.eb:active{background:var(--bg-glass-strong);transform:scale(1.2)}.cm{position:fixed;z-index:1000;background:var(--bg-card);border:1px solid var(--border-glass);border-radius:var(--radius-lg);box-shadow:0 8px 32px rgba(0,0,0,.3);padding:6px;min-width:160px;animation:fadeUp .15s ease}.ci{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:var(--radius-md);font-size:12px;font-weight:600;cursor:pointer;border:none;background:none;width:100%;text-align:right;color:var(--text-primary);font-family:var(--font-arabic);transition:all .15s}.ci:hover{background:var(--bg-glass)}.ci.dl{color:var(--accent-rose)}`;

    // =================== CHAT VIEW ===================
    if (activeChat) {
        const { otherUser } = activeChat;
        // Group messages by date
        let lastDateLabel = '';
        return (
            <div className="page-content page-enter" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - var(--nav-height) - 120px)', padding: 0 }}>
                <style>{css}</style>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-glass)', background: 'var(--bg-glass)', backdropFilter: 'blur(20px)' }}>
                    <button onClick={() => { setActiveChat(null); setShowEmoji(false); setEditMsg(null); setShowAttach(false); }} style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowRight size={16} /></button>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: otherUser.avatar ? `url(${otherUser.avatar}) center/cover` : 'linear-gradient(135deg,#10b981,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 800 }}>{!otherUser.avatar && gi(otherUser.name)}</div>
                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: '50%', background: otherOnline ? '#22c55e' : '#6b7280', border: '2px solid var(--bg-primary)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{otherUser.name}</div>
                        <div style={{ fontSize: 10, color: otherOnline ? '#22c55e' : 'var(--text-muted)', fontWeight: 600 }}>{otherOnline ? '🟢 متصل الآن' : fls(otherLastSeen)}</div>
                    </div>
                    {/* Disappear */}
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowDisappear(!showDisappear)} style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: disappear > 0 ? 'rgba(245,158,11,.12)' : 'var(--bg-glass)', border: `1px solid ${disappear > 0 ? 'rgba(245,158,11,.25)' : 'var(--border-glass)'}`, color: disappear > 0 ? '#f59e0b' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{disappear > 0 ? <EyeOff size={14} /> : <Clock size={14} />}</button>
                        {showDisappear && <div style={{ position: 'absolute', top: 38, left: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: 6, minWidth: 130, boxShadow: '0 8px 32px rgba(0,0,0,.3)', animation: 'fadeUp .15s ease' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 8px', marginBottom: 2 }}>💨 رسائل ذاتية الاختفاء</div>
                            {DISAPPEAR.map(o => <button key={o.v} onClick={() => { setDisappear(o.v); setShowDisappear(false); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 'var(--radius-md)', width: '100%', border: 'none', cursor: 'pointer', background: disappear === o.v ? 'rgba(245,158,11,.1)' : 'transparent', color: disappear === o.v ? '#f59e0b' : 'var(--text-primary)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-arabic)', transition: 'all .15s' }}>{disappear === o.v && <Check size={11} />}{o.l}</button>)}
                        </div>}
                    </div>
                </div>

                {disappear > 0 && <div style={{ padding: '5px 14px', background: 'rgba(245,158,11,.06)', borderBottom: '1px solid rgba(245,158,11,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#f59e0b' }}><EyeOff size={11} />الرسائل ستختفي بعد {disappear < 60 ? `${disappear} ث` : `${disappear / 60} د`}</div>}

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {msgs.length === 0 && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, gap: 8 }}><MessageCircle size={40} style={{ opacity: .2 }} /><div>ابدأ المحادثة مع {otherUser.name}</div></div>}

                    {msgs.map((msg, idx) => {
                        const isMe = msg.senderId === uid;
                        const isDel = msg.deleted === true;
                        // Date separator
                        const dateLabel = getDateLabel(msg.createdAt);
                        let showDate = false;
                        if (dateLabel !== lastDateLabel) { showDate = true; lastDateLabel = dateLabel; }
                        // Read status
                        const otherId = activeChat.otherUser.id;
                        const isRead = isMe && msg.readBy && msg.readBy[otherId];

                        return (
                            <React.Fragment key={msg.id}>
                                {showDate && <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ flex: 1, height: 1, background: 'var(--border-glass)' }} />
                                    <span style={{ padding: '3px 12px', borderRadius: 'var(--radius-full)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>{dateLabel}</span>
                                    <div style={{ flex: 1, height: 1, background: 'var(--border-glass)' }} />
                                </div>}
                                <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', animation: 'msgIn .2s ease' }} onContextMenu={e => { if (!isDel) { e.preventDefault(); const r = (e.target as HTMLElement).getBoundingClientRect(); setCtxPos({ x: r.left, y: r.top - 10 }); setCtxMsg(msg); } }}>
                                    <div style={{ maxWidth: '80%', padding: isDel ? '8px 14px' : (msg.type === 'image' ? '4px' : '10px 14px'), borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: isDel ? 'var(--bg-glass)' : isMe ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'var(--bg-card)', color: isDel ? 'var(--text-muted)' : (isMe ? 'white' : 'var(--text-primary)'), border: isMe ? 'none' : '1px solid var(--border-glass)', fontSize: 13, lineHeight: 1.6, fontStyle: isDel ? 'italic' : 'normal', boxShadow: isDel ? 'none' : isMe ? '0 3px 12px rgba(59,130,246,.3)' : '0 2px 8px rgba(0,0,0,.06)' }}>
                                        {msg.type === 'image' && msg.fileUrl && !isDel && <img src={msg.fileUrl} alt="" onClick={() => setImgPreview(msg.fileUrl!)} style={{ width: '100%', maxWidth: 260, borderRadius: 14, cursor: 'pointer', display: 'block' }} />}
                                        {msg.type === 'file' && msg.fileUrl && !isDel && <a href={msg.fileUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', textDecoration: 'none', color: isMe ? 'white' : 'var(--text-primary)' }}><div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: isMe ? 'rgba(255,255,255,.15)' : 'rgba(59,130,246,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FileText size={16} style={{ color: isMe ? 'white' : '#3b82f6' }} /></div><div><div style={{ fontSize: 12, fontWeight: 700, wordBreak: 'break-all' }}>{msg.fileName}</div><div style={{ fontSize: 10, opacity: .7, display: 'flex', alignItems: 'center', gap: 3 }}><Download size={9} />{msg.fileSize}</div></div></a>}
                                        {(msg.type === 'text' || !msg.type || isDel) && <div>{msg.text}</div>}
                                        {/* Meta row with read receipt */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, padding: msg.type === 'image' ? '0 8px 4px' : '0', justifyContent: isMe ? 'flex-start' : 'flex-end' }}>
                                            {msg.edited && !isDel && <span style={{ fontSize: 8, opacity: .6 }}>تم التعديل</span>}
                                            {msg.disappearAfter && msg.disappearAfter > 0 && !isDel && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 'var(--radius-full)', background: 'rgba(245,158,11,.15)', color: '#f59e0b', fontSize: 8, fontWeight: 700 }}><EyeOff size={7} />{msg.disappearAfter < 60 ? `${msg.disappearAfter}ث` : `${msg.disappearAfter / 60}د`}</span>}
                                            <span style={{ fontSize: 9, opacity: .6 }}>{ft(msg.createdAt)}</span>
                                            {/* Read receipt for sender */}
                                            {isMe && !isDel && (
                                                <span style={{ display: 'inline-flex', marginRight: 2 }}>
                                                    <CheckCheck size={14} style={{ color: isRead ? '#34d399' : 'rgba(255,255,255,0.5)' }} />
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                    <div ref={endRef} />
                </div>

                {/* Context menu */}
                {ctxMsg && <div className="cm" style={{ top: ctxPos.y, right: 20 }}>
                    {ctxMsg.senderId === uid && !ctxMsg.deleted && ctxMsg.type !== 'image' && ctxMsg.type !== 'file' && <button className="ci" onClick={() => { setEditMsg(ctxMsg); setEditTxt(ctxMsg.text); setCtxMsg(null); }}><Edit3 size={14} />تعديل الرسالة</button>}
                    {ctxMsg.senderId === uid && !ctxMsg.deleted && <button className="ci dl" onClick={() => doDelete(ctxMsg)}><Trash2 size={14} />حذف الرسالة</button>}
                    <button className="ci" onClick={() => { navigator.clipboard.writeText(ctxMsg.text); setCtxMsg(null); }}>📋 نسخ النص</button>
                </div>}

                {/* Edit banner */}
                {editMsg && <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(59,130,246,.06)', borderTop: '1px solid rgba(59,130,246,.12)' }}>
                    <Edit3 size={14} style={{ color: '#3b82f6' }} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>تعديل الرسالة</div><div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editMsg.text}</div></div>
                    <button onClick={() => { setEditMsg(null); setEditTxt(''); }} style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-glass)', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={13} /></button>
                </div>}

                {/* Emoji */}
                {showEmoji && <div style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-glass)', padding: '8px 12px', maxHeight: 250, overflowY: 'auto', animation: 'slideUp .2s ease' }}>
                    <div style={{ display: 'flex', gap: 2, marginBottom: 6, overflowX: 'auto' }}>{EMOJI_CATS.map(c => <button key={c.id} onClick={() => setEmojiCat(c.id)} style={{ padding: '5px 8px', borderRadius: 'var(--radius-md)', background: emojiCat === c.id ? 'rgba(59,130,246,.1)' : 'transparent', border: 'none', fontSize: 18, cursor: 'pointer', transition: 'all .15s' }}>{c.icon}</button>)}</div>
                    <div className="eg">{EMOJI_CATS.find(c => c.id === emojiCat)?.emojis.map((e, i) => <button key={i} className="eb" onClick={() => { if (editMsg) setEditTxt(p => p + e); else setNewMsg(p => p + e); }}>{e}</button>)}</div>
                </div>}

                {uploading && <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderTop: '1px solid var(--border-glass)', background: 'var(--bg-glass)' }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>جاري رفع الملف...</span></div>}

                {/* Input bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 10px', borderTop: '1px solid var(--border-glass)', background: 'var(--bg-card)' }}>
                    <button onClick={() => { setShowEmoji(!showEmoji); setShowAttach(false); }} style={{ width: 36, height: 36, borderRadius: '50%', background: showEmoji ? 'rgba(245,158,11,.12)' : 'transparent', border: 'none', cursor: 'pointer', color: showEmoji ? '#f59e0b' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s', flexShrink: 0 }}><Smile size={20} /></button>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button onClick={() => { setShowAttach(!showAttach); setShowEmoji(false); }} style={{ width: 36, height: 36, borderRadius: '50%', background: showAttach ? 'rgba(59,130,246,.12)' : 'transparent', border: 'none', cursor: 'pointer', color: showAttach ? '#3b82f6' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}><Paperclip size={20} /></button>
                        {showAttach && <div style={{ position: 'absolute', bottom: 42, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: 6, boxShadow: '0 8px 32px rgba(0,0,0,.3)', animation: 'fadeUp .15s ease', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140 }}>
                            <button className="ci" onClick={() => { imgRef.current?.click(); setShowAttach(false); }}><ImageIcon size={14} style={{ color: '#10b981' }} />صورة</button>
                            <button className="ci" onClick={() => { setShowAttach(false); const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment'; i.onchange = (e: any) => { const f = e.target.files?.[0]; if (f) doUpload(f, 'image'); }; i.click(); }}><Camera size={14} style={{ color: '#3b82f6' }} />التقاط صورة</button>
                            <button className="ci" onClick={() => { fileRef.current?.click(); setShowAttach(false); }}><FileText size={14} style={{ color: '#8b5cf6' }} />ملف</button>
                        </div>}
                    </div>
                    {editMsg ? <input type="text" value={editTxt} onChange={e => setEditTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && doEdit()} autoFocus style={{ flex: 1, padding: '9px 14px', borderRadius: 'var(--radius-full)', background: 'var(--bg-glass)', border: '1px solid rgba(59,130,246,.3)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-arabic)', outline: 'none' }} /> :
                        <input ref={inpRef} type="text" placeholder="اكتب رسالة..." value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()} style={{ flex: 1, padding: '9px 14px', borderRadius: 'var(--radius-full)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-arabic)', outline: 'none' }} />}
                    <button onClick={editMsg ? doEdit : () => sendMessage()} disabled={editMsg ? !editTxt.trim() : (!newMsg.trim() || sending)} style={{ width: 40, height: 40, borderRadius: '50%', background: (editMsg ? editTxt.trim() : newMsg.trim()) ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'var(--bg-glass)', border: 'none', color: (editMsg ? editTxt.trim() : newMsg.trim()) ? 'white' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (editMsg ? editTxt.trim() : newMsg.trim()) ? 'pointer' : 'default', transition: 'all .2s', flexShrink: 0, transform: 'rotate(180deg)', boxShadow: (editMsg ? editTxt.trim() : newMsg.trim()) ? '0 4px 14px rgba(59,130,246,.35)' : 'none' }}>{editMsg ? <Check size={17} /> : <Send size={17} />}</button>
                </div>
                <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f, 'image'); e.target.value = ''; }} />
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f, 'file'); e.target.value = ''; }} />
                {imgPreview && <div onClick={() => setImgPreview(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><button onClick={() => setImgPreview(null)} style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.12)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}><X size={20} /></button><img src={imgPreview} alt="" style={{ maxWidth: '92%', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain' }} /></div>}
            </div>
        );
    }

    // =================== MAIN LIST ===================
    return (
        <div className="page-content page-enter">
            <style>{css}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowRight size={18} /></button>
                <div style={{ flex: 1 }}><h2 style={{ fontSize: 18, fontWeight: 800 }}>المحادثات</h2><p style={{ fontSize: 11, color: 'var(--text-muted)' }}>تواصل مع زملائك</p></div>
            </div>

            {/* Employees bar */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}><Users size={13} style={{ verticalAlign: 'middle', marginLeft: 4 }} />الموظفين</div>
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
                    {allUsers.map(u => <button key={u.id} onClick={() => openChatWith(u)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 8px', minWidth: 72, borderRadius: 'var(--radius-xl)', background: 'var(--bg-card)', border: '1px solid var(--border-glass)', cursor: 'pointer', transition: 'all .2s', fontFamily: 'var(--font-arabic)', boxShadow: '0 2px 8px rgba(0,0,0,.05)', flexShrink: 0 }}>
                        <div style={{ position: 'relative' }}>
                            <div style={{ width: 44, height: 44, borderRadius: '50%', background: u.avatar ? `url(${u.avatar}) center/cover` : 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 800 }}>{!u.avatar && gi(u.name)}</div>
                            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: '50%', background: u.online ? '#22c55e' : '#6b7280', border: '2.5px solid var(--bg-card)' }} />
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{u.name.split(' ')[0]}</div>
                    </button>)}
                    {allUsers.length === 0 && usersLoaded && <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-muted)' }}>لا يوجد موظفين</div>}
                </div>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={15} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" placeholder="بحث في المحادثات..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '10px 38px 10px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-arabic)', outline: 'none' }} />
            </div>

            {/* Conversations */}
            {loading ? <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}><Loader2 size={28} style={{ margin: '0 auto 10px', animation: 'spin 1s linear infinite' }} /><div style={{ fontSize: 13 }}>جاري التحميل...</div></div>
                : convs.length === 0 ? <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}><div style={{ width: 70, height: 70, borderRadius: '50%', background: 'rgba(59,130,246,.08)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MessageCircle size={30} style={{ opacity: .4, color: '#3b82f6' }} /></div><div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>لا توجد محادثات بعد</div><div style={{ fontSize: 12 }}>اختر موظفاً من الأعلى لبدء المحادثة</div></div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {convs.filter(c => !search.trim() || con(c).toLowerCase().includes(search.toLowerCase())).map(c => {
                            const on = con(c);
                            // Check if has unread
                            const readBy = (c as any).readBy || {};
                            const lastRead = readBy[uid];
                            const lastMsg = c.lastMessageAt;
                            const lastSender = (c as any).lastSenderId;
                            const hasUnread = lastMsg && lastSender && lastSender !== uid && (!lastRead || (lastRead.toMillis && lastMsg.toMillis && lastRead.toMillis() < lastMsg.toMillis()));

                            return (
                                <div key={c.id} style={{ position: 'relative' }}>
                                    <button onClick={() => openExisting(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-xl)', background: 'var(--bg-card)', border: hasUnread ? '1px solid rgba(59,130,246,0.3)' : '1px solid var(--border-glass)', cursor: 'pointer', textAlign: 'right', width: '100%', transition: 'all .2s', fontFamily: 'var(--font-arabic)', boxShadow: hasUnread ? '0 2px 12px rgba(59,130,246,0.12)' : '0 2px 8px rgba(0,0,0,.05)' }}>
                                        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#10b981,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{gi(on)}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{on}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>{ft(c.lastMessageAt)}</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ fontSize: 12, color: hasUnread ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: hasUnread ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.lastMessage || 'لا توجد رسائل بعد'}</div>
                                                {hasUnread && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />}
                                            </div>
                                        </div>
                                    </button>
                                    {/* Delete conversation button */}
                                    <button onClick={() => setShowDeleteConv(c.id)} style={{ position: 'absolute', top: 8, left: 8, width: 26, height: 26, borderRadius: '50%', background: 'rgba(244,63,94,.08)', border: 'none', color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: .5, transition: 'all .15s' }} onMouseEnter={e => (e.target as any).style.opacity = '1'} onMouseLeave={e => (e.target as any).style.opacity = '.5'}><Trash2 size={12} /></button>
                                </div>
                            );
                        })}
                    </div>}

            {/* Delete conversation modal */}
            {showDeleteConv && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowDeleteConv(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', padding: 24, maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: '0 16px 48px rgba(0,0,0,.3)' }}>
                        <Trash2 size={32} style={{ color: 'var(--accent-rose)', margin: '0 auto 12px' }} />
                        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>حذف المحادثة؟</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>سيتم حذف المحادثة نهائياً ولا يمكن استرجاعها</div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setShowDeleteConv(null)} style={{ flex: 1, padding: '10px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-arabic)' }}>إلغاء</button>
                            <button onClick={() => deleteConversation(showDeleteConv)} style={{ flex: 1, padding: '10px 16px', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(135deg,#ef4444,#dc2626)', border: 'none', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-arabic)', boxShadow: '0 4px 14px rgba(239,68,68,.3)' }}>حذف</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
