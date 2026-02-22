import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Send, Search, Users, MessageCircle, Loader2, Smile, Paperclip, Image as ImageIcon, X, Trash2, Edit3, Check, Clock, Download, FileText, Camera, EyeOff, CheckCheck, MapPin, Archive } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../firebase';
import { collection, doc, getDocs, addDoc, query, where, onSnapshot, serverTimestamp, Timestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface ChatUser { id: string; name: string; avatar?: string; department?: string; online?: boolean; lastSeen?: Timestamp; }
interface Message { id: string; text: string; senderId: string; senderName: string; createdAt: Timestamp | null; edited?: boolean; deleted?: boolean; type?: 'text' | 'image' | 'file' | 'location'; fileUrl?: string; fileName?: string; fileSize?: string; disappearAfter?: number; readBy?: Record<string, boolean>; location?: { lat: number; lng: number }; }
interface Conversation { id: string; participants: string[]; participantNames: Record<string, string>; participantAvatars?: Record<string, string>; lastMessage?: string; lastMessageAt?: Timestamp; readBy?: Record<string, Timestamp>; lastSenderId?: string; }
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
const BG_OPTIONS = [
    { id: 'default', label: 'افتراضي', bg: 'transparent' },
    { id: 'dark', label: 'داكن', bg: 'rgba(0,0,0,0.3)' },
    { id: 'blue', label: 'أزرق', bg: 'linear-gradient(180deg,rgba(30,58,138,0.15),rgba(59,130,246,0.08))' },
    { id: 'green', label: 'أخضر', bg: 'linear-gradient(180deg,rgba(6,78,59,0.15),rgba(16,185,129,0.08))' },
    { id: 'purple', label: 'بنفسجي', bg: 'linear-gradient(180deg,rgba(88,28,135,0.15),rgba(139,92,246,0.08))' },
    { id: 'warm', label: 'دافئ', bg: 'linear-gradient(180deg,rgba(120,53,15,0.12),rgba(245,158,11,0.06))' },
];

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
    const [longPressConv, setLongPressConv] = useState<string | null>(null);
    const [chatBg, setChatBg] = useState(localStorage.getItem('chat-bg') || 'default');
    const [showBgPicker, setShowBgPicker] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const longPressTimer = useRef<any>(null);

    useEffect(() => { if (!uid) return; (async () => { try { const s = await getDocs(collection(db, 'users')); setAllUsers(s.docs.filter(d => d.id !== uid).map(d => ({ id: d.id, name: d.data().name || 'مستخدم', avatar: d.data().avatar, department: d.data().department, online: d.data().online === true, lastSeen: d.data().lastSeen }))); } catch (e) { } setUsersLoaded(true); })(); }, [uid]);

    useEffect(() => {
        if (!uid) return;
        // Query WITHOUT orderBy to avoid composite index requirement
        const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid));
        const u = onSnapshot(q, s => {
            const data = s.docs.map(d => ({ id: d.id, ...d.data() } as Conversation))
                .filter(c => !(c as any).deletedFor?.[uid]);
            // Sort client-side by lastMessageAt descending
            data.sort((a, b) => {
                const at = a.lastMessageAt?.toMillis?.() || 0;
                const bt = b.lastMessageAt?.toMillis?.() || 0;
                return bt - at;
            });
            setConvs(data);
            setLoading(false);
        }, (err) => { console.error('Conv listener error:', err); setLoading(false); });
        return () => u();
    }, [uid]);

    useEffect(() => {
        if (!activeChat) { setMsgs([]); return; }
        const convId = activeChat.convId;
        const otherId = activeChat.otherUser.id;
        // Query messages - sort client-side to avoid composite index
        const q = query(collection(db, 'conversations', convId, 'messages'));
        const u = onSnapshot(q, s => {
            const m: Message[] = s.docs.map(d => ({ id: d.id, ...d.data() } as Message));
            // Sort by createdAt ascending client-side
            m.sort((a, b) => {
                const at = a.createdAt?.toMillis?.() || 0;
                const bt = b.createdAt?.toMillis?.() || 0;
                return at - bt;
            });
            setMsgs(m);
            setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
            // Mark conversation as read
            setDoc(doc(db, 'conversations', convId), { readBy: { [uid]: serverTimestamp() } }, { merge: true }).catch(() => { });
            // Mark individual messages as read
            m.forEach(msg => { if (msg.senderId !== uid && (!msg.readBy || !msg.readBy[uid])) { updateDoc(doc(db, 'conversations', convId, 'messages', msg.id), { [`readBy.${uid}`]: true }).catch(() => { }); } });
        });
        return () => u();
    }, [activeChat?.convId, uid]);

    useEffect(() => { if (!activeChat) return; const u = onSnapshot(doc(db, 'users', activeChat.otherUser.id), s => { if (s.exists()) { const d = s.data(); setOtherOnline(d.online === true); setOtherLastSeen(d.lastSeen || null); } }); return () => u(); }, [activeChat?.otherUser.id]);
    useEffect(() => { const i = setInterval(() => setMsgs(p => p.map(m => m.disappearAfter && m.disappearAfter > 0 && m.createdAt && (Date.now() - m.createdAt.toDate().getTime()) / 1000 > m.disappearAfter ? { ...m, deleted: true, text: '💨 رسالة ذاتية الاختفاء' } : m)), 2000); return () => clearInterval(i); }, []);
    useEffect(() => { const h = () => { setCtxMsg(null); setLongPressConv(null); }; window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);

    const openChatWith = async (tu: ChatUser) => {
        const ex = convs.find(c => c.participants.includes(tu.id) && c.participants.includes(uid));
        if (ex) { setActiveChat({ convId: ex.id, otherUser: tu }); return; }
        if (!user) return;
        try {
            const avatars: Record<string, string> = {};
            if (user.avatar) avatars[uid] = user.avatar;
            if (tu.avatar) avatars[tu.id] = tu.avatar;
            const r = await addDoc(collection(db, 'conversations'), { participants: [uid, tu.id], participantNames: { [uid]: user.name, [tu.id]: tu.name }, participantAvatars: avatars, lastMessage: '', lastMessageAt: serverTimestamp(), createdAt: serverTimestamp(), lastSenderId: uid });
            setActiveChat({ convId: r.id, otherUser: tu });
        } catch (e) { console.error(e); }
    };

    const openExisting = (c: Conversation) => {
        const oid = c.participants.find(p => p !== uid) || '';
        const on = c.participantNames?.[oid] || 'مستخدم';
        const av = (c as any).participantAvatars?.[oid];
        setActiveChat({ convId: c.id, otherUser: allUsers.find(u => u.id === oid) || { id: oid, name: on, avatar: av } });
    };

    const sendMessage = async (opts?: { type?: string; fileUrl?: string; fileName?: string; fileSize?: string; location?: { lat: number; lng: number } }) => {
        if ((!newMsg.trim() && !opts?.fileUrl && !opts?.location) || !activeChat || !user) return;
        setSending(true); const t = newMsg.trim(); setNewMsg(''); setShowEmoji(false);
        try {
            const toUid = activeChat.otherUser.id;
            const d: any = { text: opts?.type === 'image' ? '📷 صورة' : opts?.type === 'file' ? `📎 ${opts.fileName}` : opts?.type === 'location' ? '📍 الموقع الحالي' : t, senderId: uid, senderName: user.name, toUid, createdAt: serverTimestamp(), type: opts?.type || 'text', readBy: { [uid]: true } };
            if (opts?.fileUrl) d.fileUrl = opts.fileUrl; if (opts?.fileName) d.fileName = opts.fileName; if (opts?.fileSize) d.fileSize = opts.fileSize;
            if (opts?.location) d.location = opts.location;
            if (disappear > 0) d.disappearAfter = disappear;
            await addDoc(collection(db, 'conversations', activeChat.convId, 'messages'), d);
            await setDoc(doc(db, 'conversations', activeChat.convId), { lastMessage: d.text, lastMessageAt: serverTimestamp(), lastSenderId: uid }, { merge: true });
        } catch (e) { console.error(e); }
        setSending(false); inpRef.current?.focus();
    };

    const doEdit = async () => { if (!editMsg || !editTxt.trim() || !activeChat) return; try { await updateDoc(doc(db, 'conversations', activeChat.convId, 'messages', editMsg.id), { text: editTxt.trim(), edited: true }); await setDoc(doc(db, 'conversations', activeChat.convId), { lastMessage: editTxt.trim() }, { merge: true }); } catch (e) { } setEditMsg(null); setEditTxt(''); };
    const doDelete = async (m: Message) => { if (!activeChat) return; try { await updateDoc(doc(db, 'conversations', activeChat.convId, 'messages', m.id), { deleted: true, text: 'تم حذف هذه الرسالة' }); } catch (e) { } setCtxMsg(null); };
    const deleteConvForMe = async (id: string) => {
        try {
            await updateDoc(doc(db, 'conversations', id), { [`deletedFor.${uid}`]: true });
        } catch (e) { console.error(e); }
        setDeleteConfirm(null);
        if (activeChat?.convId === id) setActiveChat(null);
    };
    const deleteConvForBoth = async (id: string) => {
        try {
            const msgsSnap = await getDocs(collection(db, 'conversations', id, 'messages'));
            await Promise.all(msgsSnap.docs.map(d => deleteDoc(doc(db, 'conversations', id, 'messages', d.id))));
            await deleteDoc(doc(db, 'conversations', id));
        } catch (e) { console.error(e); }
        setDeleteConfirm(null);
        if (activeChat?.convId === id) setActiveChat(null);
    };
    const doUpload = async (f: File, t: 'image' | 'file') => { if (!activeChat || !user) return; setUploading(true); setShowAttach(false); try { const p = `chat/${activeChat.convId}/${Date.now()}_${f.name}`; const r = ref(storage, p); await uploadBytes(r, f); const url = await getDownloadURL(r); const sz = f.size > 1048576 ? `${(f.size / 1048576).toFixed(1)} MB` : `${(f.size / 1024).toFixed(0)} KB`; await sendMessage({ type: t, fileUrl: url, fileName: f.name, fileSize: sz }); } catch (e) { } setUploading(false); };
    const sendLocation = () => { setShowAttach(false); if (!navigator.geolocation) return; navigator.geolocation.getCurrentPosition(pos => { sendMessage({ type: 'location', location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }); }, () => { }); };

    const gi = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2);
    const ft = (ts: Timestamp | null | undefined) => { if (!ts) return ''; const d = ts.toDate(), df = Date.now() - d.getTime(); if (df < 60000) return 'الآن'; if (df < 3600000) return `${Math.floor(df / 60000)} د`; if (df < 86400000) return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }); return d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' }); };
    const fls = (ts: Timestamp | null) => { if (!ts) return 'غير متصل'; const df = Date.now() - ts.toDate().getTime(); if (df < 60000) return 'آخر ظهور: الآن'; if (df < 3600000) return `آخر ظهور: منذ ${Math.floor(df / 60000)} د`; return `آخر ظهور: ${ts.toDate().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`; };
    const getDateLabel = (ts: Timestamp | null) => { if (!ts) return ''; const d = ts.toDate(), now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), md = new Date(d.getFullYear(), d.getMonth(), d.getDate()), diff = (today.getTime() - md.getTime()) / 86400000; if (diff === 0) return 'اليوم'; if (diff === 1) return 'أمس'; return d.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); };
    const getBgStyle = () => { const o = BG_OPTIONS.find(b => b.id === chatBg); return o?.bg || 'transparent'; };

    const css = `@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes slideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}@keyframes msgIn{from{opacity:0;transform:scale(.95) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}.eg{display:grid;grid-template-columns:repeat(8,1fr);gap:2px}.eb{font-size:22px;padding:6px;border-radius:8px;background:none;border:none;cursor:pointer;transition:all .15s;text-align:center}.eb:hover,.eb:active{background:var(--bg-glass-strong);transform:scale(1.2)}.cm{position:fixed;z-index:1000;background:var(--bg-card);border:1px solid var(--border-glass);border-radius:var(--radius-lg);box-shadow:0 8px 32px rgba(0,0,0,.3);padding:6px;min-width:170px;animation:fadeUp .15s ease}.ci{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:var(--radius-md);font-size:13px;font-weight:700;cursor:pointer;border:none;background:none;width:100%;text-align:right;color:var(--text-primary);font-family:var(--font-arabic);transition:all .15s}.ci:hover{background:var(--bg-glass)}.ci.dl{color:#f43f5e}.chat-root{width:100%;max-width:100vw;overflow-x:hidden;overscroll-behavior:none;touch-action:pan-y;-webkit-overflow-scrolling:touch;box-sizing:border-box}.chat-msgs{overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}.chat-root *{max-width:100%;box-sizing:border-box}.chat-root img{max-width:100%!important;height:auto}`;

    // ================= CHAT VIEW =================
    if (activeChat) {
        const { otherUser } = activeChat;
        let lastDateLabel = '';
        const bgVal = getBgStyle();
        return (
            <div className="page-content page-enter chat-root" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - var(--nav-height, 60px) - 60px)', padding: 0, overflow: 'hidden', position: 'relative', width: '100%', maxWidth: '100vw' }}>
                <style>{css}</style>
                {/* Top header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border-glass)', background: 'linear-gradient(180deg, var(--bg-card), var(--bg-glass))', backdropFilter: 'blur(20px)', flexShrink: 0 }}>
                    <button onClick={() => { setActiveChat(null); setShowEmoji(false); setEditMsg(null); setShowAttach(false); }} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><ArrowRight size={18} /></button>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: otherUser.avatar ? `url(${otherUser.avatar}) center/cover` : 'linear-gradient(135deg,#10b981,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 800, backgroundSize: 'cover', border: otherOnline ? '2px solid #22c55e' : '2px solid transparent', boxShadow: otherOnline ? '0 0 10px rgba(34,197,94,.3)' : 'none' }}>{!otherUser.avatar && gi(otherUser.name)}</div>
                        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: '50%', background: otherOnline ? '#22c55e' : '#6b7280', border: '2px solid var(--bg-card)' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{otherUser.name}</div>
                        <div style={{ fontSize: 11, color: otherOnline ? '#22c55e' : 'var(--text-muted)', fontWeight: 700 }}>{otherOnline ? '🟢 متصل الآن' : fls(otherLastSeen)}</div>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowDisappear(!showDisappear)} style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: disappear > 0 ? 'rgba(245,158,11,.12)' : 'var(--bg-glass)', border: `1px solid ${disappear > 0 ? 'rgba(245,158,11,.25)' : 'var(--border-glass)'}`, color: disappear > 0 ? '#f59e0b' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{disappear > 0 ? <EyeOff size={15} /> : <Clock size={15} />}</button>
                        {showDisappear && <div style={{ position: 'absolute', top: 40, left: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: 6, minWidth: 140, boxShadow: '0 8px 32px rgba(0,0,0,.3)', animation: 'fadeUp .15s ease' }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', padding: '4px 8px', marginBottom: 2 }}>💨 رسائل ذاتية الاختفاء</div>
                            {DISAPPEAR.map(o => <button key={o.v} onClick={() => { setDisappear(o.v); setShowDisappear(false); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 'var(--radius-md)', width: '100%', border: 'none', cursor: 'pointer', background: disappear === o.v ? 'rgba(245,158,11,.1)' : 'transparent', color: disappear === o.v ? '#f59e0b' : 'var(--text-primary)', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-arabic)' }}>{disappear === o.v && <Check size={12} />}{o.l}</button>)}
                        </div>}
                    </div>
                </div>

                {disappear > 0 && <div style={{ padding: '6px 14px', background: 'rgba(245,158,11,.06)', borderBottom: '1px solid rgba(245,158,11,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#f59e0b', flexShrink: 0 }}><EyeOff size={12} />الرسائل ستختفي بعد {disappear < 60 ? `${disappear} ث` : `${disappear / 60} د`}</div>}

                {/* Messages area */}
                <div className="chat-msgs" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: bgVal.startsWith('linear') ? bgVal : undefined, backgroundColor: !bgVal.startsWith('linear') ? bgVal : undefined, overscrollBehavior: 'contain', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}>
                    {msgs.length === 0 && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 10 }}><MessageCircle size={44} style={{ opacity: .2 }} /><div style={{ fontSize: 14, fontWeight: 700 }}>ابدأ المحادثة مع {otherUser.name}</div></div>}
                    {msgs.map(msg => {
                        const isMe = msg.senderId === uid, isDel = msg.deleted === true;
                        const dl = getDateLabel(msg.createdAt);
                        let showDate = false;
                        if (dl !== lastDateLabel) { showDate = true; lastDateLabel = dl; }
                        const isRead = isMe && msg.readBy && msg.readBy[activeChat.otherUser.id];
                        return (
                            <React.Fragment key={msg.id}>
                                {showDate && <div style={{ textAlign: 'center', padding: '10px 0', fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, height: 1, background: 'var(--border-glass)' }} /><span style={{ padding: '4px 14px', borderRadius: 'var(--radius-full)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}>{dl}</span><div style={{ flex: 1, height: 1, background: 'var(--border-glass)' }} /></div>}
                                <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', animation: 'msgIn .2s ease' }} onContextMenu={e => { if (!isDel) { e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY - 10 }); setCtxMsg(msg); } }}>
                                    <div style={{ maxWidth: '78%', padding: isDel ? '10px 16px' : (msg.type === 'image' ? '4px' : '12px 16px'), borderRadius: isMe ? '20px 20px 4px 20px' : '20px 20px 20px 4px', background: isDel ? 'var(--bg-glass)' : isMe ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'var(--bg-card)', color: isDel ? 'var(--text-muted)' : (isMe ? 'white' : 'var(--text-primary)'), border: isMe ? 'none' : '1px solid var(--border-glass)', fontSize: 14, fontWeight: 600, lineHeight: 1.7, fontStyle: isDel ? 'italic' : 'normal', boxShadow: isDel ? 'none' : isMe ? '0 4px 16px rgba(59,130,246,.25)' : '0 2px 10px rgba(0,0,0,.06)' }}>
                                        {msg.type === 'image' && msg.fileUrl && !isDel && <img src={msg.fileUrl} alt="" onClick={() => setImgPreview(msg.fileUrl!)} style={{ width: '100%', maxWidth: 260, borderRadius: 16, cursor: 'pointer', display: 'block' }} />}
                                        {msg.type === 'file' && msg.fileUrl && !isDel && <a href={msg.fileUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', textDecoration: 'none', color: isMe ? 'white' : 'var(--text-primary)' }}><div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: isMe ? 'rgba(255,255,255,.15)' : 'rgba(59,130,246,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FileText size={17} style={{ color: isMe ? 'white' : '#3b82f6' }} /></div><div><div style={{ fontSize: 13, fontWeight: 800, wordBreak: 'break-all' }}>{msg.fileName}</div><div style={{ fontSize: 10, opacity: .7, display: 'flex', alignItems: 'center', gap: 3 }}><Download size={10} />{msg.fileSize}</div></div></a>}
                                        {msg.type === 'location' && msg.location && !isDel && <a href={`https://www.google.com/maps?q=${msg.location.lat},${msg.location.lng}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', textDecoration: 'none', color: isMe ? 'white' : 'var(--text-primary)' }}><div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: isMe ? 'rgba(255,255,255,.15)' : 'rgba(16,185,129,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><MapPin size={17} style={{ color: isMe ? 'white' : '#10b981' }} /></div><div><div style={{ fontSize: 13, fontWeight: 800 }}>📍 الموقع الحالي</div><div style={{ fontSize: 10, opacity: .7 }}>اضغط لفتح الخريطة</div></div></a>}
                                        {(msg.type === 'text' || !msg.type || isDel) && <div>{msg.text}</div>}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4, justifyContent: isMe ? 'flex-start' : 'flex-end' }}>
                                            {msg.edited && !isDel && <span style={{ fontSize: 9, opacity: .6, fontWeight: 600 }}>تم التعديل</span>}
                                            {msg.disappearAfter && msg.disappearAfter > 0 && !isDel && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '2px 6px', borderRadius: 'var(--radius-full)', background: 'rgba(245,158,11,.15)', color: '#f59e0b', fontSize: 9, fontWeight: 800 }}><EyeOff size={8} />{msg.disappearAfter < 60 ? `${msg.disappearAfter}ث` : `${msg.disappearAfter / 60}د`}</span>}
                                            <span style={{ fontSize: 10, opacity: .55, fontWeight: 600 }}>{ft(msg.createdAt)}</span>
                                            {isMe && !isDel && <CheckCheck size={15} style={{ color: isRead ? '#34d399' : 'rgba(255,255,255,0.45)', marginRight: 1 }} />}
                                        </div>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                    <div ref={endRef} />
                </div>

                {ctxMsg && <div className="cm" style={{ top: Math.min(ctxPos.y, window.innerHeight - 200), right: 20 }} onClick={e => e.stopPropagation()}>
                    {ctxMsg.senderId === uid && !ctxMsg.deleted && ctxMsg.type !== 'image' && ctxMsg.type !== 'file' && ctxMsg.type !== 'location' && <button className="ci" onClick={() => { setEditMsg(ctxMsg); setEditTxt(ctxMsg.text); setCtxMsg(null); }}><Edit3 size={15} />تعديل</button>}
                    {ctxMsg.senderId === uid && !ctxMsg.deleted && <button className="ci dl" onClick={() => doDelete(ctxMsg)}><Trash2 size={15} />حذف</button>}
                    <button className="ci" onClick={() => { navigator.clipboard.writeText(ctxMsg.text); setCtxMsg(null); }}>📋 نسخ</button>
                </div>}

                {editMsg && <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(59,130,246,.06)', borderTop: '1px solid rgba(59,130,246,.12)', flexShrink: 0 }}>
                    <Edit3 size={15} style={{ color: '#3b82f6' }} /><div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6' }}>تعديل الرسالة</div><div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editMsg.text}</div></div>
                    <button onClick={() => { setEditMsg(null); setEditTxt(''); }} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-glass)', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={14} /></button>
                </div>}

                {showEmoji && <div style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border-glass)', padding: '8px 12px', maxHeight: 220, overflowY: 'auto', animation: 'slideUp .2s ease', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>{EMOJI_CATS.map(c => <button key={c.id} onClick={() => setEmojiCat(c.id)} style={{ padding: '5px 8px', borderRadius: 'var(--radius-md)', background: emojiCat === c.id ? 'rgba(59,130,246,.1)' : 'transparent', border: 'none', fontSize: 18, cursor: 'pointer' }}>{c.icon}</button>)}</div>
                    <div className="eg">{EMOJI_CATS.find(c => c.id === emojiCat)?.emojis.map((e, i) => <button key={i} className="eb" onClick={() => { if (editMsg) setEditTxt(p => p + e); else setNewMsg(p => p + e); }}>{e}</button>)}</div>
                </div>}

                {uploading && <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderTop: '1px solid var(--border-glass)', background: 'var(--bg-glass)', flexShrink: 0 }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} /><span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>جاري رفع الملف...</span></div>}

                {/* Input bar */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 10px', borderTop: '1px solid var(--border-glass)', background: 'var(--bg-card)', flexShrink: 0 }}>
                    <button onClick={editMsg ? doEdit : () => sendMessage()} disabled={editMsg ? !editTxt.trim() : (!newMsg.trim() || sending)} style={{ width: 40, height: 40, borderRadius: '50%', background: (editMsg ? editTxt.trim() : newMsg.trim()) ? 'linear-gradient(135deg,#3b82f6,#6366f1)' : 'var(--bg-glass)', border: 'none', color: (editMsg ? editTxt.trim() : newMsg.trim()) ? 'white' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (editMsg ? editTxt.trim() : newMsg.trim()) ? 'pointer' : 'default', transition: 'all .2s', flexShrink: 0, boxShadow: (editMsg ? editTxt.trim() : newMsg.trim()) ? '0 4px 16px rgba(59,130,246,.35)' : 'none' }}>{editMsg ? <Check size={18} /> : <Send size={18} style={{ transform: 'rotate(180deg)' }} />}</button>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'var(--bg-glass)', border: editMsg ? '1px solid rgba(59,130,246,.3)' : '1px solid var(--border-glass)', borderRadius: 22, padding: '0 4px 0 6px', minHeight: 42, transition: 'all .2s' }}>
                        {editMsg ? <input type="text" maxLength={100} value={editTxt} onChange={e => setEditTxt(e.target.value)} onKeyDown={e => e.key === 'Enter' && doEdit()} autoFocus style={{ flex: 1, padding: '8px 6px', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-arabic)', outline: 'none', minWidth: 0 }} /> :
                            <input ref={inpRef} type="text" maxLength={100} placeholder="اكتب رسالة..." value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()} style={{ flex: 1, padding: '8px 6px', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-arabic)', outline: 'none', minWidth: 0 }} />}
                        <button onClick={() => { setShowEmoji(!showEmoji); setShowAttach(false); }} style={{ width: 32, height: 32, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: showEmoji ? '#f59e0b' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 0 }}><Smile size={20} /></button>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <button onClick={() => { setShowAttach(!showAttach); setShowEmoji(false); }} style={{ width: 32, height: 32, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: showAttach ? '#3b82f6' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}><Paperclip size={20} /></button>
                            {showAttach && <div style={{ position: 'absolute', bottom: 40, left: 0, background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-lg)', padding: 6, boxShadow: '0 8px 32px rgba(0,0,0,.3)', animation: 'fadeUp .15s ease', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 160, zIndex: 50 }}>
                                <button className="ci" onClick={() => { imgRef.current?.click(); setShowAttach(false); }}><ImageIcon size={15} style={{ color: '#10b981' }} />صورة</button>
                                <button className="ci" onClick={() => { setShowAttach(false); const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment'; i.onchange = (e: any) => { const f = e.target.files?.[0]; if (f) doUpload(f, 'image'); }; i.click(); }}><Camera size={15} style={{ color: '#3b82f6' }} />التقاط صورة</button>
                                <button className="ci" onClick={() => { fileRef.current?.click(); setShowAttach(false); }}><FileText size={15} style={{ color: '#8b5cf6' }} />ملف</button>
                                <button className="ci" onClick={sendLocation}><MapPin size={15} style={{ color: '#f59e0b' }} />📍 إرسال الموقع</button>
                            </div>}
                        </div>
                    </div>
                </div>
                <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f, 'image'); e.target.value = ''; }} />
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f, 'file'); e.target.value = ''; }} />
                {imgPreview && <div onClick={() => setImgPreview(null)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><button onClick={() => setImgPreview(null)} style={{ position: 'absolute', top: 16, right: 16, width: 42, height: 42, borderRadius: '50%', background: 'rgba(255,255,255,.12)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}><X size={22} /></button><img src={imgPreview} alt="" style={{ maxWidth: '92%', maxHeight: '85vh', borderRadius: 14, objectFit: 'contain' }} /></div>}

                {/* Background picker */}
                {showBgPicker && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.6)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowBgPicker(false)}><div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', padding: 20, width: '100%', maxWidth: 400, animation: 'slideUp .2s ease' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 14, textAlign: 'center' }}>🎨 خلفية الدردشة</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                        {BG_OPTIONS.map(b => <button key={b.id} onClick={() => { setChatBg(b.id); localStorage.setItem('chat-bg', b.id); setShowBgPicker(false); }} style={{ padding: 14, borderRadius: 'var(--radius-lg)', background: b.bg === 'transparent' ? 'var(--bg-glass)' : b.bg, border: chatBg === b.id ? '2px solid #3b82f6' : '1px solid var(--border-glass)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-arabic)', transition: 'all .15s', minHeight: 50 }}>{b.label}</button>)}
                    </div>
                </div></div>}
            </div>
        );
    }

    // ================= MAIN LIST =================
    return (
        <div className="page-content page-enter chat-root" style={{ overscrollBehavior: 'contain' }}>
            <style>{css}</style>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, padding: '0 2px' }}>
                <button onClick={onBack} style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all .2s' }}><ArrowRight size={18} /></button>
                <div style={{ flex: 1 }}><h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>المحادثات</h2><p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, margin: 0 }}>تواصل مع زملائك</p></div>
            </div>

            {/* Employees */}
            <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}><Users size={14} />الموظفين</div>
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
                    {allUsers.map(u => <button key={u.id} onClick={() => openChatWith(u)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '10px 8px', minWidth: 74, borderRadius: 'var(--radius-xl)', background: 'var(--bg-card)', border: '1px solid var(--border-glass)', cursor: 'pointer', fontFamily: 'var(--font-arabic)', boxShadow: '0 2px 10px rgba(0,0,0,.05)', flexShrink: 0, transition: 'all .2s' }}>
                        <div style={{ position: 'relative' }}>
                            <div style={{ width: 46, height: 46, borderRadius: '50%', background: u.avatar ? `url(${u.avatar}) center/cover` : 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 15, fontWeight: 800, backgroundSize: 'cover' }}>{!u.avatar && gi(u.name)}</div>
                            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 13, height: 13, borderRadius: '50%', background: u.online ? '#22c55e' : '#6b7280', border: '2.5px solid var(--bg-card)' }} />
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', maxWidth: 62, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{u.name.split(' ')[0]}</div>
                    </button>)}
                    {allUsers.length === 0 && usersLoaded && <div style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>لا يوجد موظفين</div>}
                </div>
            </div>

            <div style={{ position: 'relative', marginBottom: 16 }}>
                <Search size={16} style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" placeholder="بحث في المحادثات..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', padding: '11px 40px 11px 14px', borderRadius: 'var(--radius-lg)', background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-arabic)', outline: 'none' }} />
            </div>

            {loading ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}><Loader2 size={30} style={{ margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} /><div style={{ fontSize: 14, fontWeight: 700 }}>جاري التحميل...</div></div>
                : convs.length === 0 ? <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--text-muted)' }}><div style={{ width: 74, height: 74, borderRadius: '50%', background: 'rgba(59,130,246,.08)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MessageCircle size={32} style={{ opacity: .4, color: '#3b82f6' }} /></div><div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>لا توجد محادثات بعد</div><div style={{ fontSize: 13, fontWeight: 600 }}>اختر موظفاً من الأعلى لبدء المحادثة</div></div>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {convs.filter(c => !search.trim() || ((c.participantNames?.[c.participants.find(p => p !== uid) || '']) || '').includes(search)).map(c => {
                            const oid = c.participants.find(p => p !== uid) || '';
                            const on = c.participantNames?.[oid] || 'مستخدم';
                            const av = (c as any).participantAvatars?.[oid] || allUsers.find(u => u.id === oid)?.avatar;
                            const rd = (c as any).readBy || {}, lr = rd[uid], lm = c.lastMessageAt, ls = (c as any).lastSenderId;
                            const unread = lm && ls && ls !== uid && (!lr || (lr.toMillis && lm.toMillis && lr.toMillis() < lm.toMillis()));
                            return (
                                <div key={c.id} style={{ position: 'relative' }}
                                    onTouchStart={() => { longPressTimer.current = setTimeout(() => setLongPressConv(c.id), 600); }}
                                    onTouchEnd={() => clearTimeout(longPressTimer.current)}
                                    onTouchMove={() => clearTimeout(longPressTimer.current)}
                                    onContextMenu={e => { e.preventDefault(); setLongPressConv(c.id); }}
                                >
                                    <button onClick={() => openExisting(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 'var(--radius-xl)', background: 'var(--bg-card)', border: unread ? '1px solid rgba(59,130,246,.3)' : '1px solid var(--border-glass)', cursor: 'pointer', textAlign: 'right', width: '100%', fontFamily: 'var(--font-arabic)', boxShadow: unread ? '0 2px 14px rgba(59,130,246,.12)' : '0 2px 8px rgba(0,0,0,.05)', transition: 'all .2s' }}>
                                        <div style={{ width: 50, height: 50, borderRadius: '50%', background: av ? `url(${av}) center/cover` : 'linear-gradient(135deg,#10b981,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 800, flexShrink: 0, backgroundSize: 'cover' }}>{!av && gi(on)}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                <div style={{ fontSize: 15, fontWeight: 800 }}>{on}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{ft(c.lastMessageAt)}</div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <div style={{ fontSize: 13, color: unread ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: unread ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.lastMessage || 'لا توجد رسائل بعد'}</div>
                                                {unread && <div style={{ minWidth: 10, height: 10, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', flexShrink: 0, boxShadow: '0 0 8px rgba(59,130,246,.5)' }} />}
                                            </div>
                                        </div>
                                    </button>
                                    {/* Long press menu */}
                                    {longPressConv === c.id && <div className="cm" style={{ top: '50%', right: 20, transform: 'translateY(-50%)' }} onClick={e => e.stopPropagation()}>
                                        <button className="ci dl" onClick={() => { setDeleteConfirm(c.id); setLongPressConv(null); }}><Trash2 size={15} />حذف المحادثة</button>
                                        <button className="ci" onClick={() => { setLongPressConv(null); }}><Archive size={15} />أرشفة</button>
                                        <button className="ci" onClick={() => { setShowBgPicker(true); setLongPressConv(null); }}> 🎨 تغيير خلفية الدردشة</button>
                                    </div>}
                                </div>);
                        })}
                    </div>}

            {deleteConfirm && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100dvh', background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setDeleteConfirm(null)}><div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 20, padding: '30px 24px', maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,.4)', animation: 'fadeUp .2s ease', border: '1px solid var(--border-glass)' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(244,63,94,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Trash2 size={26} style={{ color: '#f43f5e' }} /></div>
                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>حذف المحادثة</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 24, lineHeight: 1.6 }}>اختر طريقة حذف المحادثة</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button onClick={() => deleteConvForMe(deleteConfirm)} style={{ padding: '13px 16px', borderRadius: 14, background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-arabic)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .15s' }}>🗑️ حذف لدي فقط</button>
                    <button onClick={() => deleteConvForBoth(deleteConfirm)} style={{ padding: '13px 16px', borderRadius: 14, background: 'linear-gradient(135deg,#ef4444,#dc2626)', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-arabic)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 16px rgba(239,68,68,.3)', transition: 'all .15s' }}>⚠️ حذف من الطرفين</button>
                    <button onClick={() => setDeleteConfirm(null)} style={{ padding: '11px 16px', borderRadius: 14, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-arabic)', marginTop: 4 }}>إلغاء</button>
                </div>
            </div></div>}

            {showBgPicker && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.6)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowBgPicker(false)}><div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: '20px 20px 0 0', padding: 22, width: '100%', maxWidth: 400, animation: 'slideUp .2s ease' }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>🎨 خلفية الدردشة</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                    {BG_OPTIONS.map(b => <button key={b.id} onClick={() => { setChatBg(b.id); localStorage.setItem('chat-bg', b.id); setShowBgPicker(false); }} style={{ padding: 16, borderRadius: 'var(--radius-lg)', background: b.bg === 'transparent' ? 'var(--bg-glass)' : b.bg, border: chatBg === b.id ? '2px solid #3b82f6' : '1px solid var(--border-glass)', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-arabic)', minHeight: 55 }}>{b.label}</button>)}
                </div>
            </div></div>}
        </div>
    );
}
