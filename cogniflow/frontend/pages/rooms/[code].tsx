import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AppLayout from '../../components/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { useRooms, Room } from '../../hooks/useRooms';
import { loadPriorExamSummary, ExamHistorySummary } from '../../lib/history-utils';

interface Question {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
}

interface ResponseRecord {
    questionIndex: number;
    selectedIndex: number;
    isCorrect: boolean;
    timeMs: number;
}

async function loadRoomQuestions(concept: string, count: number, history?: ExamHistorySummary | null): Promise<Question[]> {
    const questions: Question[] = [];
    const asked: string[] = [];
    const diffs = Array.from({ length: count }, (_, i) => 0.3 + (i / count) * 0.55);
    for (const diff of diffs) {
        try {
            const res = await fetch('/api/adaptive-assessment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concept,
                    difficulty: diff,
                    emotionalState: 'neutral',
                    previousQuestions: asked.slice(-5),
                    previousExamSummary: history ?? null, // Pass history for adaptive generation
                    seed: Date.now() + Math.random() // Ensure uniqueness
                }),
            });
            const data = await res.json();
            const q = data.question;
            if (q && q.options) {
                questions.push({ question: q.question, options: q.options, correctIndex: q.correctIndex ?? 0, explanation: q.explanation ?? '' });
                asked.push(q.question);
            }
        } catch { }
    }
    return questions;
}

