'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/src/store/useAuthStore';
import api from '@/src/lib/axios';
import {
    Bug, Lightbulb, MessageSquare, MoreHorizontal,
    ChevronLeft, ChevronRight, RefreshCw, Check,
    Clock, Archive, XCircle, Filter, StickyNote,
} from 'lucide-react';

type ReportType   = 'BUG' | 'FEATURE_REQUEST' | 'FEEDBACK' | 'OTHER';
type ReportStatus = 'NEW' | 'REVIEWED' | 'RESOLVED' | 'CLOSED';

interface Report {
    id:          number;
    type:        ReportType;
    title:       string;
    description: string;
    status:      ReportStatus;
    adminNote:   string | null;
    createdAt:   string;
    metadata:    { page?: string; userAgent?: string; imageUrl?: string } | null;
    user:        { id: number; nickname: string; email: string; avatarUrl: string | null };
}

const TYPE_META: Record<ReportType, { label: string; icon: React.ReactNode; color: string }> = {
    BUG:             { label: 'Bug',         icon: <Bug size={12} />,           color: 'rgba(255,77,106,0.8)' },
    FEATURE_REQUEST: { label: 'Feature',     icon: <Lightbulb size={12} />,     color: 'rgba(251,191,36,0.8)' },
    FEEDBACK:        { label: 'Feedback',    icon: <MessageSquare size={12} />, color: 'rgba(99,179,237,0.8)' },
    OTHER:           { label: 'Other',       icon: <MoreHorizontal size={12} />,color: 'rgba(148,163,184,0.8)' },
};

const STATUS_META: Record<ReportStatus, { label: string; icon: React.ReactNode; color: string }> = {
    NEW:      { label: 'New',      icon: <Clock size={12} />,    color: 'rgba(251,191,36,0.8)' },
    REVIEWED: { label: 'Reviewed', icon: <Check size={12} />,    color: 'rgba(99,179,237,0.8)' },
    RESOLVED: { label: 'Resolved', icon: <Check size={12} />,    color: 'rgba(34,212,114,0.8)' },
    CLOSED:   { label: 'Closed',   icon: <Archive size={12} />,  color: 'rgba(100,116,139,0.7)' },
};

const STATUSES: ReportStatus[] = ['NEW', 'REVIEWED', 'RESOLVED', 'CLOSED'];

