import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Send, Search, Users, MessageCircle, Loader2, Smile, Paperclip, Image as ImageIcon, X, Trash2, Edit3, Check, Clock, Download, FileText, Camera, EyeOff, CheckCheck, MapPin, Archive, UserCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../firebase';
import { collection, doc, getDocs, addDoc, query, where, onSnapshot, serverTimestamp, Timestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface ChatUser { id: string; name: string; avatar?: string; department?: string; online?: boolean; lastSeen?: Timestamp; }
interface Message { id: string; text: string; senderId: string; senderName: string; createdAt: Timestamp | null; edited?: boolean; deleted?: boolean; type?: 'text' | 'image' | 'file' | 'location'; fileUrl?: string; fileName?: string; fileSize?: string; disappearAfter?: number; readBy?: Record<string, boolean>; location?: { lat: number; lng: number }; }
interface Conversation { id: string; participants: string[]; participantNames: Record<string, string>; participantAvatars?: Record<string, string>; lastMessage?: string; lastMessageAt?: Timestamp; readBy?: Record<string, Timestamp>; lastSenderId?: string; }
interface Props { onBack: () => void; onChatActive?: (active: boolean) => void; }

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

export default function ChatPage({ onBack, onChatActive }: Props) {
    const { user } = useAuth();
    const uid = user?.id || '';
    const [activeChat, setActiveChat] = useState<{ convId: string; otherUser: ChatUser } | null>(null);

    // Notify parent when chat is opened/closed
    React.useEffect(() => {
        onChatActive?.(!!activeChat);
    }, [activeChat, onChatActive]);
    const [convs, setConvs] = useState<Conversation[]>([]);
    const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
    const [msgs, setMsgs] = useState<Message[]>([]);
    const [newMsg, setNewMsg] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [usersLoaded, setUsersLoaded] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
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

    // Swipe-back gesture for active chat
    const chatSwipeX = useRef(0);
    const chatSwipeY = useRef(0);
    const chatSwiping = useRef(false);
    const handleChatSwipeStart = (e: React.TouchEvent) => { chatSwipeX.current = e.touches[0].clientX; chatSwipeY.current = e.touches[0].clientY; chatSwiping.current = true; };
    const handleChatSwipeEnd = (e: React.TouchEvent) => { if (!chatSwiping.current) return; chatSwiping.current = false; const dx = e.changedTouches[0].clientX - chatSwipeX.current; const dy = Math.abs(e.changedTouches[0].clientY - chatSwipeY.current); if (dx > 80 && dx > dy * 1.5) { setActiveChat(null); setShowEmoji(false); setEditMsg(null); setShowAttach(false); } };

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

    const sendMessage = async (opts?: { type?: string; text?: string; fileUrl?: string; fileName?: string; fileSize?: string; location?: { lat: number; lng: number } }) => {
        if ((!newMsg.trim() && !opts?.text && !opts?.fileUrl && !opts?.location) || !activeChat || !user) return;
        setSending(true); const t = opts?.text || newMsg.trim(); setNewMsg(''); setShowEmoji(false);
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
    const sendContact = async () => { setShowAttach(false); try { if ('contacts' in navigator && 'ContactsManager' in window) { const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false }); if (contacts?.length) { const c = contacts[0]; const name = c.name?.[0] || 'جهة اتصال'; const tel = c.tel?.[0] || ''; await sendMessage({ type: 'text', text: `👤 ${name}\n📞 ${tel}` }); } } else { const name = prompt('اسم جهة الاتصال:'); if (!name) return; const tel = prompt('رقم الهاتف:'); if (!tel) return; await sendMessage({ type: 'text', text: `👤 ${name}\n📞 ${tel}` }); } } catch (e) { console.error(e); } };

    const gi = (n: string) => n.split(' ').map(w => w[0]).join('').slice(0, 2);
    const ft = (ts: Timestamp | null | undefined) => { if (!ts) return ''; const d = ts.toDate(), df = Date.now() - d.getTime(); if (df < 60000) return 'الآن'; if (df < 3600000) return `${Math.floor(df / 60000)} د`; if (df < 86400000) return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }); return d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' }); };
    const fls = (ts: Timestamp | null) => { if (!ts) return 'غير متصل'; const df = Date.now() - ts.toDate().getTime(); if (df < 60000) return 'آخر ظهور: الآن'; if (df < 3600000) return `آخر ظهور: منذ ${Math.floor(df / 60000)} د`; return `آخر ظهور: ${ts.toDate().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`; };
    const getDateLabel = (ts: Timestamp | null) => { if (!ts) return ''; const d = ts.toDate(), now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), md = new Date(d.getFullYear(), d.getMonth(), d.getDate()), diff = (today.getTime() - md.getTime()) / 86400000; if (diff === 0) return 'اليوم'; if (diff === 1) return 'أمس'; return d.toLocaleDateString('ar-IQ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }); };
    const getBgStyle = () => { const o = BG_OPTIONS.find(b => b.id === chatBg); return o?.bg || 'transparent'; };

    const css = `
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes msgIn { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes pulseGlow { 0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); } 70% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); } 100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); } }
        
        .chat-root {
            width: 100%;
            max-width: 100vw;
            overflow-x: hidden;
            overscroll-behavior: none;
            touch-action: pan-y;
            scrollbar-width: none;
        }
        .chat-root::-webkit-scrollbar { display: none; }
        
        .glass-input {
            background: var(--bg-glass);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border-glass);
            transition: all 0.3s ease;
        }
        .glass-input:focus-within {
            border-color: var(--accent-blue);
            background: var(--bg-glass-strong);
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.15);
        }
        
        .conv-item {
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .conv-item:hover {
            transform: translateY(-2px);
            background: var(--bg-glass-hover);
        }
        .conv-item.unread {
            background: rgba(59, 130, 246, 0.05);
            border: 1px solid rgba(59, 130, 246, 0.2);
        }
        
        .emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; }
        .emoji-btn {
            font-size: 24px;
            padding: 8px;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .emoji-btn:hover { background: var(--bg-glass-strong); transform: scale(1.15); }
        
        .msg-bubble {
            max-width: 80%;
            padding: 12px 16px;
            font-size: 14.5px;
            line-height: 1.6;
            position: relative;
            transition: all 0.2s;
        }
        .msg-me {
            background: linear-gradient(135deg, #4f46e5, #3b82f6);
            color: white;
            border-radius: 20px 20px 4px 20px;
            box-shadow: 0 8px 20px rgba(59, 130, 246, 0.25);
        }
        .msg-other {
            background: var(--bg-card);
            color: var(--text-primary);
            border-radius: 20px 20px 20px 4px;
            border: 1px solid var(--border-glass);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
    `;


    // ================= CHAT VIEW =================
    // ================= CHAT VIEW =================
    if (activeChat) {
        const { otherUser } = activeChat;
        let lastDateLabel = '';
        const bgVal = getBgStyle();
        return (
            <div className="chat-root" style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                padding: 0,
                overflow: 'hidden',
                position: 'relative',
                width: '100%',
                background: bgVal.startsWith('linear') ? bgVal : undefined,
                backgroundColor: !bgVal.startsWith('linear') ? (bgVal === 'transparent' ? 'var(--bg-primary)' : bgVal) : undefined,
            }}>
                <style>{css}</style>

                {/* Modern Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))', borderBottom: '1px solid var(--border-glass)', background: 'rgba(10, 14, 26, 0.95)', backdropFilter: 'blur(24px)', zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', flexShrink: 0 }}>
                    <button onClick={() => { setActiveChat(null); setShowEmoji(false); setEditMsg(null); setShowAttach(false); }} style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0 }}><ArrowRight size={18} /></button>
                    <div style={{ position: 'relative' }}>
                        <div style={{ width: 38, height: 38, borderRadius: '14px', background: otherUser.avatar ? `url(${otherUser.avatar}) center/cover` : 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 800, border: '2px solid var(--border-glass)', boxShadow: otherOnline ? '0 0 0 2px #22c55e, 0 10px 20px rgba(34,197,94,0.2)' : 'none' }}>{!otherUser.avatar && gi(otherUser.name)}</div>
                        {otherOnline && <div style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: '#22c55e', border: '3px solid #0a0e1a', animation: 'pulseGlow 2s infinite' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{otherUser.name}</div>
                        <div style={{ fontSize: 10, color: otherOnline ? '#22c55e' : 'var(--text-muted)', fontWeight: 700 }}>{otherOnline ? 'متصل الآن' : fls(otherLastSeen)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setShowDisappear(!showDisappear)} style={{ width: 34, height: 34, borderRadius: 10, background: disappear > 0 ? 'rgba(245,158,11,0.15)' : 'var(--bg-glass)', border: disappear > 0 ? '1px solid rgba(245,158,11,0.3)' : '1px solid var(--border-glass)', color: disappear > 0 ? '#f59e0b' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{disappear > 0 ? <EyeOff size={16} /> : <Clock size={16} />}</button>
                    </div>
                    {showDisappear && <div style={{ position: 'absolute', top: 60, left: 16, zIndex: 110, background: 'var(--bg-card)', border: '1px solid var(--border-glass)', borderRadius: 20, padding: 8, minWidth: 160, boxShadow: '0 10px 40px rgba(0,0,0,0.4)', animation: 'fadeUp 0.15s ease' }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', padding: '6px 10px' }}>اختفاء الرسائل تلقائياً</div>
                        {DISAPPEAR.map(o => <button key={o.v} onClick={() => { setDisappear(o.v); setShowDisappear(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 12, width: '100%', background: disappear === o.v ? 'rgba(245,158,11,0.1)' : 'transparent', color: disappear === o.v ? '#f59e0b' : 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>{o.l}{disappear === o.v && <Check size={14} />}</button>)}
                    </div>}
                </div>

                {disappear > 0 && <div style={{ padding: '8px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: 11, fontWeight: 800, textAlign: 'center', borderBottom: '1px solid rgba(245,158,11,0.1)' }}>⚠️ الرسائل ستختفي تلقائياً بعد {DISAPPEAR.find(x => x.v === disappear)?.l}</div>}

                {/* Messages area */}
                <div className="chat-msgs" onTouchStart={handleChatSwipeStart} onTouchEnd={handleChatSwipeEnd} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, overscrollBehavior: 'contain' }}>
                    {msgs.length === 0 && <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}><div style={{ width: 80, height: 80, borderRadius: 30, background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}><MessageCircle size={40} /></div><div style={{ fontSize: 16, fontWeight: 800 }}>ابدأ المحادثة مع {otherUser.name.split(' ')[0]}</div></div>}
                    {msgs.map(msg => {
                        const isMe = msg.senderId === uid, isDel = msg.deleted === true;
                        const dl = getDateLabel(msg.createdAt);
                        let showDate = false; if (dl !== lastDateLabel) { showDate = true; lastDateLabel = dl; }
                        const isRead = isMe && msg.readBy && msg.readBy[activeChat.otherUser.id];
                        return (
                            <React.Fragment key={msg.id}>
                                {showDate && <div style={{ textAlign: 'center', padding: '24px 0 12px', display: 'flex', alignItems: 'center', gap: 16 }}><div style={{ flex: 1, height: 1, background: 'var(--border-glass)' }} /><span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-muted)', padding: '4px 12px', background: 'var(--bg-glass)', borderRadius: 10 }}>{dl}</span><div style={{ flex: 1, height: 1, background: 'var(--border-glass)' }} /></div>}
                                <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', animation: 'msgIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }} onContextMenu={e => { if (!isDel) { e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY }); setCtxMsg(msg); } }}>
                                    <div className={`msg-bubble ${isMe ? 'msg-me' : 'msg-other'}`} style={{ fontStyle: isDel ? 'italic' : 'normal', opacity: isDel ? 0.6 : 1 }}>
                                        {msg.type === 'image' && msg.fileUrl && !isDel && <div style={{ marginBottom: 6 }}><img src={msg.fileUrl} alt="" onClick={() => setImgPreview(msg.fileUrl!)} style={{ width: '100%', borderRadius: 12, cursor: 'pointer', display: 'block' }} /></div>}
                                        {msg.type === 'file' && msg.fileUrl && !isDel && <a href={msg.fileUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: 12, color: 'inherit' }}><div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={20} /></div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.fileName}</div><div style={{ fontSize: 10, opacity: 0.7 }}>{msg.fileSize}</div></div></a>}
                                        {msg.type === 'location' && msg.location && !isDel && <a href={`https://www.google.com/maps?q=${msg.location.lat},${msg.location.lng}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: 12, color: 'inherit' }}><div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><MapPin size={20} /></div><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 800 }}>الموقع الحالي</div><div style={{ fontSize: 10, opacity: 0.7 }}>اضغط للعرض على الخريطة</div></div></a>}
                                        <div style={{ wordBreak: 'break-word' }}>{msg.text}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4, opacity: 0.7 }}>{msg.edited && <span style={{ fontSize: 9 }}>معدلة</span>}<span style={{ fontSize: 10, fontWeight: 700 }}>{ft(msg.createdAt)}</span>{isMe && !isDel && <CheckCheck size={14} style={{ color: isRead ? '#34d399' : 'rgba(255,255,255,0.5)' }} />}</div>
                                    </div>
                                </div>
                            </React.Fragment>
                        );
                    })}
                    <div ref={endRef} style={{ height: 20 }} />
                </div>

                {editMsg && <div style={{ padding: '10px 16px', background: 'rgba(59, 130, 246, 0.1)', borderTop: '1px solid var(--accent-blue-soft)', display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeUp 0.2s ease' }}>
                    <div style={{ width: 4, height: 30, background: 'var(--accent-blue)', borderRadius: 2 }} /><div style={{ flex: 1 }}><div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-blue)' }}>تعديل الرسالة</div><div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{editMsg.text}</div></div>
                    <button onClick={() => { setEditMsg(null); setEditTxt(''); }} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
                </div>}

                {/* Modern Input Bar */}
                <div style={{ padding: '6px 10px', paddingBottom: '8px', background: 'rgba(10, 14, 26, 0.8)', backdropFilter: 'blur(24px)', borderTop: '1px solid var(--border-glass)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    {showEmoji && <div style={{ background: 'var(--bg-glass-strong)', borderRadius: 16, padding: 10, marginBottom: 4, maxHeight: 180, overflowY: 'auto', animation: 'slideUp 0.3s ease' }}>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 8, overflowX: 'auto', paddingBottom: 4 }}>{EMOJI_CATS.map(c => <button key={c.id} onClick={() => setEmojiCat(c.id)} style={{ padding: '6px 10px', borderRadius: 10, background: emojiCat === c.id ? 'var(--accent-blue-soft)' : 'transparent', fontSize: 16 }}>{c.icon}</button>)}</div>
                        <div className="emoji-grid">{EMOJI_CATS.find(c => c.id === emojiCat)?.emojis.map((e, i) => <button key={i} className="emoji-btn" onClick={() => { if (editMsg) setEditTxt(p => p + e); else setNewMsg(p => p + e); }}>{e}</button>)}</div>
                    </div>}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                        <button onClick={() => { setShowAttach(!showAttach); setShowEmoji(false); }} style={{ width: 38, height: 38, borderRadius: 14, background: showAttach ? 'var(--accent-blue-soft)' : 'var(--bg-glass)', color: showAttach ? 'var(--accent-blue)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Paperclip size={19} /></button>
                        <div className="glass-input" style={{ flex: 1, borderRadius: 16, padding: '3px 6px', display: 'flex', alignItems: 'center', minHeight: 38, maxHeight: 120, overflow: 'hidden' }}>
                            <button onClick={() => { setShowEmoji(!showEmoji); setShowAttach(false); }} style={{ padding: 6, color: showEmoji ? 'var(--accent-amber)' : 'var(--text-muted)', flexShrink: 0 }}><Smile size={19} /></button>
                            <textarea ref={textareaRef} placeholder="اكتب شيئاً جميل ..." value={editMsg ? editTxt : newMsg} onChange={e => { editMsg ? setEditTxt(e.target.value) : setNewMsg(e.target.value); const ta = textareaRef.current; if (ta) { ta.style.height = '32px'; ta.style.height = Math.min(ta.scrollHeight, 100) + 'px'; } }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); editMsg ? doEdit() : sendMessage(); const ta = textareaRef.current; if (ta) ta.style.height = '32px'; } }} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '7px 4px', color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-arabic)', resize: 'none', height: 32, minHeight: 32, maxHeight: 100, lineHeight: '18px', overflow: 'auto' }} rows={1} />
                        </div>
                        <button onClick={editMsg ? doEdit : () => sendMessage()} disabled={editMsg ? !editTxt.trim() : (!newMsg.trim() && !uploading)} style={{ width: 38, height: 38, borderRadius: 14, background: (newMsg.trim() || editTxt.trim()) ? 'linear-gradient(135deg, #4f46e5, #3b82f6)' : 'var(--bg-glass)', color: (newMsg.trim() || editTxt.trim()) ? 'white' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: (newMsg.trim() || editTxt.trim()) ? '0 8px 16px rgba(59,130,246,0.3)' : 'none', transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', transform: (newMsg.trim() || editTxt.trim()) ? 'scale(1.05)' : 'scale(1)', flexShrink: 0 }}>{editMsg ? <Check size={19} /> : <Send size={19} style={{ transform: 'rotate(180deg)', marginLeft: -2 }} />}</button>
                    </div>
                </div>

                {showAttach && <><div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setShowAttach(false)} /><div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000, background: 'var(--bg-card)', borderRadius: '32px 32px 0 0', padding: '16px 24px 40px', border: '1px solid var(--border-glass)', boxShadow: '0 -20px 60px rgba(0,0,0,0.5)', animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}><div style={{ width: 40, height: 6, borderRadius: 3, background: 'var(--border-glass)', margin: '0 auto 20px' }} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>{[{ icon: <ImageIcon size={26} />, label: 'صورة', color: '#10b981', action: () => imgRef.current?.click() }, { icon: <Camera size={26} />, label: 'كاميرا', color: '#3b82f6', action: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment'; i.onchange = (e: any) => { const f = e.target.files?.[0]; if (f) doUpload(f, 'image'); }; i.click(); } }, { icon: <FileText size={26} />, label: 'ملف', color: '#8b5cf6', action: () => fileRef.current?.click() }, { icon: <MapPin size={26} />, label: 'موقع', color: '#f59e0b', action: sendLocation }, { icon: <UserCircle size={26} />, label: 'اتصال', color: '#ec4899', action: sendContact },].map((item, idx) => <button key={idx} onClick={() => { item.action(); setShowAttach(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}><div style={{ width: 60, height: 60, borderRadius: 20, background: `${item.color}15`, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</div><span style={{ fontSize: 13, fontWeight: 800 }}>{item.label}</span></button>)}</div></div></>}
                {uploading && <div style={{ position: 'absolute', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-card)', padding: '8px 16px', borderRadius: 20, border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', zIndex: 50 }}><Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-blue)' }} /><span style={{ fontSize: 12, fontWeight: 800 }}>جاري الرفع ...</span></div>}

                <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f, 'image'); }} />
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f, 'file'); }} />
                {imgPreview && <div onClick={() => setImgPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><img src={imgPreview} alt="" style={{ maxWidth: '95%', maxHeight: '85dvh', borderRadius: 12 }} /></div>}
            </div>
        );
    }


    // ================= MAIN CHAT LIST =================
    return (
        <div className="page-content page-enter chat-root" style={{ padding: '16px 12px', background: 'var(--bg-primary)' }}>
            <style>{css}</style>

            {/* Settings Button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, padding: '0 4px' }}>
                <button onClick={() => setShowBgPicker(true)} style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-blue)', border: '1px solid var(--border-glass)' }}>
                    <Edit3 size={18} />
                </button>
            </div>

            {/* Stories-like Employee List */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '0 4px' }}>
                    <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}><Users size={16} color="#6366f1" /> فريق العمل</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>{allUsers.length} متوفر</span>
                </div>
                <div style={{ display: 'flex', gap: 14, overflowX: 'auto', padding: '4px', scrollbarWidth: 'none' }} className="stories-container">
                    {allUsers.map(u => (
                        <button key={u.id} onClick={() => openChatWith(u)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 72, transition: 'transform 0.2s' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{
                                    width: 64, height: 64, borderRadius: '50%',
                                    background: u.avatar ? `url(${u.avatar}) center/cover` : 'linear-gradient(135deg, #6366f1, #3b82f6)',
                                    border: u.online ? '3px solid #22c55e' : '3px solid var(--border-glass)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: 18,
                                    padding: 3, boxSizing: 'content-box',
                                    boxShadow: u.online ? '0 8px 20px rgba(34, 197, 94, 0.2)' : 'none'
                                }}>
                                    {!u.avatar && gi(u.name)}
                                </div>
                                {u.online && <div style={{ position: 'absolute', bottom: 4, right: 4, width: 14, height: 14, background: '#22c55e', borderRadius: '50%', border: '3px solid #0a0e1a' }} />}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name.split(' ')[0]}</span>
                        </button>
                    ))}
                    {allUsers.length === 0 && usersLoaded && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 20 }}>لا يوجد موظفين حالياً</div>}
                </div>
            </div>

            {/* Search Redesign */}
            <div className="glass-input" style={{ position: 'relative', marginBottom: 28, borderRadius: 20, display: 'flex', alignItems: 'center', padding: '2px 8px' }}>
                <Search size={18} style={{ color: 'var(--text-muted)', marginLeft: 10 }} />
                <input
                    type="text" placeholder="بحث في المحادثات ..."
                    value={search} onChange={e => setSearch(e.target.value)}
                    style={{
                        width: '100%', padding: '14px 4px', background: 'transparent', border: 'none', outline: 'none',
                        fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-arabic)'
                    }}
                />
            </div>

            {/* Conversations List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}><Loader2 size={32} className="spin" style={{ animation: 'spin 1s linear infinite' }} /></div>
                ) : convs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-glass)', borderRadius: 24, border: '1px solid var(--border-glass)' }}>
                        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><MessageCircle size={32} /></div>
                        <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>لا توجد محادثات</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>ابدأ محادثة جديدة مع أحد زملائك</div>
                    </div>
                ) : convs.filter(c => !search.trim() || (c.participantNames?.[c.participants.find(p => p !== uid) || ''] || '').includes(search)).map(c => {
                    const oid = c.participants.find(p => p !== uid) || '';
                    const on = c.participantNames?.[oid] || 'مستخدم';
                    const av = (c as any).participantAvatars?.[oid] || allUsers.find(u => u.id === oid)?.avatar;
                    const rd = (c as any).readBy || {}, lr = rd[uid], lm = c.lastMessageAt, ls = (c as any).lastSenderId;
                    const unread = lm && ls && ls !== uid && (!lr || (lr.toMillis && lm.toMillis && lr.toMillis() < lm.toMillis()));

                    return (
                        <div key={c.id} style={{ position: 'relative' }} className="conv-item-wrapper" onContextMenu={e => { e.preventDefault(); setLongPressConv(c.id); }}>
                            <button
                                onClick={() => openExisting(c)}
                                className={`conv-item ${unread ? 'unread' : ''}`}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
                                    borderRadius: 24, background: 'var(--bg-card)', border: '1px solid var(--border-glass)',
                                    width: '100%', textAlign: 'right', boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                                }}
                            >
                                <div style={{
                                    width: 56, height: 56, borderRadius: 20,
                                    background: av ? `url(${av}) center/cover` : 'linear-gradient(135deg, #10b981, #3b82f6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 18, fontWeight: 900, flexShrink: 0
                                }}>
                                    {!av && gi(on)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-primary)' }}>{on}</span>
                                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>{ft(c.lastMessageAt)}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <p style={{
                                            fontSize: 13, color: unread ? 'var(--text-primary)' : 'var(--text-muted)',
                                            fontWeight: unread ? 800 : 500, margin: 0,
                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1
                                        }}>
                                            {c.lastSenderId === uid ? 'أنت: ' : ''}{c.lastMessage || 'بدء المحادثة ...'}
                                        </p>
                                        {unread && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 10px rgba(59,130,246,0.6)' }} />}
                                    </div>
                                </div>
                            </button>

                            {longPressConv === c.id && (
                                <div className="cm" style={{ top: '50%', right: 16, transform: 'translateY(-50%)', zIndex: 100 }} onClick={e => e.stopPropagation()}>
                                    <button className="ci dl" onClick={() => { setDeleteConfirm(c.id); setLongPressConv(null); }}><Trash2 size={16} />حذف المحادثة</button>
                                    <button className="ci" onClick={() => { setLongPressConv(null); }}><Archive size={16} />أرشفة</button>
                                    <button className="ci" onClick={() => { setShowBgPicker(true); setLongPressConv(null); }}><ImageIcon size={16} />تغيير الخلفية</button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Delete Modal Redesign */}
            {deleteConfirm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setDeleteConfirm(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 32, padding: 32, maxWidth: 360, width: '100%', textAlign: 'center', border: '1px solid var(--border-glass)', boxShadow: '0 30px 60px rgba(0,0,0,0.5)', animation: 'fadeUp 0.3s ease' }}>
                        <div style={{ width: 64, height: 64, borderRadius: 24, background: 'rgba(244,63,94,0.1)', color: '#f43f5e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}><Trash2 size={32} /></div>
                        <h3 style={{ fontSize: 20, fontWeight: 950, marginBottom: 8 }}>حذف المحادثة</h3>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 28, lineHeight: 1.6 }}>لن تتمكن من استعادة هذه المحادثة بعد حذفها. كيف تود المتابعة؟</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <button onClick={() => deleteConvForMe(deleteConfirm)} style={{ padding: '16px', borderRadius: 16, background: 'var(--bg-glass)', color: 'var(--text-primary)', fontWeight: 800, fontSize: 14 }}>حذف لدي فقط</button>
                            <button onClick={() => deleteConvForBoth(deleteConfirm)} style={{ padding: '16px', borderRadius: 16, background: 'linear-gradient(135deg, #f43f5e, #e11d48)', color: 'white', fontWeight: 800, fontSize: 14, boxShadow: '0 10px 20px rgba(244,63,94,0.3)' }}>حذف من الطرفين</button>
                            <button onClick={() => setDeleteConfirm(null)} style={{ padding: '12px', marginTop: 8, color: 'var(--text-muted)', fontWeight: 800, fontSize: 13 }}>تراجع</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Background Picker Redesign */}
            {showBgPicker && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowBgPicker(false)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', width: '100%', borderRadius: '32px 32px 0 0', padding: 24, paddingBottom: 'calc(24px + var(--safe-bottom))', animation: 'slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1)', borderTop: '1px solid var(--border-glass)' }}>
                        <div style={{ width: 40, height: 6, borderRadius: 3, background: 'var(--border-glass)', margin: '0 auto 24px' }} />
                        <h3 style={{ fontSize: 18, fontWeight: 950, textAlign: 'center', marginBottom: 20 }}>تخصيص المظهر</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                            {BG_OPTIONS.map(b => (
                                <button key={b.id} onClick={() => { setChatBg(b.id); localStorage.setItem('chat-bg', b.id); setShowBgPicker(false); }} style={{
                                    padding: '20px 16px', borderRadius: 20,
                                    background: b.bg === 'transparent' ? 'var(--bg-glass)' : b.bg,
                                    border: chatBg === b.id ? '2px solid var(--accent-blue)' : '1px solid var(--border-glass)',
                                    color: 'var(--text-primary)', fontWeight: 800, fontSize: 14, textAlign: 'center',
                                    transition: 'all 0.2s', transform: chatBg === b.id ? 'scale(1.02)' : 'scale(1)'
                                }}>
                                    {b.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
