import React, { useState, useRef, useEffect } from 'react';
import {
    ArrowRight, User, Mail, Shield, Building2, Lock, Check, X, Save,
    Eye, EyeOff, Smartphone, Calendar, Camera, Image, Phone, Edit3,
    FileUp, FileText, Trash2, Paperclip, File, Upload, RotateCcw, Loader2,
    Sparkles, AtSign, Clock, MapPin, Briefcase
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AVATAR_COLORS } from '../../data/demoData';
import ImageEditor from '../../components/ImageEditor';
import { db, storage } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

interface PersonalDocument {
    id: string;
    name: string;
    type: string;
    size: string;
    date: string;
    category: 'national_id' | 'passport' | 'photo' | 'contract' | 'residence';
}

const DOC_CATEGORIES = [
    { id: 'national_id' as const, label: 'الهوية الشخصية', icon: '🪪', color: '#3b82f6' },
    { id: 'passport' as const, label: 'جواز السفر', icon: '🛂', color: '#8b5cf6' },
    { id: 'photo' as const, label: 'صورة شخصية', icon: '📷', color: '#ec4899' },
    { id: 'contract' as const, label: 'عقد العمل', icon: '📋', color: '#10b981' },
    { id: 'residence' as const, label: 'بطاقة السكن', icon: '🏠', color: '#f59e0b' },
];

interface Props {
    onBack: () => void;
}