function formatDate(d: string) {
    const date = new Date(d);
    const now  = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60_000)      return 'just now';
    if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`;
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

function parseBrowser(ua?: string): string {
    if (!ua) return '—';
    if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'Chrome';
    if (/Firefox/i.test(ua)) return 'Firefox';
    if (/Safari/i.test(ua))  return 'Safari';
    if (/Edg/i.test(ua))     return 'Edge';
    return 'Other';
}

// ── Inline note editor ────────────────────────────────────────────────────────
function NoteEditor({ report, onSave }: {
    report: Report;
    onSave: (id: number, note: string) => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [value,   setValue]   = useState(report.adminNote ?? '');
    const [saving,  setSaving]  = useState(false);

    const save = async () => {
        setSaving(true);
        await onSave(report.id, value);
        setSaving(false);
        setEditing(false);
    };

    if (!editing) {
        return (
            <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 text-[11px] cursor-pointer transition-colors"
                style={{ color: report.adminNote ? 'var(--accent-bright)' : 'var(--text-3)' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = report.adminNote ? 'var(--accent-bright)' : 'var(--text-3)'}
            >
                <StickyNote size={11} />
                {report.adminNote ? report.adminNote.slice(0, 40) + (report.adminNote.length > 40 ? '…' : '') : 'Add note'}
            </button>
        );
    }

    return (
        <div className="flex items-center gap-2 mt-1">
            <input
                autoFocus
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                className="flex-1 px-2 py-1 text-[11px] rounded-lg outline-none"
                style={{
                    background:  'rgba(255,255,255,0.05)',
                    border:      '1px solid var(--border-accent)',
                    color:       'var(--text-1)',
                    caretColor:  'var(--accent)',
                }}
                placeholder="Internal note…"
                maxLength={500}
            />
            <button onClick={save} disabled={saving}
                    className="text-[11px] text-emerald-400 cursor-pointer hover:text-emerald-300">
                {saving ? '…' : 'Save'}
            </button>
            <button onClick={() => setEditing(false)}
                    className="text-[11px] cursor-pointer" style={{ color: 'var(--text-3)' }}>
                Cancel
            </button>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminReportsPage() {
    const { user, _hasHydrated } = useAuthStore();
    const router = useRouter();

    const [reports,       setReports]       = useState<Report[]>([]);
    const [total,         setTotal]         = useState(0);
    const [page,          setPage]          = useState(1);
    const [loading,       setLoading]       = useState(true);
    const [statusFilter,  setStatusFilter]  = useState<ReportStatus | ''>('');
    const [typeFilter,    setTypeFilter]    = useState<ReportType | ''>('');
    const [expanded,      setExpanded]      = useState<number | null>(null);

    const TAKE = 20;

    // Guard: admin only
    useEffect(() => {
        if (!_hasHydrated) return;
        if (!user) { router.push('/auth/login'); return; }
        if (user.role !== 'ADMIN') { router.push('/chat'); return; }
    }, [user, _hasHydrated, router]);

    const fetchReports = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = { page: String(page), take: String(TAKE) };
            if (statusFilter) params.status = statusFilter;
            if (typeFilter)   params.type   = typeFilter;

            const res = await api.get('/reports', { params });
            setReports(res.data.reports);
            setTotal(res.data.total);
        } catch {
            // If not admin, redirect
            router.push('/chat');
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter, typeFilter, router]);

    useEffect(() => {
        if (user?.role === 'ADMIN') fetchReports();
    }, [fetchReports, user]);

    const updateStatus = async (id: number, status: ReportStatus) => {
        await api.patch(`/reports/${id}`, { status });
        setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    };

    const saveNote = async (id: number, adminNote: string) => {
        await api.patch(`/reports/${id}`, { adminNote });
        setReports(prev => prev.map(r => r.id === id ? { ...r, adminNote } : r));
    };

    const totalPages = Math.ceil(total / TAKE);

    if (!user || user.role !== 'ADMIN') return null;

    return (
        <div className="min-h-screen text-slate-200" style={{ background: 'var(--bg-base)', fontFamily: "'JetBrains Mono', monospace" }}>
            {/* Header */}
            <header className="sticky top-0 z-20 flex items-center justify-between px-6 py-4"
                    style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-4">
                    <button onClick={() => router.push('/chat')}
                            className="flex items-center gap-1.5 text-[12px] cursor-pointer transition-colors"
                            style={{ color: 'var(--text-3)' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                        <ChevronLeft size={14} /> Back
                    </button>
                    <div className="w-px h-4" style={{ background: 'var(--border)' }} />
                    <h1 className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
                        Reports
                    </h1>
                    <span className="text-[11px] px-2 py-0.5 rounded-full"
                          style={{ background: 'var(--accent-dim)', color: 'var(--accent-bright)', border: '1px solid var(--border-accent)' }}>
            {total}
          </span>
                </div>

                <button onClick={fetchReports} disabled={loading}
                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg cursor-pointer transition-all disabled:opacity-40"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-2)' }}>
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </header>

            <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-2 items-center">
                    <Filter size={12} style={{ color: 'var(--text-3)' }} />

                    {/* Status filter */}
                    <div className="flex gap-1">
                        <button
                            onClick={() => { setStatusFilter(''); setPage(1); }}
                            className="px-2.5 py-1 rounded-lg text-[11px] cursor-pointer transition-all"
                            style={{
                                background: !statusFilter ? 'var(--accent-dim)' : 'transparent',
                                border:     !statusFilter ? '1px solid var(--border-accent)' : '1px solid var(--border)',
                                color:      !statusFilter ? 'var(--accent-bright)' : 'var(--text-3)',
                            }}
                        >
                            All
                        </button>
                        {STATUSES.map(s => {
                            const m = STATUS_META[s];
                            return (
                                <button
                                    key={s}
                                    onClick={() => { setStatusFilter(statusFilter === s ? '' : s); setPage(1); }}
                                    className="px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-all"
                                    style={{
                                        background: statusFilter === s ? `${m.color}18` : 'transparent',
                                        border:     statusFilter === s ? `1px solid ${m.color}` : '1px solid var(--border)',
                                        color:      statusFilter === s ? m.color : 'var(--text-3)',
                                    }}
                                >
                                    {m.icon}{m.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="w-px h-4" style={{ background: 'var(--border)' }} />

                    {/* Type filter */}
                    <div className="flex gap-1">
                        {(['BUG', 'FEATURE_REQUEST', 'FEEDBACK', 'OTHER'] as ReportType[]).map(t => {
                            const m = TYPE_META[t];
                            return (
                                <button
                                    key={t}
                                    onClick={() => { setTypeFilter(typeFilter === t ? '' : t); setPage(1); }}
                                    className="px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 cursor-pointer transition-all"
                                    style={{
                                        background: typeFilter === t ? `${m.color}18` : 'transparent',
                                        border:     typeFilter === t ? `1px solid ${m.color}` : '1px solid var(--border)',
                                        color:      typeFilter === t ? m.color : 'var(--text-3)',
                                    }}
                                >
                                    {m.icon}{m.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Table */}
                {loading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="skeleton rounded-xl h-16" />
                        ))}
                    </div>
                ) : reports.length === 0 ? (
                    <div className="text-center py-20" style={{ color: 'var(--text-3)' }}>
                        <Bug size={32} className="mx-auto mb-4 opacity-30" />
                        <p className="text-[13px]">No reports found</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {reports.map(report => {
                            const tm = TYPE_META[report.type];
                            const sm = STATUS_META[report.status];
                            const isExpanded = expanded === report.id;

                            return (
                                <div
                                    key={report.id}
                                    className="rounded-xl overflow-hidden transition-all"
                                    style={{
                                        background: 'var(--bg-surface)',
                                        border:     `1px solid ${isExpanded ? 'var(--border-accent)' : 'var(--border)'}`,
                                    }}
                                >
                                    {/* Row */}
                                    <div
                                        className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                                        onClick={() => setExpanded(isExpanded ? null : report.id)}
                                    >
                                        {/* Type badge */}
                                        <div className="flex items-center gap-1 shrink-0 text-[11px] px-2 py-0.5 rounded-lg"
                                             style={{ background: `${tm.color}14`, color: tm.color, border: `1px solid ${tm.color}40` }}>
                                            {tm.icon}{tm.label}
                                        </div>

                                        {/* Title */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text-1)' }}>
                                                {report.title}
                                            </p>
                                            <p className="text-[11px] truncate" style={{ color: 'var(--text-3)' }}>
                                                {report.user.nickname} · {formatDate(report.createdAt)}
                                            </p>
                                        </div>

                                        {/* Status badge */}
                                        <div className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg shrink-0"
                                             style={{ background: `${sm.color}14`, color: sm.color, border: `1px solid ${sm.color}40` }}>
                                            {sm.icon}{sm.label}
                                        </div>

                                        {/* ID */}
                                        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-3)' }}>
                      #{report.id}
                    </span>
                                    </div>

                                    {/* Expanded detail */}
                                    {isExpanded && (
                                        <div className="px-4 pb-4 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
                                            {/* Description */}
                                            <div className="pt-3">
                                                <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                                                   style={{ color: 'var(--text-3)' }}>Description</p>
                                                <p className="text-[13px] leading-relaxed whitespace-pre-wrap"
                                                   style={{ color: 'var(--text-2)' }}>
                                                    {report.description}
                                                </p>
                                            </div>

                                            {/* Meta */}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                {[
                                                    { label: 'User',    value: `${report.user.nickname} (${report.user.email})` },
                                                    { label: 'Page',    value: report.metadata?.page ?? '—' },
                                                    { label: 'Browser', value: parseBrowser(report.metadata?.userAgent) },
                                                ].map(({ label, value }) => (
                                                    <div key={label} className="rounded-lg p-2.5"
                                                         style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
                                                        <p className="text-[9px] uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>{label}</p>
                                                        <p className="text-[11px] truncate" style={{ color: 'var(--text-2)' }}>{value}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Screenshot */}
                                            {report.metadata?.imageUrl && (
                                                <div>
                                                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-2"
                                                       style={{ color: 'var(--text-3)' }}>Screenshot</p>
                                                    <img
                                                        src={report.metadata.imageUrl}
                                                        alt="Report screenshot"
                                                        className="rounded-lg max-h-64 object-contain w-full cursor-zoom-in"
                                                        style={{ border: '1px solid var(--border)', background: 'rgba(0,0,0,0.3)' }}
                                                        onClick={() => window.open(report.metadata?.imageUrl, '_blank')}
                                                    />
                                                </div>
                                            )}

                                            {/* Admin actions */}
                                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                                {/* Status buttons */}
                                                <div className="flex gap-1 flex-wrap">
                                                    {STATUSES.map(s => {
                                                        const m = STATUS_META[s];
                                                        const active = report.status === s;
                                                        return (
                                                            <button
                                                                key={s}
                                                                onClick={() => updateStatus(report.id, s)}
                                                                disabled={active}
                                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] cursor-pointer transition-all disabled:cursor-default"
                                                                style={{
                                                                    background: active ? `${m.color}20` : 'transparent',
                                                                    border:     `1px solid ${active ? m.color : 'var(--border)'}`,
                                                                    color:      active ? m.color : 'var(--text-3)',
                                                                    opacity:    active ? 1 : 0.7,
                                                                }}
                                                            >
                                                                {m.icon}{m.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {/* Note */}
                                                <NoteEditor report={report} onSave={saveNote} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-3 pt-4">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-30 transition-all"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="text-[12px]" style={{ color: 'var(--text-3)' }}>
              {page} / {totalPages}
            </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-30 transition-all"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-2)' }}
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}