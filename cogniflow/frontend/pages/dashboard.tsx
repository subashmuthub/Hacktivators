import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { useRooms } from '../hooks/useRooms';

// ── Local storage keys ─────────────────────────────────────────────────────
const GALAXY_KEY = 'cogniflow_galaxy_nodes';
const EXAM_HISTORY_KEY = 'cogniflow_exam_history';

interface StoredResponse { concept: string; isCorrect: boolean; timeMs: number; timestamp: number; }
interface ExamHistory { concept: string; date: string; score: number; totalQuestions: number; wrongTopics: string[]; difficultyBreakdown: { easy: number; medium: number; hard: number }; }

interface ConceptPerf {
    concept: string;
    sessions: number;
    correct: number;
    total: number;
    accuracy: number;
    avgTimeMs: number;
    lastSeen: number;
    lastExamScore?: number;
}

function loadConceptPerformance(): ConceptPerf[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw: StoredResponse[] = JSON.parse(localStorage.getItem(GALAXY_KEY) || '[]');
        const examHistory: ExamHistory[] = JSON.parse(localStorage.getItem(EXAM_HISTORY_KEY) || '[]');

        const map: Record<string, StoredResponse[]> = {};
        for (const r of raw) {
            if (!map[r.concept]) map[r.concept] = [];
            map[r.concept].push(r);
        }

        return Object.entries(map).map(([concept, recs]) => {
            recs.sort((a, b) => a.timestamp - b.timestamp);
            const correct = recs.filter(r => r.isCorrect).length;
            const total = recs.length;
            const avgTimeMs = recs.reduce((s, r) => s + r.timeMs, 0) / total;
            const lastSeen = Math.max(...recs.map(r => r.timestamp));
            const matchingExams = examHistory.filter(e => e.concept === concept);
            const lastExam = matchingExams.length > 0 ? matchingExams[matchingExams.length - 1] : null;
            return {
                concept,
                sessions: Math.ceil(total / 5),
                correct, total,
                accuracy: Math.round(correct / total * 100),
                avgTimeMs,
                lastSeen,
                lastExamScore: lastExam?.score,
            };
        }).sort((a, b) => b.accuracy - a.accuracy);
    } catch { return []; }
}

