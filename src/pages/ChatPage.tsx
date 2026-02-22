import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    ArrowRight, Send, Search, Users, MessageCircle, Loader2,
    Smile, Paperclip, Image as ImageIcon, X, Trash2, Edit3, Check,
    Clock, Download, FileText, Camera, Eye, EyeOff, MoreVertical,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../firebase';
import {
    collection, doc, getDocs, addDoc, query, where, orderBy,
    onSnapshot, serverTimestamp, Timestamp, setDoc, getDoc,
    updateDoc, deleteField,
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
    disappearAfter?: number; // seconds
    viewedAt?: Timestamp;
}

interface Conversation {
    id: string;
    participants: string[];
    participantNames: Record<string, string>;
    lastMessage?: string;
    lastMessageAt?: Timestamp;
    unreadCount?: number;
}

interface Props {
    onBack: () => void;
}

// ====== EMOJI DATA ======
const EMOJI_CATEGORIES = [
    { id: 'smileys', icon: '😀', emojis: ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😜', '🤗', '😎', '🥳', '🤩', '😏', '😢', '😭', '😡', '🤯', '😴', '🤔', '🙄', '😱', '🤫', '🤐', '😷', '🤒', '💀', '👻', '👽', '🤖', '💩'] },
    { id: 'hands', icon: '👋', emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👋', '👏', '🙌', '🤝', '🙏', '💪', '👊', '✊', '🫶', '❤️‍🔥', '💯', '🔥'] },
    { id: 'hearts', icon: '❤️', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '♥️', '🫀', '💋'] },
    { id: 'objects', icon: '📎', emojis: ['📱', '💻', '📸', '🎥', '📞', '📧', '📝', '📋', '📌', '📎', '✂️', '🔑', '🔒', '💡', '⏰', '📅', '💼', '📁', '🗂️', '✅'] },
    { id: 'food', icon: '🍕', emojis: ['☕', '🍵', '🧃', '🍕', '🍔', '🍟', '🌮', '🍣', '🍰', '🎂', '🍩', '🍪', '🍫', '🍿', '🥤', '🍦', '🥗', '🍜', '🥘', '🧁'] },
    { id: 'nature', icon: '🌙', emojis: ['☀️', '🌙', '⭐', '🌟', '✨', '⚡', '🔥', '💧', '🌊', '🌈', '❄️', '🌸', '🌺', '🌻', '🍀', '🌲', '🌴', '🐦', '🦋', '🐾'] },
];

// ====== DISAPPEAR OPTIONS ======
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

    const [view, setView] = useState<'list' | 'chat' | 'newChat'>('list');
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
    const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // New features state
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

    // Load conversations
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

    // Load all users for new chat
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
        } catch (e) {
            console.error('Error loading users:', e);
        }
    };

    // Load messages for selected conversation
    useEffect(() => {
        if (!selectedConv) return;
        const q = query(
            collection(db, 'conversations', selectedConv.id, 'messages'),
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
    }, [selectedConv?.id]);

    // Track other user's online status
    useEffect(() => {
        if (!selectedConv) return;
        const otherId = selectedConv.participants.find(p => p !== userId);
        if (!otherId) return;
        const unsub = onSnapshot(doc(db, 'users', otherId), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setOtherUserOnline(data.online === true);
                setOtherUserLastSeen(data.lastSeen || null);
            }
        });
        return () => unsub();
    }, [selectedConv?.id, userId]);

    // Handle disappearing messages (client-side)
    useEffect(() => {
        const interval = setInterval(() => {
            setMessages(prev => prev.map(msg => {
                if (msg.disappearAfter && msg.disappearAfter > 0 && msg.createdAt) {
                    const created = msg.createdAt.toDate().getTime();
                    const elapsed = (Date.now() - created) / 1000;
                    if (elapsed > msg.disappearAfter) {
                        return { ...msg, deleted: true, text: '💨 رسالة ذاتية الاختفاء' };
                    }
                }
                return msg;
            }));
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const sendMessage = async (opts?: { type?: string; fileUrl?: string; fileName?: string; fileSize?: string }) => {
        if ((!newMessage.trim() && !opts?.fileUrl) || !selectedConv || !user) return;
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

            await addDoc(collection(db, 'conversations', selectedConv.id, 'messages'), msgData);
            await setDoc(doc(db, 'conversations', selectedConv.id), {
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
        if (!editingMsg || !editText.trim() || !selectedConv) return;
        try {
            await updateDoc(doc(db, 'conversations', selectedConv.id, 'messages', editingMsg.id), {
                text: editText.trim(),
                edited: true,
            });
            await setDoc(doc(db, 'conversations', selectedConv.id), {
                lastMessage: editText.trim(),
            }, { merge: true });
        } catch (e) {
            console.error('Error editing message:', e);
        }
        setEditingMsg(null);
        setEditText('');
    };

    const handleDeleteMessage = async (msg: Message) => {
        if (!selectedConv) return;
        try {
            await updateDoc(doc(db, 'conversations', selectedConv.id, 'messages', msg.id), {
                deleted: true,
                text: 'تم حذف هذه الرسالة',
            });
        } catch (e) {
            console.error('Error deleting message:', e);
        }
        setContextMsg(null);
    };

    const handleFileUpload = async (file: File, type: 'image' | 'file') => {
        if (!selectedConv || !user) return;
        setUploading(true);
        setShowAttach(false);
        try {
            const path = `chat/${selectedConv.id}/${Date.now()}_${file.name}`;
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

    const startNewConversation = async (targetUser: ChatUser) => {
        if (!user) return;
        const existing = conversations.find(c =>
            c.participants.includes(targetUser.id) && c.participants.includes(userId)
        );
        if (existing) {
            setSelectedConv(existing);
            setView('chat');
            return;
        }
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
            const newConv: Conversation = {
                id: convRef.id,
                participants: [userId, targetUser.id],
                participantNames: {
                    [userId]: user.name,
                    [targetUser.id]: targetUser.name,
                },
            };
            setSelectedConv(newConv);
            setView('chat');
        } catch (e) {
            console.error('Error creating conversation:', e);
        }
    };

    const getOtherName = (conv: Conversation) => {
        const otherId = conv.participants.find(p => p !== userId);
        return conv.participantNames?.[otherId || ''] || 'مستخدم';
    };

    const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2);

    const formatTime = (ts: Timestamp | null | undefined) => {
        if (!ts) return '';
        const d = ts.toDate();
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        if (diff < 60000) return 'الآن';
        if (diff < 3600000) return `${Math.floor(diff / 60000)} د`;
        if (diff < 86400000) return d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' });
    };

    const formatLastSeen = (ts: Timestamp | null) => {
        if (!ts) return 'غير متصل';
        const d = ts.toDate();
        const diff = Date.now() - d.getTime();
        if (diff < 60000) return 'آخر ظهور: الآن';
        if (diff < 3600000) return `آخر ظهور: منذ ${Math.floor(diff / 60000)} د`;
        return `آخر ظهور: ${d.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}`;
    };

    const filteredUsers = allUsers.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        (u.department || '').toLowerCase().includes(search.toLowerCase())
    );

    const handleContextMenu = (e: React.MouseEvent | React.TouchEvent, msg: Message) => {
        e.preventDefault();
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        setContextPos({ x: rect.left, y: rect.top - 10 });
        setContextMsg(msg);
    };

    // Close context when clicking anywhere
    useEffect(() => {
        const handler = () => setContextMsg(null);
        if (contextMsg) window.addEventListener('click', handler);
        return () => window.removeEventListener('click', handler);
    }, [contextMsg]);

    // === STYLES ===
    const styles = `
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes msgIn { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        .emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; }
        .emoji-btn { font-size: 22px; padding: 6px; border-radius: 8px; background: none; border: none; cursor: pointer; transition: all 0.15s; text-align: center; }
        .emoji-btn:hover, .emoji-btn:active { background: var(--bg-glass-strong); transform: scale(1.2); }
        .chat-ctx-menu { position: fixed; z-index: 1000; background: var(--bg-card); border: 1px solid var(--border-glass); border-radius: var(--radius-lg); box-shadow: 0 8px 32px rgba(0,0,0,0.25); padding: 6px; min-width: 160px; animation: fadeUp 0.15s ease; }
        .chat-ctx-item { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: var(--radius-md); font-size: 12px; font-weight: 600; cursor: pointer; border: none; background: none; width: 100%; text-align: right; color: var(--text-primary); font-family: var(--font-arabic); transition: all 0.15s; }
        .chat-ctx-item:hover { background: var(--bg-glass); }
        .chat-ctx-item.danger { color: var(--accent-rose); }
        .disappear-badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 6px; border-radius: var(--radius-full); background: rgba(245,158,11,0.15); color: var(--accent-amber); font-size: 9px; font-weight: 700; }
    `;

    // === NEW CHAT: Select user ===
    if (view === 'newChat') {
        return (
            <div className="page-content page-enter">
                <style>{styles}</style>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <button onClick={() => setView('list')} style={{
                        width: 36, height: 36, borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                        color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                    }}>
                        <ArrowRight size={18} />
                    </button>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 800 }}>محادثة جديدة</h2>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>اختر موظف للمراسلة</p>
                    </div>
                </div>

                {/* Search */}
                <div style={{ position: 'relative', marginBottom: 16 }}>
                    <Search size={16} style={{
                        position: 'absolute', right: 12, top: '50%',
                        transform: 'translateY(-50%)', color: 'var(--text-muted)',
                    }} />
                    <input
                        type="text"
                        placeholder="بحث عن موظف..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '12px 40px 12px 14px',
                            borderRadius: 'var(--radius-lg)',
                            background: 'var(--bg-glass)',
                            border: '1px solid var(--border-glass)',
                            color: 'var(--text-primary)', fontSize: 13,
                            fontFamily: 'var(--font-arabic)', outline: 'none',
                        }}
                    />
                </div>

                {/* Users list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {filteredUsers.map(u => (
                        <button
                            key={u.id}
                            onClick={() => startNewConversation(u)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '12px 14px',
                                borderRadius: 'var(--radius-lg)',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-glass)',
                                cursor: 'pointer', textAlign: 'right',
                                transition: 'all 0.2s',
                                width: '100%',
                                fontFamily: 'var(--font-arabic)',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                            }}
                        >
                            {/* Avatar with online dot */}
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                <div style={{
                                    width: 46, height: 46, borderRadius: '50%',
                                    background: u.avatar ? `url(${u.avatar}) center/cover` : 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: 14, fontWeight: 800,
                                }}>
                                    {!u.avatar && getInitials(u.name)}
                                </div>
                                <div style={{
                                    position: 'absolute', bottom: 1, right: 1,
                                    width: 12, height: 12, borderRadius: '50%',
                                    background: u.online ? '#22c55e' : '#6b7280',
                                    border: '2px solid var(--bg-card)',
                                }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{u.name}</div>
                                <div style={{ fontSize: 11, color: u.online ? 'var(--accent-emerald)' : 'var(--text-muted)' }}>
                                    {u.online ? '🟢 متصل الآن' : u.department || 'غير متصل'}
                                </div>
                            </div>
                        </button>
                    ))}
                    {filteredUsers.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>
                            <Users size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                            <div>لا يوجد موظفين</div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // === CHAT VIEW ===
    if (view === 'chat' && selectedConv) {
        const otherName = getOtherName(selectedConv);
        return (
            <div className="page-content page-enter" style={{
                display: 'flex', flexDirection: 'column',
                height: 'calc(100dvh - var(--nav-height) - 120px)',
                padding: 0,
            }}>
                <style>{styles}</style>

                {/* Chat header */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-glass)',
                    background: 'var(--bg-glass)',
                    backdropFilter: 'blur(20px)',
                }}>
                    <button onClick={() => { setView('list'); setSelectedConv(null); setShowEmoji(false); setEditingMsg(null); }} style={{
                        width: 34, height: 34, borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                        color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                    }}>
                        <ArrowRight size={16} />
                    </button>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-blue))',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontSize: 13, fontWeight: 800,
                        }}>
                            {getInitials(otherName)}
                        </div>
                        <div style={{
                            position: 'absolute', bottom: 0, right: 0,
                            width: 11, height: 11, borderRadius: '50%',
                            background: otherUserOnline ? '#22c55e' : '#6b7280',
                            border: '2px solid var(--bg-primary)',
                        }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>{otherName}</div>
                        <div style={{ fontSize: 10, color: otherUserOnline ? 'var(--accent-emerald)' : 'var(--text-muted)', fontWeight: 600 }}>
                            {otherUserOnline ? '🟢 متصل الآن' : formatLastSeen(otherUserLastSeen)}
                        </div>
                    </div>
                    {/* Disappear mode toggle */}
                    <div style={{ position: 'relative' }}>
                        <button onClick={() => setShowDisappearPicker(!showDisappearPicker)} style={{
                            width: 34, height: 34, borderRadius: 'var(--radius-md)',
                            background: disappearMode > 0 ? 'rgba(245,158,11,0.12)' : 'var(--bg-glass)',
                            border: `1px solid ${disappearMode > 0 ? 'rgba(245,158,11,0.25)' : 'var(--border-glass)'}`,
                            color: disappearMode > 0 ? 'var(--accent-amber)' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}>
                            {disappearMode > 0 ? <EyeOff size={15} /> : <Clock size={15} />}
                        </button>
                        {showDisappearPicker && (
                            <div style={{
                                position: 'absolute', top: 40, left: 0, zIndex: 50,
                                background: 'var(--bg-card)', border: '1px solid var(--border-glass)',
                                borderRadius: 'var(--radius-lg)', padding: 8, minWidth: 130,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.25)', animation: 'fadeUp 0.15s ease',
                            }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', padding: '4px 8px', marginBottom: 4 }}>
                                    💨 رسائل ذاتية الاختفاء
                                </div>
                                {DISAPPEAR_OPTIONS.map(opt => (
                                    <button key={opt.value} onClick={() => { setDisappearMode(opt.value); setShowDisappearPicker(false); }} style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                        width: '100%', border: 'none', cursor: 'pointer',
                                        background: disappearMode === opt.value ? 'rgba(245,158,11,0.1)' : 'transparent',
                                        color: disappearMode === opt.value ? 'var(--accent-amber)' : 'var(--text-primary)',
                                        fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-arabic)',
                                        transition: 'all 0.15s',
                                    }}>
                                        {disappearMode === opt.value && <Check size={12} />}
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Disappear mode banner */}
                {disappearMode > 0 && (
                    <div style={{
                        padding: '6px 16px', background: 'rgba(245,158,11,0.06)',
                        borderBottom: '1px solid rgba(245,158,11,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        fontSize: 11, fontWeight: 600, color: 'var(--accent-amber)',
                    }}>
                        <EyeOff size={12} />
                        الرسائل ستختفي بعد {disappearMode < 60 ? `${disappearMode} ث` : `${disappearMode / 60} د`}
                    </div>
                )}

                {/* Messages */}
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
                            <div>ابدأ المحادثة مع {otherName}</div>
                        </div>
                    )}

                    {messages.map(msg => {
                        const isMe = msg.senderId === userId;
                        const isDeleted = msg.deleted === true;

                        return (
                            <div
                                key={msg.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                                    animation: 'msgIn 0.25s ease',
                                }}
                                onContextMenu={e => !isDeleted && handleContextMenu(e, msg)}
                            >
                                <div style={{
                                    maxWidth: '80%',
                                    padding: isDeleted ? '8px 14px' : (msg.type === 'image' ? '4px' : '10px 14px'),
                                    borderRadius: isMe
                                        ? '18px 18px 4px 18px'
                                        : '18px 18px 18px 4px',
                                    background: isDeleted
                                        ? 'var(--bg-glass)'
                                        : isMe
                                            ? 'linear-gradient(135deg, #3b82f6, #6366f1)'
                                            : 'var(--bg-card)',
                                    color: isDeleted ? 'var(--text-muted)' : (isMe ? 'white' : 'var(--text-primary)'),
                                    border: isMe ? 'none' : '1px solid var(--border-glass)',
                                    fontSize: 13, lineHeight: 1.6,
                                    fontStyle: isDeleted ? 'italic' : 'normal',
                                    boxShadow: isDeleted ? 'none' : isMe
                                        ? '0 3px 12px rgba(59,130,246,0.3)'
                                        : '0 2px 8px rgba(0,0,0,0.06)',
                                    position: 'relative',
                                }}>
                                    {/* Image message */}
                                    {msg.type === 'image' && msg.fileUrl && !isDeleted && (
                                        <img
                                            src={msg.fileUrl}
                                            alt="image"
                                            onClick={() => setImagePreview(msg.fileUrl!)}
                                            style={{
                                                width: '100%', maxWidth: 260, borderRadius: 14,
                                                cursor: 'pointer', display: 'block',
                                            }}
                                        />
                                    )}

                                    {/* File message */}
                                    {msg.type === 'file' && msg.fileUrl && !isDeleted && (
                                        <a href={msg.fileUrl} target="_blank" rel="noreferrer" style={{
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '8px 4px', textDecoration: 'none',
                                            color: isMe ? 'white' : 'var(--text-primary)',
                                        }}>
                                            <div style={{
                                                width: 38, height: 38, borderRadius: 'var(--radius-md)',
                                                background: isMe ? 'rgba(255,255,255,0.15)' : 'var(--accent-blue-soft)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0,
                                            }}>
                                                <FileText size={18} style={{ color: isMe ? 'white' : 'var(--accent-blue)' }} />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 12, fontWeight: 700, wordBreak: 'break-all' }}>{msg.fileName}</div>
                                                <div style={{ fontSize: 10, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Download size={10} /> {msg.fileSize}
                                                </div>
                                            </div>
                                        </a>
                                    )}

                                    {/* Text */}
                                    {(msg.type === 'text' || !msg.type || isDeleted) && (
                                        <div>{msg.text}</div>
                                    )}

                                    {/* Meta row */}
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        marginTop: msg.type === 'image' ? 6 : 3,
                                        padding: msg.type === 'image' ? '0 8px 4px' : 0,
                                        justifyContent: isMe ? 'flex-start' : 'flex-end',
                                    }}>
                                        {msg.edited && !isDeleted && (
                                            <span style={{ fontSize: 8, opacity: 0.6 }}>تم التعديل</span>
                                        )}
                                        {msg.disappearAfter && msg.disappearAfter > 0 && !isDeleted && (
                                            <span className="disappear-badge">
                                                <EyeOff size={8} />
                                                {msg.disappearAfter < 60 ? `${msg.disappearAfter}ث` : `${msg.disappearAfter / 60}د`}
                                            </span>
                                        )}
                                        <span style={{ fontSize: 9, opacity: 0.6 }}>
                                            {formatTime(msg.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Context Menu */}
                {contextMsg && (
                    <div className="chat-ctx-menu" style={{ top: contextPos.y, right: 20 }}>
                        {contextMsg.senderId === userId && !contextMsg.deleted && contextMsg.type !== 'image' && contextMsg.type !== 'file' && (
                            <button className="chat-ctx-item" onClick={() => {
                                setEditingMsg(contextMsg);
                                setEditText(contextMsg.text);
                                setContextMsg(null);
                            }}>
                                <Edit3 size={14} /> تعديل الرسالة
                            </button>
                        )}
                        {contextMsg.senderId === userId && !contextMsg.deleted && (
                            <button className="chat-ctx-item danger" onClick={() => handleDeleteMessage(contextMsg)}>
                                <Trash2 size={14} /> حذف الرسالة
                            </button>
                        )}
                        <button className="chat-ctx-item" onClick={() => {
                            navigator.clipboard.writeText(contextMsg.text);
                            setContextMsg(null);
                        }}>
                            📋 نسخ النص
                        </button>
                    </div>
                )}

                {/* Editing banner */}
                {editingMsg && (
                    <div style={{
                        padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10,
                        background: 'rgba(59,130,246,0.06)', borderTop: '1px solid rgba(59,130,246,0.12)',
                    }}>
                        <Edit3 size={14} style={{ color: 'var(--accent-blue)' }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-blue)' }}>تعديل الرسالة</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingMsg.text}</div>
                        </div>
                        <button onClick={() => { setEditingMsg(null); setEditText(''); }} style={{
                            width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-glass)',
                            border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}>
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* Emoji picker */}
                {showEmoji && (
                    <div style={{
                        background: 'var(--bg-card)', borderTop: '1px solid var(--border-glass)',
                        padding: '10px 14px', maxHeight: 260, overflowY: 'auto',
                        animation: 'slideUp 0.2s ease',
                    }}>
                        {/* Category tabs */}
                        <div style={{ display: 'flex', gap: 2, marginBottom: 8, overflowX: 'auto' }}>
                            {EMOJI_CATEGORIES.map(cat => (
                                <button key={cat.id} onClick={() => setEmojiCategory(cat.id)} style={{
                                    padding: '6px 10px', borderRadius: 'var(--radius-md)',
                                    background: emojiCategory === cat.id ? 'var(--accent-blue-soft)' : 'transparent',
                                    border: 'none', fontSize: 18, cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}>
                                    {cat.icon}
                                </button>
                            ))}
                        </div>
                        {/* Emoji grid */}
                        <div className="emoji-grid">
                            {EMOJI_CATEGORIES.find(c => c.id === emojiCategory)?.emojis.map((em, i) => (
                                <button key={i} className="emoji-btn" onClick={() => {
                                    if (editingMsg) {
                                        setEditText(prev => prev + em);
                                    } else {
                                        setNewMessage(prev => prev + em);
                                    }
                                }}>
                                    {em}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Upload progress */}
                {uploading && (
                    <div style={{
                        padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        borderTop: '1px solid var(--border-glass)', background: 'var(--bg-glass)',
                    }}>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-blue)' }} />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>جاري رفع الملف...</span>
                    </div>
                )}

                {/* Message input */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 12px',
                    borderTop: '1px solid var(--border-glass)',
                    background: 'var(--bg-card)',
                }}>
                    {/* Emoji toggle */}
                    <button onClick={() => { setShowEmoji(!showEmoji); setShowAttach(false); }} style={{
                        width: 38, height: 38, borderRadius: '50%',
                        background: showEmoji ? 'rgba(245,158,11,0.12)' : 'transparent',
                        border: 'none', cursor: 'pointer',
                        color: showEmoji ? 'var(--accent-amber)' : 'var(--text-muted)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s', flexShrink: 0,
                    }}>
                        <Smile size={20} />
                    </button>

                    {/* Attach */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                        <button onClick={() => { setShowAttach(!showAttach); setShowEmoji(false); }} style={{
                            width: 38, height: 38, borderRadius: '50%',
                            background: showAttach ? 'rgba(59,130,246,0.12)' : 'transparent',
                            border: 'none', cursor: 'pointer',
                            color: showAttach ? 'var(--accent-blue)' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                        }}>
                            <Paperclip size={20} />
                        </button>
                        {showAttach && (
                            <div style={{
                                position: 'absolute', bottom: 44, right: 0,
                                background: 'var(--bg-card)', border: '1px solid var(--border-glass)',
                                borderRadius: 'var(--radius-lg)', padding: 8,
                                boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                                animation: 'fadeUp 0.15s ease', display: 'flex', flexDirection: 'column', gap: 2,
                                minWidth: 150,
                            }}>
                                <button className="chat-ctx-item" onClick={() => imageInputRef.current?.click()}>
                                    <ImageIcon size={15} style={{ color: 'var(--accent-emerald)' }} /> صورة
                                </button>
                                <button className="chat-ctx-item" onClick={() => {
                                    // Camera capture
                                    const inp = document.createElement('input');
                                    inp.type = 'file';
                                    inp.accept = 'image/*';
                                    inp.capture = 'environment';
                                    inp.onchange = (e: any) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFileUpload(file, 'image');
                                    };
                                    inp.click();
                                }}>
                                    <Camera size={15} style={{ color: 'var(--accent-blue)' }} /> التقاط صورة
                                </button>
                                <button className="chat-ctx-item" onClick={() => fileInputRef.current?.click()}>
                                    <FileText size={15} style={{ color: 'var(--accent-purple)' }} /> ملف
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Input */}
                    {editingMsg ? (
                        <input
                            type="text"
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleEditMessage()}
                            autoFocus
                            style={{
                                flex: 1, padding: '10px 14px',
                                borderRadius: 'var(--radius-full)',
                                background: 'var(--bg-glass)',
                                border: '1px solid rgba(59,130,246,0.3)',
                                color: 'var(--text-primary)',
                                fontSize: 13, fontFamily: 'var(--font-arabic)', outline: 'none',
                            }}
                        />
                    ) : (
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="اكتب رسالة..."
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                            style={{
                                flex: 1, padding: '10px 14px',
                                borderRadius: 'var(--radius-full)',
                                background: 'var(--bg-glass)',
                                border: '1px solid var(--border-glass)',
                                color: 'var(--text-primary)',
                                fontSize: 13, fontFamily: 'var(--font-arabic)', outline: 'none',
                            }}
                        />
                    )}

                    {/* Send button */}
                    <button
                        onClick={editingMsg ? handleEditMessage : () => sendMessage()}
                        disabled={editingMsg ? !editText.trim() : (!newMessage.trim() || sending)}
                        style={{
                            width: 42, height: 42, borderRadius: '50%',
                            background: (editingMsg ? editText.trim() : newMessage.trim())
                                ? 'linear-gradient(135deg, #3b82f6, #6366f1)'
                                : 'var(--bg-glass)',
                            border: 'none',
                            color: (editingMsg ? editText.trim() : newMessage.trim()) ? 'white' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: (editingMsg ? editText.trim() : newMessage.trim()) ? 'pointer' : 'default',
                            transition: 'all 0.2s ease',
                            flexShrink: 0,
                            transform: 'rotate(180deg)',
                            boxShadow: (editingMsg ? editText.trim() : newMessage.trim()) ? '0 4px 14px rgba(59,130,246,0.35)' : 'none',
                        }}
                    >
                        {editingMsg ? <Check size={18} /> : <Send size={18} />}
                    </button>
                </div>

                {/* Hidden file inputs */}
                <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'image');
                        e.target.value = '';
                    }}
                />
                <input
                    ref={fileInputRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'file');
                        e.target.value = '';
                    }}
                />

                {/* Image lightbox */}
                {imagePreview && (
                    <div onClick={() => setImagePreview(null)} style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.9)', zIndex: 9999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                    }}>
                        <button onClick={() => setImagePreview(null)} style={{
                            position: 'absolute', top: 20, right: 20,
                            width: 40, height: 40, borderRadius: '50%',
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', zIndex: 10,
                        }}>
                            <X size={20} />
                        </button>
                        <img src={imagePreview} alt="preview" style={{
                            maxWidth: '92%', maxHeight: '85vh', borderRadius: 12,
                            objectFit: 'contain',
                        }} />
                    </div>
                )}
            </div>
        );
    }

    // === CONVERSATIONS LIST ===
    return (
        <div className="page-content page-enter">
            <style>{styles}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={onBack} style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                }}>
                    <ArrowRight size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>المحادثات</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>تواصل مع زملائك</p>
                </div>
                <button
                    onClick={() => { setView('newChat'); loadUsers(); }}
                    style={{
                        padding: '8px 14px',
                        borderRadius: 'var(--radius-lg)',
                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                        border: 'none', color: 'white',
                        fontSize: 12, fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontFamily: 'var(--font-arabic)',
                        boxShadow: '0 4px 14px rgba(59,130,246,0.3)',
                    }}
                >
                    <MessageCircle size={14} />
                    محادثة جديدة
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                    <Loader2 size={32} style={{ margin: '0 auto 10px', animation: 'spin 1s linear infinite' }} />
                    <div style={{ fontSize: 13 }}>جاري التحميل...</div>
                </div>
            ) : conversations.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '60px 20px',
                    color: 'var(--text-muted)',
                }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: '50%',
                        background: 'rgba(59,130,246,0.08)', margin: '0 auto 16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <MessageCircle size={36} style={{ opacity: 0.4, color: 'var(--accent-blue)' }} />
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>لا توجد محادثات</div>
                    <div style={{ fontSize: 12 }}>ابدأ محادثة جديدة مع أحد زملائك</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {conversations.map(conv => {
                        const otherName = getOtherName(conv);
                        return (
                            <button
                                key={conv.id}
                                onClick={() => { setSelectedConv(conv); setView('chat'); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '14px',
                                    borderRadius: 'var(--radius-xl)',
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--border-glass)',
                                    cursor: 'pointer', textAlign: 'right',
                                    width: '100%',
                                    transition: 'all 0.2s',
                                    fontFamily: 'var(--font-arabic)',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                }}
                            >
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <div style={{
                                        width: 50, height: 50, borderRadius: '50%',
                                        background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-blue))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontSize: 16, fontWeight: 800,
                                    }}>
                                        {getInitials(otherName)}
                                    </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', marginBottom: 4,
                                    }}>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                                            {otherName}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>
                                            {formatTime(conv.lastMessageAt)}
                                        </div>
                                    </div>
                                    <div style={{
                                        fontSize: 12, color: 'var(--text-muted)',
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
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
