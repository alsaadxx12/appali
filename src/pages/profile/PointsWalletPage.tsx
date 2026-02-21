import React, { useState, useEffect } from 'react';
import {
    ArrowRight, Star, DollarSign, Repeat,
    ArrowDownLeft, ArrowUpRight, Coins
} from 'lucide-react';
import { db } from '../../firebase';
import { collection, getDocs, doc, getDoc, addDoc, query, orderBy } from 'firebase/firestore';

interface Props {
    onBack: () => void;
    userId: string;
}

interface PointsTransaction {
    id: string;
    type: 'add' | 'deduct' | 'redeem';
    amount: number;
    reason: string;
    date: string;
}

export default function PointsWalletPage({ onBack, userId }: Props) {
    const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
    const [pointValue, setPointValue] = useState(100);
    const [minRedeem, setMinRedeem] = useState(50);
    const [loading, setLoading] = useState(true);
    const [showRedeem, setShowRedeem] = useState(false);
    const [redeemAmount, setRedeemAmount] = useState(0);
    const [redeemMsg, setRedeemMsg] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                const txSnap = await getDocs(
                    query(collection(db, 'users', userId, 'pointsTransactions'), orderBy('date', 'desc'))
                );
                const txs = txSnap.docs.map(d => ({ id: d.id, ...d.data() })) as PointsTransaction[];
                setTransactions(txs);

                const settingsSnap = await getDoc(doc(db, 'settings', 'points'));
                if (settingsSnap.exists()) {
                    const s = settingsSnap.data();
                    setPointValue(s.pointValue ?? 100);
                    setMinRedeem(s.minRedeemPoints ?? 50);
                }
            } catch (e) {
                console.error('Error loading points data:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [userId]);

    const balance = transactions.reduce((sum, t) => {
        if (t.type === 'add') return sum + t.amount;
        return sum - t.amount;
    }, 0);

    const totalAdded = transactions.filter(t => t.type === 'add').reduce((s, t) => s + t.amount, 0);
    const totalDeducted = transactions.filter(t => t.type !== 'add').reduce((s, t) => s + t.amount, 0);

    const handleRedeem = async () => {
        if (redeemAmount < minRedeem) {
            setRedeemMsg(`الحد الأدنى للاستبدال ${minRedeem} نقطة`);
            return;
        }
        if (redeemAmount > balance) {
            setRedeemMsg('الرصيد غير كافي');
            return;
        }
        try {
            const tx: Omit<PointsTransaction, 'id'> = {
                type: 'redeem',
                amount: redeemAmount,
                reason: 'استبدال نقاط',
                date: new Date().toISOString(),
            };
            const docRef = await addDoc(collection(db, 'users', userId, 'pointsTransactions'), tx);
            setTransactions([{ ...tx, id: docRef.id }, ...transactions]);
            setShowRedeem(false);
            setRedeemAmount(0);
            setRedeemMsg('');
        } catch (e) {
            console.error('Error redeeming points:', e);
            setRedeemMsg('حدث خطأ، حاول مرة أخرى');
        }
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
    };

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
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>محفظة النقاط</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>رصيد النقاط وكشف الحساب</p>
                </div>
            </div>

            {/* Balance Card */}
            <div className="glass-card" style={{
                marginBottom: 14, padding: '22px 16px', textAlign: 'center',
                background: 'linear-gradient(135deg, rgba(234,179,8,0.08), rgba(249,115,22,0.08))',
                border: '1px solid rgba(234,179,8,0.2)',
            }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>
                    رصيد النقاط
                </div>
                <div style={{
                    fontSize: 38, fontWeight: 900, fontFamily: 'var(--font-numeric)',
                    color: 'var(--accent-amber)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                    <Star size={26} />
                    {loading ? '...' : balance.toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)', marginTop: 2 }}>
                    ≈ {(balance * pointValue).toLocaleString()} د.ع
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                    <div style={{
                        flex: 1, padding: '8px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                    }}>
                        <div style={{ fontSize: 9, color: 'var(--accent-emerald)', fontWeight: 600, marginBottom: 2 }}>إجمالي المضاف</div>
                        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: 'var(--accent-emerald)' }}>
                            +{totalAdded.toLocaleString()}
                        </div>
                    </div>
                    <div style={{
                        flex: 1, padding: '8px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.2)',
                    }}>
                        <div style={{ fontSize: 9, color: 'var(--accent-rose)', fontWeight: 600, marginBottom: 2 }}>إجمالي المسحوب</div>
                        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-numeric)', color: 'var(--accent-rose)' }}>
                            -{totalDeducted.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Redeem Button */}
                <button onClick={() => setShowRedeem(!showRedeem)} style={{
                    marginTop: 14, width: '100%', padding: '11px', borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))',
                    color: 'white', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                    <Repeat size={16} /> استبدال النقاط
                </button>
            </div>

            {/* Redeem Panel */}
            {showRedeem && (
                <div className="glass-card" style={{ marginBottom: 14, padding: '16px' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>استبدال النقاط</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textAlign: 'center' }}>
                        الحد الأدنى: {minRedeem} نقطة • المتاح: {balance} نقطة
                    </div>
                    <input type="number" className="form-input" value={redeemAmount || ''}
                        onChange={e => setRedeemAmount(Number(e.target.value))}
                        placeholder="عدد النقاط" style={{
                            textAlign: 'center', fontSize: 18, fontWeight: 800,
                            fontFamily: 'var(--font-numeric)', marginBottom: 6,
                        }} />
                    {redeemAmount > 0 && (
                        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--accent-emerald)', fontWeight: 700, marginBottom: 8 }}>
                            = {(redeemAmount * pointValue).toLocaleString()} د.ع
                        </div>
                    )}
                    {redeemMsg && (
                        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--accent-rose)', fontWeight: 600, marginBottom: 6 }}>
                            {redeemMsg}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleRedeem} style={{
                            flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                            background: 'var(--accent-emerald)', color: 'white', fontSize: 13, fontWeight: 700,
                        }}>تأكيد الاستبدال</button>
                        <button onClick={() => { setShowRedeem(false); setRedeemMsg(''); }} style={{
                            flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-glass-strong)', color: 'var(--text-secondary)',
                            fontSize: 13, fontWeight: 700, border: '1px solid var(--border-glass)',
                        }}>إلغاء</button>
                    </div>
                </div>
            )}

            {/* Transaction Statement */}
            <h3 className="section-title" style={{ fontSize: 14 }}>
                <DollarSign size={16} /> كشف حساب النقاط
            </h3>
            <div className="glass-card" style={{ marginBottom: 16 }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: 12 }}>جاري التحميل...</div>
                ) : transactions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                        <Coins size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', display: 'block' }} />
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>لا توجد حركات نقاط بعد</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>ستظهر حركات النقاط هنا عند إضافتها</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {transactions.map((tx, i) => (
                            <div key={tx.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 0',
                                borderBottom: i < transactions.length - 1 ? '1px solid var(--border-glass)' : 'none',
                            }}>
                                <div style={{
                                    width: 34, height: 34, borderRadius: 'var(--radius-md)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    background: tx.type === 'add' ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
                                    color: tx.type === 'add' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                }}>
                                    {tx.type === 'add' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {tx.reason}
                                    </div>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>
                                        {formatDate(tx.date)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{
                                        fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-numeric)',
                                        color: tx.type === 'add' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                    }}>
                                        {tx.type === 'add' ? '+' : '-'}{tx.amount}
                                    </div>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-numeric)' }}>
                                        {(tx.amount * pointValue).toLocaleString()} د.ع
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
