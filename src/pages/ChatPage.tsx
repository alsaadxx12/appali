import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Send, Search, Users, MessageCircle, Loader2, Smile, Paperclip, Image as ImageIcon, X, Trash2, Edit3, Check, Clock, Download, FileText, Camera, EyeOff, CheckCheck, MapPin, Archive, UserCircle, Phone, PhoneOff, MicOff, Mic } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, storage } from '../firebase';
import { collection, doc, getDocs, getDoc, addDoc, query, where, onSnapshot, serverTimestamp, Timestamp, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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

    // ========== Voice Call State ==========
    const [callState, setCallState] = useState<'idle' | 'calling' | 'ringing' | 'connected'>('idle');
    const [callDocId, setCallDocId] = useState<string | null>(null);
    const [callPartner, setCallPartner] = useState<{ id?: string; name: string; avatar?: string } | null>(null);
    const [callDuration, setCallDuration] = useState(0);
    const [callMuted, setCallMuted] = useState(false);
    const [callDirection, setCallDirection] = useState<'outgoing' | 'incoming'>('outgoing');
    const callConvIdRef = useRef<string | null>(null);
    const peerRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const ringtoneRef = useRef<HTMLAudioElement | null>(null);
    const callTimerRef = useRef<any>(null);
    const callUnsubRef = useRef<(() => void) | null>(null);
    const callTimeoutRef = useRef<any>(null);
    const callDurationRef = useRef(0);

    // Swipe-back gesture for active chat
    const chatSwipeX = useRef(0);
    const chatSwipeY = useRef(0);
    const chatSwiping = useRef(false);
    const handleChatSwipeStart = (e: React.TouchEvent) => { chatSwipeX.current = e.touches[0].clientX; chatSwipeY.current = e.touches[0].clientY; chatSwiping.current = true; };
    const handleChatSwipeEnd = (e: React.TouchEvent) => { if (!chatSwiping.current) return; chatSwiping.current = false; const dx = e.changedTouches[0].clientX - chatSwipeX.current; const dy = Math.abs(e.changedTouches[0].clientY - chatSwipeY.current); if (dx > 80 && dx > dy * 1.5) { setActiveChat(null); setShowEmoji(false); setEditMsg(null); setShowAttach(false); } };

    // ========== Voice Call Functions ==========
    const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

    const startCall = async (partner: { id: string; name: string; avatar?: string }) => {
        if (!uid || !user || callState !== 'idle') return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            setCallPartner({ id: partner.id, name: partner.name, avatar: partner.avatar });
            setCallState('calling');
            setCallDuration(0);
            callDurationRef.current = 0;
            setCallMuted(false);
            setCallDirection('outgoing');

            // Find or remember convId for this partner
            const existingConv = convs.find(c => c.participants.includes(partner.id) && c.participants.includes(uid));
            callConvIdRef.current = existingConv?.id || null;

            const pc = new RTCPeerConnection(ICE_SERVERS);
            peerRef.current = pc;
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            pc.ontrack = (e) => {
                if (remoteAudioRef.current) {
                    remoteAudioRef.current.srcObject = e.streams[0];
                    remoteAudioRef.current.play().catch(() => { });
                }
            };

            // Create call doc
            const callDoc = await addDoc(collection(db, 'calls'), {
                callerId: uid,
                callerName: user.name,
                callerAvatar: user.avatar || '',
                receiverId: partner.id,
                receiverName: partner.name,
                status: 'ringing',
                createdAt: serverTimestamp(),
            });
            setCallDocId(callDoc.id);

            // Collect ICE candidates
            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    addDoc(collection(db, 'calls', callDoc.id, 'callerCandidates'), e.candidate.toJSON());
                }
            };

            // Create offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await updateDoc(doc(db, 'calls', callDoc.id), { offer: { type: offer.type, sdp: offer.sdp } });

            // Listen for answer
            const unsub = onSnapshot(doc(db, 'calls', callDoc.id), (snap) => {
                const data = snap.data();
                if (!data) return;
                if (data.status === 'answered' && data.answer && !pc.currentRemoteDescription) {
                    pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    setCallState('connected');
                    callTimerRef.current = setInterval(() => {
                        callDurationRef.current += 1;
                        setCallDuration(d => d + 1);
                    }, 1000);
                }
                if (data.status === 'ended') {
                    endCall(false);
                }
            });
            callUnsubRef.current = unsub;

            // Listen for receiver ICE candidates
            onSnapshot(collection(db, 'calls', callDoc.id, 'receiverCandidates'), (snap) => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
                    }
                });
            });
        } catch (e) {
            console.error('startCall error:', e);
            setCallState('idle');
        }
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            const audioTrack = localStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setCallMuted(!audioTrack.enabled);
            }
        }
    };

    const answerCall = async (callId: string) => {
        if (!uid) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;

            const pc = new RTCPeerConnection(ICE_SERVERS);
            peerRef.current = pc;
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            pc.ontrack = (e) => {
                if (remoteAudioRef.current) {
                    remoteAudioRef.current.srcObject = e.streams[0];
                    remoteAudioRef.current.play().catch(() => { });
                }
            };

            // Get offer from Firestore
            const callSnap = await getDoc(doc(db, 'calls', callId));
            if (!callSnap.exists()) return;
            const callData = callSnap.data();

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    addDoc(collection(db, 'calls', callId, 'receiverCandidates'), e.candidate.toJSON());
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await updateDoc(doc(db, 'calls', callId), { answer: { type: answer.type, sdp: answer.sdp }, status: 'answered' });

            // Stop ringtone
            if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }
            if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }

            setCallState('connected');
            setCallDirection('incoming');
            callDurationRef.current = 0;
            callTimerRef.current = setInterval(() => {
                callDurationRef.current += 1;
                setCallDuration(d => d + 1);
            }, 1000);

            // Listen for caller ICE candidates
            onSnapshot(collection(db, 'calls', callId, 'callerCandidates'), (snap) => {
                snap.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
                    }
                });
            });

            // Listen for call end
            const unsub = onSnapshot(doc(db, 'calls', callId), (snap) => {
                if (snap.data()?.status === 'ended') endCall(false);
            });
            callUnsubRef.current = unsub;

        } catch (e) {
            console.error('answerCall error:', e);
            setCallState('idle');
        }
    };

    const endCall = async (notify = true, reason: 'ended' | 'missed' | 'rejected' = 'ended') => {
        const duration = callDurationRef.current;
        const direction = callDirection;
        const wasConnected = callState === 'connected';
        const wasCalling = callState === 'calling';
        const wasRinging = callState === 'ringing';
        const convId = callConvIdRef.current || (activeChat?.convId);
        const partnerName = callPartner?.name || '';

        if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
        if (callTimeoutRef.current) { clearTimeout(callTimeoutRef.current); callTimeoutRef.current = null; }
        if (callUnsubRef.current) { callUnsubRef.current(); callUnsubRef.current = null; }
        if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
        if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
        if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current.currentTime = 0; }

        if (notify && callDocId) {
            try { await updateDoc(doc(db, 'calls', callDocId), { status: reason === 'missed' ? 'missed' : 'ended', duration }); } catch (e) { }
        }

        // Send call summary message to chat
        if (convId && uid && user) {
            try {
                const mins = Math.floor(duration / 60).toString().padStart(2, '0');
                const secs = (duration % 60).toString().padStart(2, '0');
                let callText = '';
                if (wasConnected) {
                    callText = direction === 'outgoing'
                        ? `📞 مكالمة صادرة — ${mins}:${secs}`
                        : `📞 مكالمة واردة — ${mins}:${secs}`;
                } else if (wasCalling) {
                    callText = '📞 مكالمة صادرة — لم يتم الرد';
                } else if (wasRinging && reason === 'rejected') {
                    callText = '📞 مكالمة واردة — تم الرفض';
                } else if (wasRinging) {
                    callText = '📞 مكالمة فائتة';
                }
                if (callText) {
                    await addDoc(collection(db, 'conversations', convId, 'messages'), {
                        text: callText, senderId: uid, senderName: user.name,
                        toUid: callPartner?.id || '', createdAt: serverTimestamp(),
                        type: 'call', readBy: { [uid]: true },
                    });
                    await setDoc(doc(db, 'conversations', convId), { lastMessage: callText, lastMessageAt: serverTimestamp(), lastSenderId: uid }, { merge: true });
                }
            } catch (e) { console.error('Call message error:', e); }
        }

        setCallState('idle');
        setCallDocId(null);
        setCallPartner(null);
        setCallDuration(0);
        callDurationRef.current = 0;
        setCallMuted(false);
        callConvIdRef.current = null;
    };

    useEffect(() => {
        if (!uid) return;
        const q = query(collection(db, 'calls'), where('receiverId', '==', uid), where('status', '==', 'ringing'));
        const unsub = onSnapshot(q, (snap) => {
            snap.docChanges().forEach(async (change) => {
                if (change.type === 'added' && callState === 'idle') {
                    const data = change.doc.data();
                    setCallDocId(change.doc.id);
                    setCallPartner({ id: data.callerId, name: data.callerName, avatar: data.callerAvatar });
                    setCallState('ringing');
                    setCallDirection('incoming');

                    // Find convId for call messages
                    const existConv = convs.find(c => c.participants.includes(data.callerId) && c.participants.includes(uid));
                    callConvIdRef.current = existConv?.id || null;

                    // Play ringtone
                    try {
                        if (ringtoneRef.current) {
                            ringtoneRef.current.loop = true;
                            ringtoneRef.current.play().catch(() => { });
                        }
                        // Vibrate
                        if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
                    } catch (e) { }

                    // Send notification
                    try {
                        if ('Notification' in window && Notification.permission === 'granted') {
                            new Notification('مكالمة واردة', { body: `${data.callerName} يتصل بك`, icon: data.callerAvatar || undefined, tag: 'incoming-call', requireInteraction: true });
                        }
                    } catch (e) { }

                    // Auto-reject after 30 seconds
                    callTimeoutRef.current = setTimeout(() => {
                        endCall(true, 'missed');
                    }, 30000);
                }
            });
        });
        return () => unsub();
    }, [uid, callState, convs]);

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
    const sendContact = async () => {
        setShowAttach(false);
        try {
            if ('contacts' in navigator && 'ContactsManager' in window) {
                const contacts = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false });
                if (contacts && contacts.length > 0) {
                    const c = contacts[0];
                    const name = c.name?.[0] || 'جهة اتصال';
                    const phones = (c.tel || []).filter(Boolean);
                    const tel = phones.length > 0 ? phones.join(' / ') : 'بدون رقم';
                    const contactText = '\u200F👤 ' + name + '\n📞 ' + tel;
                    await sendMessage({ type: 'text', text: contactText });
                }
            } else {
                alert('هذه الميزة تتطلب فتح التطبيق من متصفح Chrome على Android');
            }
        } catch (e: any) {
            console.error('sendContact error:', e);
        }
    };

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
                        <button onClick={() => startCall({ id: otherUser.id, name: otherUser.name, avatar: otherUser.avatar })} style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Phone size={16} /></button>
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

                {/* Voice Call Overlay */}
                {callState !== 'idle' && callPartner && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 10000,
                        background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 24, animation: 'fadeIn 0.3s ease',
                    }}>
                        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', border: '1px solid rgba(99,102,241,0.15)', animation: 'callRing1 2s ease-out infinite' }} />
                        <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', border: '1px solid rgba(99,102,241,0.08)', animation: 'callRing2 2s ease-out 0.5s infinite' }} />

                        <div style={{
                            width: 100, height: 100, borderRadius: '50%',
                            background: callPartner.avatar ? `url(${callPartner.avatar}) center/cover` : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontSize: 32, fontWeight: 900,
                            border: '3px solid rgba(255,255,255,0.2)',
                            boxShadow: '0 0 40px rgba(99,102,241,0.4)',
                        }}>
                            {!callPartner.avatar && gi(callPartner.name)}
                        </div>

                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: 'white', marginBottom: 6 }}>{callPartner.name}</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: callState === 'connected' ? '#22c55e' : 'rgba(255,255,255,0.5)' }}>
                                {callState === 'calling' && 'جاري الاتصال...'}
                                {callState === 'ringing' && 'مكالمة واردة'}
                                {callState === 'connected' && `${Math.floor(callDuration / 60).toString().padStart(2, '0')}:${(callDuration % 60).toString().padStart(2, '0')}`}
                            </div>
                        </div>

                        {callState === 'calling' && (
                            <div style={{ display: 'flex', gap: 8 }}>
                                {[0, 1, 2].map(i => (
                                    <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', animation: `callDot 1.4s ease-in-out ${i * 0.2}s infinite` }} />
                                ))}
                            </div>
                        )}

                        {/* Call action buttons */}
                        <div style={{ display: 'flex', gap: 24, marginTop: 40, alignItems: 'center' }}>
                            {callState === 'ringing' && (
                                <button onClick={() => callDocId && answerCall(callDocId)} style={{
                                    width: 64, height: 64, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 8px 30px rgba(34,197,94,0.4)', animation: 'callBtnPulse 1.5s ease-in-out infinite', cursor: 'pointer',
                                }}><Phone size={28} /></button>
                            )}
                            {callState === 'connected' && (
                                <button onClick={toggleMute} style={{
                                    width: 52, height: 52, borderRadius: '50%',
                                    background: callMuted ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.1)',
                                    border: callMuted ? '2px solid rgba(245,158,11,0.5)' : '2px solid rgba(255,255,255,0.2)',
                                    color: callMuted ? '#f59e0b' : 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                }}>
                                    {callMuted ? <MicOff size={22} /> : <Mic size={22} />}
                                </button>
                            )}
                            <button onClick={() => endCall(true, callState === 'ringing' ? 'rejected' : 'ended')} style={{
                                width: 64, height: 64, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 8px 30px rgba(239,68,68,0.4)', cursor: 'pointer',
                            }}>
                                <PhoneOff size={28} />
                            </button>
                        </div>

                        <style>{`
                            @keyframes callRing1 { 0% { transform: scale(0.8); opacity: 0.6; } 100% { transform: scale(1.6); opacity: 0; } }
                            @keyframes callRing2 { 0% { transform: scale(0.8); opacity: 0.4; } 100% { transform: scale(1.8); opacity: 0; } }
                            @keyframes callDot { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; } 40% { transform: scale(1.2); opacity: 1; } }
                            @keyframes callBtnPulse { 0%, 100% { box-shadow: 0 8px 30px rgba(34,197,94,0.4); } 50% { box-shadow: 0 8px 40px rgba(34,197,94,0.7); } }
                            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                        `}</style>
                    </div>
                )}

                {/* Remote audio for WebRTC */}
                <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
                {/* Ringtone audio */}
                <audio ref={ringtoneRef} src="data:audio/wav;base64,UklGRiQGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAGAACAgICAgICAgICAgICAgICAgICAf3B3c3Bwb3Bwb3Bwb3Bwb3Bwb3N/i5WZnJ+goKCgoKCfnJmVi39wY1dRTUpHREFAQEBBREhMT1VdZ3uLmaCkp6enp6enp6SgmIl7a1lMREA+PDs5ODg4OTo8PkBGTldjdIiWn6Woqampqainol+UhHFdTUI7Nzc1NTMzMzM1NTc3PEhXaXqLmKGmqayrq6uqp6KdlYl8bl9SRz45NjQ0MjIyMjQ0NjhCUmJxgZCcoKWpq62trauop6OckoR4bF9TSD44NjQ0NDMzMzQ0NjhCUmFxgJCaoKWpq62ura6rpqKdloh8bl9SR0A3NjQ0NDMzMzQ0NjhCUmFxgJCapqerr7Ozs7OxrailnZOGd21gUkhCOzY0NDQzMzMzNDQ2OEJSYnGAkJigrK6ztLS0tLGtqKWdkoR4bGBUSkM7OEWQZ3Z5fYCCgYKBf318eHNvamNZUEdAPDk4NjU1NTU2ODg8QEdSX2x7iZaikJ2goKCgoKCfnJqWkYqBd2xfU0hCPDs5ODc3Nzc4ODk7PEJIUl5sdIGOmKChpqioqKiop6ShnpqTin96b2FWTERAPj08PDs7OztAPj5ARFBYZ294gIqQn5+kp6ioqKinpKGenpqTin94b2JXTkZCQD49PDs7Ozs8Pj5ARFBYZnN8hIyUl5ydoKOjo6OjoJ2bnJiTin94cGRYUEhEQkA+PT09PD0+PkBERFBWYm13gImQlJmc" playsInline style={{ display: 'none' }} />
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

            {/* Voice Call Overlay (chat list context) */}
            {callState !== 'idle' && callPartner && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'linear-gradient(180deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 24, animation: 'fadeIn 0.3s ease',
                }}>
                    <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', border: '1px solid rgba(99,102,241,0.15)', animation: 'callRing1 2s ease-out infinite' }} />
                    <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', border: '1px solid rgba(99,102,241,0.08)', animation: 'callRing2 2s ease-out 0.5s infinite' }} />
                    <div style={{
                        width: 100, height: 100, borderRadius: '50%',
                        background: callPartner.avatar ? `url(${callPartner.avatar}) center/cover` : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: 32, fontWeight: 900,
                        border: '3px solid rgba(255,255,255,0.2)',
                        boxShadow: '0 0 40px rgba(99,102,241,0.4)',
                    }}>
                        {!callPartner.avatar && gi(callPartner.name)}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: 'white', marginBottom: 6 }}>{callPartner.name}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: callState === 'connected' ? '#22c55e' : 'rgba(255,255,255,0.5)' }}>
                            {callState === 'calling' && 'جاري الاتصال...'}
                            {callState === 'ringing' && 'مكالمة واردة'}
                            {callState === 'connected' && `${Math.floor(callDuration / 60).toString().padStart(2, '0')}:${(callDuration % 60).toString().padStart(2, '0')}`}
                        </div>
                    </div>
                    {callState === 'calling' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', animation: `callDot 1.4s ease-in-out ${i * 0.2}s infinite` }} />
                            ))}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 24, marginTop: 40, alignItems: 'center' }}>
                        {callState === 'ringing' && (
                            <button onClick={() => callDocId && answerCall(callDocId)} style={{
                                width: 64, height: 64, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 8px 30px rgba(34,197,94,0.4)', animation: 'callBtnPulse 1.5s ease-in-out infinite', cursor: 'pointer',
                            }}><Phone size={28} /></button>
                        )}
                        {callState === 'connected' && (
                            <button onClick={toggleMute} style={{
                                width: 52, height: 52, borderRadius: '50%',
                                background: callMuted ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.1)',
                                border: callMuted ? '2px solid rgba(245,158,11,0.5)' : '2px solid rgba(255,255,255,0.2)',
                                color: callMuted ? '#f59e0b' : 'white',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            }}>
                                {callMuted ? <MicOff size={22} /> : <Mic size={22} />}
                            </button>
                        )}
                        <button onClick={() => endCall(true, callState === 'ringing' ? 'rejected' : 'ended')} style={{
                            width: 64, height: 64, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                            border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 8px 30px rgba(239,68,68,0.4)', cursor: 'pointer',
                        }}><PhoneOff size={28} /></button>
                    </div>
                    <style>{`
                        @keyframes callRing1 { 0% { transform: scale(0.8); opacity: 0.6; } 100% { transform: scale(1.6); opacity: 0; } }
                        @keyframes callRing2 { 0% { transform: scale(0.8); opacity: 0.4; } 100% { transform: scale(1.8); opacity: 0; } }
                        @keyframes callDot { 0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; } 40% { transform: scale(1.2); opacity: 1; } }
                        @keyframes callBtnPulse { 0%, 100% { box-shadow: 0 8px 30px rgba(34,197,94,0.4); } 50% { box-shadow: 0 8px 40px rgba(34,197,94,0.7); } }
                        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    `}</style>
                </div>
            )}
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
            <audio ref={ringtoneRef} src="data:audio/wav;base64,UklGRiQGAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAGAACAgICAgICAgICAgICAgICAgICAf3B3c3Bwb3Bwb3Bwb3Bwb3Bwb3N/i5WZnJ+goKCgoKCfnJmVi39wY1dRTUpHREFAQEBBREhMT1VdZ3uLmaCkp6enp6enp6SgmIl7a1lMREA+PDs5ODg4OTo8PkBGTldjdIiWn6Woqampqainol+UhHFdTUI7Nzc1NTMzMzM1NTc3PEhXaXqLmKGmqayrq6uqp6KdlYl8bl9SRz45NjQ0MjIyMjQ0NjhCUmJxgZCcoKWpq62trauop6OckoR4bF9TSD44NjQ0NDMzMzQ0NjhCUmFxgJCaoKWpq62ura6rpqKdloh8bl9SR0A3NjQ0NDMzMzQ0NjhCUmFxgJCapqerr7Ozs7OxrailnZOGd21gUkhCOzY0NDQzMzMzNDQ2OEJSYnGAkJigrK6ztLS0tLGtqKWdkoR4bGBUSkM7OEWQZ3Z5fYCCgYKBf318eHNvamNZUEdAPDk4NjU1NTU2ODg8QEdSX2x7iZaikJ2goKCgoKCfnJqWkYqBd2xfU0hCPDs5ODc3Nzc4ODk7PEJIUl5sdIGOmKChpqioqKiop6ShnpqTin96b2FWTERAPj08PDs7OztAPj5ARFBYZ294gIqQn5+kp6ioqKinpKGenpqTin94b2JXTkZCQD49PDs7Ozs8Pj5ARFBYZnN8hIyUl5ydoKOjo6OjoJ2bnJiTin94cGRYUEhEQkA+PT09PD0+PkBERFBWYm13gImQlJmc" playsInline style={{ display: 'none' }} />
        </div>
    );
}
