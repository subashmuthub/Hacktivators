import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AppLayout from '../../components/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { useRooms } from '../../hooks/useRooms';

const CONCEPTS = ['Derivatives', 'Limits', 'Integration', 'Functions', 'Algebra', 'Probability', 'Statistics', 'Vectors'];

export default function CreateRoomPage() {
    const { user, loading } = useAuth();
    const { createRoom } = useRooms();
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [concept, setConcept] = useState('Derivatives');
    const [questionCount, setQuestionCount] = useState(10);
    const [timePerQ, setTimePerQ] = useState(60);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!loading && !user) router.replace('/login');
        if (!loading && user && user.role !== 'teacher') router.replace('/dashboard');
    }, [user, loading, router]);

    const handleCreate = () => {
        if (!title.trim() || !user) return;
        setSubmitting(true);
        const code = createRoom(title.trim(), concept, questionCount, timePerQ, user.email);
        router.push(`/rooms/${code}`);
    };

    if (loading || !user) return null;

    return (
        <>
            <Head><title>Create Room — CogniFlow</title></Head>
            <AppLayout>
                <div style={{ maxWidth: '560px', margin: '2rem auto', padding: '0 1.5rem' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>Create Exam Room</h1>
                        <p style={{ color: '#64748b', marginTop: '0.25rem', fontSize: '0.9rem' }}>
                            Students join with a unique code. You start the exam when ready.
                        </p>
                    </div>

                    <div className="card" style={{ padding: '1.75rem' }}>
                        <div style={{ marginBottom: '1.25rem' }}>
                            <label className="section-label">Room / Exam Title</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="e.g. Chapter 3 Mid-Term"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                            />
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label className="section-label">Concept</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                {CONCEPTS.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => setConcept(c)}
                                        style={{
                                            padding: '0.4rem 0.9rem',
                                            borderRadius: '9999px',
                                            fontSize: '0.83rem',
                                            fontWeight: concept === c ? '600' : '400',
                                            border: `1px solid ${concept === c ? '#2563eb' : '#e2e8f0'}`,
                                            background: concept === c ? '#2563eb' : '#ffffff',
                                            color: concept === c ? '#ffffff' : '#374151',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s',
                                        }}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                            <div>
                                <label className="section-label">Questions: {questionCount}</label>
                                <input type="range" min={5} max={20} value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} style={{ width: '100%', accentColor: '#2563eb' }} />
                            </div>
                            <div>
                                <label className="section-label">Time / Question: {timePerQ}s</label>
                                <input type="range" min={30} max={180} step={15} value={timePerQ} onChange={e => setTimePerQ(Number(e.target.value))} style={{ width: '100%', accentColor: '#2563eb' }} />
                            </div>
                        </div>

                        <button
                            className="btn-primary"
                            style={{ width: '100%', padding: '0.875rem', fontSize: '0.95rem' }}
                            onClick={handleCreate}
                            disabled={!title.trim() || submitting}
                        >
                            {submitting ? 'Creating...' : 'Create Room'}
                        </button>
                    </div>
                </div>
            </AppLayout>
        </>
    );
}
