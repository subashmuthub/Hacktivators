import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { saveSessionToGalaxy } from '../components/KnowledgeGalaxy';
import {
    saveExamHistory, loadPriorExamSummary,
    ExamHistorySummary, ResponseRecord,
    Difficulty, Confidence
} from '../lib/history-utils';



// ── Concept categories (unlimited + free-form) ─────────────────────────────
const CONCEPT_CATEGORIES: Record<string, string[]> = {
    'Mathematics': ['Derivatives', 'Integration', 'Linear Algebra', 'Probability', 'Geometry'],
    'Physics': ['Mechanics', 'Thermodynamics', 'Electromagnetism', 'Optics', 'Quantum Basics'],
    'Computer Science': ['Data Structures', 'Algorithms', 'Operating Systems', 'Databases', 'Networking'],
    'Chemistry': ['Atomic Structure', 'Bonding', 'Stoichiometry', 'Organic Chem', 'Periodicity'],
    'Biology': ['Cell Biology', 'Genetics', 'Evolution', 'Ecology', 'Physiology'],
    'History': ['World War I', 'World War II', 'Ancient Rome', 'Industrial Revolution', 'Cold War'],
    'English': ['Grammar', 'Essay Structure', 'Literary Devices', 'Reading Comp', 'Creative Writing'],
};

type Mode = 'practice' | 'exam';
type Phase = 'select' | 'question' | 'feedback' | 'results';

interface Question {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    difficulty: Difficulty;
    hint?: string;
}

interface SessionStats {
    xp: number;
    streak: number;
    maxStreak: number;
    correct: number;
    total: number;
    hintsUsed: number;
}

// ── XP calculation ─────────────────────────────────────────────────────────
function calcXP(isCorrect: boolean, diff: Difficulty, timeMs: number, streak: number, confidence: Confidence | null): number {
    if (!isCorrect) return 0;
    const base = diff === 'easy' ? 10 : diff === 'medium' ? 20 : 35;
    const streakBonus = Math.min(streak * 3, 30);
    const speedBonus = timeMs < 10000 ? 10 : timeMs < 20000 ? 5 : 0;
    const confBonus = confidence === 'sure' ? 5 : 0;
    return base + streakBonus + speedBonus + confBonus;
}

function xpToLevel(xp: number): { level: number; progress: number; needed: number } {
    const thresholds = [0, 50, 150, 300, 500, 750, 1100, 1500, 2100, 3000];
    let level = 1;
    for (let i = 1; i < thresholds.length; i++) if (xp >= thresholds[i]) level = i + 1;
    const cur = thresholds[Math.min(level - 1, thresholds.length - 1)];
    const next = thresholds[Math.min(level, thresholds.length - 1)];
    return { level, progress: next > cur ? ((xp - cur) / (next - cur)) * 100 : 100, needed: next - xp };
}

// ── API call ──────────────────────────────────────────────────────────────
async function fetchQuestion(
    concept: string,
    difficulty: number,
    prevQuestions: string[],
    diffLabel: Difficulty,
    previousExamSummary?: ExamHistorySummary | null
): Promise<Question | null> {
    try {
        const res = await fetch('/api/adaptive-assessment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                concept,
                difficulty,
                emotionalState: 'neutral',
                previousQuestions: prevQuestions.slice(-8),
                previousExamSummary: previousExamSummary ?? null,
            }),
        });
        const data = await res.json();
        const q = data.question;
        if (!q || !q.options) return null;
        return {
            question: q.question,
            options: q.options,
            correctIndex: q.correctIndex ?? 0,
            explanation: q.explanation ?? '',
            difficulty: diffLabel,
            hint: q.hint ?? `Think about the core definition of ${concept} before eliminating options.`,
        };
    } catch { return null; }
}