export default function AccountInfoPage({ onBack }: Props) {
    const { user, firebaseUser, updateProfile } = useAuth();

    // Editable state
    const [name, setName] = useState(user?.name || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [editingField, setEditingField] = useState<'name' | 'phone' | null>(null);
    const [tempValue, setTempValue] = useState('');

    // Images
    const googlePhotoURL = firebaseUser?.photoURL || '';
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar || '');
    const [coverUrl, setCoverUrl] = useState('');
    const [avatarFilter, setAvatarFilter] = useState('none');
    const [coverFilter, setCoverFilter] = useState('none');
    const [savingImage, setSavingImage] = useState(false);
    const [imageMsg, setImageMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Image editor
    const [editorImage, setEditorImage] = useState<string | null>(null);
    const [editorMode, setEditorMode] = useState<'avatar' | 'cover'>('avatar');

    // Password section
    const [showPasswordSection, setShowPasswordSection] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordMsg, setPasswordMsg] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);

    // Documents
    const [documents, setDocuments] = useState<PersonalDocument[]>([]);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [uploadCategory, setUploadCategory] = useState<PersonalDocument['category']>('national_id');
    const [deleteDocConfirm, setDeleteDocConfirm] = useState<string | null>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    // Saved animation
    const [savedField, setSavedField] = useState<string | null>(null);
    const [savingField, setSavingField] = useState<string | null>(null);

    // File inputs
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);

    // Load cover photo from Firestore on mount
    useEffect(() => {
        if (!user) return;
        const loadCover = async () => {
            try {
                const snap = await getDoc(doc(db, 'users', user.id));
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.coverPhoto) setCoverUrl(data.coverPhoto);
                    if (data.avatar) setAvatarUrl(data.avatar);
                }
            } catch (e) {
                console.error('Error loading cover:', e);
            }
        };
        loadCover();
    }, [user?.id]);

    if (!user) return null;

    const userIndex = user.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    const avatarColor = AVATAR_COLORS[userIndex % AVATAR_COLORS.length];
    const initials = user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2);

    const startEdit = (field: 'name' | 'phone') => {
        setTempValue(field === 'name' ? name : phone);
        setEditingField(field);
    };

    const saveEdit = async () => {
        if (!editingField) return;
        setSavingField(editingField);
        try {
            if (editingField === 'name') {
                setName(tempValue);
                await updateProfile({ name: tempValue });
            } else {
                setPhone(tempValue);
                await updateProfile({ phone: tempValue });
            }
            setSavedField(editingField);
            setEditingField(null);
            setTimeout(() => setSavedField(null), 2000);
        } catch (e) {
            console.error('Error saving field:', e);
        } finally {
            setSavingField(null);
        }
    };

    const cancelEdit = () => {
        setEditingField(null);
        setTempValue('');
    };

    const handleFileSelect = (file: File, mode: 'avatar' | 'cover') => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const url = e.target?.result as string;
            setEditorImage(url);
            setEditorMode(mode);
        };
        reader.readAsDataURL(file);
    };

    // Save image to Firebase Storage + Firestore
    const handleImageSave = async (url: string, filter: string) => {
        setEditorImage(null);
        setSavingImage(true);
        setImageMsg(null);

        try {
            let downloadUrl = url;

            // Upload base64 to Firebase Storage
            if (url.startsWith('data:')) {
                const path = editorMode === 'avatar'
                    ? `users/${user.id}/avatar`
                    : `users/${user.id}/cover`;
                const storageRef = ref(storage, path);
                await uploadString(storageRef, url, 'data_url');
                downloadUrl = await getDownloadURL(storageRef);
            }

            if (editorMode === 'avatar') {
                setAvatarUrl(downloadUrl);
                setAvatarFilter(filter);
                await updateProfile({ avatar: downloadUrl });
            } else {
                setCoverUrl(downloadUrl);
                setCoverFilter(filter);
                await updateProfile({ coverPhoto: downloadUrl });
            }

            setImageMsg({ type: 'success', text: editorMode === 'avatar' ? 'تم تحديث صورة الحساب ✅' : 'تم تحديث صورة الغلاف ✅' });
            setTimeout(() => setImageMsg(null), 3000);
        } catch (e) {
            console.error('Error saving image:', e);
            setImageMsg({ type: 'error', text: 'فشل حفظ الصورة — تحقق من الاتصال' });
            setTimeout(() => setImageMsg(null), 4000);
        } finally {
            setSavingImage(false);
        }
    };

    // Reset avatar to Google photo
    const resetToGooglePhoto = async () => {
        if (!googlePhotoURL) return;
        setSavingImage(true);
        try {
            setAvatarUrl(googlePhotoURL);
            setAvatarFilter('none');
            await updateProfile({ avatar: googlePhotoURL });
            setImageMsg({ type: 'success', text: 'تمت إعادة صورة Google بنجاح ✅' });
            setTimeout(() => setImageMsg(null), 3000);
        } catch (e) {
            console.error('Error resetting avatar:', e);
        } finally {
            setSavingImage(false);
        }
    };

    // Reset cover
    const resetCover = async () => {
        setSavingImage(true);
        try {
            setCoverUrl('');
            setCoverFilter('none');
            await updateProfile({ coverPhoto: '' });
            setImageMsg({ type: 'success', text: 'تمت إعادة تعيين الغلاف ✅' });
            setTimeout(() => setImageMsg(null), 3000);
        } catch (e) {
            console.error('Error resetting cover:', e);
        } finally {
            setSavingImage(false);
        }
    };

    const handlePasswordChange = async () => {
        if (!currentPassword) {
            setPasswordMsg('الرجاء إدخال كلمة المرور الحالية');
            return;
        }
        if (newPassword.length < 6) {
            setPasswordMsg('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordMsg('كلمات المرور غير متطابقة');
            return;
        }
        await updateProfile({ password: newPassword });
        setPasswordMsg('تم تغيير كلمة المرور بنجاح ✓');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
            setShowPasswordSection(false);
            setPasswordMsg('');
        }, 2000);
    };

    const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const ext = file.name.split('.').pop()?.toUpperCase() || 'FILE';
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        const newDoc: PersonalDocument = {
            id: `doc-${Date.now()}`,
            name: file.name.replace(/\.[^/.]+$/, ''),
            type: ext,
            size: `${sizeMB} MB`,
            date: new Date().toISOString().split('T')[0],
            category: uploadCategory,
        };
        setDocuments([newDoc, ...documents]);
        setShowUploadForm(false);
        if (docInputRef.current) docInputRef.current.value = '';
    };

    const handleDeleteDoc = (id: string) => {
        setDocuments(documents.filter(d => d.id !== id));
        setDeleteDocConfirm(null);
    };

    const getFilterCss = (filter: string) => {
        const filters: Record<string, string> = {
            none: 'none', vivid: 'saturate(1.4) contrast(1.1)',
            warm: 'sepia(0.25) saturate(1.3) brightness(1.05)',
            cool: 'saturate(0.9) hue-rotate(15deg) brightness(1.05)',
            bright: 'brightness(1.2) contrast(1.05)',
            noir: 'grayscale(1) contrast(1.2)',
            vintage: 'sepia(0.5) contrast(0.9) brightness(1.1)',
            dramatic: 'contrast(1.4) saturate(0.8) brightness(0.95)',
            fade: 'contrast(0.85) brightness(1.1) saturate(0.8)',
            ocean: 'hue-rotate(200deg) saturate(0.7) brightness(1.1)',
            sunset: 'sepia(0.3) hue-rotate(-15deg) saturate(1.5) brightness(1.05)',
            emerald: 'hue-rotate(90deg) saturate(0.6) brightness(1.1)',
        };
        return filters[filter] || 'none';
    };

    const isCustomAvatar = avatarUrl && avatarUrl !== googlePhotoURL;

    return (
        <div className="page-content page-enter" style={{ padding: 0 }}>
            {/* Hidden file inputs */}
            <input ref={avatarInputRef} type="file" accept="image/*" hidden
                onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0], 'avatar'); e.target.value = ''; }} />
            <input ref={coverInputRef} type="file" accept="image/*" hidden
                onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0], 'cover'); e.target.value = ''; }} />

            {/* Image Editor Modal */}
            {editorImage && (
                <ImageEditor
                    imageUrl={editorImage}
                    onSave={handleImageSave}
                    onCancel={() => setEditorImage(null)}
                    aspectRatio={editorMode === 'avatar' ? 'circle' : 'cover'}
                />
            )}

            {/* ====== COVER PHOTO ====== */}
            <div style={{ position: 'relative', width: '100%', height: 200 }}>
                <div style={{
                    width: '100%', height: '100%',
                    background: coverUrl
                        ? `url(${coverUrl}) center/cover no-repeat`
                        : 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #164e63 70%, #0f172a 100%)',
                    filter: getFilterCss(coverFilter),
                    transition: 'all 500ms ease',
                }}>
                    {/* Animated gradient overlay when no cover */}
                    {!coverUrl && (
                        <div style={{
                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'radial-gradient(ellipse at 30% 50%, rgba(59,130,246,0.15) 0%, transparent 60%), radial-gradient(ellipse at 70% 30%, rgba(139,92,246,0.1) 0%, transparent 50%)',
                        }} />
                    )}
                </div>
                {/* Bottom fade */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
                    background: 'linear-gradient(to top, var(--bg-primary), transparent)',
                }} />
                {/* Back button */}
                <button onClick={onBack} style={{
                    position: 'absolute', top: 12, right: 12,
                    width: 38, height: 38, borderRadius: 'var(--radius-lg)',
                    background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 200ms ease',
                }}>
                    <ArrowRight size={18} />
                </button>
                {/* Cover buttons */}
                <div style={{
                    position: 'absolute', top: 12, left: 12,
                    display: 'flex', gap: 6,
                }}>
                    <button onClick={() => coverInputRef.current?.click()} style={{
                        padding: '7px 14px', borderRadius: 'var(--radius-full)',
                        background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        color: 'white', fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 5,
                        transition: 'all 200ms ease',
                    }}>
                        <Image size={12} /> تغيير الغلاف
                    </button>
                    {coverUrl && (
                        <>
                            <button onClick={() => { setEditorImage(coverUrl); setEditorMode('cover'); }} style={{
                                padding: '7px 10px', borderRadius: 'var(--radius-full)',
                                background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: 'var(--accent-amber)', fontSize: 10, fontWeight: 700,
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                                <Edit3 size={11} /> فلاتر
                            </button>
                            <button onClick={resetCover} disabled={savingImage} style={{
                                padding: '7px 10px', borderRadius: 'var(--radius-full)',
                                background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                color: 'var(--accent-rose)', fontSize: 10, fontWeight: 700,
                                display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                                <RotateCcw size={11} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ====== MAIN CONTENT ====== */}
            <div style={{ padding: '0 16px', paddingBottom: 100, marginTop: -60, position: 'relative', zIndex: 2 }}>

                {/* Image saving feedback */}
                {(savingImage || imageMsg) && (
                    <div style={{
                        marginBottom: 10, padding: '8px 14px', borderRadius: 'var(--radius-lg)',
                        background: savingImage ? 'var(--bg-glass)' : imageMsg?.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                        border: `1px solid ${savingImage ? 'var(--border-glass)' : imageMsg?.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        animation: 'fadeIn 300ms ease',
                    }}>
                        {savingImage ? (
                            <>
                                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-blue)' }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-blue)' }}>جاري حفظ الصورة...</span>
                            </>
                        ) : (
                            <span style={{
                                fontSize: 12, fontWeight: 600,
                                color: imageMsg?.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                            }}>{imageMsg?.text}</span>
                        )}
                    </div>
                )}

                {/* ====== PROFILE HERO CARD ====== */}
                <div style={{
                    borderRadius: 'var(--radius-xl)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-glass)',
                    overflow: 'visible',
                    marginBottom: 16,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                }}>
                    <div style={{ padding: '16px 18px 14px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                        {/* Avatar */}
                        <div style={{ position: 'relative', flexShrink: 0, marginTop: -50 }}>
                            <div style={{
                                width: 92, height: 92, borderRadius: 'var(--radius-xl)',
                                border: '4px solid var(--bg-card)',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
                                overflow: 'hidden',
                                background: avatarUrl ? '#111' : avatarColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 300ms ease',
                            }}>
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="" style={{
                                        width: '100%', height: '100%', objectFit: 'cover',
                                        filter: getFilterCss(avatarFilter),
                                    }} />
                                ) : (
                                    <span style={{ fontSize: 32, fontWeight: 800, color: 'white', letterSpacing: -1 }}>{initials}</span>
                                )}
                            </div>
                            {/* Camera button */}
                            <button onClick={() => avatarInputRef.current?.click()} style={{
                                position: 'absolute', bottom: -2, right: -2,
                                width: 30, height: 30, borderRadius: '50%',
                                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                color: 'white', boxShadow: '0 4px 14px rgba(59,130,246,0.5)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '3px solid var(--bg-card)',
                                transition: 'transform 200ms ease',
                            }}>
                                <Camera size={12} />
                            </button>
                            {/* Edit filter button */}
                            {avatarUrl && (
                                <button onClick={() => { setEditorImage(avatarUrl); setEditorMode('avatar'); }} style={{
                                    position: 'absolute', bottom: -2, left: -2,
                                    width: 30, height: 30, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                    color: 'white', boxShadow: '0 4px 14px rgba(245,158,11,0.5)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '3px solid var(--bg-card)',
                                }}>
                                    <Sparkles size={11} />
                                </button>
                            )}
                        </div>

                        {/* Name + Role + Phone */}
                        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                            {/* Name */}
                            {editingField === 'name' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                                    <input
                                        type="text" className="form-input" value={tempValue}
                                        onChange={e => setTempValue(e.target.value)} autoFocus
                                        style={{ flex: 1, padding: '5px 10px', fontSize: 15, fontWeight: 700 }}
                                    />
                                    <button onClick={saveEdit} disabled={!!savingField} style={{
                                        width: 26, height: 26, borderRadius: '50%',
                                        background: 'var(--accent-emerald)', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>{savingField ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}</button>
                                    <button onClick={cancelEdit} style={{
                                        width: 26, height: 26, borderRadius: '50%',
                                        background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}><X size={12} /></button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                    <h2 style={{
                                        fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap',
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                        background: 'linear-gradient(135deg, var(--text-primary) 60%, var(--accent-blue))',
                                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                    }}>{name}</h2>
                                    <button onClick={() => startEdit('name')} style={{
                                        width: 22, height: 22, borderRadius: '50%',
                                        background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}><Edit3 size={9} /></button>
                                    {savedField === 'name' && (
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, padding: '2px 8px',
                                            borderRadius: 'var(--radius-full)',
                                            background: 'var(--accent-emerald-soft)', color: 'var(--accent-emerald)',
                                            animation: 'fadeIn 300ms ease',
                                        }}>✓ تم الحفظ</span>
                                    )}
                                </div>
                            )}

                            {/* Role badge */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 4,
                                    padding: '3px 10px', borderRadius: 'var(--radius-full)',
                                    fontSize: 10, fontWeight: 700,
                                    background: user.role === 'admin'
                                        ? 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.1))'
                                        : 'var(--accent-blue-soft)',
                                    color: user.role === 'admin' ? 'var(--accent-amber)' : 'var(--accent-blue)',
                                    border: `1px solid ${user.role === 'admin' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.15)'}`,
                                }}>
                                    <Shield size={10} />
                                    {user.role === 'admin' ? 'مشرف النظام' : 'موظف'}
                                </span>
                                {user.department && (
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        padding: '3px 10px', borderRadius: 'var(--radius-full)',
                                        fontSize: 10, fontWeight: 700,
                                        background: 'var(--accent-purple-soft)',
                                        color: 'var(--accent-purple)',
                                        border: '1px solid rgba(139,92,246,0.15)',
                                    }}>
                                        <Briefcase size={9} />
                                        {user.department}
                                    </span>
                                )}
                            </div>

                            {/* Phone */}
                            {editingField === 'phone' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <input
                                        type="tel" className="form-input" value={tempValue}
                                        onChange={e => setTempValue(e.target.value)} autoFocus dir="ltr"
                                        style={{ flex: 1, padding: '5px 10px', fontSize: 13, fontFamily: 'var(--font-numeric)' }}
                                    />
                                    <button onClick={saveEdit} disabled={!!savingField} style={{
                                        width: 26, height: 26, borderRadius: '50%',
                                        background: 'var(--accent-emerald)', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>{savingField ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}</button>
                                    <button onClick={cancelEdit} style={{
                                        width: 26, height: 26, borderRadius: '50%',
                                        background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}><X size={12} /></button>
                                </div>
                            ) : phone ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <Phone size={12} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
                                    <span style={{
                                        fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
                                        fontFamily: 'var(--font-numeric)', direction: 'ltr', unicodeBidi: 'embed',
                                    }}>{phone}</span>
                                    <button onClick={() => startEdit('phone')} style={{
                                        width: 20, height: 20, borderRadius: '50%',
                                        background: 'var(--accent-emerald-soft)', color: 'var(--accent-emerald)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}><Edit3 size={9} /></button>
                                    {savedField === 'phone' && (
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, padding: '2px 8px',
                                            borderRadius: 'var(--radius-full)',
                                            background: 'var(--accent-emerald-soft)', color: 'var(--accent-emerald)',
                                            animation: 'fadeIn 300ms ease',
                                        }}>✓ تم الحفظ</span>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Reset to Google Photo button */}
                    {isCustomAvatar && googlePhotoURL && (
                        <div style={{
                            padding: '0 18px 14px',
                        }}>
                            <button onClick={resetToGooglePhoto} disabled={savingImage} style={{
                                width: '100%', padding: '9px 14px', borderRadius: 'var(--radius-md)',
                                background: 'rgba(59,130,246,0.08)',
                                border: '1px solid rgba(59,130,246,0.15)',
                                color: 'var(--accent-blue)', fontSize: 11, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                transition: 'all 200ms ease',
                                opacity: savingImage ? 0.6 : 1,
                            }}>
                                {savingImage ? (
                                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                ) : (
                                    <RotateCcw size={13} />
                                )}
                                إعادة صورة حساب Google
                            </button>
                        </div>
                    )}
                </div>

                {/* ====== ACCOUNT DETAILS ====== */}
                <div style={{ marginBottom: 16 }}>
                    <h3 className="section-title" style={{ fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: 'var(--radius-md)',
                            background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}><User size={14} /></div>
                        بيانات الحساب
                    </h3>
                    <div style={{
                        borderRadius: 'var(--radius-xl)',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-glass)',
                        overflow: 'hidden',
                    }}>
                        <InfoRow icon={<AtSign size={15} />} label="اسم المستخدم" value={user.username} color="#3b82f6" />
                        <div style={{ height: 1, background: 'var(--border-glass)', margin: '0 16px' }} />
                        <InfoRow icon={<Building2 size={15} />} label="القسم" value={user.department} color="#8b5cf6" />
                        <div style={{ height: 1, background: 'var(--border-glass)', margin: '0 16px' }} />
                        <InfoRow icon={<Shield size={15} />} label="الصلاحية" value={user.role === 'admin' ? 'مشرف النظام' : 'موظف'} color="#f59e0b" badge />
                        {user.branch && (
                            <>
                                <div style={{ height: 1, background: 'var(--border-glass)', margin: '0 16px' }} />
                                <InfoRow icon={<MapPin size={15} />} label="الفرع" value={user.branch} color="#10b981" />
                            </>
                        )}
                        <div style={{ height: 1, background: 'var(--border-glass)', margin: '0 16px' }} />
                        <InfoRow icon={<Clock size={15} />} label="وقت الدوام" value={`${user.shiftStart || '08:00'} — ${user.shiftEnd || '16:00'}`} color="#06b6d4" />
                    </div>
                </div>

                {/* ====== PASSWORD ====== */}
                <div style={{ marginBottom: 16 }}>
                    <h3 className="section-title" style={{ fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: 'var(--radius-md)',
                            background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}><Lock size={14} /></div>
                        الأمان وكلمة المرور
                    </h3>
                    <div style={{
                        borderRadius: 'var(--radius-xl)',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-glass)',
                        padding: 16,
                    }}>
                        {!showPasswordSection ? (
                            <button onClick={() => setShowPasswordSection(true)} style={{
                                width: '100%', padding: '12px',
                                borderRadius: 'var(--radius-lg)',
                                background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.12))',
                                border: '1px solid rgba(59,130,246,0.15)',
                                color: 'var(--accent-blue)', fontSize: 13, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                transition: 'all 200ms ease',
                            }}>
                                <Lock size={15} />
                                تغيير كلمة المرور
                            </button>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">كلمة المرور الحالية</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showCurrent ? 'text' : 'password'}
                                            className="form-input"
                                            placeholder="أدخل كلمة المرور الحالية"
                                            value={currentPassword}
                                            onChange={e => setCurrentPassword(e.target.value)}
                                            dir="ltr" style={{ paddingLeft: 40 }}
                                        />
                                        <button onClick={() => setShowCurrent(!showCurrent)}
                                            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                            {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">كلمة المرور الجديدة</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showNew ? 'text' : 'password'}
                                            className="form-input"
                                            placeholder="أدخل كلمة المرور الجديدة (6 أحرف على الأقل)"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            dir="ltr" style={{ paddingLeft: 40 }}
                                        />
                                        <button onClick={() => setShowNew(!showNew)}
                                            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
                                            {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="form-group" style={{ marginBottom: 0 }}>
                                    <label className="form-label">تأكيد كلمة المرور</label>
                                    <input type="password" className="form-input"
                                        placeholder="أعد إدخال كلمة المرور الجديدة"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)} dir="ltr" />
                                </div>
                                {passwordMsg && (
                                    <div style={{
                                        padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                        fontSize: 12, fontWeight: 600, textAlign: 'center',
                                        background: passwordMsg.includes('✓') ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                                        color: passwordMsg.includes('✓') ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                        border: `1px solid ${passwordMsg.includes('✓') ? 'rgba(16,185,129,0.2)' : 'rgba(244,63,94,0.2)'}`,
                                    }}>{passwordMsg}</div>
                                )}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={handlePasswordChange} style={{
                                        flex: 1, padding: '10px',
                                        background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))',
                                        borderRadius: 'var(--radius-md)', color: 'white', fontSize: 13, fontWeight: 700,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    }}>
                                        <Save size={14} /> حفظ
                                    </button>
                                    <button onClick={() => { setShowPasswordSection(false); setPasswordMsg(''); }} style={{
                                        padding: '10px 16px',
                                        background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                                        borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
                                    }}>إلغاء</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ====== DOCUMENTS ====== */}
                <div style={{ marginBottom: 16 }}>
                    <h3 className="section-title" style={{ fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 28, height: 28, borderRadius: 'var(--radius-md)',
                            background: 'rgba(139,92,246,0.1)', color: '#8b5cf6',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}><Paperclip size={14} /></div>
                        المستمسكات الثبوتية
                    </h3>
                    <div style={{
                        borderRadius: 'var(--radius-xl)',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-glass)',
                        padding: 16, marginBottom: 10,
                    }}>
                        {!showUploadForm ? (
                            <button onClick={() => setShowUploadForm(true)} style={{
                                width: '100%', padding: '12px',
                                borderRadius: 'var(--radius-lg)',
                                background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.12))',
                                border: '1px solid rgba(59,130,246,0.15)',
                                color: 'var(--accent-blue)', fontSize: 13, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            }}>
                                <Upload size={15} /> رفع مستمسك جديد
                            </button>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'center' }}>اختر نوع المستمسك</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    {DOC_CATEGORIES.map(cat => (
                                        <button key={cat.id} onClick={() => setUploadCategory(cat.id)} style={{
                                            padding: '8px 14px', borderRadius: 'var(--radius-md)',
                                            fontSize: 11, fontWeight: 700,
                                            background: uploadCategory === cat.id ? `${cat.color}20` : 'var(--bg-glass)',
                                            color: uploadCategory === cat.id ? cat.color : 'var(--text-muted)',
                                            border: `1px solid ${uploadCategory === cat.id ? cat.color : 'var(--border-glass)'}`,
                                            display: 'flex', alignItems: 'center', gap: 4,
                                            transition: 'all 200ms ease',
                                        }}>
                                            <span>{cat.icon}</span> {cat.label}
                                        </button>
                                    ))}
                                </div>
                                <input ref={docInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                    onChange={handleDocUpload} style={{ display: 'none' }} />
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button onClick={() => docInputRef.current?.click()} style={{
                                        flex: 1, padding: '10px',
                                        background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))',
                                        borderRadius: 'var(--radius-md)', color: 'white', fontSize: 13, fontWeight: 700,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    }}>
                                        <FileUp size={15} /> اختر ملف
                                    </button>
                                    <button onClick={() => setShowUploadForm(false)} style={{
                                        padding: '10px 16px',
                                        background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                                        borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
                                    }}>إلغاء</button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Documents List */}
                    {documents.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                            {documents.map(doc => {
                                const cat = DOC_CATEGORIES.find(c => c.id === doc.category);
                                const isDeleting = deleteDocConfirm === doc.id;
                                return (
                                    <div key={doc.id} style={{
                                        borderRadius: 'var(--radius-lg)',
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border-glass)',
                                        padding: '12px 14px',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{
                                                width: 40, height: 40, borderRadius: 'var(--radius-md)',
                                                background: `${cat?.color || '#666'}12`,
                                                border: `1px solid ${cat?.color || '#666'}20`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 18, flexShrink: 0,
                                            }}>{cat?.icon || '📎'}</div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 700 }}>{doc.name}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    <span style={{
                                                        padding: '1px 6px', borderRadius: 'var(--radius-full)',
                                                        background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                                                        fontSize: 9, fontWeight: 700,
                                                    }}>{doc.type}</span>
                                                    <span style={{ fontFamily: 'var(--font-numeric)' }}>{doc.size}</span>
                                                    <span>•</span>
                                                    <span style={{ fontFamily: 'var(--font-numeric)' }}>{doc.date}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => setDeleteDocConfirm(doc.id)} style={{
                                                width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                                background: 'rgba(244,63,94,0.08)', color: 'var(--accent-rose)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                border: '1px solid rgba(244,63,94,0.12)',
                                            }}><Trash2 size={13} /></button>
                                        </div>
                                        {isDeleting && (
                                            <div style={{
                                                marginTop: 8, padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                                background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)',
                                                display: 'flex', alignItems: 'center', gap: 8,
                                            }}>
                                                <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--accent-rose)' }}>
                                                    حذف هذا المستمسك؟
                                                </span>
                                                <button onClick={() => handleDeleteDoc(doc.id)} style={{
                                                    padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                                                    background: 'var(--accent-rose)', color: 'white',
                                                    fontSize: 10, fontWeight: 700,
                                                }}>حذف</button>
                                                <button onClick={() => setDeleteDocConfirm(null)} style={{
                                                    padding: '4px 12px', borderRadius: 'var(--radius-sm)',
                                                    background: 'var(--bg-glass-strong)', color: 'var(--text-secondary)',
                                                    fontSize: 10, fontWeight: 700,
                                                }}>إلغاء</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {documents.length === 0 && (
                        <div style={{
                            borderRadius: 'var(--radius-xl)',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-glass)',
                            textAlign: 'center', padding: '28px 16px',
                        }}>
                            <File size={28} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 8px', opacity: 0.5 }} />
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>لا توجد مستمسكات مرفوعة</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>اضغط "رفع مستمسك جديد" لإضافة ملفاتك</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// === Info Row ===
function InfoRow({ icon, label, value, color, badge }: {
    icon: React.ReactNode; label: string; value: string; color: string; badge?: boolean;
}) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
            <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-lg)',
                background: `${color}12`, color, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px solid ${color}18`,
            }}>
                {icon}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, fontWeight: 600 }}>{label}</div>
                {badge ? (
                    <span style={{
                        display: 'inline-block', padding: '2px 10px',
                        borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 700,
                        background: `${color}15`, color,
                        border: `1px solid ${color}20`,
                    }}>{value}</span>
                ) : (
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
                )}
            </div>
        </div>
    );
}
