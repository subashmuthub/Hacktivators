import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import AppLayout from '../../components/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { Course, Module } from '../../types/lms';
import { getCourse } from '../../lib/lms-store';
import QuizModule from '../../components/QuizModule';
import { CheckCircle, Circle, BookOpen, ChevronLeft, Lock } from 'lucide-react';

export default function CoursePlayerPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const { id } = router.query;

    const [course, setCourse] = useState<Course | null>(null);
    const [activeModuleIndex, setActiveModuleIndex] = useState(0);
    const [progress, setProgress] = useState<Record<string, boolean>>({}); // moduleId -> completed
    const [courseCompleted, setCourseCompleted] = useState(false);

    useEffect(() => {
        if (id && typeof id === 'string') {
            const loaded = getCourse(id);
            if (loaded) {
                setCourse(loaded);
                // Load progress from localStorage
                const savedProgress = localStorage.getItem(`cogniflow_progress_${id}`);
                if (savedProgress) {
                    setProgress(JSON.parse(savedProgress));
                }
            }
        }
    }, [id]);

    const handleComplete = (moduleId: string) => {
        const newProgress = { ...progress, [moduleId]: true };
        setProgress(newProgress);
        localStorage.setItem(`cogniflow_progress_${id}`, JSON.stringify(newProgress));

        // Check if all completed
        if (course && course.modules.every(m => newProgress[m.id])) {
            setCourseCompleted(true);
            // Trigger confetti or XP reward here?
            window.dispatchEvent(new Event('cogniflow_update')); // Refresh analytics
        }
    };

    if (loading || !user) return null;
    if (!course) return <div style={{ padding: '2rem' }}>Loading course...</div>;

    const activeModule = course.modules[activeModuleIndex];
    const isNextDisabled = !progress[activeModule.id]; // Can only proceed if current is done? Maybe optional constraint.

    return (
        <>
            <Head><title>{course.title} — CogniFlow</title></Head>
            <AppLayout>
                <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', height: 'calc(100vh - 80px)', maxWidth: '1400px', margin: '0 auto' }}>

                    {/* Sidebar */}
                    <div style={{ background: '#f8fafc', borderRight: '1px solid #e2e8f0', padding: '1.5rem', overflowY: 'auto' }}>
                        <Link href="/courses" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', textDecoration: 'none', marginBottom: '1.5rem', fontSize: '0.9rem', fontWeight: '600' }}>
                            <ChevronLeft size={16} /> Back to Courses
                        </Link>

                        <h2 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>{course.title}</h2>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.5rem' }}>
                            {Object.values(progress).filter(p => p).length} / {course.modules.length} Completed
                            <div style={{ height: '4px', background: '#e2e8f0', borderRadius: '2px', marginTop: '0.5rem' }}>
                                <div style={{ height: '100%', background: '#10b981', borderRadius: '2px', width: `${(Object.values(progress).filter(p => p).length / course.modules.length) * 100}%`, transition: 'width 0.3s' }}></div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {course.modules.map((m, i) => (
                                <button
                                    key={m.id}
                                    onClick={() => setActiveModuleIndex(i)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        textAlign: 'left',
                                        gap: '0.75rem',
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        background: activeModuleIndex === i ? '#fff' : 'transparent',
                                        border: activeModuleIndex === i ? '1px solid #cbd5e1' : 'none',
                                        boxShadow: activeModuleIndex === i ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                                        cursor: 'pointer',
                                        color: activeModuleIndex === i ? '#0f172a' : '#64748b',
                                        fontWeight: activeModuleIndex === i ? '600' : '400',
                                        transition: 'all 0.1s'
                                    }}
                                >
                                    {progress[m.id] ? (
                                        <CheckCircle size={18} className="text-green-500" />
                                    ) : (
                                        activeModuleIndex === i ? <Circle size={18} className="text-blue-500" /> : <Lock size={16} className="text-gray-400" />
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.9rem' }}>{m.title}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '600' }}>{m.type}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Main Content */}
                    <div style={{ padding: '3rem', overflowY: 'auto', background: '#fff' }}>
                        {courseCompleted && <div className="mb-8 p-4 bg-green-50 rounded-lg text-green-800 font-bold border border-green-200">🎉 Course Completed! You have mastered {course.concept}.</div>}

                        <div style={{ marginBottom: '2rem' }}>
                            <span className="badge badge-purple" style={{ textTransform: 'capitalize' }}>{activeModule.type} Module</span>
                            <h1 style={{ fontSize: '2rem', fontWeight: '800', marginTop: '0.5rem', marginBottom: '1.5rem', color: '#1e293b' }}>{activeModule.title}</h1>
                        </div>

                        {activeModule.type === 'text' ? (
                            <div className="prose" style={{ maxWidth: '800px', lineHeight: '1.7', color: '#334155' }}>
                                <div style={{ whiteSpace: 'pre-wrap', fontSize: '1.1rem' }}>
                                    {activeModule.content}
                                </div>

                                <div style={{ marginTop: '4rem', display: 'flex', justifyContent: 'flex-end' }}>
                                    {!progress[activeModule.id] ? (
                                        <button
                                            className="btn-primary"
                                            onClick={() => handleComplete(activeModule.id)}
                                        >
                                            Mark as Complete
                                        </button>
                                    ) : (
                                        <button className="btn-secondary" style={{ color: '#10b981', borderColor: '#10b981' }} disabled>
                                            Completed <CheckCircle size={16} style={{ marginLeft: '0.5rem' }} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                                {!progress[activeModule.id] ? (
                                    <QuizModule
                                        concept={activeModule.content} // For quiz, content is the Concept
                                        questionCount={activeModule.quizConfig?.count || 5}
                                        difficulty={activeModule.quizConfig?.difficulty || 'medium'}
                                        onComplete={(score) => {
                                            if (score >= 60) {
                                                handleComplete(activeModule.id);
                                            } else {
                                                alert("You need at least 60% to pass this module.");
                                            }
                                        }}
                                    />
                                ) : (
                                    <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                                        <CheckCircle size={64} className="text-green-500 mb-4" style={{ margin: '0 auto' }} />
                                        <h2 className="text-2xl font-bold mb-2">Module Completed</h2>
                                        <p className="text-gray-500 mb-6">You have passed this assessment.</p>
                                        <button className="btn-secondary" onClick={() => setProgress({ ...progress, [activeModule.id]: false })}>
                                            Retake Assessment
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Navigation Footer */}
                        <div style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
                            <button
                                className="btn-secondary"
                                onClick={() => setActiveModuleIndex(Math.max(0, activeModuleIndex - 1))}
                                disabled={activeModuleIndex === 0}
                            >
                                Previous
                            </button>
                            <button
                                className="btn-secondary"
                                onClick={() => setActiveModuleIndex(Math.min(course.modules.length - 1, activeModuleIndex + 1))}
                                disabled={activeModuleIndex === course.modules.length - 1}
                            >
                                Next Module
                            </button>
                        </div>
                    </div>
                </div>
            </AppLayout>
        </>
    );
}