const DIFF_COLORS: Record<Difficulty, { color: string; bg: string; border: string }> = {
    easy: { color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
    medium: { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    hard: { color: '#b91c1c', bg: '#fff5f5', border: '#fecaca' },
};

export default function AssessmentPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    // ── Setup state ───────────────────────────────────────────────────────────
    const [mode, setMode] = useState<Mode>('practice');
    const [phase, setPhase] = useState<Phase>('select');
    const [concept, setConcept] = useState('Derivatives');
    const [customConcept, setCustomConcept] = useState('');
    const [questionCount, setQuestionCount] = useState(10);
    const [diffLevel, setDiffLevel] = useState<Difficulty>('medium');
    const [openCategory, setOpenCategory] = useState<string | null>('Mathematics');

    // ── Session state ─────────────────────────────────────────────────────────
    const [currentQ, setCurrentQ] = useState<Question | null>(null);
    const [examQueue, setExamQueue] = useState<Question[]>([]);
    const [qIndex, setQIndex] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [confidence, setConfidence] = useState<Confidence | null>(null);
    const [responses, setResponses] = useState<ResponseRecord[]>([]);
    const [loadingQ, setLoadingQ] = useState(false);
    const [difficulty, setDifficulty] = useState(0.35);
    const [askedQuestions, setAskedQuestions] = useState<string[]>([]);
    const [hintVisible, setHintVisible] = useState(false);
    const [stats, setStats] = useState<SessionStats>({ xp: 0, streak: 0, maxStreak: 0, correct: 0, total: 0, hintsUsed: 0 });

    // ── Timer ─────────────────────────────────────────────────────────────────
    const [timeLeft, setTimeLeft] = useState(90);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef<number>(0);

    // ── XP animation ─────────────────────────────────────────────────────────
    const [xpPop, setXpPop] = useState<number | null>(null);

    // ── Fullscreen proctoring (exam mode only) ────────────────────────────────
    const [fsWarnings, setFsWarnings] = useState(0);
    const [showWarning, setShowWarning] = useState(false);
    const [sessionTerminated, setSessionTerminated] = useState(false);
    const MAX_WARNINGS = 2;

    const enterFullscreen = useCallback(() => {
        const el = document.documentElement as any;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
    }, []);

    const exitFullscreen = useCallback(() => {
        const doc = document as any;
        if (doc.exitFullscreen) doc.exitFullscreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
    }, []);

    // Detect fullscreen exits during exam
    useEffect(() => {
        if (mode !== 'exam' || phase === 'select' || phase === 'results' || sessionTerminated) return;
        const handleFsChange = () => {
            const doc = document as any;
            const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement);
            if (!isFs && (phase === 'question' || phase === 'feedback')) {
                setFsWarnings(prev => {
                    const next = prev + 1;
                    if (next > MAX_WARNINGS) {
                        // 3rd violation — terminate
                        exitFullscreen();
                        setSessionTerminated(true);
                        setShowWarning(false);
                        if (timerRef.current) clearInterval(timerRef.current);
                    } else {
                        setShowWarning(true);
                    }
                    return next;
                });
            }
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFsChange);
            document.removeEventListener('webkitfullscreenchange', handleFsChange);
        };
    }, [mode, phase, sessionTerminated, exitFullscreen]);

    useEffect(() => {
        if (!loading && !user) router.replace('/login');
    }, [user, loading, router]);

    useEffect(() => {
        if (router.query.mode === 'exam') setMode('exam');
    }, [router.query]);

    const activeConcept = customConcept.trim() || concept;

    // ── Difficulty mapping ────────────────────────────────────────────────────
    const diffNumMap: Record<Difficulty, number> = { easy: 0.2, medium: 0.45, hard: 0.8 };

    // ── Timer ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (phase === 'question' && mode === 'exam') {
            const limit = 90;
            setTimeLeft(limit);
            timerRef.current = setInterval(() => {
                setTimeLeft(t => {
                    if (t <= 1) { clearInterval(timerRef.current!); handleAutoSubmit(); return 0; }
                    return t - 1;
                });
            }, 1000);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [phase, currentQ]); // eslint-disable-line

    const handleAutoSubmit = useCallback(() => {
        if (!currentQ) return;
        const rec: ResponseRecord = {
            question: currentQ.question, selectedIndex: -1, correctIndex: currentQ.correctIndex,
            isCorrect: false, explanation: currentQ.explanation, difficulty: currentQ.difficulty,
            confidence: null, timeMs: 90000, xpGained: 0,
        };
        const updated = [...responses, rec];
        setResponses(updated);
        setStats(s => ({ ...s, streak: 0, total: s.total + 1 }));
        advanceExam(updated);
    }, [currentQ, responses]); // eslint-disable-line

    // ── Start session ─────────────────────────────────────────────────────────
    const startSession = async () => {
        setResponses([]); setAskedQuestions([]); setQIndex(0); setHintVisible(false);
        setStats({ xp: 0, streak: 0, maxStreak: 0, correct: 0, total: 0, hintsUsed: 0 });
        const initDiff = diffNumMap[diffLevel];
        setDifficulty(initDiff);

        // Load prior exam data for adaptive question generation
        const priorExam = loadPriorExamSummary(activeConcept);

        if (mode === 'exam') {
            // Enter fullscreen for exam proctoring
            setFsWarnings(0); setSessionTerminated(false); setShowWarning(false);
            enterFullscreen();
            setLoadingQ(true);
            const diffs: Difficulty[] = Array.from({ length: questionCount }, (_, i) => {
                const ratio = i / questionCount;
                return ratio < 0.3 ? 'easy' : ratio < 0.7 ? 'medium' : 'hard';
            });
            const questions: Question[] = [];
            const asked: string[] = [];
            for (const d of diffs) {
                // Pass prior exam summary so Gemini can target weak areas
                const q = await fetchQuestion(activeConcept, diffNumMap[d], asked, d, priorExam);
                if (q) { questions.push(q); asked.push(q.question); }
            }
            setExamQueue(questions);
            setCurrentQ(questions[0] || null);
            setLoadingQ(false);
            setPhase('question');
            startTimeRef.current = Date.now();
        } else {
            await loadNextPracticeQuestion([], initDiff, priorExam);
        }
    };

    const loadNextPracticeQuestion = async (asked: string[], diff: number, priorExam?: ExamHistorySummary | null) => {
        setLoadingQ(true); setSelectedOption(null); setConfidence(null); setHintVisible(false);
        const dl: Difficulty = diff < 0.33 ? 'easy' : diff < 0.66 ? 'medium' : 'hard';
        const q = await fetchQuestion(activeConcept, diff, asked, dl, priorExam);
        setCurrentQ(q); setLoadingQ(false); setPhase('question');
        startTimeRef.current = Date.now();
    };

    const submitAnswer = (idx: number) => {
        if (!currentQ) return;
        if (timerRef.current) clearInterval(timerRef.current);
        const elapsed = Date.now() - startTimeRef.current;
        const isCorrect = idx === currentQ.correctIndex;
        const xpGained = calcXP(isCorrect, currentQ.difficulty, elapsed, stats.streak, confidence);

        setStats(s => {
            const newStreak = isCorrect ? s.streak + 1 : 0;
            return { xp: s.xp + xpGained, streak: newStreak, maxStreak: Math.max(s.maxStreak, newStreak), correct: s.correct + (isCorrect ? 1 : 0), total: s.total + 1, hintsUsed: s.hintsUsed };
        });

        if (xpGained > 0) { setXpPop(xpGained); setTimeout(() => setXpPop(null), 1500); }

        const rec: ResponseRecord = {
            question: currentQ.question, selectedIndex: idx, correctIndex: currentQ.correctIndex,
            isCorrect, explanation: currentQ.explanation, difficulty: currentQ.difficulty,
            confidence, timeMs: elapsed, xpGained,
        };
        const updated = [...responses, rec];
        setResponses(updated);
        const newAsked = [...askedQuestions, currentQ.question];
        setAskedQuestions(newAsked);

        if (mode === 'exam') {
            advanceExam(updated);
        } else {
            const recent = updated.slice(-4);
            const acc = recent.filter(r => r.isCorrect).length / recent.length;
            const newDiff = Math.max(0.1, Math.min(0.95, difficulty + (acc > 0.75 ? 0.12 : acc < 0.4 ? -0.12 : 0)));
            setDifficulty(newDiff);
            setPhase('feedback');
        }
    };

    const advanceExam = (recs: ResponseRecord[]) => {
        const next = recs.length;
        if (next >= examQueue.length || next >= questionCount) {
            // Save exam history for adaptive follow-up exams
            saveExamHistory(activeConcept, recs);
            // Save to Knowledge Galaxy and trigger live 3D update
            saveSessionToGalaxy(activeConcept, recs.map(r => ({ isCorrect: r.isCorrect, timeMs: r.timeMs })));
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('cogniflow_update'));
            setPhase('results'); return;
        }
        setCurrentQ(examQueue[next]); setQIndex(next); setSelectedOption(null); setConfidence(null);
        startTimeRef.current = Date.now(); setPhase('question');
    };

    const handleNextPractice = async () => {
        if (responses.length >= questionCount) {
            // Save exam history for adaptive follow-up sessions
            saveExamHistory(activeConcept, responses);
            // Save to Knowledge Galaxy and trigger live 3D update
            saveSessionToGalaxy(activeConcept, responses.map(r => ({ isCorrect: r.isCorrect, timeMs: r.timeMs })));
            if (typeof window !== 'undefined') window.dispatchEvent(new Event('cogniflow_update'));
            setPhase('results'); return;
        }
        await loadNextPracticeQuestion(askedQuestions, difficulty);
    };

    if (loading || !user) return null;

    // ── Session Terminated Screen (3rd violation) ─────────────────────────────
    if (sessionTerminated) {
        return (
            <>
                <Head><title>Session Ended — CogniFlow</title></Head>
                <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div style={{ background: '#1e293b', border: '1px solid #dc2626', borderRadius: '16px', padding: '3rem 2.5rem', maxWidth: '460px', width: '100%', textAlign: 'center' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#fee2e2', margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        </div>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 0.75rem' }}>Exam Session Terminated</h1>
                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.6', margin: '0 0 0.5rem' }}>
                            You exited fullscreen <strong style={{ color: '#f87171' }}>3 times</strong>. Your exam session has been permanently ended.
                        </p>
                        <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '0 0 2rem' }}>
                            Score recorded: <strong style={{ color: '#f87171' }}>{responses.length > 0 ? Math.round((responses.filter(r => r.isCorrect).length / responses.length) * 100) : 0}%</strong> ({responses.filter(r => r.isCorrect).length}/{responses.length} answered before termination)
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                                onClick={() => { setSessionTerminated(false); setPhase('select'); setResponses([]); setFsWarnings(0); }}
                                style={{ padding: '0.7rem 1.5rem', borderRadius: '8px', background: '#334155', color: '#f8fafc', border: 'none', fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem' }}
                            >Back to Setup</button>
                            <button
                                onClick={() => router.push('/dashboard')}
                                style={{ padding: '0.7rem 1.5rem', borderRadius: '8px', background: '#dc2626', color: '#fff', border: 'none', fontWeight: '600', cursor: 'pointer', fontSize: '0.9rem' }}
                            >Go to Dashboard</button>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // ── Warning overlay (fullscreen exit detected during exam) ────────────────
    const WarningOverlay = () => !showWarning ? null : (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#fff', borderRadius: '16px', padding: '2.5rem', maxWidth: '420px', width: '90%', textAlign: 'center', border: `2px solid ${fsWarnings >= MAX_WARNINGS ? '#dc2626' : '#f59e0b'}` }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: fsWarnings >= MAX_WARNINGS ? '#fee2e2' : '#fffbeb', margin: '0 auto 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={fsWarnings >= MAX_WARNINGS ? '#dc2626' : '#f59e0b'} strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1e293b', margin: '0 0 0.5rem' }}>
                    {fsWarnings >= MAX_WARNINGS ? 'Final Warning!' : `Warning ${fsWarnings} of ${MAX_WARNINGS}`}
                </h2>
                <p style={{ color: '#475569', fontSize: '0.9rem', lineHeight: '1.6', margin: '0 0 0.5rem' }}>
                    You left fullscreen mode during an exam. This is not allowed.
                </p>
                <p style={{ color: fsWarnings >= MAX_WARNINGS ? '#dc2626' : '#92400e', fontSize: '0.85rem', fontWeight: '600', margin: '0 0 1.75rem' }}>
                    {fsWarnings >= MAX_WARNINGS
                        ? 'One more exit will permanently end your session.'
                        : `${MAX_WARNINGS - fsWarnings} warning${MAX_WARNINGS - fsWarnings !== 1 ? 's' : ''} remaining before session termination.`}
                </p>
                <button
                    onClick={() => { setShowWarning(false); enterFullscreen(); }}
                    style={{ padding: '0.75rem 2rem', borderRadius: '9px', background: fsWarnings >= MAX_WARNINGS ? '#dc2626' : '#2563eb', color: '#fff', border: 'none', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', width: '100%' }}
                >
                    Return to Fullscreen to Continue
                </button>
            </div>
        </div>
    );

    // ── Reusable: XP pop animation ────────────────────────────────────────────

    const XpPop = () => xpPop ? (
        <div style={{ position: 'fixed', top: '80px', right: '20px', zIndex: 9999, background: '#15803d', color: 'white', fontWeight: '800', fontSize: '1.1rem', padding: '0.4rem 1rem', borderRadius: '9999px', animation: 'xpPop 1.5s ease forwards', pointerEvents: 'none' }}>
            +{xpPop} XP
        </div>
    ) : null;

    // ── Stats bar ─────────────────────────────────────────────────────────────
    const StatsBar = () => {
        const { level, progress } = xpToLevel(stats.xp);
        return (
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', padding: '0.75rem 1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '160px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.85rem' }}>L{level}</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '3px' }}>{stats.xp} XP</div>
                        <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px' }}>
                            <div style={{ height: '100%', background: '#7c3aed', borderRadius: '3px', width: `${progress}%`, transition: 'width 0.5s' }} />
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'center', padding: '0 0.75rem', borderLeft: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: '800', color: stats.streak >= 5 ? '#dc2626' : stats.streak >= 3 ? '#b45309' : '#1e293b' }}>{stats.streak}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Streak</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0 0.75rem', borderLeft: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#16a34a' }}>{stats.correct}</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Correct</div>
                </div>
                <div style={{ textAlign: 'center', padding: '0 0.75rem', borderLeft: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#1e293b' }}>{stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0}%</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Accuracy</div>
                </div>
                {stats.maxStreak >= 3 && (
                    <div style={{ textAlign: 'center', padding: '0 0.75rem', borderLeft: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '1rem', fontWeight: '700', color: '#dc2626' }}>Best: {stats.maxStreak}</div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Max Streak</div>
                    </div>
                )}
            </div>
        );
    };

    // ── RESULTS ───────────────────────────────────────────────────────────────
    if (phase === 'results') {
        const correct = responses.filter(r => r.isCorrect).length;
        const total = responses.length;
        const score = total > 0 ? Math.round((correct / total) * 100) : 0;
        const avgTime = total > 0 ? Math.round(responses.reduce((s, r) => s + r.timeMs, 0) / total / 1000) : 0;
        const totalXP = responses.reduce((s, r) => s + r.xpGained, 0);
        const { level } = xpToLevel(stats.xp);

        return (
            <>
                <Head><title>Results — CogniFlow</title></Head>
                <AppLayout>
                    <div style={{ maxWidth: '780px', margin: '2rem auto', padding: '0 1.5rem' }}>
                        {/* Score hero */}
                        <div className="card" style={{ padding: '2.5rem', textAlign: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ fontSize: '4rem', fontWeight: '900', color: score >= 80 ? '#16a34a' : score >= 50 ? '#b45309' : '#dc2626', lineHeight: 1 }}>{score}%</div>
                            <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginTop: '0.5rem' }}>{mode === 'exam' ? 'Exam Complete' : 'Practice Session Done'}</div>
                            <p style={{ color: '#64748b', margin: '0.25rem 0 1.5rem' }}>{correct} of {total} correct &nbsp;·&nbsp; {activeConcept} &nbsp;·&nbsp; Avg {avgTime}s/question</p>

                            {/* Mini stat grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
                                {[
                                    { label: 'XP Earned', value: `+${totalXP}`, color: '#7c3aed', bg: '#f5f3ff' },
                                    { label: 'Level', value: `L${level}`, color: '#2563eb', bg: '#eff6ff' },
                                    { label: 'Best Streak', value: stats.maxStreak, color: '#dc2626', bg: '#fff5f5' },
                                    { label: 'Avg Time', value: `${avgTime}s`, color: '#0369a1', bg: '#f0f9ff' },
                                ].map((s, i) => (
                                    <div key={i} style={{ padding: '0.875rem', borderRadius: '8px', background: s.bg }}>
                                        <div style={{ fontSize: '1.4rem', fontWeight: '800', color: s.color }}>{s.value}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>{s.label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Accuracy breakdown by difficulty */}
                            {(['easy', 'medium', 'hard'] as Difficulty[]).filter(d => responses.some(r => r.difficulty === d)).map(d => {
                                const dRecs = responses.filter(r => r.difficulty === d);
                                const dCorrect = dRecs.filter(r => r.isCorrect).length;
                                const dPct = dRecs.length ? Math.round((dCorrect / dRecs.length) * 100) : 0;
                                const dc = DIFF_COLORS[d];
                                return (
                                    <div key={d} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: dc.color, background: dc.bg, border: `1px solid ${dc.border}`, borderRadius: '4px', padding: '2px 6px', width: '52px', textAlign: 'center', textTransform: 'capitalize' }}>{d}</span>
                                        <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px' }}>
                                            <div style={{ height: '100%', background: dc.color, borderRadius: '4px', width: `${dPct}%` }} />
                                        </div>
                                        <span style={{ fontSize: '0.8rem', color: '#334155', fontWeight: '600', width: '40px' }}>{dPct}%</span>
                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{dCorrect}/{dRecs.length}</span>
                                    </div>
                                );
                            })}

                            <div style={{ marginTop: '1.75rem', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button className="btn-secondary" onClick={() => { setPhase('select'); setResponses([]); }}>Change Settings</button>
                                <button className="btn-primary" onClick={startSession}>
                                    {loadPriorExamSummary(activeConcept) ? '🎯 Adaptive Retry (AI targets weak areas)' : 'Practice Again'}
                                </button>
                            </div>
                            {loadPriorExamSummary(activeConcept) && (
                                <div style={{ marginTop: '0.75rem', padding: '0.6rem 1rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.82rem', color: '#1d4ed8', textAlign: 'center' }}>
                                    ✨ <strong>Adaptive mode:</strong> Your next session will have AI-personalized questions targeting your weak areas from this exam.
                                </div>
                            )}
                        </div>

                        {/* Per-question review */}
                        <div className="card" style={{ padding: '1.5rem' }}>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1e293b', marginBottom: '1rem', marginTop: 0 }}>Question Review</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {responses.map((r, i) => {
                                    const dc = DIFF_COLORS[r.difficulty];
                                    return (
                                        <div key={i} style={{ padding: '0.875rem 1rem', borderRadius: '8px', border: `1px solid ${r.isCorrect ? '#bbf7d0' : '#fecaca'}`, background: r.isCorrect ? '#f0fdf4' : '#fff5f5', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                            <div style={{ flexShrink: 0, width: '22px', height: '22px', borderRadius: '50%', background: r.isCorrect ? '#dcfce7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
                                                {r.isCorrect ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                    <span style={{ fontWeight: '500', color: '#1e293b', fontSize: '0.85rem' }}>Q{i + 1}. {r.question}</span>
                                                    <span style={{ fontSize: '0.7rem', fontWeight: '600', color: dc.color, background: dc.bg, border: `1px solid ${dc.border}`, borderRadius: '4px', padding: '1px 5px', textTransform: 'capitalize', flexShrink: 0 }}>{r.difficulty}</span>
                                                </div>
                                                {!r.isCorrect && r.explanation && (
                                                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px solid #fecaca' }}>{r.explanation}</div>
                                                )}
                                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.3rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                                                    <span>{(r.timeMs / 1000).toFixed(1)}s</span>
                                                    {r.xpGained > 0 && <span style={{ color: '#7c3aed', fontWeight: '600' }}>+{r.xpGained} XP</span>}
                                                    {r.confidence && <span>Confidence: {r.confidence}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </AppLayout>
                <style>{`@keyframes xpPop { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-40px) scale(1.3)} }`}</style>
            </>
        );
    }

    // ── SETUP SCREEN ───────────────────────────────────────────────────────────
    if (phase === 'select') {
        return (
            <>
                <Head><title>Assessment — CogniFlow</title></Head>
                <AppLayout>
                    <div style={{ maxWidth: '840px', margin: '2rem auto', padding: '0 1.5rem' }}>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#1e293b', marginBottom: '1.5rem' }}>New Assessment</h1>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.25rem' }}>
                            {/* Left — concept picker */}
                            <div>
                                <div className="card" style={{ padding: '1.5rem', marginBottom: '1.25rem' }}>
                                    <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', margin: '0 0 0.75rem' }}>Select Concept</h2>

                                    {/* Free-form input */}
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label className="section-label">Type any concept</label>
                                        <input
                                            type="text"
                                            className="input"
                                            placeholder="e.g. Photosynthesis, Machine Learning, Calculus..."
                                            value={customConcept}
                                            onChange={e => setCustomConcept(e.target.value)}
                                        />
                                        {customConcept.trim() && (
                                            <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#2563eb' }}>
                                                Using: <strong>{customConcept.trim()}</strong>
                                            </div>
                                        )}
                                    </div>

                                    {/* Category tabs */}
                                    <div className="section-label" style={{ marginBottom: '0.5rem' }}>Or choose from library</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                                        {Object.keys(CONCEPT_CATEGORIES).map(cat => (
                                            <button
                                                key={cat}
                                                onClick={() => { setOpenCategory(openCategory === cat ? null : cat); setCustomConcept(''); }}
                                                style={{
                                                    padding: '0.3rem 0.75rem', borderRadius: '9999px', fontSize: '0.8rem',
                                                    fontWeight: openCategory === cat ? '600' : '400',
                                                    border: `1px solid ${openCategory === cat ? '#2563eb' : '#e2e8f0'}`,
                                                    background: openCategory === cat ? '#2563eb' : '#fff',
                                                    color: openCategory === cat ? '#fff' : '#374151',
                                                    cursor: 'pointer', transition: 'all 0.12s',
                                                }}
                                            >{cat}</button>
                                        ))}
                                    </div>

                                    {/* Concept chips */}
                                    {openCategory && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                            {CONCEPT_CATEGORIES[openCategory].map(c => (
                                                <button
                                                    key={c}
                                                    onClick={() => { setConcept(c); setCustomConcept(''); }}
                                                    style={{
                                                        padding: '0.35rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem',
                                                        fontWeight: concept === c && !customConcept ? '600' : '400',
                                                        border: `1px solid ${concept === c && !customConcept ? '#2563eb' : '#e2e8f0'}`,
                                                        background: concept === c && !customConcept ? '#eff6ff' : '#f8fafc',
                                                        color: concept === c && !customConcept ? '#1d4ed8' : '#374151',
                                                        cursor: 'pointer', transition: 'all 0.12s',
                                                    }}
                                                >{c}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Mode selection */}
                                <div className="card" style={{ padding: '1.25rem' }}>
                                    <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', margin: '0 0 0.75rem' }}>Mode</h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        {(['practice', 'exam'] as Mode[]).map(m => (
                                            <button key={m} onClick={() => setMode(m)} style={{
                                                padding: '1rem', borderRadius: '10px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                                                border: `2px solid ${mode === m ? (m === 'practice' ? '#2563eb' : '#16a34a') : '#e2e8f0'}`,
                                                background: mode === m ? (m === 'practice' ? '#eff6ff' : '#f0fdf4') : '#f8fafc',
                                            }}>
                                                <div style={{ fontWeight: '700', fontSize: '0.9rem', color: mode === m ? (m === 'practice' ? '#1d4ed8' : '#15803d') : '#334155' }}>
                                                    {m === 'practice' ? 'Practice Mode' : 'Exam Mode'}
                                                </div>
                                                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.25rem' }}>
                                                    {m === 'practice' ? 'AI hints, explanations, confidence check' : 'Timed, no hints, scored at end'}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Right — settings panel */}
                            <div>
                                <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
                                    <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', margin: '0 0 1rem' }}>Settings</h2>

                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <label className="section-label">Questions: <strong>{questionCount}</strong></label>
                                        <input type="range" min={5} max={50} step={5} value={questionCount}
                                            onChange={e => setQuestionCount(Number(e.target.value))}
                                            style={{ width: '100%', accentColor: '#2563eb' }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginTop: '3px' }}>
                                            <span>5</span><span>50</span>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <label className="section-label">Difficulty</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                            {(['easy', 'medium', 'hard'] as Difficulty[]).map(d => {
                                                const dc = DIFF_COLORS[d];
                                                return (
                                                    <button key={d} onClick={() => setDiffLevel(d)} style={{
                                                        padding: '0.5rem', borderRadius: '7px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.12s',
                                                        border: `1.5px solid ${diffLevel === d ? dc.color : '#e2e8f0'}`,
                                                        background: diffLevel === d ? dc.bg : '#ffffff',
                                                        color: diffLevel === d ? dc.color : '#475569',
                                                    }}>{d}</button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Summary */}
                                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.875rem', fontSize: '0.82rem', color: '#475569', lineHeight: '1.7' }}>
                                        <div><strong>Concept:</strong> {activeConcept}</div>
                                        <div><strong>Mode:</strong> {mode === 'practice' ? 'Practice (AI assisted)' : 'Exam (timed)'}</div>
                                        <div><strong>Questions:</strong> {questionCount}</div>
                                        <div><strong>Difficulty:</strong> <span style={{ color: DIFF_COLORS[diffLevel].color, textTransform: 'capitalize' }}>{diffLevel}</span></div>
                                    </div>
                                </div>

                                <button
                                    className="btn-primary"
                                    style={{ width: '100%', padding: '1rem', fontSize: '1rem', fontWeight: '700' }}
                                    onClick={startSession}
                                >
                                    Start {mode === 'practice' ? 'Practice' : 'Exam'}
                                </button>
                            </div>
                        </div>
                    </div>
                </AppLayout>
            </>
        );
    }

    // ── LOADING ────────────────────────────────────────────────────────────────
    if (loadingQ || !currentQ) {
        return (
            <>
                <Head><title>Assessment — CogniFlow</title></Head>
                <AppLayout>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Generating {activeConcept} question with AI...</p>
                    </div>
                </AppLayout>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </>
        );
    }

    // ── PRACTICE FEEDBACK ──────────────────────────────────────────────────────
    if (phase === 'feedback' && mode === 'practice') {
        const last = responses[responses.length - 1];
        const dc = DIFF_COLORS[last.difficulty];
        return (
            <>
                <Head><title>Feedback — CogniFlow</title></Head>
                <AppLayout>
                    <div style={{ maxWidth: '700px', margin: '2rem auto', padding: '0 1.5rem' }}>
                        <StatsBar />
                        <div className="card" style={{ padding: '2rem' }}>
                            <div style={{ padding: '1rem', borderRadius: '8px', background: last.isCorrect ? '#f0fdf4' : '#fff5f5', border: `1px solid ${last.isCorrect ? '#bbf7d0' : '#fecaca'}`, marginBottom: '1.5rem' }}>
                                <div style={{ fontWeight: '700', fontSize: '1rem', color: last.isCorrect ? '#15803d' : '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    {last.isCorrect ? 'Correct!' : 'Incorrect'}
                                    {last.xpGained > 0 && <span style={{ fontSize: '0.85rem', background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: '9999px', fontWeight: '800' }}>+{last.xpGained} XP</span>}
                                    {last.isCorrect && stats.streak >= 3 && <span style={{ fontSize: '0.85rem', background: '#fff5f5', color: '#dc2626', padding: '2px 8px', borderRadius: '9999px' }}>{stats.streak} streak!</span>}
                                </div>
                                {!last.isCorrect && <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '0.25rem' }}>Correct answer was option {last.correctIndex + 1}.</div>}
                            </div>

                            {!last.isCorrect && last.explanation && (
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <div className="section-label">AI Explanation</div>
                                    <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.875rem', color: '#334155', lineHeight: '1.65' }}>
                                        {last.explanation}
                                    </div>
                                </div>
                            )}

                            {!last.isCorrect && (
                                <div style={{ marginBottom: '1.25rem', padding: '0.875rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px' }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: '600', color: '#92400e', marginBottom: '0.25rem' }}>Study Tip</div>
                                    <p style={{ fontSize: '0.85rem', color: '#78350f', margin: 0 }}>
                                        Review <strong>{activeConcept}</strong>. Next question will be slightly easier to reinforce this area.
                                    </p>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Q{responses.length} of {questionCount} &nbsp;·&nbsp; <span style={{ textTransform: 'capitalize' }}>{last.difficulty}</span></span>
                                <button className="btn-primary" onClick={responses.length >= questionCount ? () => setPhase('results') : handleNextPractice}>
                                    {responses.length >= questionCount ? 'View Results' : 'Next Question'}
                                </button>
                            </div>
                        </div>
                    </div>
                </AppLayout>
            </>
        );
    }

    // ── QUESTION SCREEN ────────────────────────────────────────────────────────
    const qNum = mode === 'exam' ? qIndex + 1 : responses.length + 1;
    const progress = ((qNum - 1) / questionCount) * 100;
    const dc = DIFF_COLORS[currentQ.difficulty];

    return (
        <>
            <Head><title>Assessment — CogniFlow</title></Head>
            <XpPop />
            <AppLayout>
                <div style={{ maxWidth: '700px', margin: '2rem auto', padding: '0 1.5rem' }}>
                    <StatsBar />

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className={`badge ${mode === 'practice' ? 'badge-blue' : 'badge-green'}`}>{mode}</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: '600', color: dc.color, background: dc.bg, border: `1px solid ${dc.border}`, padding: '2px 7px', borderRadius: '4px', textTransform: 'capitalize' }}>{currentQ.difficulty}</span>
                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>{activeConcept} · Q{qNum}/{questionCount}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {mode === 'exam' && (
                                <div style={{ fontSize: '0.95rem', fontWeight: '800', color: timeLeft <= 15 ? '#dc2626' : '#374151', background: timeLeft <= 15 ? '#fee2e2' : '#f1f5f9', padding: '0.3rem 0.875rem', borderRadius: '6px' }}>
                                    {timeLeft}s
                                </div>
                            )}
                            <button
                                onClick={() => setPhase('results')}
                                style={{ fontSize: '0.75rem', color: '#dc2626', background: 'transparent', border: '1px solid #fecaca', padding: '0.3rem 0.75rem', borderRadius: '5px', cursor: 'pointer', fontWeight: '600' }}
                            >
                                End Session
                            </button>
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: '5px', background: '#e2e8f0', borderRadius: '3px', marginBottom: '1.25rem' }}>
                        <div style={{ height: '100%', background: '#2563eb', borderRadius: '3px', width: `${progress}%`, transition: 'width 0.3s' }} />
                    </div>

                    {/* Question card */}
                    <div className="card" style={{ padding: '2rem' }}>
                        <p style={{ fontSize: '1.05rem', fontWeight: '600', color: '#1e293b', lineHeight: '1.65', marginBottom: '1.5rem', marginTop: 0 }}>
                            {currentQ.question}
                        </p>

                        {/* Options */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.5rem' }}>
                            {currentQ.options.map((opt, i) => {
                                const sel = selectedOption === i;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            setSelectedOption(i);
                                            if (mode === 'practice' && confidence) submitAnswer(i);
                                        }}
                                        style={{
                                            textAlign: 'left', padding: '0.9rem 1rem', borderRadius: '9px',
                                            border: `1.5px solid ${sel ? '#2563eb' : '#e2e8f0'}`,
                                            background: sel ? '#eff6ff' : '#ffffff',
                                            color: sel ? '#1d4ed8' : '#334155',
                                            fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'inherit',
                                            fontWeight: sel ? '600' : '400',
                                        }}
                                    >
                                        <span style={{ fontWeight: '700', marginRight: '0.6rem', color: sel ? '#2563eb' : '#94a3b8', fontSize: '0.82rem' }}>{String.fromCharCode(65 + i)}.</span>
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Practice: confidence check */}
                        {mode === 'practice' && selectedOption === null && (
                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                                <div className="section-label" style={{ marginBottom: '0.5rem' }}>How confident are you?</div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {([['sure', '#15803d', '#f0fdf4', '#bbf7d0'], ['unsure', '#b45309', '#fffbeb', '#fde68a'], ['guess', '#7c3aed', '#f5f3ff', '#e9d5ff']] as const).map(([c, col, bg, border]) => (
                                        <button
                                            key={c}
                                            onClick={() => setConfidence(c as Confidence)}
                                            style={{
                                                padding: '0.45rem 1rem', borderRadius: '7px', fontSize: '0.82rem', fontWeight: confidence === c ? '700' : '500',
                                                border: `1.5px solid ${confidence === c ? col : '#e2e8f0'}`,
                                                background: confidence === c ? bg : '#ffffff',
                                                color: confidence === c ? col : '#475569',
                                                cursor: 'pointer', transition: 'all 0.12s', textTransform: 'capitalize',
                                            }}
                                        >{c}</button>
                                    ))}
                                </div>
                                {confidence && selectedOption === null && (
                                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>Select an answer above to submit.</p>
                                )}
                            </div>
                        )}

                        {/* Practice: submit after selecting option (when confidence already chosen) */}
                        {mode === 'practice' && selectedOption !== null && confidence === null && (
                            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                                <div className="section-label" style={{ marginBottom: '0.5rem' }}>How confident are you?</div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {(['sure', 'unsure', 'guess'] as Confidence[]).map(c => (
                                        <button key={c} onClick={() => { setConfidence(c); submitAnswer(selectedOption!); }}
                                            style={{
                                                padding: '0.45rem 1rem', borderRadius: '7px', fontSize: '0.82rem', fontWeight: '500',
                                                border: '1.5px solid #e2e8f0', background: '#ffffff', color: '#475569',
                                                cursor: 'pointer', transition: 'all 0.12s', textTransform: 'capitalize',
                                            }}
                                        >{c}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Hint (practice only) */}
                        {mode === 'practice' && currentQ.hint && (
                            <div style={{ marginTop: '1rem' }}>
                                {!hintVisible ? (
                                    <button
                                        onClick={() => { setHintVisible(true); setStats(s => ({ ...s, hintsUsed: s.hintsUsed + 1 })); }}
                                        style={{ fontSize: '0.82rem', color: '#7c3aed', background: 'none', border: '1px solid #e9d5ff', borderRadius: '6px', padding: '0.35rem 0.75rem', cursor: 'pointer' }}
                                    >
                                        Show Hint
                                    </button>
                                ) : (
                                    <div style={{ padding: '0.75rem', background: '#fdf4ff', border: '1px solid #e9d5ff', borderRadius: '8px', fontSize: '0.85rem', color: '#6d28d9' }}>
                                        <strong>Hint:</strong> {currentQ.hint}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Exam submit button */}
                        {mode === 'exam' && (
                            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn-primary" onClick={() => selectedOption !== null && submitAnswer(selectedOption)} disabled={selectedOption === null}>
                                    Submit Answer
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </AppLayout>
            <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes xpPop { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-40px) scale(1.3)} }
      `}</style>
        </>
    );
}
