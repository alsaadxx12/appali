import React, { useState, useRef } from 'react';
import {
    ArrowRight, User, Mail, Shield, Building2, Lock, Check, X, Save,
    Eye, EyeOff, Smartphone, Calendar, Camera, Image, Phone, Edit3,
    FileUp, FileText, Trash2, Paperclip, File, Upload
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AVATAR_COLORS } from '../../data/demoData';
import ImageEditor from '../../components/ImageEditor';

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

const DEMO_DOCUMENTS: PersonalDocument[] = [
    { id: 'doc-1', name: 'هوية الأحوال المدنية', type: 'PDF', size: '2.4 MB', date: '2024-01-15', category: 'national_id' },
    { id: 'doc-2', name: 'جواز السفر', type: 'PDF', size: '1.8 MB', date: '2024-02-20', category: 'passport' },
    { id: 'doc-3', name: 'بطاقة السكن', type: 'JPG', size: '3.1 MB', date: '2024-03-10', category: 'residence' },
];

interface Props {
    onBack: () => void;
}

// Sample cover and avatar defaults
const DEFAULT_COVER = 'https://images.unsplash.com/photo-1557683316-973673baf926?w=800&h=300&fit=crop';
const DEFAULT_AVATAR = '';

export default function AccountInfoPage({ onBack }: Props) {
    const { user } = useAuth();

    // Editable state
    const [name, setName] = useState(user?.name || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [editingField, setEditingField] = useState<'name' | 'phone' | null>(null);
    const [tempValue, setTempValue] = useState('');

    // Images
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar || DEFAULT_AVATAR);
    const [coverUrl, setCoverUrl] = useState(DEFAULT_COVER);
    const [avatarFilter, setAvatarFilter] = useState('none');
    const [coverFilter, setCoverFilter] = useState('none');

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
    const [documents, setDocuments] = useState<PersonalDocument[]>(DEMO_DOCUMENTS);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [uploadCategory, setUploadCategory] = useState<PersonalDocument['category']>('national_id');
    const [deleteDocConfirm, setDeleteDocConfirm] = useState<string | null>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

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

    // Saved animation
    const [savedField, setSavedField] = useState<string | null>(null);

    // File inputs
    const avatarInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);

    if (!user) return null;

    const userIndex = user.id.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    const avatarColor = AVATAR_COLORS[userIndex % AVATAR_COLORS.length];
    const initials = user.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2);

    const startEdit = (field: 'name' | 'phone') => {
        setTempValue(field === 'name' ? name : phone);
        setEditingField(field);
    };

    const saveEdit = () => {
        if (!editingField) return;
        if (editingField === 'name') setName(tempValue);
        else setPhone(tempValue);
        setSavedField(editingField);
        setEditingField(null);
        setTimeout(() => setSavedField(null), 1500);
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

    const handleImageSave = (url: string, filter: string) => {
        if (editorMode === 'avatar') {
            setAvatarUrl(url);
            setAvatarFilter(filter);
        } else {
            setCoverUrl(url);
            setCoverFilter(filter);
        }
        setEditorImage(null);
    };

    const handlePasswordChange = () => {
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
        setPasswordMsg('تم تغيير كلمة المرور بنجاح ✓');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
            setShowPasswordSection(false);
            setPasswordMsg('');
        }, 2000);
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

            {/* Cover Photo */}
            <div style={{ position: 'relative', width: '100%', height: 180 }}>
                <div style={{
                    width: '100%', height: '100%',
                    background: coverUrl
                        ? `url(${coverUrl}) center/cover no-repeat`
                        : 'linear-gradient(135deg, #1e3a5f, #0a1628)',
                    filter: getFilterCss(coverFilter),
                }} />
                {/* Cover overlay gradient */}
                <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 90,
                    background: 'linear-gradient(to top, var(--bg-primary), transparent)',
                }} />
                {/* Back button */}
                <button onClick={onBack} style={{
                    position: 'absolute', top: 12, right: 12,
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <ArrowRight size={18} />
                </button>
                {/* Cover change button */}
                <button onClick={() => coverInputRef.current?.click()} style={{
                    position: 'absolute', top: 12, left: 12,
                    padding: '6px 12px', borderRadius: 'var(--radius-full)',
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'white', fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 4,
                }}>
                    <Image size={12} /> تغيير الغلاف
                </button>
                {/* Edit existing cover filter */}
                {coverUrl && (
                    <button onClick={() => { setEditorImage(coverUrl); setEditorMode('cover'); }} style={{
                        position: 'absolute', top: 12, left: 116,
                        padding: '6px 12px', borderRadius: 'var(--radius-full)',
                        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: 'var(--accent-amber)', fontSize: 10, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                        <Edit3 size={12} /> فلاتر
                    </button>
                )}
            </div>

            {/* Profile Info Card - Avatar in corner */}
            <div style={{ padding: '0 16px', paddingBottom: 100, marginTop: -55, position: 'relative', zIndex: 2 }}>
                <div className="glass-card" style={{
                    padding: '16px', marginBottom: 16,
                    overflow: 'visible',
                }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                        {/* Avatar - Right corner */}
                        <div style={{ position: 'relative', flexShrink: 0, marginTop: -45 }}>
                            <div style={{
                                width: 88, height: 88, borderRadius: 'var(--radius-xl)',
                                border: '3px solid var(--bg-card)',
                                boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
                                overflow: 'hidden',
                                background: avatarUrl ? '#111' : avatarColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="" style={{
                                        width: '100%', height: '100%', objectFit: 'cover',
                                        filter: getFilterCss(avatarFilter),
                                    }} />
                                ) : (
                                    <span style={{ fontSize: 30, fontWeight: 800, color: 'white' }}>{initials}</span>
                                )}
                            </div>
                            {/* Camera button */}
                            <button onClick={() => avatarInputRef.current?.click()} style={{
                                position: 'absolute', bottom: -4, right: -4,
                                width: 30, height: 30, borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                                color: 'white', boxShadow: '0 4px 12px rgba(59,130,246,0.4)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: '2px solid var(--bg-card)',
                            }}>
                                <Camera size={13} />
                            </button>
                            {/* Edit avatar filter */}
                            {avatarUrl && (
                                <button onClick={() => { setEditorImage(avatarUrl); setEditorMode('avatar'); }} style={{
                                    position: 'absolute', bottom: -4, left: -4,
                                    width: 30, height: 30, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--accent-amber), #f59e0b)',
                                    color: 'white', boxShadow: '0 4px 12px rgba(245,158,11,0.4)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '2px solid var(--bg-card)',
                                }}>
                                    <Edit3 size={11} />
                                </button>
                            )}
                        </div>

                        {/* Name, Role, Phone */}
                        <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                            {/* Editable Name */}
                            {editingField === 'name' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={tempValue}
                                        onChange={e => setTempValue(e.target.value)}
                                        autoFocus
                                        style={{ flex: 1, padding: '5px 10px', fontSize: 15, fontWeight: 700 }}
                                    />
                                    <button onClick={saveEdit} style={{
                                        width: 26, height: 26, borderRadius: '50%',
                                        background: 'var(--accent-emerald)', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}><Check size={12} /></button>
                                    <button onClick={cancelEdit} style={{
                                        width: 26, height: 26, borderRadius: '50%',
                                        background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}><X size={12} /></button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                    <h2 style={{ fontSize: 17, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</h2>
                                    <button onClick={() => startEdit('name')} style={{
                                        width: 22, height: 22, borderRadius: '50%',
                                        background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}><Edit3 size={10} /></button>
                                    {savedField === 'name' && (
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, padding: '2px 6px',
                                            borderRadius: 'var(--radius-full)',
                                            background: 'var(--accent-emerald-soft)', color: 'var(--accent-emerald)',
                                        }}>✓</span>
                                    )}
                                </div>
                            )}

                            {/* Role badge */}
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '2px 10px', borderRadius: 'var(--radius-full)',
                                fontSize: 10, fontWeight: 700, marginBottom: 6,
                                background: user.role === 'admin' ? 'var(--accent-amber-soft)' : 'var(--accent-blue-soft)',
                                color: user.role === 'admin' ? 'var(--accent-amber)' : 'var(--accent-blue)',
                            }}>
                                <Shield size={10} />
                                {user.role === 'admin' ? 'مشرف' : 'موظف'}
                            </span>

                            {/* Editable Phone */}
                            {editingField === 'phone' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                    <input
                                        type="tel"
                                        className="form-input"
                                        value={tempValue}
                                        onChange={e => setTempValue(e.target.value)}
                                        autoFocus
                                        dir="ltr"
                                        style={{ flex: 1, padding: '5px 10px', fontSize: 13, fontFamily: 'var(--font-numeric)' }}
                                    />
                                    <button onClick={saveEdit} style={{
                                        width: 26, height: 26, borderRadius: '50%',
                                        background: 'var(--accent-emerald)', color: 'white',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}><Check size={12} /></button>
                                    <button onClick={cancelEdit} style={{
                                        width: 26, height: 26, borderRadius: '50%',
                                        background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}><X size={12} /></button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                    <Phone size={12} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
                                    <span style={{
                                        fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
                                        fontFamily: 'var(--font-numeric)', direction: 'ltr', unicodeBidi: 'embed',
                                    }}>{phone}</span>
                                    <button onClick={() => startEdit('phone')} style={{
                                        width: 22, height: 22, borderRadius: '50%',
                                        background: 'var(--accent-emerald-soft)', color: 'var(--accent-emerald)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    }}><Edit3 size={10} /></button>
                                    {savedField === 'phone' && (
                                        <span style={{
                                            fontSize: 9, fontWeight: 700, padding: '2px 6px',
                                            borderRadius: 'var(--radius-full)',
                                            background: 'var(--accent-emerald-soft)', color: 'var(--accent-emerald)',
                                        }}>✓</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Account Details */}
                <h3 className="section-title" style={{ fontSize: 14 }}>
                    <User size={16} />
                    بيانات الحساب
                </h3>
                <div className="glass-card" style={{ marginBottom: 16 }}>
                    <InfoRow icon={<Mail size={16} />} label="اسم المستخدم" value={user.username} color="var(--accent-blue)" />
                    <div style={{ height: 1, background: 'var(--border-glass)', margin: '12px 0' }} />

                    <div style={{ height: 1, background: 'var(--border-glass)', margin: '12px 0' }} />
                    <InfoRow icon={<Building2 size={16} />} label="القسم" value={user.department} color="var(--accent-purple)" />
                    <div style={{ height: 1, background: 'var(--border-glass)', margin: '12px 0' }} />
                    <InfoRow
                        icon={<Shield size={16} />}
                        label="الصلاحية"
                        value={user.role === 'admin' ? 'مشرف' : 'موظف'}
                        color="var(--accent-amber)"
                        badge
                    />
                    <div style={{ height: 1, background: 'var(--border-glass)', margin: '12px 0' }} />
                    <InfoRow icon={<Calendar size={16} />} label="تاريخ الانضمام" value="2024-01-15" color="var(--accent-teal)" />
                </div>

                {/* Password Change */}
                <h3 className="section-title" style={{ fontSize: 14 }}>
                    <Lock size={16} />
                    كلمة المرور
                </h3>
                <div className="glass-card" style={{ marginBottom: 16 }}>
                    {!showPasswordSection ? (
                        <button
                            onClick={() => setShowPasswordSection(true)}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: 'var(--radius-md)',
                                background: 'linear-gradient(135deg, var(--accent-blue), var(--accent-purple))',
                                color: 'white', fontSize: 13, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            }}
                        >
                            <Lock size={16} />
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
                                        dir="ltr"
                                        style={{ paddingLeft: 40 }}
                                    />
                                    <button
                                        onClick={() => setShowCurrent(!showCurrent)}
                                        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                                    >
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
                                        dir="ltr"
                                        style={{ paddingLeft: 40 }}
                                    />
                                    <button
                                        onClick={() => setShowNew(!showNew)}
                                        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
                                    >
                                        {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">تأكيد كلمة المرور</label>
                                <input
                                    type="password"
                                    className="form-input"
                                    placeholder="أعد إدخال كلمة المرور الجديدة"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    dir="ltr"
                                />
                            </div>

                            {passwordMsg && (
                                <div style={{
                                    padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                    fontSize: 12, fontWeight: 600, textAlign: 'center',
                                    background: passwordMsg.includes('✓') ? 'var(--accent-emerald-soft)' : 'var(--accent-rose-soft)',
                                    color: passwordMsg.includes('✓') ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                }}>
                                    {passwordMsg}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    onClick={handlePasswordChange}
                                    style={{
                                        flex: 1, padding: '10px',
                                        background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))',
                                        borderRadius: 'var(--radius-md)', color: 'white', fontSize: 13, fontWeight: 700,
                                    }}
                                >
                                    <Save size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: 4 }} />
                                    حفظ كلمة المرور
                                </button>
                                <button
                                    onClick={() => { setShowPasswordSection(false); setPasswordMsg(''); }}
                                    style={{
                                        padding: '10px 16px',
                                        background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                                        borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
                                    }}
                                >
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    )}
                    {/* Personal Documents */}
                    <h3 className="section-title" style={{ fontSize: 14 }}>
                        <Paperclip size={16} />
                        المستمسكات الثبوتية
                    </h3>
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                        {/* Upload Button */}
                        {!showUploadForm ? (
                            <button
                                onClick={() => setShowUploadForm(true)}
                                style={{
                                    width: '100%', padding: '12px',
                                    borderRadius: 'var(--radius-md)',
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    color: 'white', fontSize: 13, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                }}
                            >
                                <Upload size={16} />
                                رفع مستمسك جديد
                            </button>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'center' }}>اختر نوع المستمسك</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                                    {DOC_CATEGORIES.map(cat => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setUploadCategory(cat.id)}
                                            style={{
                                                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                                                fontSize: 11, fontWeight: 700,
                                                background: uploadCategory === cat.id ? `${cat.color}20` : 'var(--bg-glass)',
                                                color: uploadCategory === cat.id ? cat.color : 'var(--text-muted)',
                                                border: `1px solid ${uploadCategory === cat.id ? cat.color : 'var(--border-glass)'}`,
                                                display: 'flex', alignItems: 'center', gap: 4,
                                                transition: 'all 200ms ease',
                                            }}
                                        >
                                            <span>{cat.icon}</span> {cat.label}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    ref={docInputRef}
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                    onChange={handleDocUpload}
                                    style={{ display: 'none' }}
                                />
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                        onClick={() => docInputRef.current?.click()}
                                        style={{
                                            flex: 1, padding: '10px',
                                            background: 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))',
                                            borderRadius: 'var(--radius-md)', color: 'white', fontSize: 13, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                        }}
                                    >
                                        <FileUp size={16} />
                                        اختر ملف
                                    </button>
                                    <button
                                        onClick={() => setShowUploadForm(false)}
                                        style={{
                                            padding: '10px 16px',
                                            background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                                            borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600,
                                        }}
                                    >
                                        إلغاء
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Documents List */}
                    {documents.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                            {documents.map(doc => {
                                const cat = DOC_CATEGORIES.find(c => c.id === doc.category);
                                const isDeleting = deleteDocConfirm === doc.id;
                                return (
                                    <div key={doc.id} className="glass-card" style={{ padding: '12px 14px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{
                                                width: 40, height: 40, borderRadius: 'var(--radius-md)',
                                                background: `${cat?.color || '#666'}15`,
                                                border: `1px solid ${cat?.color || '#666'}25`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 18, flexShrink: 0,
                                            }}>
                                                {cat?.icon || '📎'}
                                            </div>
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
                                                background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                        {isDeleting && (
                                            <div style={{
                                                marginTop: 8, padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                                background: 'var(--accent-rose-soft)', border: '1px solid rgba(244,63,94,0.2)',
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
                        <div className="glass-card" style={{ textAlign: 'center', padding: '24px 16px', marginBottom: 16 }}>
                            <File size={28} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 8px' }} />
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>لا توجد مستمسكات مرفوعة</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>اضغط "رفع مستمسك جديد" لإضافة ملفاتك</div>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-md)',
                background: `${color}22`, color, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                {icon}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
                {badge ? (
                    <span style={{
                        display: 'inline-block', padding: '2px 10px',
                        borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 700,
                        background: `${color}22`, color,
                    }}>
                        {value}
                    </span>
                ) : (
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
                )}
            </div>
        </div>
    );
}
