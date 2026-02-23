import React, { useState, useEffect } from 'react';
import {
    ArrowRight, UserPlus, Trash2, Edit3, Save, X,
    Search, Building2, Clock, Shield, DollarSign, Users,
    Key, Eye, Plus, Check, Lock, Unlock, ChevronDown, ChevronUp, ToggleLeft, ToggleRight,
    FolderOpen, FileText, Paperclip, Crown, UserCog
} from 'lucide-react';
import { AVATAR_COLORS } from '../../data/demoData';
import { db } from '../../firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, setDoc, query, where } from 'firebase/firestore';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
    onBack: () => void;
}

interface Permission {
    id: string;
    label: string;
    category: string;
}

interface PermissionGroup {
    id: string;
    name: string;
    color: string;
    permissions: string[]; // permission IDs
    description: string;
}

interface Employee {
    id: string;
    name: string;
    department: string;
    branch: string;
    role: 'employee' | 'admin';
    salary: number;
    shiftStart: string;
    shiftEnd: string;
    phone: string;
    permissionGroupId: string;
    maritalStatus: 'أعزب' | 'متزوج';
    isActive?: boolean;
}

// ====== Permission Categories ======
const PERMISSION_CATEGORIES = [
    { id: 'attendance', label: 'الحضور والانصراف', icon: '🕐', color: 'var(--accent-blue)' },
    { id: 'admin', label: 'لوحة الإدارة', icon: '🛡️', color: 'var(--accent-purple)' },
    { id: 'salary', label: 'الرواتب', icon: '💰', color: 'var(--accent-emerald)' },
    { id: 'vip', label: 'نظام VIP', icon: '👑', color: '#ffd700' },
    { id: 'employees', label: 'إدارة الموظفين', icon: '👥', color: 'var(--accent-teal)' },
    { id: 'branches', label: 'الفروع والأقسام', icon: '🏢', color: 'var(--accent-amber)' },
    { id: 'notifications', label: 'الإشعارات', icon: '🔔', color: '#06b6d4' },
    { id: 'points', label: 'إعدادات النقاط', icon: '⭐', color: '#f97316' },
    { id: 'documents', label: 'إدارة الملفات', icon: '📂', color: '#a855f7' },
    { id: 'reports', label: 'التقارير', icon: '📊', color: 'var(--accent-rose)' },
];

const ALL_PERMISSIONS: Permission[] = [
    // Attendance
    { id: 'attendance.view', label: 'عرض سجل الحضور', category: 'attendance' },
    { id: 'attendance.checkin', label: 'تسجيل البصمة', category: 'attendance' },
    { id: 'attendance.edit', label: 'تعديل سجلات الحضور', category: 'attendance' },
    { id: 'attendance.export', label: 'تصدير البصمات', category: 'attendance' },
    // Admin
    { id: 'admin.access', label: 'دخول لوحة الإدارة', category: 'admin' },
    { id: 'admin.dashboard', label: 'عرض الإحصائيات', category: 'admin' },
    { id: 'admin.settings', label: 'تعديل الإعدادات', category: 'admin' },
    // Salary
    { id: 'salary.view_own', label: 'عرض الراتب الشخصي', category: 'salary' },
    { id: 'salary.view_all', label: 'عرض رواتب الجميع', category: 'salary' },
    { id: 'salary.edit', label: 'تعديل الرواتب', category: 'salary' },
    { id: 'salary.advance', label: 'طلب سلفة', category: 'salary' },
    // VIP
    { id: 'vip.view', label: 'عرض صفحة VIP', category: 'vip' },
    { id: 'vip.manage', label: 'إدارة نقاط VIP', category: 'vip' },
    { id: 'vip.settings', label: 'إعدادات VIP', category: 'vip' },
    // Employees
    { id: 'employees.view', label: 'عرض قائمة الموظفين', category: 'employees' },
    { id: 'employees.add', label: 'إضافة موظفين', category: 'employees' },
    { id: 'employees.edit', label: 'تعديل بيانات الموظفين', category: 'employees' },
    { id: 'employees.delete', label: 'حذف الموظفين', category: 'employees' },
    { id: 'employees.permissions', label: 'إدارة الصلاحيات', category: 'employees' },
    // Branches
    { id: 'branches.view', label: 'عرض الفروع', category: 'branches' },
    { id: 'branches.add', label: 'إضافة فروع', category: 'branches' },
    { id: 'branches.edit', label: 'تعديل الفروع', category: 'branches' },
    { id: 'branches.delete', label: 'حذف الفروع', category: 'branches' },
    { id: 'branches.departments', label: 'إدارة الأقسام', category: 'branches' },
    // Notifications
    { id: 'notifications.view', label: 'عرض الإشعارات', category: 'notifications' },
    { id: 'notifications.send', label: 'إرسال إشعارات', category: 'notifications' },
    { id: 'notifications.manage', label: 'إدارة الإشعارات', category: 'notifications' },
    { id: 'notifications.settings', label: 'إعدادات الإشعارات', category: 'notifications' },
    // Points Settings
    { id: 'points.view', label: 'عرض إعدادات النقاط', category: 'points' },
    { id: 'points.edit', label: 'تعديل قيم النقاط', category: 'points' },
    { id: 'points.levels', label: 'تعديل حدود المستويات', category: 'points' },
    { id: 'points.reset', label: 'إعادة تعيين النقاط', category: 'points' },
    // Documents
    { id: 'documents.view', label: 'عرض مستمسكات الموظفين', category: 'documents' },
    { id: 'documents.upload', label: 'رفع المستمسكات', category: 'documents' },
    { id: 'documents.delete', label: 'حذف المستمسكات', category: 'documents' },
    { id: 'documents.manage', label: 'إدارة ملفات الموظفين', category: 'documents' },
    // Reports
    { id: 'reports.attendance', label: 'تقارير الحضور', category: 'reports' },
    { id: 'reports.salary', label: 'تقارير الرواتب', category: 'reports' },
    { id: 'reports.export', label: 'تصدير التقارير', category: 'reports' },
];

const GROUP_COLORS = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#6366f1',
];

const DEFAULT_GROUPS: PermissionGroup[] = [];

const DEMO_EMPLOYEES: Employee[] = [];


type PageTab = 'employees' | 'permissions' | 'files';

interface EmployeeDocument {
    id: string;
    name: string;
    type: string;
    size: string;
    date: string;
    category: string;
}

const DOC_CATEGORIES_MAP: Record<string, { label: string; icon: string; color: string }> = {
    national_id: { label: 'الهوية الشخصية', icon: '🪪', color: '#3b82f6' },
    passport: { label: 'جواز السفر', icon: '🛂', color: '#8b5cf6' },
    photo: { label: 'صورة شخصية', icon: '📷', color: '#ec4899' },
    contract: { label: 'عقد العمل', icon: '📋', color: '#10b981' },
    residence: { label: 'بطاقة السكن', icon: '🏠', color: '#f59e0b' },
};

const DEMO_EMPLOYEE_DOCS: Record<string, EmployeeDocument[]> = {};

