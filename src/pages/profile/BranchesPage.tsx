import React, { useState, useEffect, useRef } from 'react';
import {
    ArrowRight, MapPin, Navigation, Building2, Plus,
    Edit3, Trash2, X, Save, Users, Layers,
} from 'lucide-react';
import DepartmentPage, { Department } from './DepartmentPage';
import { db } from '../../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';

interface Props {
    onBack: () => void;
}

interface Branch {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radiusMeters: number;
    address: string;
    employeeCount: number;
    isActive: boolean;
    departments: Department[];
}

type FormMode = 'none' | 'add-branch' | 'edit-branch';

export default function BranchesPage({ onBack }: Props) {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [formMode, setFormMode] = useState<FormMode>('none');
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

    const [branchForm, setBranchForm] = useState({
        id: '', name: '', address: '', latitude: 33.3152, longitude: 44.3661,
        radiusMeters: 200, isActive: true,
    });

    const mapRef = useRef<HTMLDivElement>(null);

    // Place search state
    const [placeQuery, setPlaceQuery] = useState('');
    const [placeResults, setPlaceResults] = useState<any[]>([]);
    const [searchingPlace, setSearchingPlace] = useState(false);
    const searchTimeout = useRef<any>(null);

    const handlePlaceSearch = (query: string) => {
        setPlaceQuery(query);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (!query.trim() || query.trim().length < 2) {
            setPlaceResults([]);
            return;
        }
        searchTimeout.current = setTimeout(async () => {
            setSearchingPlace(true);
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=ar`
                );
                const data = await res.json();
                setPlaceResults(data);
            } catch (e) {
                console.error('Place search error:', e);
                setPlaceResults([]);
            } finally {
                setSearchingPlace(false);
            }
        }, 400);
    };

    const selectPlace = (place: any) => {
        const lat = parseFloat(place.lat);
        const lng = parseFloat(place.lon);
        setBranchForm(prev => ({
            ...prev,
            latitude: lat,
            longitude: lng,
            address: place.display_name || prev.address,
        }));
        setPlaceQuery('');
        setPlaceResults([]);
    };

    // Load branches from Firestore
    useEffect(() => {
        loadBranches();
    }, []);

    const loadBranches = async () => {
        try {
            const snap = await getDocs(collection(db, 'branches'));
            const loaded: Branch[] = snap.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    name: data.name || '',
                    latitude: data.latitude || 33.3152,
                    longitude: data.longitude || 44.3661,
                    radiusMeters: data.radiusMeters || 200,
                    address: data.address || '',
                    employeeCount: data.employeeCount || 0,
                    isActive: data.isActive !== false,
                    departments: data.departments || [],
                };
            });
            setBranches(loaded);
        } catch (e) {
            console.error('Error loading branches:', e);
        } finally {
            setLoading(false);
        }
    };

    const totalEmployees = branches.reduce((s, b) => s + b.employeeCount, 0);
    const totalDepts = branches.reduce((s, b) => s + b.departments.length, 0);

    const handleAddBranch = async () => {
        try {
            const branchData = {
                name: branchForm.name,
                address: branchForm.address,
                latitude: branchForm.latitude,
                longitude: branchForm.longitude,
                radiusMeters: branchForm.radiusMeters,
                isActive: branchForm.isActive,
                employeeCount: 0,
                departments: [],
                createdAt: new Date().toISOString(),
            };
            const docRef = await addDoc(collection(db, 'branches'), branchData);
            setBranches([...branches, { ...branchData, id: docRef.id }]);
            setFormMode('none');
        } catch (e) {
            console.error('Error adding branch:', e);
        }
    };

    const handleEditBranch = async () => {
        try {
            await updateDoc(doc(db, 'branches', branchForm.id), {
                name: branchForm.name,
                address: branchForm.address,
                latitude: branchForm.latitude,
                longitude: branchForm.longitude,
                radiusMeters: branchForm.radiusMeters,
                isActive: branchForm.isActive,
            });
            setBranches(branches.map(b =>
                b.id === branchForm.id ? {
                    ...b,
                    name: branchForm.name, address: branchForm.address,
                    latitude: branchForm.latitude, longitude: branchForm.longitude,
                    radiusMeters: branchForm.radiusMeters, isActive: branchForm.isActive,
                } : b
            ));
            setFormMode('none');
        } catch (e) {
            console.error('Error editing branch:', e);
        }
    };

    const handleDeleteBranch = async (id: string) => {
        try {
            await deleteDoc(doc(db, 'branches', id));
            setBranches(branches.filter(b => b.id !== id));
        } catch (e) {
            console.error('Error deleting branch:', e);
        }
        setDeleteConfirm(null);
    };

    const startEditBranch = (b: Branch) => {
        setBranchForm({
            id: b.id, name: b.name, address: b.address,
            latitude: b.latitude, longitude: b.longitude,
            radiusMeters: b.radiusMeters, isActive: b.isActive,
        });
        setFormMode('edit-branch');
    };

    const handleUpdateDepartments = async (branchId: string, departments: Department[]) => {
        try {
            await updateDoc(doc(db, 'branches', branchId), { departments });
            setBranches(branches.map(b => b.id === branchId ? { ...b, departments } : b));
        } catch (e) {
            console.error('Error updating departments:', e);
        }
    };

    // Map click handler for embedded iframe messages
    const handleMapClick = (lat: number, lng: number) => {
        setBranchForm(prev => ({ ...prev, latitude: lat, longitude: lng }));
    };

    // Navigate into department page
    const activeBranch = selectedBranch ? branches.find(b => b.id === selectedBranch) : null;
    if (activeBranch) {
        return (
            <DepartmentPage
                branch={activeBranch}
                onBack={() => setSelectedBranch(null)}
                onUpdateDepartments={handleUpdateDepartments}
            />
        );
    }

    if (loading) {
        return (
            <div className="page-content page-enter" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Building2 size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.5 }} />
                    <div style={{ fontSize: 13 }}>جاري التحميل...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="page-content page-enter">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button onClick={onBack} style={{
                    width: 36, height: 36, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-glass)', border: '1px solid var(--border-glass)',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <ArrowRight size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>الأفرع والأقسام</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>انقر على الفرع لعرض أقسامه</p>
                </div>
            </div>

            {/* Stats Row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <StatCard icon={<Building2 size={16} />} value={branches.length} label="الأفرع" color="var(--accent-blue)" />
                <StatCard icon={<Layers size={16} />} value={totalDepts} label="الأقسام" color="var(--accent-purple)" />
                <StatCard icon={<Users size={16} />} value={totalEmployees} label="الموظفين" color="var(--accent-emerald)" />
            </div>

            {/* Add/Edit Branch Form */}
            {(formMode === 'add-branch' || formMode === 'edit-branch') && (
                <div className="glass-card" style={{ marginBottom: 16, padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 700 }}>
                            {formMode === 'edit-branch' ? 'تعديل الفرع' : 'إضافة فرع جديد'}
                        </h3>
                        <button onClick={() => setFormMode('none')} style={{
                            width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                            background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <X size={14} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <FieldLabel label="اسم الفرع">
                            <input className="form-input" value={branchForm.name}
                                onChange={e => setBranchForm({ ...branchForm, name: e.target.value })}
                                placeholder="أدخل اسم الفرع" />
                        </FieldLabel>
                        <FieldLabel label="العنوان">
                            <input className="form-input" value={branchForm.address}
                                onChange={e => setBranchForm({ ...branchForm, address: e.target.value })}
                                placeholder="أدخل عنوان الفرع" />
                        </FieldLabel>

                        {/* ═══ Place Search ═══ */}
                        <FieldLabel label="🔍 البحث عن مكان">
                            <div style={{ position: 'relative' }}>
                                <input
                                    className="form-input"
                                    value={placeQuery}
                                    onChange={e => handlePlaceSearch(e.target.value)}
                                    placeholder="ابحث عن مدينة، شارع، أو مكان..."
                                    style={{ paddingLeft: 36 }}
                                />
                                <MapPin size={15} style={{
                                    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                                    color: searchingPlace ? 'var(--accent-amber)' : 'var(--text-muted)',
                                    transition: 'color 200ms',
                                }} />
                                {/* Search results dropdown */}
                                {placeResults.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                        marginTop: 4, borderRadius: 'var(--radius-md)', overflow: 'hidden',
                                        background: 'var(--bg-card, #1a1a2e)', border: '1px solid var(--border-glass)',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                                        maxHeight: 220, overflowY: 'auto',
                                    }}>
                                        {placeResults.map((place, i) => (
                                            <button
                                                key={i}
                                                onClick={() => selectPlace(place)}
                                                style={{
                                                    width: '100%', padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 8,
                                                    background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-glass)',
                                                    color: 'inherit', cursor: 'pointer', textAlign: 'right',
                                                    transition: 'background 150ms',
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >
                                                <MapPin size={14} style={{ color: 'var(--accent-teal)', flexShrink: 0, marginTop: 2 }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2, lineHeight: 1.4 }}>
                                                        {place.display_name}
                                                    </div>
                                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)', direction: 'ltr' }}>
                                                        {parseFloat(place.lat).toFixed(4)}, {parseFloat(place.lon).toFixed(4)}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {searchingPlace && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                        marginTop: 4, padding: '12px', borderRadius: 'var(--radius-md)',
                                        background: 'var(--bg-card, #1a1a2e)', border: '1px solid var(--border-glass)',
                                        textAlign: 'center', fontSize: 12, color: 'var(--text-muted)',
                                    }}>
                                        جاري البحث...
                                    </div>
                                )}
                            </div>
                        </FieldLabel>

                        {/* ═══ Interactive Map ═══ */}
                        <FieldLabel label="📍 موقع الفرع على الخريطة (اضغط لتحديد الموقع)">
                            <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                                <iframe
                                    title="map"
                                    width="100%"
                                    height="250"
                                    style={{ border: 'none', display: 'block' }}
                                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${branchForm.longitude - 0.01},${branchForm.latitude - 0.008},${branchForm.longitude + 0.01},${branchForm.latitude + 0.008}&layer=mapnik&marker=${branchForm.latitude},${branchForm.longitude}`}
                                />
                                {/* Clickable overlay */}
                                <div
                                    ref={mapRef}
                                    onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const x = (e.clientX - rect.left) / rect.width;
                                        const y = (e.clientY - rect.top) / rect.height;
                                        const lng = (branchForm.longitude - 0.01) + x * 0.02;
                                        const lat = (branchForm.latitude + 0.008) - y * 0.016;
                                        handleMapClick(parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6)));
                                    }}
                                    style={{
                                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                        cursor: 'crosshair', zIndex: 10,
                                    }}
                                />
                            </div>
                        </FieldLabel>

                        {/* Lat/Lng fields */}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <FieldLabel label="خط العرض" flex>
                                <input className="form-input" type="number" step="0.0001"
                                    value={branchForm.latitude}
                                    onChange={e => setBranchForm({ ...branchForm, latitude: Number(e.target.value) })}
                                    style={{ fontFamily: 'var(--font-numeric)', direction: 'ltr' }} />
                            </FieldLabel>
                            <FieldLabel label="خط الطول" flex>
                                <input className="form-input" type="number" step="0.0001"
                                    value={branchForm.longitude}
                                    onChange={e => setBranchForm({ ...branchForm, longitude: Number(e.target.value) })}
                                    style={{ fontFamily: 'var(--font-numeric)', direction: 'ltr' }} />
                            </FieldLabel>
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <FieldLabel label="نطاق GPS (متر)" flex>
                                <input className="form-input" type="number" value={branchForm.radiusMeters}
                                    onChange={e => setBranchForm({ ...branchForm, radiusMeters: Number(e.target.value) })}
                                    style={{ fontFamily: 'var(--font-numeric)' }} />
                            </FieldLabel>
                            <FieldLabel label="الحالة" flex>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => setBranchForm({ ...branchForm, isActive: true })} style={{
                                        flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 700,
                                        background: branchForm.isActive ? 'var(--accent-emerald-soft)' : 'var(--bg-glass)',
                                        color: branchForm.isActive ? 'var(--accent-emerald)' : 'var(--text-muted)',
                                        border: `1px solid ${branchForm.isActive ? 'var(--accent-emerald)' : 'var(--border-glass)'}`,
                                    }}>نشط</button>
                                    <button onClick={() => setBranchForm({ ...branchForm, isActive: false })} style={{
                                        flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 700,
                                        background: !branchForm.isActive ? 'var(--accent-rose-soft)' : 'var(--bg-glass)',
                                        color: !branchForm.isActive ? 'var(--accent-rose)' : 'var(--text-muted)',
                                        border: `1px solid ${!branchForm.isActive ? 'var(--accent-rose)' : 'var(--border-glass)'}`,
                                    }}>متوقف</button>
                                </div>
                            </FieldLabel>
                        </div>
                        <button
                            onClick={formMode === 'edit-branch' ? handleEditBranch : handleAddBranch}
                            disabled={!branchForm.name.trim()}
                            style={{
                                width: '100%', padding: '13px', borderRadius: 'var(--radius-md)',
                                background: branchForm.name.trim()
                                    ? 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))'
                                    : 'var(--bg-glass-strong)',
                                color: branchForm.name.trim() ? 'white' : 'var(--text-muted)',
                                fontSize: 14, fontWeight: 700,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4,
                            }}
                        >
                            <Save size={16} />
                            {formMode === 'edit-branch' ? 'حفظ التعديلات' : 'إضافة الفرع'}
                        </button>
                    </div>
                </div>
            )}

            {/* Branch Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 80 }}>
                {branches.length === 0 && formMode === 'none' && (
                    <div className="glass-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <Building2 size={40} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 12px', opacity: 0.5 }} />
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            لا يوجد أفرع
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            اضغط + لإضافة فرع جديد
                        </div>
                    </div>
                )}

                {branches.map(branch => (
                    <div key={branch.id} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* Clickable branch area */}
                        <button
                            onClick={() => setSelectedBranch(branch.id)}
                            style={{
                                width: '100%', padding: '16px', display: 'flex', alignItems: 'center', gap: 12,
                                background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', textAlign: 'right',
                            }}
                        >
                            <div style={{
                                width: 46, height: 46, borderRadius: 'var(--radius-lg)',
                                background: branch.isActive
                                    ? 'linear-gradient(135deg, var(--accent-emerald-soft), rgba(20,184,166,0.1))'
                                    : 'var(--bg-glass-strong)',
                                color: branch.isActive ? 'var(--accent-emerald)' : 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: `1px solid ${branch.isActive ? 'rgba(16,185,129,0.2)' : 'var(--border-glass)'}`,
                                flexShrink: 0,
                            }}>
                                <Building2 size={22} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 15, fontWeight: 700 }}>{branch.name}</span>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                        fontSize: 9, fontWeight: 700,
                                        background: branch.isActive ? 'var(--accent-emerald-soft)' : 'var(--accent-rose-soft)',
                                        color: branch.isActive ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                    }}>{branch.isActive ? 'نشط' : 'متوقف'}</span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                                    {branch.address || 'بدون عنوان'}
                                </div>
                            </div>
                            <ArrowRight size={18} style={{ color: 'var(--text-muted)', transform: 'rotate(180deg)' }} />
                        </button>

                        {/* Info chips */}
                        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <InfoChip icon={<Users size={11} />} text={`${branch.employeeCount} موظف`} color="var(--accent-blue)" />
                            <InfoChip icon={<Navigation size={11} />} text={`${branch.radiusMeters} متر`} color="var(--accent-purple)" />
                            <InfoChip icon={<Layers size={11} />} text={`${branch.departments.length} قسم`} color="var(--accent-amber)" />
                            <InfoChip icon={<MapPin size={11} />} text={`${branch.latitude.toFixed(4)}, ${branch.longitude.toFixed(4)}`} color="var(--accent-teal)" numeric />
                        </div>

                        {/* Action bar */}
                        <div style={{
                            padding: '8px 16px', borderTop: '1px solid var(--border-glass)',
                            display: 'flex', justifyContent: 'flex-end', gap: 6,
                        }}>
                            <button onClick={(e) => { e.stopPropagation(); startEditBranch(branch); }} style={{
                                padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                                background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                                display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
                            }}><Edit3 size={12} /> تعديل</button>
                            <button onClick={(e) => {
                                e.stopPropagation();
                                deleteConfirm === branch.id ? handleDeleteBranch(branch.id) : setDeleteConfirm(branch.id);
                            }} style={{
                                padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                                background: deleteConfirm === branch.id ? 'var(--accent-rose)' : 'var(--accent-rose-soft)',
                                color: deleteConfirm === branch.id ? 'white' : 'var(--accent-rose)',
                                display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
                            }}><Trash2 size={12} /> {deleteConfirm === branch.id ? 'تأكيد الحذف' : 'حذف'}</button>
                        </div>
                    </div>
                ))}
            </div>

            {/* FAB - Add Branch */}
            {formMode === 'none' && (
                <button className="fab-btn" onClick={() => {
                    const defaultForm = { id: '', name: '', address: '', latitude: 33.3152, longitude: 44.3661, radiusMeters: 200, isActive: true };
                    setBranchForm(defaultForm);
                    setFormMode('add-branch');
                    // Auto-detect current location
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                            (pos) => {
                                setBranchForm(prev => ({
                                    ...prev,
                                    latitude: parseFloat(pos.coords.latitude.toFixed(6)),
                                    longitude: parseFloat(pos.coords.longitude.toFixed(6)),
                                }));
                            },
                            () => { /* user denied or error — keep Baghdad default */ }
                        );
                    }
                }}>
                    <Plus size={24} />
                </button>
            )}
        </div>
    );
}

// === Subcomponents ===
function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
    return (
        <div className="glass-card" style={{
            flex: 1, textAlign: 'center', padding: '14px 8px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        }}>
            <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: `${color}18`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{icon}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: 'var(--font-numeric)' }}>{value}</div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
        </div>
    );
}

function FieldLabel({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
    return (
        <div style={{ flex: flex ? 1 : undefined }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textAlign: 'center' }}>{label}</label>
            {children}
        </div>
    );
}

function InfoChip({ icon, text, color, numeric }: { icon: React.ReactNode; text: string; color: string; numeric?: boolean }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 'var(--radius-full)',
            fontSize: 10, fontWeight: 600, background: `${color}15`, color,
            fontFamily: numeric ? 'var(--font-numeric)' : undefined,
        }}>{icon}{text}</span>
    );
}
