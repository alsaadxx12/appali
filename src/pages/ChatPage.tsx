import React, { useState, useEffect, useRef } from 'react';
import {
    ArrowRight, Send, Search, Users, MessageCircle, Loader2,
    Smile, Paperclip, Image as ImageIcon, X, Trash2, Edit3, Check,
    Clock, Download, FileText, Camera, EyeOff, MoreVertical,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../firebase';
import {
    collection, doc, getDocs, addDoc, query, where, orderBy,
    onSnapshot, serverTimestamp, Timestamp, setDoc,
    updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ====== TYPES ======
interface ChatUser {
    id: string;
    name: string;
    avatar?: string;
    department?: string;
    online?: boolean;
    lastSeen?: Timestamp;
}

interface Message {
    id: string;
    text: string;
    senderId: string;
    senderName: string;
    createdAt: Timestamp | null;
    edited?: boolean;
    deleted?: boolean;
    type?: 'text' | 'image' | 'file';
    fileUrl?: string;
    fileName?: string;
    fileSize?: string;
    disappearAfter?: number;
}

interface Conversation {
    id: string;
    participants: string[];
    participantNames: Record<string, string>;
    lastMessage?: string;
    lastMessageAt?: Timestamp;
}

interface Props {
    onBack: () => void;
}

// ====== EMOJI ======
const EMOJI_CATEGORIES = [
    { id: 'smileys', icon: '😀', emojis: ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😜', '🤗', '😎', '🥳', '🤩', '😏', '😢', '😭', '😡', '🤯', '😴', '🤔', '🙄', '😱', '🤫', '🤐', '😷', '🤒', '💀', '👻', '👽', '🤖', '💩'] },
    { id: 'hands', icon: '👋', emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👋', '👏', '🙌', '🤝', '🙏', '💪', '👊', '✊', '🫶', '❤️‍🔥', '💯', '🔥'] },
    { id: 'hearts', icon: '❤️', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '♥️', '🫀', '💋'] },
    { id: 'objects', icon: '📎', emojis: ['📱', '💻', '📸', '🎥', '📞', '📧', '📝', '📋', '📌', '📎', '✂️', '🔑', '🔒', '💡', '⏰', '📅', '💼', '📁', '🗂️', '✅'] },
    { id: 'food', icon: '🍕', emojis: ['☕', '🍵', '🧃', '🍕', '🍔', '🍟', '🌮', '🍣', '🍰', '🎂', '🍩', '🍪', '🍫', '🍿', '🥤', '🍦', '🥗', '🍜', '🥘', '🧁'] },
    { id: 'nature', icon: '🌙', emojis: ['☀️', '🌙', '⭐', '🌟', '✨', '⚡', '🔥', '💧', '🌊', '🌈', '❄️', '🌸', '🌺', '🌻', '🍀', '🌲', '🌴', '🐦', '🦋', '🐾'] },
];

const DISAPPEAR_OPTIONS = [
    { label: 'إيقاف', value: 0 },
    { label: '10 ث', value: 10 },
    { label: '30 ث', value: 30 },
    { label: '1 د', value: 60 },
    { label: '5 د', value: 300 },
];

export default function ChatPage({ onBack }: Props) {
    const { user } = useAuth();
    const userId = user?.id || '';

    // Main state
    const [activeChat, setActiveChat] = useState<{ convId: string; otherUser: ChatUser } | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [usersLoaded, setUsersLoaded] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Feature state
    const [showEmoji, setShowEmoji] = useState(false);
    const [emojiCategory, setEmojiCategory] = useState('smileys');
    const [showAttach, setShowAttach] = useState(false);
    const [contextMsg, setContextMsg] = useState<Message | null>(null);
    const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
    const [editingMsg, setEditingMsg] = useState<Message | null>(null);
    const [editText, setEditText] = useState('');
    const [disappearMode, setDisappearMode] = useState(0);
    const [showDisappearPicker, setShowDisappearPicker] = useState(false);
    const [otherUserOnline, setOtherUserOnline] = useState(false);
    const [otherUserLastSeen, setOtherUserLastSeen] = useState<Timestamp | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);

    // ====== LOAD USERS (on mount) ======
    useEffect(() => {
        if (!userId) return;
        const loadUsers = async () => {
            try {
                const snap = await getDocs(collection(db, 'users'));
                const users: ChatUser[] = snap.docs
                    .filter(d => d.id !== userId)
                    .map(d => ({
                        id: d.id,
                        name: d.data().name || 'مستخدم',
                        avatar: d.data().avatar,
                        department: d.data().department,
                        online: d.data().online === true,
                        lastSeen: d.data().lastSeen,
                    }));
                setAllUsers(users);
                setUsersLoaded(true);
            } catch (e) {
                console.error('Error loading users:', e);
                setUsersLoaded(true);
            }
        };
        loadUsers();
    }, [userId]);

    // ====== LOAD CONVERSATIONS ======
    useEffect(() => {
        if (!userId) return;
        const q = query(
            collection(db, 'conversations'),
            where('participants', 'array-contains', userId),
            orderBy('lastMessageAt', 'desc')
        );
        const unsub = onSnapshot(q, (snap) => {
            const convs: Conversation[] = snap.docs.map(d => ({
                id: d.id,
                ...d.data(),
            } as Conversation));
            setConversations(convs);
            setLoading(false);
        }, (err) => {
            console.error('Error loading conversations:', err);
            setLoading(false);
        });
        return () => unsub();
    }, [userId]);

    // ====== LOAD MESSAGES ======
    useEffect(() => {
        if (!activeChat) { setMessages([]); return; }
        const q = query(
            collection(db, 'conversations', activeChat.convId, 'messages'),
            orderBy('createdAt', 'asc')
        );
        const unsub = onSnapshot(q, (snap) => {
            const msgs: Message[] = snap.docs.map(d => ({
                id: d.id,
                ...d.data(),
            } as Message));
            setMessages(msgs);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });
        return () => unsub();
    }, [activeChat?.convId]);

    // ====== TRACK OTHER USER ONLINE ======
    useEffect(() => {
        if (!activeChat) return;
        const unsub = onSnapshot(doc(db, 'users', activeChat.otherUser.id), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setOtherUserOnline(data.online === true);
                setOtherUserLastSeen(data.lastSeen || null);
            }
        });
        return () => unsub();
    }, [activeChat?.otherUser.id]);

    // ====== DISAPPEARING MESSAGES ======
    useEffect(() => {
        const interval = setInterval(() => {
            setMessages(prev => prev.map(msg => {
                if (msg.disappearAfter && msg.disappearAfter > 0 && msg.createdAt) {
                    const elapsed = (Date.now() - msg.createdAt.toDate().getTime()) / 1000;
                    if (elapsed > msg.disappearAfter) {
                        return { ...msg, deleted: true, text: '💨 رسالة ذاتية الاختفاء' };
                    }
                }
                return msg;
            }));
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    // Close context menu
    useEffect(() => {
        const handler = () => setContextMsg(null);
        if (contextMsg) window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, [contextMsg]);

    // ====== OPEN CHAT WITH USER ======
    const openChatWith = async (targetUser: ChatUser) => {
        // Check if conversation already exists
        const existing = conversations.find(c =>
            c.participants.includes(targetUser.id) && c.participants.includes(userId)
        );
        if (existing) {
            setActiveChat({ convId: existing.id, otherUser: targetUser });
            return;
        }
        // Create new conversation
        if (!user) return;
        try {
            const convRef = await addDoc(collection(db, 'conversations'), {
                participants: [userId, targetUser.id],
                participantNames: {
                    [userId]: user.name,
                    [targetUser.id]: targetUser.name,
                },
                lastMessage: '',
                lastMessageAt: serverTimestamp(),
                createdAt: serverTimestamp(),
            });
            setActiveChat({ convId: convRef.id, otherUser: targetUser });
        } catch (e) {
            console.error('Error creating conversation:', e);
        }
    };

    const openExistingConv = (conv: Conversation) => {
        const otherId = conv.participants.find(p => p !== userId) || '';
        const otherName = conv.participantNames?.[otherId] || 'مستخدم';
        const matchedUser = allUsers.find(u => u.id === otherId);
        setActiveChat({
            convId: conv.id,
            otherUser: matchedUser || { id: otherId, name: otherName },
        });
    };

    // ====== SEND MESSAGE ======
    const sendMessage = async (opts?: { type?: string; fileUrl?: string; fileName?: string; fileSize?: string }) => {
        if ((!newMessage.trim() && !opts?.fileUrl) || !activeChat || !user) return;
        setSending(true);
        const text = newMessage.trim();
        setNewMessage('');
        setShowEmoji(false);

        try {
            const msgData: any = {
                text: opts?.type === 'image' ? '📷 صورة' : opts?.type === 'file' ? `📎 ${opts.fileName}` : text,
                senderId: userId,
                senderName: user.name,
                createdAt: serverTimestamp(),
                type: opts?.type || 'text',
            };
            if (opts?.fileUrl) msgData.fileUrl = opts.fileUrl;
            if (opts?.fileName) msgData.fileName = opts.fileName;
            if (opts?.fileSize) msgData.fileSize = opts.fileSize;
            if (disappearMode > 0) msgData.disappearAfter = disappearMode;

            await addDoc(collection(db, 'conversations', activeChat.convId, 'messages'), msgData);
            await setDoc(doc(db, 'conversations', activeChat.convId), {
                lastMessage: msgData.text,
                lastMessageAt: serverTimestamp(),
            }, { merge: true });
        } catch (e) {
            console.error('Error sending message:', e);
        }
        setSending(false);
        inputRef.current?.focus();
    };

    const handleEditMessage = async () => {
        if (!editingMsg || !editText.trim() || !activeChat) return;
        try {
            await updateDoc(doc(db, 'conversations', activeChat.convId, 'messages', editingMsg.id), {
                text: editText.trim(),
                edited: true,
            });
            await setDoc(doc(db, 'conversations', activeChat.convId), {
                lastMessage: editText.trim(),
            }, { merge: true });
        } catch (e) {
            console.error('Error editing message:', e);
        }
        setEditingMsg(null);
        setEditText('');
    };

    const handleDeleteMessage = async (msg: Message) => {
        if (!activeChat) return;
        try {
            await updateDoc(doc(db, 'conversations', activeChat.convId, 'messages', msg.id), {
                deleted: true,
                text: 'تم حذف هذه الرسالة',
            });
        } catch (e) {
            console.error('Error deleting message:', e);
        }
        setContextMsg(null);
    };

    const handleFileUpload = async (file: File, type: 'image' | 'file') => {
        if (!activeChat || !user) return;
        setUploading(true);
        setShowAttach(false);
        try {
            const path = `chat/${activeChat.convId}/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            const size = file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${(file.size / 1024).toFixed(0)} KB`;
            await sendMessage({ type, fileUrl: url, fileName: file.name, fileSize: size });
        } catch (e) {
            console.error('Error uploading file:', e);
        }
        setUploading(false);
    };

    // ====== HELPERS ======
    const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2);

    const formatTime = (ts: Timestamp | null | undefined) => {
        if (!ts) return '';
        const d = ts.toDate();
        const diff = Date.now() - d.getTime();
        if (diff < 60000) return 'الآن';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} د`;
        if (diff < 86400000) return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' });
    };

    const formatLastSeen = (ts: Timestamp | null) => {
        if (!ts) return 'غير متصل';
        const diff = Date.now() - ts.toDate().getTime();
        if (diff < 60000) return 'آخر ظهور: الآن';
        if (diff < 3600000) return `آخر ظهور: منذ ${Math.floor(diff / 60000)} د`;
        return `آخر ظهور: ${ts.toDate().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`;
    };

    const getConvOtherName = (conv: Conversation) => {
        const otherId = conv.participants.find(p => p !== userId) || '';
        return conv.participantNames?.[otherId] || 'مستخدم';
    };

    const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setContextPos({ x: rect.left, y: rect.top - 10 });
        setContextMsg(msg);
    };

    // ====== STYLES ======
    const css = `
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(100%); } to { opacity:1; transform:translateY(0); } }
        @keyframes msgIn { from { opacity:0; transform:scale(0.92) translateY(8px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .emoji-grid { display:grid; grid-template-columns:repeat(8,1fr); gap:2px; }
        .emoji-btn { font-size:22px; padding:6px; border-radius:8px; background:none; border:none; cursor:pointer; transition:all 0.15s; text-align:center; }
        .emoji-btn:hover,.emoji-btn:active { background:var(--bg-glass-strong); transform:scale(1.2); }
        .ctx-menu { position:fixed; z-index:1000; background:var(--bg-card); border:1px solid var(--border-glass); border-radius:var(--radius-lg); box-shadow:0 8px 32px rgba(0,0,0,0.3); padding:6px; min-width:160px; animation:fadeUp 0.15s ease; }
        .ctx-item { display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:var(--radius-md); font-size:12px; font-weight:600; cursor:pointer; border:none; background:none; width:100%; text-align:right; color:var(--text-primary); font-family:var(--font-arabic); transition:all 0.15s; }
        .ctx-item:hover { background:var(--bg-glass); }
        .ctx-item.del { color:var(--accent-rose); }
    `;

    // ================================================
    // ====== CHAT VIEW (active conversation) ======
    // ================================================
    if (activeChat) {
        const { otherUser } = activeChat;
        return (
            <div className="page-content page-enter" style={{
                display: 'flex', flexDirection: 'column',
                height: 'calc(100dvh - var(--nav-height) - 120px)',
                padding: 0,
            }}>
                <style>{css}</style>

                {/* ── Header ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--border-glass)',
                    background: 'var(--bg-glass)', backdropFilter: 'blur(20px)',
                }}>
                    <button onClick={() => { setActiveChat(null); setShowEmoji(false); setEditingMsg(null); setShowAttach(false); }} style={{
                        width: 34, height: 34, borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                        color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}>
                        <ArrowRight size={16} />
                    </button>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: '50%',
                            background: otherUser.avatar ? `url(${otherUser.avatar}) center/cover` : 'linear-gradient(135deg, #10b981, #3b82f6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontSize: 13, fontWeight: 800,
                        }}>
                            {!otherUser.avatar && getInitials(otherUser.name)}
                        </div>
                        <div style={{
                            position: 'absolute', bottom: 0, right: 0,
                            width: 11, height: 11, borderRadius: '50%',
                            background: otherUserOnline ? '#22c55e' : '#6b7280',
                            border: '2px solid var(--bg-primary)',
                        }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{otherUser.name}</div>
                        <div style={{ fontSize: 10, color: otherUserOnline ? '#22c55e' : 'var(--text-muted)', fontWeight: 600 }}>
                            {otherUserOnline ? '🟢 متصل الآن' : formatLastSeen(otherUserLastSeen)}
                        </div>
                    </div>
                    {/* Disappear toggle */}
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowDisappearPicker(!showDisappearPicker)} style={{
                            width: 32, height: 32, borderRadius: 'var(--radius-md)',
                            background: disappearMode > 0 ? 'rgba(245,158,11,0.12)' : 'var(--bg-glass)',
                            border: `1px solid ${disappearMode > 0 ? 'rgba(245,158,11,0.25)' : 'var(--border-glass)'}`,
                            color: disappearMode > 0 ? '#f59e0b' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}>
                            {disappearMode > 0 ? <EyeOff size={14} /> : <Clock size={14} />}
                        </button>
                        {showDisappearPicker && (
                            <div style={{
                                position: 'absolute', top: 38, left: 0, zIndex: 50,
                                background: 'var(--bg-card)', border: '1px solid var(--border-glass)',
                                borderRadius: 'var(--radius-lg)', padding: 6, minWidth: 130,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.3)', animation: 'fadeUp 0.15s ease',
                            }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 8px', marginBottom: 2 }}>
                                    💨 رسائل ذاتية الاختفاء
                                </div>
                                {DISAPPEAR_OPTIONS.map(opt => (
                                    <button key={opt.value} onClick={() => { setDisappearMode(opt.value); setShowDisappearPicker(false); }} style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '7px 10px', borderRadius: 'var(--radius-md)',
                                        width: '100%', border: 'none', cursor: 'pointer',
                                        background: disappearMode === opt.value ? 'rgba(245,158,11,0.1)' : 'transparent',
                                        color: disappearMode === opt.value ? '#f59e0b' : 'var(--text-primary)',
                                        fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-arabic)', transition: 'all 0.15s',
                                    }}>
                                        {disappearMode === opt.value && <Check size={11} />}
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Disappear banner */}
                {disappearMode > 0 && (
                    <div style={{
                        padding: '5px 14px', background: 'rgba(245,158,11,0.06)',
                        borderBottom: '1px solid rgba(245,158,11,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        fontSize: 11, fontWeight: 600, color: '#f59e0b',
                    }}>
                        <EyeOff size={11} />
                        الرسائل ستختفي بعد {disappearMode < 60 ? `${disappearMode} ث` : `${disappearMode / 60} د`}
                    </div>
                )}

                {/* ── Messages ── */}
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                    {messages.length === 0 && (
                        <div style={{
                            flex: 1, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-muted)', fontSize: 13, gap: 8,
                        }}>
                            <MessageCircle size={40} style={{ opacity: 0.2 }} />
                            <div>ابدأ المحادثة مع {otherUser.name}</div>
                        </div>
                    )}

                    {messages.map(msg => {
                        const isMe = msg.senderId === userId;
                        const isDel = msg.deleted === true;
                        return (
                            <div key={msg.id} style={{
                                display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start',
                                animation: 'msgIn 0.2s ease',
                            }} onContextMenu={e => !isDel && handleContextMenu(e, msg)}>
                                <div style={{
                                    maxWidth: '80%',
                                    padding: isDel ? '8px 14px' : (msg.type === 'image' ? '4px' : '10px 14px'),
                                    borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                    background: isDel ? 'var(--bg-glass)' : isMe ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'var(--bg-card)',
                                    color: isDel ? 'var(--text-muted)' : (isMe ? 'white' : 'var(--text-primary)'),
                                    border: isMe ? 'none' : '1px solid var(--border-glass)',
                                    fontSize: 13, lineHeight: 1.6,
                                    fontStyle: isDel ? 'italic' : 'normal',
                                    boxShadow: isDel ? 'none' : isMe ? '0 3px 12px rgba(59,130,246,0.3)' : '0 2px 8px rgba(0,0,0,0.06)',
                                }}>
                                    {/* Image */}
                                    {msg.type === 'image' && msg.fileUrl && !isDel && (
                                        <img src={msg.fileUrl} alt="" onClick={() => setImagePreview(msg.fileUrl!)} style={{
                                            width: '100%', maxWidth: 260, borderRadius: 14, cursor: 'pointer', display: 'block',
                                        }} />
                                    )}
                                    {/* File */}
                                    {msg.type === 'file' && msg.fileUrl && !isDel && (
                                        <a href={msg.fileUrl} target="_blank" rel="noreferrer" style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '8px 4px', textDecoration: 'none',
                                            color: isMe ? 'white' : 'var(--text-primary)',
                                        }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                                background: isMe ? 'rgba(255,255,255,0.15)' : 'rgba(59,130,246,0.1)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                            }}>
                                                <FileText size={16} style={{ color: isMe ? 'white' : '#3b82f6' }} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 700, wordBreak: 'break-all' }}>{msg.fileName}</div>
                                                <div style={{ fontSize: 10, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 3 }}>
                                                    <Download size={9} /> {msg.fileSize}
                                                </div>
                                            </div>
                                        </a>
                                    )}
                                    {/* Text */}
                                    {(msg.type === 'text' || !msg.type || isDel) && <div>{msg.text}</div>}
                                    {/* Meta */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 4, marginTop: 3,
                                        padding: msg.type === 'image' ? '0 8px 4px' : 0,
                                        justifyContent: isMe ? 'flex-start' : 'flex-end',
                                    }}>
                                        {msg.edited && !isDel && <span style={{ fontSize: 8, opacity: 0.6 }}>تم التعديل</span>}
                                        {msg.disappearAfter && msg.disappearAfter > 0 && !isDel && (
                                            <span style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 2,
                                                padding: '1px 5px', borderRadius: 'var(--radius-full)',
                                                background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 8, fontWeight: 700,
                                            }}>
                                                <EyeOff size={7} />
                                                {msg.disappearAfter < 60 ? `${msg.disappearAfter}ث` : `${msg.disappearAfter / 60}د`}
                                            </span>
                                        )}
                                        <span style={{ fontSize: 9, opacity: 0.6 }}>{formatTime(msg.createdAt)}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Context menu */}
                {contextMsg && (
                    <div className="ctx-menu" style={{ top: contextPos.y, right: 20 }}>
                        {contextMsg.senderId === userId && !contextMsg.deleted && contextMsg.type !== 'image' && contextMsg.type !== 'file' && (
                            <button className="ctx-item" onClick={() => {
                                setEditingMsg(contextMsg); setEditText(contextMsg.text); setContextMsg(null);
                            }}>
                                <Edit3 size={14} /> تعديل الرسالة
                            </button>
                        )}
                        {contextMsg.senderId === userId && !contextMsg.deleted && (
                            <button className="ctx-item del" onClick={() => handleDeleteMessage(contextMsg)}>
                                <Trash2 size={14} /> حذف الرسالة
                            </button>
                        )}
                        <button className="ctx-item" onClick={() => {
                            navigator.clipboard.writeText(contextMsg.text); setContextMsg(null);
                        }}>
                            📋 نسخ النص
                        </button>
                    </div>
                )}

                {/* Editing banner */}
                {editingMsg && (
                    <div style={{
                        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
                        background: 'rgba(59,130,246,0.06)', borderTop: '1px solid rgba(59,130,246,0.12)',
                    }}>
                        <Edit3 size={14} style={{ color: '#3b82f6' }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>تعديل الرسالة</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingMsg.text}</div>
                        </div>
                        <button onClick={() => { setEditingMsg(null); setEditText(''); }} style={{
                            width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-glass)',
                            border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}>
                            <X size={13} />
                        </button>
                    </div>
                )}

                {/* Emoji picker */}
                {showEmoji && (
                    <div style={{
                        background: 'var(--bg-card)', borderTop: '1px solid var(--border-glass)',
                        padding: '8px 12px', maxHeight: 250, overflowY: 'auto', animation: 'slideUp 0.2s ease',
                    }}>
                        <div style={{ display: 'flex', gap: 2, marginBottom: 6, overflowX: 'auto' }}>
                            {EMOJI_CATEGORIES.map(cat => (
                                <button key={cat.id} onClick={() => setEmojiCategory(cat.id)} style={{
                                    padding: '5px 8px', borderRadius: 'var(--radius-md)',
                                    background: emojiCategory === cat.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                                    border: 'none', fontSize: 18, cursor: 'pointer', transition: 'all 0.15s',
                                }}>
                                    {cat.icon}
                                </button>
                            ))}
                        </div>
                        <div className="emoji-grid">
                            {EMOJI_CATEGORIES.find(c => c.id === emojiCategory)?.emojis.map((em, i) => (
                                <button key={i} className="emoji-btn" onClick={() => {
                                    if (editingMsg) setEditText(p => p + em);
                                    else setNewMessage(p => p + em);
                                }}>
                                    {em}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Upload indicator */}
                {uploading && (
                    <div style={{
                        padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        borderTop: '1px solid var(--border-glass)', background: 'var(--bg-glass)',
                    }}>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: '#3b82f6' }} />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>جاري رفع الملف...</span>
                    </div>
                )}

                {/* ── Input bar ── */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '8px 10px', borderTop: '1px solid var(--border-glass)', background: 'var(--bg-card)',
                }}>
                    <button onClick={() => { setShowEmoji(!showEmoji); setShowAttach(false); }} style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: showEmoji ? 'rgba(245,158,11,0.12)' : 'transparent',
                        border: 'none', cursor: 'pointer',
                        color: showEmoji ? '#f59e0b' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0,
                    }}>
                        <Smile size={20} />
                    </button>

                    {/* Attach */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button onClick={() => { setShowAttach(!showAttach); setShowEmoji(false); }} style={{
                            width: 36, height: 36, borderRadius: '50%',
                            background: showAttach ? 'rgba(59,130,246,0.12)' : 'transparent',
                            border: 'none', cursor: 'pointer',
                            color: showAttach ? '#3b82f6' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
                        }}>
                            <Paperclip size={20} />
                        </button>
                        {showAttach && (
                            <div style={{
                                position: 'absolute', bottom: 42, right: 0,
                                background: 'var(--bg-card)', border: '1px solid var(--border-glass)',
                                borderRadius: 'var(--radius-lg)', padding: 6,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                                animation: 'fadeUp 0.15s ease', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140,
                            }}>
                                <button className="ctx-item" onClick={() => { imageInputRef.current?.click(); setShowAttach(false); }}>
                                    <ImageIcon size={14} style={{ color: '#10b981' }} /> صورة
                                </button>
                                <button className="ctx-item" onClick={() => {
                                    setShowAttach(false);
                                    const inp = document.createElement('input');
                                    inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
                                    inp.onchange = (e: any) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'image'); };
                                    inp.click();
                                }}>
                                    <Camera size={14} style={{ color: '#3b82f6' }} /> التقاط صورة
                                </button>
                                <button className="ctx-item" onClick={() => { fileInputRef.current?.click(); setShowAttach(false); }}>
                                    <FileText size={14} style={{ color: '#8b5cf6' }} /> ملف
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Text input */}
                    {editingMsg ? (
                        <input type="text" value={editText} onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleEditMessage()} autoFocus
                            style={{
                                flex: 1, padding: '9px 14px', borderRadius: 'var(--radius-full)',
                                background: 'var(--bg-glass)', border: '1px solid rgba(59,130,246,0.3)',
                                color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-arabic)', outline: 'none',
                            }}
                        />
                    ) : (
                        <input ref={inputRef} type="text" placeholder="اكتب رسالة..."
                            value={newMessage} onChange={e => setNewMessage(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                            style={{
                                flex: 1, padding: '9px 14px', borderRadius: 'var(--radius-full)',
                                background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                                color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-arabic)', outline: 'none',
                            }}
                        />
                    )}

                    {/* Send */}
                    <button
                        onClick={editingMsg ? handleEditMessage : () => sendMessage()}
                        disabled={editingMsg ? !editText.trim() : (!newMessage.trim() || sending)}
                        style={{
                            width: 40, height: 40, borderRadius: '50%',
                            background: (editingMsg ? editText.trim() : newMessage.trim())
                                ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'var(--bg-glass)',
                            border: 'none',
                            color: (editingMsg ? editText.trim() : newMessage.trim()) ? 'white' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: (editingMsg ? editText.trim() : newMessage.trim()) ? 'pointer' : 'default',
                            transition: 'all 0.2s', flexShrink: 0, transform: 'rotate(180deg)',
                            boxShadow: (editingMsg ? editText.trim() : newMessage.trim()) ? '0 4px 14px rgba(59,130,246,0.35)' : 'none',
                        }}
                    >
                        {editingMsg ? <Check size={17} /> : <Send size={17} />}
                    </button>
                </div>

                {/* Hidden inputs */}
                <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'image'); e.target.value = ''; }} />
                <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, 'file'); e.target.value = ''; }} />

                {/* Image lightbox */}
                {imagePreview && (
                    <div onClick={() => setImagePreview(null)} style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.92)', zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    }}>
                        <button onClick={() => setImagePreview(null)} style={{
                            position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%',
                            background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10,
                        }}>
                            <X size={20} />
                        </button>
                        <img src={imagePreview} alt="" style={{ maxWidth: '92%', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain' }} />
                    </div>
                )}
            </div>
        );
    }

    // ================================================
    // ====== MAIN LIST (employees + conversations) ===
    // ================================================
    return (
        <div className="page-content page-enter">
            <style>{css}</style>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <button onClick={onBack} style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}>
                    <ArrowRight size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>المحادثات</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>تواصل مع زملائك</p>
                </div>
            </div>

            {/* ── Employees horizontal scroll ── */}
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                    <Users size={13} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
                    الموظفين — اختر لبدء المحادثة
                </div>
                <div style={{
                    display: 'flex', gap: 10, overflowX: 'auto',
                    paddingBottom: 6, WebkitOverflowScrolling: 'touch',
                }}>
                    {allUsers.map(u => (
                        <button key={u.id} onClick={() => openChatWith(u)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            padding: '10px 8px', minWidth: 72,
                            borderRadius: 'var(--radius-xl)',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-glass)',
                            cursor: 'pointer', transition: 'all 0.2s',
                            fontFamily: 'var(--font-arabic)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                            flexShrink: 0,
                        }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: '50%',
                                    background: u.avatar ? `url(${u.avatar}) center/cover` : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: 14, fontWeight: 800,
                                }}>
                                    {!u.avatar && getInitials(u.name)}
                                </div>
                                <div style={{
                                    position: 'absolute', bottom: 0, right: 0,
                                    width: 12, height: 12, borderRadius: '50%',
                                    background: u.online ? '#22c55e' : '#6b7280',
                                    border: '2.5px solid var(--bg-card)',
                                }} />
                            </div>
                            <div style={{
                                fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
                                maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                textAlign: 'center',
                            }}>
                                {u.name.split(' ')[0]}
                            </div>
                        </button>
                    ))}
                    {allUsers.length === 0 && usersLoaded && (
                        <div style={{ padding: '10px 20px', fontSize: 12, color: 'var(--text-muted)' }}>لا يوجد موظفين</div>
                    )}
                </div>
            </div>

            {/* ── Search ── */}
            <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={15} style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)',
                }} />
                <input type="text" placeholder="بحث في المحادثات..." value={search} onChange={e => setSearch(e.target.value)}
                    style={{
                        width: '100%', padding: '10px 38px 10px 14px',
                        borderRadius: 'var(--radius-lg)', background: 'var(--bg-glass)',
                        border: '1px solid var(--border-glass)', color: 'var(--text-primary)',
                        fontSize: 13, fontFamily: 'var(--font-arabic)', outline: 'none',
                    }}
                />
            </div>

            {/* ── Conversations ── */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-muted)' }}>
                    <Loader2 size={28} style={{ margin: '0 auto 10px', animation: 'spin 1s linear infinite' }} />
                    <div style={{ fontSize: 13 }}>جاري التحميل...</div>
                </div>
            ) : conversations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                    <div style={{
                        width: 70, height: 70, borderRadius: '50%',
                        background: 'rgba(59,130,246,0.08)', margin: '0 auto 14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <MessageCircle size={30} style={{ opacity: 0.4, color: '#3b82f6' }} />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>لا توجد محادثات بعد</div>
                    <div style={{ fontSize: 12 }}>اختر موظفاً من الأعلى لبدء المحادثة</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {conversations
                        .filter(c => {
                            if (!search.trim()) return true;
                            return getConvOtherName(c).toLowerCase().includes(search.toLowerCase());
                        })
                        .map(conv => {
                            const otherName = getConvOtherName(conv);
                            return (
                                <button key={conv.id} onClick={() => openExistingConv(conv)} style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '12px 14px', borderRadius: 'var(--radius-xl)',
                                    background: 'var(--bg-card)', border: '1px solid var(--border-glass)',
                                    cursor: 'pointer', textAlign: 'right', width: '100%',
                                    transition: 'all 0.2s', fontFamily: 'var(--font-arabic)',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                }}>
                                    <div style={{
                                        width: 48, height: 48, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #10b981, #3b82f6)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontSize: 15, fontWeight: 800, flexShrink: 0,
                                    }}>
                                        {getInitials(otherName)}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3,
                                        }}>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{otherName}</div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>
                                                {formatTime(conv.lastMessageAt)}
                                            </div>
                                        </div>
                                        <div style={{
                                            fontSize: 12, color: 'var(--text-muted)',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {conv.lastMessage || 'لا توجد رسائل بعد'}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                </div>
            )}
        </div>
    );
}