export default function EmployeeManagementPage({ onBack }: Props) {
    const [activeTab, setActiveTab] = useState<PageTab>('employees');

    // === Employees State ===
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);

    // Dynamic branches & departments from Firestore
    const [branchList, setBranchList] = useState<{ id: string; name: string; departments: { name: string }[] }[]>([]);
    const branchNames = branchList.map(b => b.name);
    const getDepartmentsForBranch = (branchName: string) => {
        const branch = branchList.find(b => b.name === branchName);
        return branch ? branch.departments.map(d => d.name) : [];
    };
    const allDepartmentNames = [...new Set(branchList.flatMap(b => b.departments.map(d => d.name)))];
    const [searchQuery, setSearchQuery] = useState('');

    // Load employees from Firestore
    useEffect(() => {
        const loadEmployees = async () => {
            try {
                const snap = await getDocs(collection(db, 'users'));
                const loaded: Employee[] = snap.docs.map(doc => {
                    const d = doc.data();
                    return {
                        id: doc.id,
                        name: d.name || 'بدون اسم',
                        department: d.department || 'غير محدد',
                        branch: d.branch || 'المقر الرئيسي',
                        role: d.role === 'admin' ? 'admin' : 'employee',
                        salary: d.salary || 0,
                        shiftStart: d.shiftStart || '08:00',
                        shiftEnd: d.shiftEnd || '16:00',
                        phone: d.phone || '',
                        permissionGroupId: d.permissionGroupId || '',
                        maritalStatus: d.maritalStatus || 'أعزب',
                        isActive: d.isActive !== false,
                    };
                });
                setEmployees(loaded);
            } catch (e) {
                console.error('Error loading employees:', e);
            } finally {
                setLoading(false);
            }
        };
        loadEmployees();

        // Load branches for dropdowns
        const loadBranches = async () => {
            try {
                const snap = await getDocs(collection(db, 'branches'));
                const loaded = snap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: d.id,
                        name: data.name || '',
                        departments: data.departments || [],
                    };
                });
                setBranchList(loaded);
            } catch (e) {
                console.error('Error loading branches:', e);
            }
        };
        loadBranches();
    }, []);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [isDeptManager, setIsDeptManager] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [deleteInfo, setDeleteInfo] = useState<{
        empId: string;
        loading: boolean;
        isManager: string | null;
        attendanceCount: number;
        leaveCount: number;
        checked: boolean;
    } | null>(null);

    const emptyEmployee: Employee = {
        id: '', name: '', department: '', branch: '',
        role: 'employee', salary: 1000000, shiftStart: '08:00', shiftEnd: '16:00', phone: '',
        permissionGroupId: 'grp-employee', maritalStatus: 'أعزب',
    };
    const [formData, setFormData] = useState<Employee>(emptyEmployee);

    // Helper: check if an employee is currently a department manager
    const isEmployeeDeptManager = (emp: Employee): string | null => {
        const branch = branchList.find(b => b.name === emp.branch);
        if (!branch) return null;
        const dept = branch.departments.find((d: any) => d.name === emp.department && d.manager === emp.name);
        return dept ? dept.name : null;
    };

    // Helper: update department manager in Firestore
    const updateDeptManager = async (branchName: string, deptName: string, managerName: string) => {
        const branch = branchList.find(b => b.name === branchName);
        if (!branch || !deptName) return;
        const updatedDepts = branch.departments.map((d: any) =>
            d.name === deptName ? { ...d, manager: managerName } : d
        );
        try {
            await updateDoc(doc(db, 'branches', branch.id), { departments: updatedDepts });
            setBranchList(prev => prev.map(b =>
                b.id === branch.id ? { ...b, departments: updatedDepts } : b
            ));
        } catch (e) {
            console.error('Error updating department manager:', e);
        }
    };

    // Helper: clear manager from a department
    const clearDeptManager = async (branchName: string, deptName: string) => {
        await updateDeptManager(branchName, deptName, 'غير محدد');
    };

    // === Permissions State ===
    const [permGroups, setPermGroups] = useState<PermissionGroup[]>(DEFAULT_GROUPS);
    const [editingGroup, setEditingGroup] = useState<PermissionGroup | null>(null);
    const [showGroupForm, setShowGroupForm] = useState(false);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

    const emptyGroup: PermissionGroup = {
        id: '', name: '', color: GROUP_COLORS[0], permissions: [], description: '',
    };
    const [groupForm, setGroupForm] = useState<PermissionGroup>(emptyGroup);
    const [deleteGroupConfirm, setDeleteGroupConfirm] = useState<string | null>(null);

    const filteredEmployees = employees.filter(emp =>
        emp.name.includes(searchQuery) || emp.department.includes(searchQuery) || emp.id.includes(searchQuery)
    );

    const formatCurrency = (amount: number) => amount.toLocaleString('en-US') + ' د.ع';

    const formatSalaryInput = (val: string) => {
        const num = parseInt(val.replace(/,/g, ''), 10);
        return isNaN(num) ? 0 : num;
    };

    // === Employee Handlers ===
    const handleAdd = async () => {
        const newId = `EMP-${Date.now()}`;
        const newEmp = { ...formData, id: newId, isActive: true };
        try {
            await setDoc(doc(db, 'users', newId), {
                name: newEmp.name,
                department: newEmp.department,
                branch: newEmp.branch,
                role: newEmp.role,
                salary: newEmp.salary,
                shiftStart: newEmp.shiftStart,
                shiftEnd: newEmp.shiftEnd,
                phone: newEmp.phone,
                permissionGroupId: newEmp.permissionGroupId,
                maritalStatus: newEmp.maritalStatus,
                isActive: true,
                createdAt: new Date().toISOString(),
            });
            // Set as department manager if toggle is on
            if (isDeptManager && newEmp.department && newEmp.branch) {
                await updateDeptManager(newEmp.branch, newEmp.department, newEmp.name);
            }
            setEmployees([...employees, newEmp]);
            setShowAddForm(false);
            setFormData(emptyEmployee);
            setIsDeptManager(false);
        } catch (e) {
            console.error('Error adding employee:', e);
        }
    };

    // Check employee dependencies before delete
    const checkEmployeeDependencies = async (emp: Employee) => {
        setDeleteInfo({ empId: emp.id, loading: true, isManager: null, attendanceCount: 0, leaveCount: 0, checked: false });
        setDeleteConfirm(emp.id);
        try {
            // 1. Is department manager?
            const mgrDept = isEmployeeDeptManager(emp);

            // 2. Has attendance records?
            let attCount = 0;
            try {
                const attQ = query(collection(db, 'attendance'), where('userId', '==', emp.id));
                const attSnap = await getDocs(attQ);
                attCount = attSnap.size;
            } catch { /* no permission or no collection */ }

            // 3. Has leave records?
            let lvCount = 0;
            try {
                const lvQ = query(collection(db, 'leaves'), where('userId', '==', emp.id));
                const lvSnap = await getDocs(lvQ);
                lvCount = lvSnap.size;
            } catch { /* no permission or no collection */ }

            setDeleteInfo({ empId: emp.id, loading: false, isManager: mgrDept, attendanceCount: attCount, leaveCount: lvCount, checked: true });
        } catch (e) {
            console.error('Error checking dependencies:', e);
            setDeleteInfo({ empId: emp.id, loading: false, isManager: null, attendanceCount: 0, leaveCount: 0, checked: true });
        }
    };

    const handleDelete = async (id: string) => {
        const emp = employees.find(e => e.id === id);
        if (!emp) return;

        // Block if department manager
        if (deleteInfo?.isManager) {
            return; // UI already shows the block message
        }

        setSaving(true);
        try {
            // Clear manager reference if needed
            const mgrDept = isEmployeeDeptManager(emp);
            if (mgrDept) {
                await clearDeptManager(emp.branch, emp.department);
            }
            await deleteDoc(doc(db, 'users', id));
            setEmployees(employees.filter(e => e.id !== id));
            setSaveMessage({ type: 'success', text: `تم حذف الموظف ${emp.name} بنجاح` });
        } catch (e) {
            console.error('Error deleting employee:', e);
            setSaveMessage({ type: 'error', text: 'فشل حذف الموظف — تحقق من الاتصال' });
        } finally {
            setSaving(false);
        }
        setDeleteConfirm(null);
        setDeleteInfo(null);
        setTimeout(() => setSaveMessage(null), 3000);
    };

    const handleToggleActive = async (emp: Employee) => {
        const newStatus = emp.isActive === false ? true : false;
        try {
            await setDoc(doc(db, 'users', emp.id), { isActive: newStatus, updatedAt: new Date().toISOString() }, { merge: true });
            setEmployees(employees.map(e => e.id === emp.id ? { ...e, isActive: newStatus } : e));
        } catch (e) {
            console.error('Error toggling employee status:', e);
        }
    };

    const handleSaveEdit = async () => {
        if (saving) return; // Prevent double submit
        setSaving(true);
        setSaveMessage(null);
        try {
            // Find original employee to detect department/branch changes
            const origEmp = employees.find(e => e.id === formData.id);

            await setDoc(doc(db, 'users', formData.id), {
                name: formData.name,
                department: formData.department,
                branch: formData.branch,
                role: formData.role,
                salary: formData.salary,
                shiftStart: formData.shiftStart,
                shiftEnd: formData.shiftEnd,
                phone: formData.phone,
                permissionGroupId: formData.permissionGroupId,
                maritalStatus: formData.maritalStatus,
                updatedAt: new Date().toISOString(),
            }, { merge: true });

            // Handle department manager assignment
            if (isDeptManager && formData.department && formData.branch) {
                // If employee was previously manager of a different dept, clear it
                if (origEmp && (origEmp.department !== formData.department || origEmp.branch !== formData.branch)) {
                    const wasMgr = isEmployeeDeptManager(origEmp);
                    if (wasMgr) {
                        await clearDeptManager(origEmp.branch, origEmp.department);
                    }
                }
                await updateDeptManager(formData.branch, formData.department, formData.name);
            } else if (!isDeptManager && origEmp) {
                // Toggle turned off — clear manager if they were one
                const wasMgr = isEmployeeDeptManager(origEmp);
                if (wasMgr) {
                    await clearDeptManager(origEmp.branch, origEmp.department);
                }
            }

            setEmployees(employees.map(e => e.id === formData.id ? formData : e));
            setEditingId(null);
            setFormData(emptyEmployee);
            setIsDeptManager(false);
            setSaveMessage({ type: 'success', text: 'تم حفظ بيانات الموظف بنجاح ✅' });
            setTimeout(() => setSaveMessage(null), 3000);
        } catch (e) {
            console.error('Error saving employee:', e);
            const errMsg = e instanceof Error ? e.message : String(e);
            setSaveMessage({ type: 'error', text: `فشل حفظ البيانات: ${errMsg.includes('permission') ? 'صلاحيات غير كافية' : 'تأكد من الاتصال بالإنترنت'}` });
            setTimeout(() => setSaveMessage(null), 5000);
        } finally {
            setSaving(false);
        }
    };

    const startEdit = (emp: Employee) => {
        setFormData({ ...emp });
        setEditingId(emp.id);
        setShowAddForm(false);
        // Check if employee is currently a department manager
        setIsDeptManager(!!isEmployeeDeptManager(emp));
    };

    // === Permission Group Handlers ===
    const handleAddGroup = () => {
        const newGroup = { ...groupForm, id: `grp-${Date.now()}` };
        setPermGroups([...permGroups, newGroup]);
        setShowGroupForm(false);
        setGroupForm(emptyGroup);
    };

    const handleSaveGroup = () => {
        setPermGroups(permGroups.map(g => g.id === groupForm.id ? groupForm : g));
        setEditingGroup(null);
        setGroupForm(emptyGroup);
    };

    const handleDeleteGroup = (id: string) => {
        // Move employees in deleted group to 'grp-employee'
        setEmployees(employees.map(e => e.permissionGroupId === id ? { ...e, permissionGroupId: 'grp-employee' } : e));
        setPermGroups(permGroups.filter(g => g.id !== id));
        setDeleteGroupConfirm(null);
    };

    const startEditGroup = (group: PermissionGroup) => {
        setGroupForm({ ...group });
        setEditingGroup(group);
        setShowGroupForm(false);
    };

    const togglePermission = (permId: string) => {
        const has = groupForm.permissions.includes(permId);
        setGroupForm({
            ...groupForm,
            permissions: has
                ? groupForm.permissions.filter(p => p !== permId)
                : [...groupForm.permissions, permId],
        });
    };

    const toggleCategory = (catId: string) => {
        const catPerms = ALL_PERMISSIONS.filter(p => p.category === catId).map(p => p.id);
        const allSelected = catPerms.every(p => groupForm.permissions.includes(p));
        if (allSelected) {
            setGroupForm({ ...groupForm, permissions: groupForm.permissions.filter(p => !catPerms.includes(p)) });
        } else {
            const newPerms = [...new Set([...groupForm.permissions, ...catPerms])];
            setGroupForm({ ...groupForm, permissions: newPerms });
        }
    };

    const getGroupById = (id: string) => permGroups.find(g => g.id === id);
    const employeesInGroup = (groupId: string) => employees.filter(e => e.permissionGroupId === groupId).length;

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
                    <h2 style={{ fontSize: 18, fontWeight: 800 }}>إدارة الموظفين</h2>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>الموظفين والصلاحيات</p>
                </div>
            </div>

            {/* Tab Switcher — Premium Pill Design */}
            <div style={{
                display: 'flex', gap: 0, padding: 3,
                marginBottom: 18, borderRadius: 16,
                background: 'rgba(15,23,42,0.6)',
                border: '1px solid var(--border-glass)',
                boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.15)',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {[
                    { id: 'employees' as PageTab, label: 'الموظفين', icon: <Users size={13} />, gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)' },
                    { id: 'permissions' as PageTab, label: 'الصلاحيات', icon: <Key size={13} />, gradient: 'linear-gradient(135deg, #8b5cf6, #6366f1)' },
                    { id: 'files' as PageTab, label: 'الملفات', icon: <FolderOpen size={13} />, gradient: 'linear-gradient(135deg, #ec4899, #a855f7)' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            flex: 1, padding: '9px 8px',
                            borderRadius: 13,
                            fontSize: 11, fontWeight: 800,
                            letterSpacing: '0.02em',
                            background: activeTab === tab.id ? tab.gradient : 'transparent',
                            color: activeTab === tab.id ? 'white' : 'var(--text-muted)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                            transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: activeTab === tab.id ? 'scale(1)' : 'scale(0.97)',
                            boxShadow: activeTab === tab.id ? '0 4px 15px rgba(0,0,0,0.25)' : 'none',
                            border: 'none',
                            cursor: 'pointer',
                            position: 'relative',
                            zIndex: activeTab === tab.id ? 2 : 1,
                        }}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ========== EMPLOYEES TAB ========== */}
            {activeTab === 'employees' && (
                <>
                    {/* Search */}
                    <div style={{ position: 'relative', marginBottom: 14 }}>
                        <Search size={16} style={{
                            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                        }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="ابحث عن موظف..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ paddingRight: 38, textAlign: 'right' }}
                        />
                    </div>

                    {/* Stats — Premium Cards */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <div style={{
                            flex: 1, padding: '14px 10px', borderRadius: 14,
                            background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(6,182,212,0.04))',
                            border: '1px solid rgba(59,130,246,0.12)',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-blue)', fontFamily: 'var(--font-numeric)' }}>{employees.length}</div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>إجمالي</div>
                        </div>
                        <div style={{
                            flex: 1, padding: '14px 10px', borderRadius: 14,
                            background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.04))',
                            border: '1px solid rgba(139,92,246,0.12)',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: '#8b5cf6', fontFamily: 'var(--font-numeric)' }}>{employees.filter(e => e.role === 'admin').length}</div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>مشرف</div>
                        </div>
                        <div style={{
                            flex: 1, padding: '14px 10px', borderRadius: 14,
                            background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(20,184,166,0.04))',
                            border: '1px solid rgba(16,185,129,0.12)',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--accent-emerald)', fontFamily: 'var(--font-numeric)' }}>{employees.filter(e => e.role === 'employee').length}</div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginTop: 2 }}>موظف</div>
                        </div>
                    </div>

                    {/* Add/Edit Form */}
                    {(showAddForm || editingId) && (
                        <div className="glass-card" style={{ marginBottom: 16, padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700 }}>
                                    {editingId ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}
                                </h3>
                                <button onClick={() => { setShowAddForm(false); setEditingId(null); }} style={{
                                    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                                    background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <X size={14} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <FormField label="الاسم الكامل">
                                    <input className="form-input" value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="أدخل اسم الموظف" />
                                </FormField>

                                <FormField label="رقم الهاتف">
                                    <input className="form-input" value={formData.phone}
                                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                        placeholder="07XXXXXXXXX" style={{ fontFamily: 'var(--font-numeric)' }} />
                                </FormField>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <FormField label="الفرع" flex>
                                        <select className="form-input" value={formData.branch}
                                            onChange={e => {
                                                const newBranch = e.target.value;
                                                const depts = getDepartmentsForBranch(newBranch);
                                                setFormData({ ...formData, branch: newBranch, department: depts[0] || '' });
                                            }}>
                                            <option value="">اختر الفرع</option>
                                            {branchNames.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </FormField>
                                    <FormField label="القسم" flex>
                                        <select className="form-input" value={formData.department}
                                            onChange={e => setFormData({ ...formData, department: e.target.value })}>
                                            <option value="">اختر القسم</option>
                                            {(formData.branch ? getDepartmentsForBranch(formData.branch) : allDepartmentNames).map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </FormField>
                                </div>

                                {/* Salary with formatting */}
                                <FormField label="الراتب الاسمي (د.ع)">
                                    <input
                                        className="form-input salary-input"
                                        value={formData.salary.toLocaleString('en-US')}
                                        onChange={e => setFormData({ ...formData, salary: formatSalaryInput(e.target.value) })}
                                    />
                                </FormField>

                                <div style={{ display: 'flex', gap: 8 }}>
                                    <FormField label="وقت الحضور" flex>
                                        <input className="form-input" type="time" value={formData.shiftStart}
                                            onChange={e => setFormData({ ...formData, shiftStart: e.target.value })}
                                            style={{ fontFamily: 'var(--font-numeric)' }} />
                                    </FormField>
                                    <FormField label="وقت الانصراف" flex>
                                        <input className="form-input" type="time" value={formData.shiftEnd}
                                            onChange={e => setFormData({ ...formData, shiftEnd: e.target.value })}
                                            style={{ fontFamily: 'var(--font-numeric)' }} />
                                    </FormField>
                                </div>

                                <FormField label="الحالة الزوجية">
                                    <select className="form-input" value={formData.maritalStatus}
                                        onChange={e => setFormData({ ...formData, maritalStatus: e.target.value as Employee['maritalStatus'] })}>
                                        <option value="أعزب">أعزب</option>
                                        <option value="متزوج">متزوج</option>
                                    </select>
                                </FormField>

                                {/* Permission Group Selection */}
                                <FormField label="مجموعة الصلاحيات">
                                    <select className="form-input" value={formData.permissionGroupId}
                                        onChange={e => setFormData({ ...formData, permissionGroupId: e.target.value })}>
                                        {permGroups.map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </FormField>

                                {/* Department Manager Toggle */}
                                {formData.department && formData.branch && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 12px', borderRadius: 'var(--radius-md)',
                                        background: isDeptManager ? 'rgba(245,158,11,0.06)' : 'var(--bg-glass)',
                                        border: `1px solid ${isDeptManager ? 'rgba(245,158,11,0.25)' : 'var(--border-glass)'}`,
                                        transition: 'all 200ms ease',
                                    }}>
                                        <div style={{
                                            width: 34, height: 34, borderRadius: 'var(--radius-sm)',
                                            background: isDeptManager ? 'rgba(245,158,11,0.15)' : 'var(--bg-glass-strong)',
                                            color: isDeptManager ? 'var(--accent-amber)' : 'var(--text-muted)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                        }}>
                                            <Crown size={16} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: isDeptManager ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>
                                                تعيين كمدير قسم
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                                                مدير قسم {formData.department}
                                            </div>
                                        </div>
                                        <button onClick={() => setIsDeptManager(!isDeptManager)} style={{
                                            width: 46, height: 26, borderRadius: 13, padding: 2,
                                            background: isDeptManager ? 'var(--accent-amber)' : 'var(--bg-glass-strong)',
                                            border: `1px solid ${isDeptManager ? 'transparent' : 'var(--border-glass)'}`,
                                            cursor: 'pointer', position: 'relative', transition: 'all 250ms ease',
                                        }}>
                                            <div style={{
                                                width: 20, height: 20, borderRadius: '50%',
                                                background: 'white', transition: 'all 250ms ease',
                                                transform: isDeptManager ? 'translateX(0px)' : 'translateX(20px)',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                                            }} />
                                        </button>
                                    </div>
                                )}

                                <button
                                    onClick={editingId ? handleSaveEdit : handleAdd}
                                    disabled={!formData.name.trim() || saving}
                                    style={{
                                        width: '100%', padding: '13px', borderRadius: 'var(--radius-md)',
                                        background: (!formData.name.trim() || saving)
                                            ? 'var(--bg-glass-strong)'
                                            : 'linear-gradient(135deg, var(--accent-emerald), var(--accent-teal))',
                                        color: (!formData.name.trim() || saving) ? 'var(--text-muted)' : 'white',
                                        fontSize: 14, fontWeight: 700,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        marginTop: 4, transition: 'all 200ms ease',
                                        opacity: saving ? 0.7 : 1,
                                    }}
                                >
                                    {saving ? (
                                        <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> جاري الحفظ...</>
                                    ) : (
                                        <><Save size={16} /> {editingId ? 'حفظ التعديلات' : 'إضافة الموظف'}</>
                                    )}
                                </button>

                                {/* Save feedback message */}
                                {saveMessage && (
                                    <div style={{
                                        marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                        background: saveMessage.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
                                        border: `1px solid ${saveMessage.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`,
                                        color: saveMessage.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                        fontSize: 12, fontWeight: 600, textAlign: 'center',
                                        animation: 'fadeIn 300ms ease',
                                    }}>
                                        {saveMessage.text}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Employee List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 80 }}>
                        {filteredEmployees.map((emp, idx) => {
                            const initials = emp.name.split(' ').map(w => w[0]).join('').slice(0, 2);
                            const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                            const isDeleting = deleteConfirm === emp.id;
                            const group = getGroupById(emp.permissionGroupId);
                            const isInactive = emp.isActive === false;

                            return (
                                <div key={emp.id} style={{
                                    borderRadius: 'var(--radius-xl)',
                                    background: 'var(--bg-card)',
                                    border: `1px solid ${isInactive ? 'rgba(244,63,94,0.15)' : 'var(--border-glass)'}`,
                                    overflow: 'hidden',
                                    transition: 'all 300ms ease',
                                    opacity: isInactive ? 0.6 : 1,
                                    boxShadow: isInactive ? 'none' : '0 2px 12px rgba(0,0,0,0.08)',
                                }}>
                                    {/* Top row: Avatar + Name + Actions */}
                                    <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                        {/* Avatar with gradient ring */}
                                        <div style={{
                                            width: 50, height: 50, borderRadius: '50%',
                                            background: `linear-gradient(135deg, ${color}, ${color}88)`,
                                            padding: 2.5, flexShrink: 0,
                                            boxShadow: `0 4px 14px ${color}40`,
                                        }}>
                                            <div style={{
                                                width: '100%', height: '100%', borderRadius: '50%',
                                                background: 'var(--bg-card)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <span style={{
                                                    fontSize: 16, fontWeight: 800,
                                                    background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                                }}>{initials}</span>
                                            </div>
                                        </div>
                                        {/* Name + Badges */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                                                <span style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</span>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                                    fontSize: 9, fontWeight: 700,
                                                    background: emp.role === 'admin'
                                                        ? 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(168,85,247,0.1))'
                                                        : 'rgba(59,130,246,0.1)',
                                                    color: emp.role === 'admin' ? '#a855f7' : 'var(--accent-blue)',
                                                    border: `1px solid ${emp.role === 'admin' ? 'rgba(139,92,246,0.2)' : 'rgba(59,130,246,0.15)'}`,
                                                }}>
                                                    {emp.role === 'admin' ? '⭐ مشرف' : 'موظف'}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                                {isEmployeeDeptManager(emp) && (
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                                        fontSize: 9, fontWeight: 700,
                                                        background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(234,88,12,0.08))',
                                                        color: 'var(--accent-amber)',
                                                        border: '1px solid rgba(245,158,11,0.2)',
                                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                                    }}>
                                                        <Crown size={9} /> مدير قسم
                                                    </span>
                                                )}
                                                {isInactive && (
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                                        fontSize: 9, fontWeight: 700,
                                                        background: 'rgba(244,63,94,0.08)',
                                                        color: 'var(--accent-rose)',
                                                        border: '1px solid rgba(244,63,94,0.15)',
                                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                                    }}>
                                                        ⛔ معطل
                                                    </span>
                                                )}
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{emp.department}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Info Grid */}
                                    <div style={{
                                        margin: '0 16px', padding: '10px 12px',
                                        borderRadius: 'var(--radius-lg)',
                                        background: 'var(--bg-glass)',
                                        border: '1px solid var(--border-glass)',
                                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <DollarSign size={12} style={{ color: 'var(--accent-emerald)', flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>الراتب</span>
                                            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-numeric)', marginRight: 'auto', direction: 'ltr' }}>{formatCurrency(emp.salary)}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Building2 size={12} style={{ color: 'var(--accent-teal)', flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>الفرع</span>
                                            <span style={{ fontSize: 11, fontWeight: 700, marginRight: 'auto' }}>{emp.branch || '—'}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <Clock size={12} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>الدوام</span>
                                            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-numeric)', marginRight: 'auto', direction: 'ltr' }}>{emp.shiftStart} - {emp.shiftEnd}</span>
                                        </div>
                                        {group && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Key size={12} style={{ color: group.color, flexShrink: 0 }} />
                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>المجموعة</span>
                                                <span style={{ fontSize: 11, fontWeight: 700, color: group.color, marginRight: 'auto' }}>{group.name}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action buttons */}
                                    <div style={{
                                        padding: '10px 16px 14px', display: 'flex', gap: 6,
                                    }}>
                                        <button onClick={() => handleToggleActive(emp)} style={{
                                            flex: 1, padding: '8px 0', borderRadius: 'var(--radius-md)',
                                            background: isInactive ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
                                            color: isInactive ? 'var(--accent-amber)' : 'var(--accent-emerald)',
                                            border: `1px solid ${isInactive ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)'}`,
                                            fontSize: 11, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                            transition: 'all 200ms ease',
                                        }}>
                                            {isInactive ? <><ToggleLeft size={13} /> تفعيل</> : <><ToggleRight size={13} /> معطّل</>}
                                        </button>
                                        <button onClick={() => startEdit(emp)} style={{
                                            flex: 1, padding: '8px 0', borderRadius: 'var(--radius-md)',
                                            background: 'rgba(59,130,246,0.08)',
                                            color: 'var(--accent-blue)',
                                            border: '1px solid rgba(59,130,246,0.15)',
                                            fontSize: 11, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                            transition: 'all 200ms ease',
                                        }}>
                                            <Edit3 size={13} /> تعديل
                                        </button>
                                        <button onClick={() => checkEmployeeDependencies(emp)} style={{
                                            flex: 1, padding: '8px 0', borderRadius: 'var(--radius-md)',
                                            background: 'rgba(244,63,94,0.06)',
                                            color: 'var(--accent-rose)',
                                            border: '1px solid rgba(244,63,94,0.12)',
                                            fontSize: 11, fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                            transition: 'all 200ms ease',
                                        }}>
                                            <Trash2 size={13} /> حذف
                                        </button>
                                    </div>

                                    {/* Delete Confirmation with Dependency Check */}
                                    {isDeleting && (
                                        <div style={{
                                            marginTop: 10, padding: '14px', borderRadius: 'var(--radius-md)',
                                            background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.18)',
                                        }}>
                                            {/* Loading */}
                                            {deleteInfo?.loading && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10 }}>
                                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
                                                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>جاري فحص بيانات الموظف...</span>
                                                </div>
                                            )}

                                            {/* Dependency results */}
                                            {deleteInfo?.checked && (
                                                <>
                                                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-rose)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <AlertTriangle size={16} />
                                                        حذف الموظف: {emp.name}
                                                    </div>

                                                    {/* Manager warning - BLOCKS delete */}
                                                    {deleteInfo.isManager && (
                                                        <div style={{
                                                            padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                                            background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)',
                                                            marginBottom: 8,
                                                        }}>
                                                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-amber)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                                <Crown size={13} /> مدير قسم {deleteInfo.isManager}
                                                            </div>
                                                            <div style={{ fontSize: 11, color: 'var(--accent-amber)', opacity: 0.85 }}>
                                                                ⚠️ يجب تعيين مدير بديل للقسم أولاً قبل حذف هذا الموظف
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Attendance records info */}
                                                    {deleteInfo.attendanceCount > 0 && (
                                                        <div style={{
                                                            padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                                            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
                                                            marginBottom: 8,
                                                        }}>
                                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-blue)' }}>
                                                                📋 لديه {deleteInfo.attendanceCount} سجل حضور — سيتم حذفها مع الموظف
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Leave records info */}
                                                    {deleteInfo.leaveCount > 0 && (
                                                        <div style={{
                                                            padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                                            background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)',
                                                            marginBottom: 8,
                                                        }}>
                                                            <div style={{ fontSize: 11, fontWeight: 600, color: '#a855f7' }}>
                                                                📝 لديه {deleteInfo.leaveCount} طلب إجازة — سيتم حذفها مع الموظف
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* No issues */}
                                                    {!deleteInfo.isManager && deleteInfo.attendanceCount === 0 && deleteInfo.leaveCount === 0 && (
                                                        <div style={{
                                                            padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                                                            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)',
                                                            marginBottom: 8,
                                                        }}>
                                                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent-emerald)' }}>
                                                                ✅ لا توجد بيانات مرتبطة — يمكن حذف الموظف بأمان
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Actions */}
                                                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                                        {!deleteInfo.isManager && (
                                                            <button onClick={() => handleDelete(emp.id)} disabled={saving} style={{
                                                                flex: 1, padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                                                                background: 'var(--accent-rose)', color: 'white',
                                                                fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                                opacity: saving ? 0.7 : 1,
                                                            }}>
                                                                {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                                                                تأكيد الحذف
                                                            </button>
                                                        )}
                                                        {deleteInfo.isManager && (
                                                            <button onClick={() => startEdit(emp)} style={{
                                                                flex: 1, padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                                                                background: 'var(--accent-amber)', color: 'white',
                                                                fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                            }}>
                                                                <Edit3 size={14} /> تعديل بيانات الموظف
                                                            </button>
                                                        )}
                                                        <button onClick={() => { setDeleteConfirm(null); setDeleteInfo(null); }} style={{
                                                            padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                                                            background: 'var(--bg-glass-strong)', color: 'var(--text-secondary)',
                                                            fontSize: 12, fontWeight: 700,
                                                        }}>إلغاء</button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Success/Error feedback toast */}
                                    {saveMessage && !isDeleting && (
                                        <div style={{
                                            marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius-md)',
                                            background: saveMessage.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
                                            border: `1px solid ${saveMessage.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(244,63,94,0.25)'}`,
                                            color: saveMessage.type === 'success' ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                                            fontSize: 11, fontWeight: 600, textAlign: 'center',
                                        }}>
                                            {saveMessage.text}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {filteredEmployees.length === 0 && (
                            <div className="glass-card" style={{ textAlign: 'center', padding: '30px 20px' }}>
                                <Users size={32} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 10px' }} />
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>لا يوجد موظفون</div>
                            </div>
                        )}
                    </div>

                    {/* FAB - Add Employee */}
                    {!showAddForm && !editingId && (
                        <button className="fab-btn" onClick={() => { setShowAddForm(true); setFormData(emptyEmployee); }}>
                            <UserPlus size={24} />
                        </button>
                    )}
                </>
            )}

            {/* ========== PERMISSIONS TAB ========== */}
            {activeTab === 'permissions' && (
                <>
                    {/* Stats */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <StatCard value={permGroups.length} label="مجموعة" color="var(--accent-purple)" />
                        <StatCard value={ALL_PERMISSIONS.length} label="صلاحية" color="var(--accent-blue)" />
                        <StatCard value={PERMISSION_CATEGORIES.length} label="تصنيف" color="var(--accent-amber)" />
                    </div>

                    {/* Add/Edit Group Form */}
                    {(showGroupForm || editingGroup) && (
                        <div className="glass-card" style={{ marginBottom: 16, padding: 16, border: `1px solid ${groupForm.color}30` }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                <h3 style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Key size={16} style={{ color: groupForm.color }} />
                                    {editingGroup ? 'تعديل المجموعة' : 'إنشاء مجموعة جديدة'}
                                </h3>
                                <button onClick={() => { setShowGroupForm(false); setEditingGroup(null); }} style={{
                                    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                                    background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <X size={14} />
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <FormField label="اسم المجموعة">
                                    <input className="form-input" value={groupForm.name}
                                        onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                                        placeholder="مثال: مدير فرع" />
                                </FormField>

                                <FormField label="الوصف">
                                    <input className="form-input" value={groupForm.description}
                                        onChange={e => setGroupForm({ ...groupForm, description: e.target.value })}
                                        placeholder="وصف مختصر للمجموعة" />
                                </FormField>

                                {/* Color Picker */}
                                <FormField label="اللون">
                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                        {GROUP_COLORS.map(c => (
                                            <button key={c} onClick={() => setGroupForm({ ...groupForm, color: c })} style={{
                                                width: 30, height: 30, borderRadius: '50%',
                                                background: c, border: groupForm.color === c ? '3px solid white' : '2px solid transparent',
                                                boxShadow: groupForm.color === c ? `0 0 10px ${c}60` : 'none',
                                                transition: 'all 200ms ease',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                {groupForm.color === c && <Check size={14} color="white" />}
                                            </button>
                                        ))}
                                    </div>
                                </FormField>

                                {/* Permissions Selector */}
                                <div style={{ marginTop: 6 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textAlign: 'center' }}>
                                        الصلاحيات ({groupForm.permissions.length}/{ALL_PERMISSIONS.length})
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {PERMISSION_CATEGORIES.map(cat => {
                                            const catPerms = ALL_PERMISSIONS.filter(p => p.category === cat.id);
                                            const selectedCount = catPerms.filter(p => groupForm.permissions.includes(p.id)).length;
                                            const allSelected = selectedCount === catPerms.length;
                                            const isExpanded = expandedCategory === cat.id;

                                            return (
                                                <div key={cat.id} style={{
                                                    borderRadius: 'var(--radius-md)',
                                                    border: `1px solid ${selectedCount > 0 ? cat.color + '30' : 'var(--border-glass)'}`,
                                                    background: selectedCount > 0 ? `${cat.color}08` : 'var(--bg-glass)',
                                                    overflow: 'hidden',
                                                }}>
                                                    {/* Category Header */}
                                                    <div
                                                        onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                                                        style={{
                                                            padding: '10px 12px',
                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <span style={{ fontSize: 16 }}>{cat.icon}</span>
                                                        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: cat.color }}>
                                                            {cat.label}
                                                        </span>
                                                        <span style={{
                                                            fontSize: 10, fontWeight: 700, padding: '2px 8px',
                                                            borderRadius: 'var(--radius-full)',
                                                            background: allSelected ? `${cat.color}20` : 'var(--bg-glass-strong)',
                                                            color: allSelected ? cat.color : 'var(--text-muted)',
                                                            fontFamily: 'var(--font-numeric)',
                                                        }}>
                                                            {selectedCount}/{catPerms.length}
                                                        </span>
                                                        <button onClick={(e) => { e.stopPropagation(); toggleCategory(cat.id); }} style={{
                                                            width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                                                            background: allSelected ? cat.color : 'var(--bg-glass-strong)',
                                                            color: allSelected ? 'white' : 'var(--text-muted)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            transition: 'all 200ms ease', fontSize: 10,
                                                        }}>
                                                            {allSelected ? <Unlock size={12} /> : <Lock size={12} />}
                                                        </button>
                                                        {isExpanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                                                    </div>

                                                    {/* Expanded Permissions */}
                                                    {isExpanded && (
                                                        <div style={{
                                                            padding: '4px 12px 10px',
                                                            borderTop: `1px solid ${cat.color}15`,
                                                        }}>
                                                            {catPerms.map(perm => {
                                                                const isActive = groupForm.permissions.includes(perm.id);
                                                                return (
                                                                    <button
                                                                        key={perm.id}
                                                                        onClick={() => togglePermission(perm.id)}
                                                                        style={{
                                                                            width: '100%', padding: '8px 10px',
                                                                            display: 'flex', alignItems: 'center', gap: 8,
                                                                            borderRadius: 'var(--radius-sm)',
                                                                            background: isActive ? `${cat.color}10` : 'transparent',
                                                                            transition: 'all 150ms ease',
                                                                            marginTop: 2,
                                                                        }}
                                                                    >
                                                                        <div style={{
                                                                            width: 20, height: 20, borderRadius: 4,
                                                                            border: `2px solid ${isActive ? cat.color : 'var(--border-glass)'}`,
                                                                            background: isActive ? cat.color : 'transparent',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            transition: 'all 150ms ease', flexShrink: 0,
                                                                        }}>
                                                                            {isActive && <Check size={12} color="white" />}
                                                                        </div>
                                                                        <span style={{
                                                                            fontSize: 12, fontWeight: 600,
                                                                            color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                                                                        }}>
                                                                            {perm.label}
                                                                        </span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Save Button */}
                                <button
                                    onClick={editingGroup ? handleSaveGroup : handleAddGroup}
                                    disabled={!groupForm.name.trim()}
                                    style={{
                                        width: '100%', padding: '13px', borderRadius: 'var(--radius-md)',
                                        background: groupForm.name.trim()
                                            ? `linear-gradient(135deg, ${groupForm.color}, ${groupForm.color}cc)`
                                            : 'var(--bg-glass-strong)',
                                        color: groupForm.name.trim() ? 'white' : 'var(--text-muted)',
                                        fontSize: 14, fontWeight: 700,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        marginTop: 6, transition: 'all 200ms ease',
                                    }}
                                >
                                    <Save size={16} />
                                    {editingGroup ? 'حفظ التعديلات' : 'إنشاء المجموعة'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Permission Groups List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 80 }}>
                        {permGroups.map(group => {
                            const count = employeesInGroup(group.id);
                            const isDeleting = deleteGroupConfirm === group.id;

                            return (
                                <div key={group.id} className="glass-card" style={{
                                    padding: 0, overflow: 'hidden',
                                    borderRight: `3px solid ${group.color}`,
                                }}>
                                    <div style={{ padding: '14px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            {/* Group Icon */}
                                            <div style={{
                                                width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                                                background: `${group.color}15`,
                                                color: group.color,
                                                border: `1px solid ${group.color}25`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                flexShrink: 0,
                                            }}>
                                                <Shield size={20} />
                                            </div>

                                            {/* Info */}
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {group.name}
                                                    <span style={{
                                                        fontSize: 9, fontWeight: 700, padding: '1px 8px',
                                                        borderRadius: 'var(--radius-full)',
                                                        background: `${group.color}15`, color: group.color,
                                                        fontFamily: 'var(--font-numeric)',
                                                    }}>
                                                        {count} موظف
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                    {group.description}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                <button onClick={() => startEditGroup(group)} style={{
                                                    width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                                    background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                }}>
                                                    <Edit3 size={13} />
                                                </button>
                                                {group.id !== 'grp-admin' && group.id !== 'grp-employee' && (
                                                    <button onClick={() => setDeleteGroupConfirm(group.id)} style={{
                                                        width: 30, height: 30, borderRadius: 'var(--radius-sm)',
                                                        background: 'var(--accent-rose-soft)', color: 'var(--accent-rose)',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    }}>
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Permission chips */}
                                        <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
                                            {PERMISSION_CATEGORIES.map(cat => {
                                                const catPerms = ALL_PERMISSIONS.filter(p => p.category === cat.id);
                                                const selectedCount = catPerms.filter(p => group.permissions.includes(p.id)).length;
                                                if (selectedCount === 0) return null;
                                                return (
                                                    <span key={cat.id} style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                                        fontSize: 9, fontWeight: 700,
                                                        background: `${cat.color}12`, color: cat.color,
                                                    }}>
                                                        {cat.icon} {cat.label}
                                                        <span style={{ fontFamily: 'var(--font-numeric)', opacity: 0.7 }}>
                                                            {selectedCount}/{catPerms.length}
                                                        </span>
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {/* Employees in group */}
                                        {count > 0 && (
                                            <div style={{
                                                marginTop: 10, padding: '8px 10px', borderRadius: 'var(--radius-md)',
                                                background: 'var(--bg-glass)',
                                            }}>
                                                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
                                                    الموظفون في هذه المجموعة:
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    {employees.filter(e => e.permissionGroupId === group.id).map((emp, i) => {
                                                        const initials = emp.name.split(' ').map(w => w[0]).join('').slice(0, 2);
                                                        return (
                                                            <div key={emp.id} style={{
                                                                display: 'flex', alignItems: 'center', gap: 5,
                                                                padding: '3px 8px 3px 3px', borderRadius: 'var(--radius-full)',
                                                                background: 'var(--bg-glass-strong)',
                                                                fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)',
                                                            }}>
                                                                <div style={{
                                                                    width: 20, height: 20, borderRadius: '50%',
                                                                    background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                                                                    color: 'white', fontSize: 8, fontWeight: 800,
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                }}>
                                                                    {initials}
                                                                </div>
                                                                {emp.name}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Delete Confirmation */}
                                    {isDeleting && (
                                        <div style={{
                                            padding: '10px 16px', borderTop: '1px solid var(--border-glass)',
                                            background: 'var(--accent-rose-soft)',
                                            display: 'flex', alignItems: 'center', gap: 10,
                                        }}>
                                            <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--accent-rose)' }}>
                                                سيتم نقل الموظفين إلى "موظف عادي"
                                            </span>
                                            <button onClick={() => handleDeleteGroup(group.id)} style={{
                                                padding: '5px 12px', borderRadius: 'var(--radius-sm)',
                                                background: 'var(--accent-rose)', color: 'white',
                                                fontSize: 10, fontWeight: 700,
                                            }}>حذف</button>
                                            <button onClick={() => setDeleteGroupConfirm(null)} style={{
                                                padding: '5px 12px', borderRadius: 'var(--radius-sm)',
                                                background: 'var(--bg-glass-strong)', color: 'var(--text-secondary)',
                                                fontSize: 10, fontWeight: 700,
                                            }}>إلغاء</button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* FAB - Add Group */}
                    {!showGroupForm && !editingGroup && (
                        <button className="fab-btn" onClick={() => { setShowGroupForm(true); setGroupForm(emptyGroup); }}>
                            <Plus size={24} />
                        </button>
                    )}
                </>
            )}

            {/* ========== FILES TAB ========== */}
            {activeTab === 'files' && (
                <>
                    {/* Files Stats */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                        <StatCard value={employees.length} label="موظف" color="var(--accent-blue)" />
                        <StatCard
                            value={Object.values(DEMO_EMPLOYEE_DOCS).reduce((acc, docs) => acc + docs.length, 0)}
                            label="مستمسك" color="#a855f7"
                        />
                        <StatCard
                            value={employees.filter(e => (DEMO_EMPLOYEE_DOCS[e.id] || []).length === 0).length}
                            label="بدون ملفات" color="var(--accent-rose)"
                        />
                    </div>

                    {/* Search */}
                    <div style={{ position: 'relative', marginBottom: 14 }}>
                        <Search size={16} style={{
                            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                            color: 'var(--text-muted)',
                        }} />
                        <input
                            type="text"
                            className="form-input"
                            placeholder="ابحث عن موظف..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ paddingRight: 38, textAlign: 'right' }}
                        />
                    </div>

                    {/* Employee File Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 80 }}>
                        {filteredEmployees.map((emp, idx) => {
                            const docs = DEMO_EMPLOYEE_DOCS[emp.id] || [];
                            const initials = emp.name.split(' ').map(w => w[0]).join('').slice(0, 2);
                            const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];

                            return (
                                <EmployeeFileCard
                                    key={emp.id}
                                    emp={emp}
                                    docs={docs}
                                    initials={initials}
                                    avatarColor={color}
                                />
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

// === Subcomponents ===
function StatCard({ value, label, color }: { value: number; label: string; color: string }) {
    return (
        <div className="glass-card" style={{ flex: 1, textAlign: 'center', padding: '12px 6px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--font-numeric)' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
        </div>
    );
}

function FormField({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
    return (
        <div style={{ flex: flex ? 1 : undefined }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4, textAlign: 'center' }}>
                {label}
            </label>
            {children}
        </div>
    );
}

function RoleBtn({ label, active, color, onClick }: { label: string; active: boolean; color: 'blue' | 'purple'; onClick: () => void }) {
    const c = color === 'blue' ? 'var(--accent-blue)' : 'var(--accent-purple)';
    const soft = color === 'blue' ? 'var(--accent-blue-soft)' : 'var(--accent-purple-soft)';
    return (
        <button onClick={onClick} style={{
            flex: 1, padding: '10px', borderRadius: 'var(--radius-md)',
            fontSize: 13, fontWeight: 700, transition: 'all 200ms ease',
            background: active ? soft : 'var(--bg-glass)',
            color: active ? c : 'var(--text-muted)',
            border: `1px solid ${active ? c : 'var(--border-glass)'}`,
        }}>
            {label}
        </button>
    );
}

function DetailChip({ icon, text, color, numeric }: { icon: React.ReactNode; text: string; color: string; numeric?: boolean }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 'var(--radius-full)',
            fontSize: 10, fontWeight: 600,
            background: `${color}15`, color,
            fontFamily: numeric ? 'var(--font-numeric)' : undefined,
        }}>
            {icon}{text}
        </span>
    );
}

// === Employee File Card (for Files Tab) ===
function EmployeeFileCard({ emp, docs, initials, avatarColor }: {
    emp: { id: string; name: string; department: string };
    docs: EmployeeDocument[];
    initials: string;
    avatarColor: string;
}) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="glass-card" style={{
            padding: 0, overflow: 'hidden',
            borderRight: docs.length > 0 ? '3px solid #a855f7' : '3px solid var(--border-glass)',
        }}>
            {/* Employee Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                style={{
                    width: '100%', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: 'transparent',
                }}
            >
                <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: avatarColor, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, flexShrink: 0,
                }}>
                    {initials}
                </div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{emp.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 6, marginTop: 2 }}>
                        <span>{emp.department}</span>
                        <span>•</span>
                        <span style={{ fontFamily: 'var(--font-numeric)' }}>{emp.id}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                        padding: '2px 10px', borderRadius: 'var(--radius-full)',
                        fontSize: 10, fontWeight: 700,
                        background: docs.length > 0 ? '#a855f720' : 'var(--accent-rose-soft)',
                        color: docs.length > 0 ? '#a855f7' : 'var(--accent-rose)',
                        fontFamily: 'var(--font-numeric)',
                    }}>
                        {docs.length} ملف
                    </span>
                    {expanded ? <ChevronUp size={14} color="var(--text-muted)" /> : <ChevronDown size={14} color="var(--text-muted)" />}
                </div>
            </button>

            {/* Expanded Documents */}
            {expanded && (
                <div style={{
                    padding: '0 16px 14px',
                    borderTop: '1px solid var(--border-glass)',
                }}>
                    {docs.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                            {docs.map(doc => {
                                const cat = DOC_CATEGORIES_MAP[doc.category];
                                return (
                                    <div key={doc.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 12px', borderRadius: 'var(--radius-md)',
                                        background: 'var(--bg-glass)',
                                    }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 'var(--radius-md)',
                                            background: `${cat?.color || '#666'}15`,
                                            border: `1px solid ${cat?.color || '#666'}25`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 16, flexShrink: 0,
                                        }}>
                                            {cat?.icon || '📎'}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700 }}>{doc.name}</div>
                                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <span style={{
                                                    padding: '1px 5px', borderRadius: 'var(--radius-full)',
                                                    background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)',
                                                    fontSize: 8, fontWeight: 700,
                                                }}>{doc.type}</span>
                                                <span style={{ fontFamily: 'var(--font-numeric)' }}>{doc.size}</span>
                                                <span>•</span>
                                                <span style={{ fontFamily: 'var(--font-numeric)' }}>{doc.date}</span>
                                            </div>
                                        </div>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                            fontSize: 9, fontWeight: 700,
                                            background: `${cat?.color || '#666'}15`,
                                            color: cat?.color || '#666',
                                        }}>
                                            {cat?.label || 'أخرى'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div style={{
                            textAlign: 'center', padding: '16px 10px',
                            marginTop: 10,
                        }}>
                            <Paperclip size={20} style={{ color: 'var(--text-muted)', display: 'block', margin: '0 auto 6px' }} />
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                لا توجد مستمسكات لهذا الموظف
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
