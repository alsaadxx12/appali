import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Send, Search, Users, MessageCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import {
    collection, doc, getDocs, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp, setDoc, getDoc,
} from 'firebase/firestore';

interface ChatUser {
    id: string;
    name: string;
    avatar?: string;
    department?: string;
}

interface Message {
    id: string;
    text: string;
    senderId: string;
    senderName: string;
    createdAt: Timestamp | null;
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

    const sendMessage = async () => {
        if (!newMessage.trim() || !selectedConv || !user) return;
        setSending(true);
        const text = newMessage.trim();
        setNewMessage('');

        try {
            await addDoc(collection(db, 'conversations', selectedConv.id, 'messages'), {
                text,
                senderId: userId,
                senderName: user.name,
                createdAt: serverTimestamp(),
            });
            // Update conversation last message
            await setDoc(doc(db, 'conversations', selectedConv.id), {
                lastMessage: text,
                lastMessageAt: serverTimestamp(),
            }, { merge: true });
        } catch (e) {
            console.error('Error sending message:', e);
        }
        setSending(false);
        inputRef.current?.focus();
    };

    const startNewConversation = async (targetUser: ChatUser) => {
        if (!user) return;
        // Check if conversation already exists
        const existing = conversations.find(c =>
            c.participants.includes(targetUser.id) && c.participants.includes(userId)
        );
        if (existing) {
            setSelectedConv(existing);
            setView('chat');
            return;
        }
        // Create new conversation
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

    const filteredUsers = allUsers.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        (u.department || '').toLowerCase().includes(search.toLowerCase())
    );

    // === NEW CHAT: Select user ===
    if (view === 'newChat') {
        return (
            <div className="page-content page-enter">
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
                <div style={{
                    position: 'relative', marginBottom: 16,
                }}>
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
                            fontFamily: 'var(--font-arabic)',
                            outline: 'none',
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
                                background: 'var(--bg-glass)',
                                border: '1px solid var(--border-glass)',
                                cursor: 'pointer', textAlign: 'right',
                                transition: 'all 0.2s',
                                width: '100%',
                                fontFamily: 'var(--font-arabic)',
                            }}
                        >
                            <div style={{
                                width: 44, height: 44, borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'white', fontSize: 14, fontWeight: 800,
                                flexShrink: 0,
                            }}>
                                {getInitials(u.name)}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{u.name}</div>
                                {u.department && (
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.department}</div>
                                )}
                            </div>
                        </button>
                    ))}
                    {filteredUsers.length === 0 && (
                        <div style={{
                            textAlign: 'center', padding: 40,
                            color: 'var(--text-muted)', fontSize: 13,
                        }}>
                            <Users size={32} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                            <div>لا يوجد موظفين</div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // === CHAT VIEW: Messages ===
    if (view === 'chat' && selectedConv) {
        const otherName = getOtherName(selectedConv);
        return (
            <div className="page-content page-enter" style={{
                display: 'flex', flexDirection: 'column',
                height: 'calc(100dvh - var(--nav-height) - 120px)',
                padding: 0,
            }}>
                {/* Chat header */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px',
                    borderBottom: '1px solid var(--border-glass)',
                }}>
                    <button onClick={() => { setView('list'); setSelectedConv(null); }} style={{
                        width: 34, height: 34, borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                        color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                    }}>
                        <ArrowRight size={16} />
                    </button>
                    <div style={{
                        width: 38, height: 38, borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-blue))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 13, fontWeight: 800,
                    }}>
                        {getInitials(otherName)}
                    </div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>{otherName}</div>
                        <div style={{ fontSize: 10, color: 'var(--accent-emerald)' }}>متصل</div>
                    </div>
                </div>

                {/* Messages */}
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                    {messages.length === 0 && (
                        <div style={{
                            flex: 1, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            color: 'var(--text-muted)', fontSize: 13, gap: 8,
                        }}>
                            <MessageCircle size={40} style={{ opacity: 0.3 }} />
                            <div>ابدأ المحادثة مع {otherName}</div>
                        </div>
                    )}

                    {messages.map(msg => {
                        const isMe = msg.senderId === userId;
                        return (
                            <div
                                key={msg.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: isMe ? 'flex-end' : 'flex-start',
                                }}
                            >
                                <div style={{
                                    maxWidth: '78%',
                                    padding: '10px 14px',
                                    borderRadius: isMe
                                        ? 'var(--radius-lg) var(--radius-lg) 4px var(--radius-lg)'
                                        : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px',
                                    background: isMe
                                        ? 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))'
                                        : 'var(--bg-glass)',
                                    color: isMe ? 'white' : 'var(--text-primary)',
                                    border: isMe ? 'none' : '1px solid var(--border-glass)',
                                    fontSize: 13, lineHeight: 1.6,
                                }}>
                                    <div>{msg.text}</div>
                                    <div style={{
                                        fontSize: 9,
                                        opacity: 0.7,
                                        textAlign: isMe ? 'left' : 'right',
                                        marginTop: 4,
                                    }}>
                                        {formatTime(msg.createdAt)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Message input */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px',
                    borderTop: '1px solid var(--border-glass)',
                    background: 'var(--bg-glass)',
                }}>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="اكتب رسالة..."
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        style={{
                            flex: 1, padding: '12px 14px',
                            borderRadius: 'var(--radius-full)',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-glass)',
                            color: 'var(--text-primary)',
                            fontSize: 13,
                            fontFamily: 'var(--font-arabic)',
                            outline: 'none',
                        }}
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim() || sending}
                        style={{
                            width: 44, height: 44, borderRadius: '50%',
                            background: newMessage.trim()
                                ? 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))'
                                : 'var(--bg-glass)',
                            border: 'none',
                            color: newMessage.trim() ? 'white' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: newMessage.trim() ? 'pointer' : 'default',
                            transition: 'all 0.2s ease',
                            flexShrink: 0,
                            transform: 'rotate(180deg)',
                        }}
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        );
    }

    // === CONVERSATIONS LIST ===
    return (
        <div className="page-content page-enter">
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
                        background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                        border: 'none', color: 'white',
                        fontSize: 12, fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontFamily: 'var(--font-arabic)',
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
                    <MessageCircle size={48} style={{ margin: '0 auto 14px', opacity: 0.3 }} />
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>لا توجد محادثات</div>
                    <div style={{ fontSize: 12 }}>ابدأ محادثة جديدة مع أحد زملائك</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {conversations.map(conv => {
                        const otherName = getOtherName(conv);
                        return (
                            <button
                                key={conv.id}
                                onClick={() => { setSelectedConv(conv); setView('chat'); }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 12,
                                    padding: '14px',
                                    borderRadius: 'var(--radius-lg)',
                                    background: 'var(--bg-glass)',
                                    border: '1px solid var(--border-glass)',
                                    cursor: 'pointer', textAlign: 'right',
                                    width: '100%',
                                    transition: 'all 0.2s',
                                    fontFamily: 'var(--font-arabic)',
                                }}
                            >
                                <div style={{
                                    width: 48, height: 48, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-blue))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontSize: 15, fontWeight: 800,
                                    flexShrink: 0,
                                }}>
                                    {getInitials(otherName)}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between',
                                        alignItems: 'center', marginBottom: 4,
                                    }}>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                                            {otherName}
                                        </div>
                                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
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

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
