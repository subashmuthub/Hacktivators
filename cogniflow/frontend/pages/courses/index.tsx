import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppLayout from '../../components/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { Course } from '../../types/lms';
import { getCourses, deleteCourse } from '../../lib/lms-store';
import { BookOpen, Trash2, PlusCircle } from 'lucide-react';

export default function CoursesIndexPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [courses, setCourses] = useState<Course[]>([]);

    useEffect(() => {
        // Load courses
        const load = () => setCourses(getCourses());
        load();

        const handleUpdate = () => load();
        window.addEventListener('cogniflow_lms_update', handleUpdate);
        return () => window.removeEventListener('cogniflow_lms_update', handleUpdate);
    }, []);

    if (loading || !user) return null;

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        if (confirm('Are you sure you want to delete this course?')) {
            deleteCourse(id);
        }
    };

    return (
        <>
            <Head><title>Courses — CogniFlow LMS</title></Head>
            <AppLayout>
                <div style={{ maxWidth: '1000px', margin: '2rem auto', padding: '0 1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <h1 style={{ fontSize: '2rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>My Courses</h1>
                        {user.role === 'teacher' && (
                            <Link href="/courses/create" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', color: 'white', padding: '0.75rem 1.25rem', borderRadius: '8px', textDecoration: 'none', fontWeight: '600' }}>
                                <PlusCircle size={18} />
                                Create Course
                            </Link>
                        )}
                    </div>

                    {courses.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
                            <BookOpen size={48} color="#cbd5e1" style={{ marginBottom: '1rem' }} />
                            <h3 style={{ fontSize: '1.25rem', color: '#64748b', marginBottom: '0.5rem' }}>No courses yet</h3>
                            <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Create your first adaptive learning course to get started.</p>
                            <Link href="/courses/create" className="btn-primary">Create Course</Link>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                            {courses.map(course => (
                                <Link href={`/courses/${course.id}`} key={course.id} style={{ textDecoration: 'none', color: 'inherit' }}>
                                    <div className="card" style={{ height: '100%', transition: 'transform 0.2s', cursor: 'pointer', position: 'relative', overflow: 'hidden' }}>
                                        {/* Cover Gradient */}
                                        <div style={{ height: '100px', background: `linear-gradient(135deg, ${stringToColor(course.concept || course.title)} 0%, #1e293b 100%)` }}></div>

                                        <div style={{ padding: '1.5rem' }}>
                                            <div style={{ position: 'absolute', top: '75px', right: '1.5rem', background: 'white', padding: '0.5rem', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                                <BookOpen size={24} color={stringToColor(course.concept || course.title)} />
                                            </div>

                                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '0.5rem', color: '#1e293b' }}>{course.title}</h3>
                                            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: '2.6em' }}>
                                                {course.description}
                                            </p>

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="badge badge-purple">{course.modules.length} Modules</span>
                                                <button
                                                    onClick={(e) => handleDelete(e, course.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0.25rem' }}
                                                    className="hover-red"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </AppLayout>
            <style jsx global>{`
                .hover-red:hover { color: #ef4444 !important; }
            `}</style>
        </>
    );
}

// Helper to generate consistent colors from strings
function stringToColor(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}