function masteryTier(accuracy: number): { icon: string; label: string; color: string; bg: string } {
    if (accuracy >= 85) return { icon: '🥇', label: 'Mastered', color: '#15803d', bg: '#f0fdf4' };
    if (accuracy >= 65) return { icon: '🥈', label: 'Proficient', color: '#b45309', bg: '#fffbeb' };
    if (accuracy >= 40) return { icon: '📘', label: 'Learning', color: '#1d4ed8', bg: '#eff6ff' };
    return { icon: '🔴', label: 'Needs Work', color: '#b91c1c', bg: '#fff5f5' };
}

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'just now';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export default function DashboardPage() {
    const { user, loading } = useAuth();
    const { rooms } = useRooms();
    const router = useRouter();
    const [conceptPerfs, setConceptPerfs] = useState<ConceptPerf[]>([]);
    const [totalXP, setTotalXP] = useState(0);
    const [examCount, setExamCount] = useState(0);
    const [avgScore, setAvgScore] = useState<number | null>(null);

    useEffect(() => {
        if (!loading && !user) router.replace('/login');
    }, [user, loading, router]);

    useEffect(() => {
        if (!user) return;

        const fetchData = () => {
            const perfs = loadConceptPerformance();
            setConceptPerfs(perfs);

            // Compute summary stats
            const totalCorrect = perfs.reduce((s, p) => s + p.correct, 0);
            const totalQ = perfs.reduce((s, p) => s + p.total, 0);
            setTotalXP(totalCorrect * 15 + perfs.reduce((s, p) => s + p.sessions, 0) * 5);

            const exams: ExamHistory[] = typeof window !== 'undefined'
                ? JSON.parse(localStorage.getItem(EXAM_HISTORY_KEY) || '[]')
                : [];
            setExamCount(exams.length);
            if (exams.length > 0) {
                setAvgScore(Math.round(exams.reduce((s, e) => s + e.score, 0) / exams.length));
            } else {
                setAvgScore(null);
            }
        };

        fetchData(); // Initial load

        // Re-compute on live updates
        window.addEventListener('cogniflow_update', fetchData);
        window.addEventListener('storage', fetchData);
        return () => {
            window.removeEventListener('cogniflow_update', fetchData);
            window.removeEventListener('storage', fetchData);
        };
    }, [user]);

    if (loading || !user) return null;

    const myRooms = Object.values(rooms).filter(r => r.createdBy === user.email || r.participants.find(p => p.email === user.email));

    const statCards = [
        { label: 'Total XP Earned', value: totalXP > 0 ? `${totalXP}` : '0', sub: totalXP > 0 ? 'From all sessions' : 'Complete an assessment', color: '#7c3aed', bg: '#f5f3ff' },
        { label: 'Exams Completed', value: examCount, sub: examCount > 0 ? `Avg score: ${avgScore}%` : 'Start one in Assessment', color: '#059669', bg: '#ecfdf5' },
        { label: 'Active Rooms', value: myRooms.filter(r => r.status !== 'ended').length, sub: 'Joined or created', color: '#2563eb', bg: '#eff6ff' },
    ];

    const masteredCount = conceptPerfs.filter(p => p.accuracy >= 85).length;
    const overallPct = conceptPerfs.length > 0
        ? Math.round(conceptPerfs.reduce((s, p) => s + p.accuracy, 0) / conceptPerfs.length)
        : null;

    return (
        <>
            <Head><title>Dashboard — CogniFlow</title></Head>
            <AppLayout>
                <div style={{ maxWidth: '960px', margin: '0 auto', padding: '2rem 1.5rem' }}>
                    {/* Welcome */}
                    <div style={{ marginBottom: '2rem' }}>
                        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                            Welcome back, {user.name}
                        </h1>
                        <p style={{ color: '#64748b', marginTop: '0.25rem', fontSize: '0.9rem' }}>
                            {user.role === 'teacher' ? 'Create rooms and track student progress.' : 'Your adaptive learning dashboard — personalized to your performance.'}
                        </p>
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                        {statCards.map((s, i) => (
                            <div key={i} className="card" style={{ padding: '1.25rem' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: '0.5rem' }}>{s.label}</div>
                                <div style={{ fontSize: '2rem', fontWeight: '700', color: s.color, lineHeight: 1 }}>{s.value}</div>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.35rem' }}>{s.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Performance Rankings */}
                    {conceptPerfs.length > 0 && (
                        <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                                    🏆 Performance Rankings
                                </h2>
                                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.82rem', color: '#64748b' }}>
                                    {overallPct !== null && (
                                        <span>Overall: <strong style={{ color: overallPct >= 70 ? '#15803d' : overallPct >= 50 ? '#b45309' : '#b91c1c' }}>{overallPct}%</strong></span>
                                    )}
                                    <span>Mastered: <strong style={{ color: '#7c3aed' }}>{masteredCount}/{conceptPerfs.length}</strong></span>
                                </div>
                            </div>

                            {/* Mastery progress overview */}
                            <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '6px', fontWeight: '600' }}>MASTERY OVERVIEW</div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {[
                                        { label: '🥇 Mastered', count: conceptPerfs.filter(p => p.accuracy >= 85).length, color: '#15803d' },
                                        { label: '🥈 Proficient', count: conceptPerfs.filter(p => p.accuracy >= 65 && p.accuracy < 85).length, color: '#b45309' },
                                        { label: '📘 Learning', count: conceptPerfs.filter(p => p.accuracy >= 40 && p.accuracy < 65).length, color: '#1d4ed8' },
                                        { label: '🔴 Needs Work', count: conceptPerfs.filter(p => p.accuracy < 40).length, color: '#b91c1c' },
                                    ].map((t, i) => (
                                        <div key={i} style={{ fontSize: '0.82rem', fontWeight: '600', color: t.color }}>
                                            {t.label}: {t.count}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {conceptPerfs.slice(0, 10).map((perf, i) => {
                                    const tier = masteryTier(perf.accuracy);
                                    return (
                                        <div key={perf.concept} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            padding: '0.75rem 1rem', borderRadius: '8px',
                                            background: tier.bg, border: `1px solid ${tier.color}22`
                                        }}>
                                            {/* Rank */}
                                            <div style={{ width: '24px', fontSize: '0.78rem', fontWeight: '700', color: '#64748b', textAlign: 'center', flexShrink: 0 }}>#{i + 1}</div>
                                            {/* Icon */}
                                            <div style={{ fontSize: '1.2rem', flexShrink: 0 }}>{tier.icon}</div>
                                            {/* Concept name */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.88rem', textTransform: 'capitalize' }}>{perf.concept}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
                                                    {perf.total} attempts · {perf.sessions} sessions · {timeAgo(perf.lastSeen)}
                                                    {perf.lastExamScore !== undefined && ` · Last exam: ${perf.lastExamScore}%`}
                                                </div>
                                            </div>
                                            {/* Accuracy bar */}
                                            <div style={{ width: '120px', flexShrink: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '0.72rem' }}>
                                                    <span style={{ color: '#64748b' }}>Accuracy</span>
                                                    <span style={{ fontWeight: '700', color: tier.color }}>{perf.accuracy}%</span>
                                                </div>
                                                <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px' }}>
                                                    <div style={{ height: '100%', background: tier.color, borderRadius: '3px', width: `${perf.accuracy}%`, transition: 'width 0.4s' }} />
                                                </div>
                                            </div>
                                            {/* Tier label */}
                                            <div style={{ fontSize: '0.72rem', fontWeight: '700', color: tier.color, background: 'white', padding: '2px 8px', borderRadius: '4px', border: `1px solid ${tier.color}44`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                {tier.label}
                                            </div>
                                            {/* Adaptive badge */}
                                            <Link href="/assessment" style={{ textDecoration: 'none' }}>
                                                <div title="Start adaptive session targeting weak areas" style={{ fontSize: '0.7rem', color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 7px', borderRadius: '4px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                                    🎯 Practice
                                                </div>
                                            </Link>
                                        </div>
                                    );
                                })}
                            </div>

                            {conceptPerfs.length === 0 && (
                                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem', fontSize: '0.9rem' }}>
                                    Complete an assessment to see your performance rankings here.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Quick actions */}
                    <div className="card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
                        <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginBottom: '1rem', marginTop: 0 }}>Quick Actions</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                            <Link href="/courses" style={{ textDecoration: 'none' }}>
                                <div style={{ padding: '1.1rem', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', cursor: 'pointer' }}>
                                    <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '0.9rem' }}>📚 My Courses</div>
                                    <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '0.2rem' }}>Learning modules</div>
                                </div>
                            </Link>
                            <Link href="/assessment" style={{ textDecoration: 'none' }}>
                                <div style={{ padding: '1.1rem', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', cursor: 'pointer' }}>
                                    <div style={{ fontWeight: '600', color: '#1d4ed8', fontSize: '0.9rem' }}>🎯 Adaptive Practice</div>
                                    <div style={{ color: '#3b82f6', fontSize: '0.8rem', marginTop: '0.2rem' }}>AI learns from your history</div>
                                </div>
                            </Link>
                            <Link href="/assessment?mode=exam" style={{ textDecoration: 'none' }}>
                                <div style={{ padding: '1.1rem', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', cursor: 'pointer' }}>
                                    <div style={{ fontWeight: '600', color: '#15803d', fontSize: '0.9rem' }}>📝 Take an Exam</div>
                                    <div style={{ color: '#22c55e', fontSize: '0.8rem', marginTop: '0.2rem' }}>Timed, scored assessment</div>
                                </div>
                            </Link>
                            <Link href="/tutor" style={{ textDecoration: 'none' }}>
                                <div style={{ padding: '1.1rem', borderRadius: '10px', background: '#fdf4ff', border: '1px solid #e9d5ff', cursor: 'pointer' }}>
                                    <div style={{ fontWeight: '600', color: '#7e22ce', fontSize: '0.9rem' }}>🤖 AI Tutor (Gemini)</div>
                                    <div style={{ color: '#a855f7', fontSize: '0.8rem', marginTop: '0.2rem' }}>Socratic deep learning</div>
                                </div>
                            </Link>
                            <Link href="/rooms/join" style={{ textDecoration: 'none' }}>
                                <div style={{ padding: '1.1rem', borderRadius: '10px', background: '#faf5ff', border: '1px solid #e9d5ff', cursor: 'pointer' }}>
                                    <div style={{ fontWeight: '600', color: '#6d28d9', fontSize: '0.9rem' }}>🚪 Join a Room</div>
                                    <div style={{ color: '#8b5cf6', fontSize: '0.8rem', marginTop: '0.2rem' }}>Enter exam code</div>
                                </div>
                            </Link>
                            <Link href="/galaxy" style={{ textDecoration: 'none' }}>
                                <div style={{ padding: '1.1rem', borderRadius: '10px', background: '#f0f9ff', border: '1px solid #bae6fd', cursor: 'pointer' }}>
                                    <div style={{ fontWeight: '600', color: '#0369a1', fontSize: '0.9rem' }}>🌌 Knowledge Galaxy</div>
                                    <div style={{ color: '#0ea5e9', fontSize: '0.8rem', marginTop: '0.2rem' }}>Live 3D concept map</div>
                                </div>
                            </Link>
                            <Link href="/analytics" style={{ textDecoration: 'none' }}>
                                <div style={{ padding: '1.1rem', borderRadius: '10px', background: '#fff7ed', border: '1px solid #fed7aa', cursor: 'pointer' }}>
                                    <div style={{ fontWeight: '600', color: '#c2410c', fontSize: '0.9rem' }}>📊 Analytics</div>
                                    <div style={{ color: '#f97316', fontSize: '0.8rem', marginTop: '0.2rem' }}>Performance trends</div>
                                </div>
                            </Link>
                            {user.role === 'teacher' && (
                                <Link href="/rooms/create" style={{ textDecoration: 'none' }}>
                                    <div style={{ padding: '1.1rem', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', cursor: 'pointer' }}>
                                        <div style={{ fontWeight: '600', color: '#15803d', fontSize: '0.9rem' }}>➕ Create a Room</div>
                                        <div style={{ color: '#22c55e', fontSize: '0.8rem', marginTop: '0.2rem' }}>New exam for students</div>
                                    </div>
                                </Link>
                            )}
                        </div>
                    </div>

                    {/* My Rooms */}
                    {myRooms.length > 0 && (
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginBottom: '1rem', marginTop: 0 }}>My Rooms</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {myRooms.slice(0, 5).map(room => (
                                    <Link key={room.code} href={`/rooms/${room.code}`} style={{ textDecoration: 'none' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1rem', borderRadius: '8px', border: '1px solid #f1f5f9', background: '#f8fafc', cursor: 'pointer' }}>
                                            <div>
                                                <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.9rem' }}>{room.title}</div>
                                                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                                                    Code: <strong>{room.code}</strong> &nbsp;·&nbsp; {room.concept} &nbsp;·&nbsp; {room.participants.length} participant{room.participants.length !== 1 ? 's' : ''}
                                                </div>
                                            </div>
                                            <span className={`badge ${room.status === 'active' ? 'badge-green' : room.status === 'waiting' ? 'badge-amber' : 'badge-red'}`}>
                                                {room.status === 'waiting' ? 'Waiting' : room.status === 'active' ? 'Live' : 'Ended'}
                                            </span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </AppLayout>
        </>
    );
}