export default function RoomPage() {
    const { user, loading } = useAuth();
    const { getRoom, startRoom, endRoom } = useRooms();
    const router = useRouter();
    const { code } = router.query as { code: string };

    const [room, setRoom] = useState<Room | null>(null);
    const [phase, setPhase] = useState<'lobby' | 'loading' | 'exam' | 'results'>('lobby');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [qIndex, setQIndex] = useState(0);
    const [selected, setSelected] = useState<number | null>(null);
    const [responses, setResponses] = useState<ResponseRecord[]>([]);
    const [timeLeft, setTimeLeft] = useState(60);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [prediction, setPrediction] = useState<ExamHistorySummary | null>(null);
    const startRef = useRef<number>(0);

    useEffect(() => {
        if (!loading && !user) router.replace('/login');
    }, [user, loading, router]);

    // Poll for room updates
    useEffect(() => {
        if (!code) return;
        const refresh = () => {
            const r = getRoom(code);
            setRoom(r);
            if (r) {
                // Load prediction based on room concept
                setPrediction(loadPriorExamSummary(r.concept));
            }
            // Auto-start exam when teacher switches room to active
            if (r && r.status === 'active' && phase === 'lobby') {
                handleBeginExam(r);
            }
        };
        refresh();
        const interval = setInterval(refresh, 1500);
        return () => clearInterval(interval);
    }, [code, phase]);

    // Timer per question
    useEffect(() => {
        if (phase !== 'exam' || !room) return;
        const limit = room.timePerQuestion;
        setTimeLeft(limit);
        timerRef.current = setInterval(() => {
            setTimeLeft(t => {
                if (t <= 1) {
                    clearInterval(timerRef.current!);
                    autoAdvance();
                    return 0;
                }
                return t - 1;
            });
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [qIndex, phase]);

    const handleBeginExam = async (r: Room) => {
        setPhase('loading');
        // Load prediction again to be sure (or use state)
        const hist = loadPriorExamSummary(r.concept);
        const qs = await loadRoomQuestions(r.concept, r.questionCount, hist);
        setQuestions(qs);
        setQIndex(0);
        setSelected(null);
        setResponses([]);
        startRef.current = Date.now();
        setPhase('exam');
    };

    const autoAdvance = () => {
        if (!room) return;
        const rec: ResponseRecord = { questionIndex: qIndex, selectedIndex: -1, isCorrect: false, timeMs: room.timePerQuestion * 1000 };
        advance([...responses, rec]);
    };

    const handleSubmit = () => {
        if (selected === null || !questions[qIndex]) return;
        if (timerRef.current) clearInterval(timerRef.current);
        const isCorrect = selected === questions[qIndex].correctIndex;
        const rec: ResponseRecord = { questionIndex: qIndex, selectedIndex: selected, isCorrect, timeMs: Date.now() - startRef.current };
        advance([...responses, rec]);
    };

    const advance = (updatedRecs: ResponseRecord[]) => {
        setResponses(updatedRecs);
        const next = qIndex + 1;
        if (next >= questions.length) {
            if (room && user?.email === room.createdBy) endRoom(room.code);
            setPhase('results');
        } else {
            setQIndex(next);
            setSelected(null);
            startRef.current = Date.now();
        }
    };

    const isTeacher = user && room && user.email === room.createdBy;

    if (loading || !user) return null;

    // ── Results ──
    if (phase === 'results') {
        const correct = responses.filter(r => r.isCorrect).length;
        const total = responses.length;
        const score = total > 0 ? Math.round((correct / total) * 100) : 0;
        return (
            <>
                <Head><title>Results — CogniFlow</title></Head>
                <AppLayout>
                    <div style={{ maxWidth: '600px', margin: '2rem auto', padding: '0 1.5rem' }}>
                        <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', fontWeight: '800', color: score >= 70 ? '#16a34a' : score >= 40 ? '#b45309' : '#dc2626' }}>{score}%</div>
                            <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', marginTop: '0.25rem' }}>Exam Room Complete</div>
                            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>{correct} of {total} correct</p>
                            <div style={{ marginTop: '2rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                                <button className="btn-secondary" onClick={() => router.push('/dashboard')}>Go to Dashboard</button>
                            </div>
                        </div>
                    </div>
                </AppLayout>
            </>
        );
    }

    // ── Loading questions ──
    if (phase === 'loading') {
        return (
            <>
                <Head><title>Loading Exam — CogniFlow</title></Head>
                <AppLayout>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                        <p style={{ color: '#64748b' }}>Preparing exam questions...</p>
                    </div>
                </AppLayout>
            </>
        );
    }

    // ── Exam question ──
    if (phase === 'exam' && questions[qIndex]) {
        const q = questions[qIndex];
        const progress = (qIndex / questions.length) * 100;
        const limit = room?.timePerQuestion ?? 60;
        return (
            <>
                <Head><title>Exam — CogniFlow Room {code}</title></Head>
                <AppLayout>
                    <div style={{ maxWidth: '680px', margin: '2rem auto', padding: '0 1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Room {code} &nbsp;·&nbsp; Q{qIndex + 1} / {questions.length}</span>
                            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: timeLeft <= 10 ? '#dc2626' : '#374151', background: timeLeft <= 10 ? '#fee2e2' : '#f1f5f9', padding: '0.3rem 0.75rem', borderRadius: '6px' }}>
                                {timeLeft}s
                            </div>
                        </div>
                        <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', marginBottom: '1.25rem' }}>
                            <div style={{ height: '100%', background: '#2563eb', width: `${progress}%`, borderRadius: '2px', transition: 'width 0.3s' }} />
                        </div>
                        <div className="card" style={{ padding: '2rem' }}>
                            <p style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b', lineHeight: '1.6', marginBottom: '1.5rem', marginTop: 0 }}>{q.question}</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                {q.options.map((opt, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelected(i)}
                                        style={{
                                            textAlign: 'left', padding: '0.875rem 1rem', borderRadius: '8px',
                                            border: `1.5px solid ${selected === i ? '#2563eb' : '#e2e8f0'}`,
                                            background: selected === i ? '#eff6ff' : '#ffffff',
                                            color: selected === i ? '#1d4ed8' : '#334155',
                                            fontSize: '0.9rem', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                                        }}
                                    >
                                        <span style={{ fontWeight: '600', marginRight: '0.5rem', color: '#94a3b8', fontSize: '0.8rem' }}>{String.fromCharCode(65 + i)}.</span>
                                        {opt}
                                    </button>
                                ))}
                            </div>
                            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn-primary" onClick={handleSubmit} disabled={selected === null}>Submit Answer</button>
                            </div>
                        </div>
                    </div>
                </AppLayout>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </>
        );
    }

    // ── Lobby ──
    return (
        <>
            <Head><title>Room {code} — CogniFlow</title></Head>
            <AppLayout>
                <div style={{ maxWidth: '620px', margin: '2rem auto', padding: '0 1.5rem' }}>
                    <div className="card" style={{ padding: '2rem' }}>
                        {/* Room info */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <div>
                                <h1 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#1e293b', margin: '0 0 0.25rem 0' }}>{room?.title || 'Loading...'}</h1>
                                {room && <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>{room.concept} &nbsp;·&nbsp; {room.questionCount} questions &nbsp;·&nbsp; {room.timePerQuestion}s / question</p>}
                            </div>
                            {room && <span className={`badge ${room.status === 'active' ? 'badge-green' : room.status === 'waiting' ? 'badge-amber' : 'badge-red'}`}>{room.status === 'waiting' ? 'Waiting' : room.status === 'active' ? 'Live' : 'Ended'}</span>}
                        </div>

                        {/* Room code big display */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.5rem', textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div className="section-label" style={{ textAlign: 'center' }}>Room Code</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800', letterSpacing: '0.15em', color: '#1e293b' }}>{code}</div>
                            <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.25rem' }}>Share this code with students</p>
                        </div>

                        {/* AI Prediction Card */}
                        {/* AI Prediction Card */}
                        {prediction && (
                            <div style={{ padding: '1.25rem', background: '#ecfdf5', borderRadius: '10px', border: '1px solid #6ee7b7', marginBottom: '1.5rem' }}>
                                <div className="section-label" style={{ color: '#047857' }}>AI Performance Prediction</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ fontSize: '2rem', filter: 'grayscale(0)' }}>
                                        {prediction.score >= 85 ? '🥇' : prediction.score >= 60 ? '🥈' : '📘'}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#065f46' }}>
                                            Expected Range: {Math.max(0, prediction.score - 10)}% - {Math.min(100, prediction.score + 10)}%
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#047857', marginTop: '0.2rem' }}>
                                            Based on your {prediction.totalQuestions} past answers in {prediction.concept}.
                                        </div>
                                    </div>
                                </div>
                                {prediction.wrongTopics.length > 0 && (
                                    <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#064e3b' }}>
                                        <strong>Focus areas:</strong> {prediction.wrongTopics.slice(0, 2).join(', ')}...
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Participants */}
                        {room && (
                            <div style={{ marginBottom: '1.5rem' }}>
                                <div className="section-label">{room.participants.length} Participant{room.participants.length !== 1 ? 's' : ''}</div>
                                {room.participants.length === 0 ? (
                                    <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No one has joined yet.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {room.participants.map(p => (
                                            <div key={p.email} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', background: '#f1f5f9', borderRadius: '9999px', fontSize: '0.83rem', color: '#334155' }}>
                                                <div style={{ width: '22px', height: '22px', background: '#e0e7ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '700', color: '#3730a3' }}>
                                                    {p.name[0].toUpperCase()}
                                                </div>
                                                {p.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Actions */}
                        {isTeacher && room?.status === 'waiting' && (
                            <button
                                className="btn-primary"
                                style={{ width: '100%', padding: '0.875rem', fontSize: '0.95rem' }}
                                onClick={async () => {
                                    startRoom(code);
                                    await handleBeginExam(room!);
                                }}
                                disabled={!room || room.participants.length === 0}
                            >
                                Start Exam for Everyone
                            </button>
                        )}
                        {isTeacher && room?.status === 'active' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ textAlign: 'center', color: '#059669', fontWeight: '600', padding: '0.75rem', background: '#ecfdf5', borderRadius: '8px' }}>
                                    Exam is Live! 🚀
                                </div>
                                <button
                                    className="btn-secondary"
                                    style={{ width: '100%', padding: '0.875rem', fontSize: '0.95rem', background: '#fee2e2', color: '#ef4444', borderColor: '#fecaca' }}
                                    onClick={() => endRoom(code)}
                                >
                                    End Exam Session
                                </button>
                            </div>
                        )}
                        {!isTeacher && room?.status === 'waiting' && (
                            <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.9rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                                Waiting for the teacher to start the exam...
                            </div>
                        )}
                        {room?.status === 'ended' && (
                            <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.9rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px' }}>
                                This exam has ended.
                            </div>
                        )}
                    </div>
                </div>
            </AppLayout >
        </>
    );
}
