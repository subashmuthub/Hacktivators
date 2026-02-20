import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import AppLayout from '../../components/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { Course, Module, ModuleType } from '../../types/lms';
import { saveCourse } from '../../lib/lms-store';
// import { v4 as uuidv4 } from 'uuid'; // Not installed

function uuidv4() {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
        (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16)
    );
}

export default function CreateCoursePage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [concept, setConcept] = useState('');
    const [modules, setModules] = useState<Module[]>([]);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modType, setModType] = useState<ModuleType>('text');
    const [modTitle, setModTitle] = useState('');
    const [modContent, setModContent] = useState('');
    const [quizCount, setQuizCount] = useState(5);
    const [quizDiff, setQuizDiff] = useState('medium');

    useEffect(() => {
        if (!loading && user && user.role !== 'teacher') {
            router.replace('/courses');
        }
    }, [user, loading, router]);

    if (loading || !user || user.role !== 'teacher') return null;

    const addModule = () => {
        if (!modTitle) return;
        const newMod: Module = {
            id: uuidv4(),
            title: modTitle,
            type: modType,
            content: modContent, // For Quiz, this is the Concept to test
            quizConfig: modType === 'quiz' ? { count: quizCount, difficulty: quizDiff } : undefined,
        };
        setModules([...modules, newMod]);
        setShowModal(false);
        resetModal();
    };

    const resetModal = () => {
        setModTitle('');
        setModContent('');
        setModType('text');
        setQuizCount(5);
    };

    const handleSave = () => {
        if (!title || !description || modules.length === 0) return;
        const newCourse: Course = {
            id: uuidv4(),
            title,
            description,
            concept: concept || title, // Fallback if concept not set
            modules,
            createdBy: user.email,
            createdAt: Date.now(),
        };
        saveCourse(newCourse);
        router.push('/courses');
    };

    return (
        <>
            <Head><title>Create Course — CogniFlow LMS</title></Head>
            <AppLayout>
                <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>Create New Course</h1>
                        <button className="btn-secondary" onClick={() => router.back()}>Cancel</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2rem' }}>
                        {/* Left: Module List */}
                        <div>
                            <div className="card" style={{ padding: '2rem', minHeight: '400px' }}>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    Course Modules
                                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '400' }}>Drag & drop reordering coming soon</span>
                                </h2>

                                {modules.length === 0 ? (
                                    <div style={{ padding: '3rem', border: '2px dashed #e2e8f0', borderRadius: '12px', textAlign: 'center', color: '#94a3b8' }}>
                                        <p>No modules yet. Add your first lesson!</p>
                                        <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => setShowModal(true)}>+ Add Module</button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {modules.map((m, i) => (
                                            <div key={m.id} style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <div style={{ width: '28px', height: '28px', background: '#e2e8f0', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.8rem', color: '#64748b' }}>{i + 1}</div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: '600', color: '#334155' }}>{m.title}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                        <span className={`badge ${m.type === 'text' ? 'badge-blue' : 'badge-purple'}`} style={{ padding: '2px 6px', fontSize: '0.65rem' }}>{m.type}</span>
                                                        {m.type === 'quiz' && <span>{m.quizConfig?.count} Qs · {m.quizConfig?.difficulty}</span>}
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setModules(modules.filter(mod => mod.id !== m.id))}
                                                    style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
                                                >✕</button>
                                            </div>
                                        ))}
                                        <button
                                            className="btn-secondary"
                                            style={{ marginTop: '1rem', borderStyle: 'dashed' }}
                                            onClick={() => setShowModal(true)}
                                        >
                                            + Add Another Module
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right: Course Settings */}
                        <div>
                            <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>Course Details</h3>

                                <div style={{ marginBottom: '1rem' }}>
                                    <label className="section-label">Title</label>
                                    <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Advanced Calculus" />
                                </div>

                                <div style={{ marginBottom: '1rem' }}>
                                    <label className="section-label">Description</label>
                                    <textarea className="input" style={{ minHeight: '80px', resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="What will students learn?" />
                                </div>

                                <div style={{ marginBottom: '1rem' }}>
                                    <label className="section-label">Main Concept</label>
                                    <input className="input" value={concept} onChange={e => setConcept(e.target.value)} placeholder="Linked to Knowledge Galaxy node" />
                                    <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>This creates a major node in the 3D graph.</p>
                                </div>

                                <button
                                    className="btn-primary"
                                    style={{ width: '100%', padding: '0.875rem' }}
                                    onClick={handleSave}
                                    disabled={!title || modules.length === 0}
                                >
                                    Publish Course
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Add Module Modal */}
                    {showModal && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
                            <div className="card" style={{ width: '90%', maxWidth: '500px', padding: '2rem' }}>
                                <h3 style={{ marginTop: 0 }}>Add Module</h3>

                                <div style={{ marginBottom: '1rem' }}>
                                    <label className="section-label">Type</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => setModType('text')}
                                            style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: `1px solid ${modType === 'text' ? '#2563eb' : '#e2e8f0'}`, background: modType === 'text' ? '#eff6ff' : '#fff', color: modType === 'text' ? '#1d4ed8' : '#64748b', fontWeight: '600', cursor: 'pointer' }}
                                        >📄 Documentation</button>
                                        <button
                                            onClick={() => setModType('quiz')}
                                            style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: `1px solid ${modType === 'quiz' ? '#7c3aed' : '#e2e8f0'}`, background: modType === 'quiz' ? '#f5f3ff' : '#fff', color: modType === 'quiz' ? '#6d28d9' : '#64748b', fontWeight: '600', cursor: 'pointer' }}
                                        >🧠 AI Quiz</button>
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1rem' }}>
                                    <label className="section-label">Module Title</label>
                                    <input className="input" value={modTitle} onChange={e => setModTitle(e.target.value)} placeholder="e.g. Introduction to Limits" />
                                </div>

                                {modType === 'text' ? (
                                    <div style={{ marginBottom: '1.5rem' }}>
                                        <label className="section-label">Content (Markdown supported)</label>
                                        <textarea className="input" style={{ minHeight: '150px' }} value={modContent} onChange={e => setModContent(e.target.value)} placeholder="# Heading&#10;Write your lesson content here..." />
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ marginBottom: '1rem' }}>
                                            <label className="section-label">Quiz Topic</label>
                                            <input className="input" value={modContent} onChange={e => setModContent(e.target.value)} placeholder="e.g. Limits, Continuity (AI generates questions)" />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                            <div>
                                                <label className="section-label">Questions</label>
                                                <input type="number" className="input" value={quizCount} onChange={e => setQuizCount(Number(e.target.value))} min={3} max={20} />
                                            </div>
                                            <div>
                                                <label className="section-label">Difficulty</label>
                                                <select className="input" value={quizDiff} onChange={e => setQuizDiff(e.target.value)}>
                                                    <option value="easy">Easy</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="hard">Hard</option>
                                                </select>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                    <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                                    <button className="btn-primary" onClick={addModule} disabled={!modTitle || !modContent}>Add Module</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </AppLayout>
        </>
    );
}
