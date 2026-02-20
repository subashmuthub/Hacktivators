import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import AppLayout from '../../components/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { useRooms } from '../../hooks/useRooms';

export default function RoomsIndexPage() {
    const { user, loading } = useAuth();
    const { rooms } = useRooms();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) router.replace('/login');
    }, [user, loading, router]);

    if (loading || !user) return null;

    const myRooms = Object.values(rooms).filter(r =>
        r.createdBy === user.email || r.participants.find(p => p.email === user.email)
    );

    return (
        <>
            <Head><title>Rooms — CogniFlow</title></Head>
            <AppLayout>
                <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '0 1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <div>
                            <h1 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>Exam Rooms</h1>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                Create or join rooms to take group exams with a shared code.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <Link href="/rooms/join" style={{ textDecoration: 'none' }}>
                                <button className="btn-secondary">Join Room</button>
                            </Link>
                            {user.role === 'teacher' && (
                                <Link href="/rooms/create" style={{ textDecoration: 'none' }}>
                                    <button className="btn-primary">Create Room</button>
                                </Link>
                            )}
                        </div>
                    </div>

                    {myRooms.length === 0 ? (
                        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                            <div style={{ width: '48px', height: '48px', background: '#f1f5f9', borderRadius: '12px', margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2">
                                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                                </svg>
                            </div>
                            <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#334155', margin: '0 0 0.5rem' }}>No rooms yet</h3>
                            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                {user.role === 'teacher' ? 'Create a room and share the code with your students.' : 'Ask your teacher for a room code to join a group exam.'}
                            </p>
                            {user.role === 'teacher' ? (
                                <Link href="/rooms/create"><button className="btn-primary">Create Your First Room</button></Link>
                            ) : (
                                <Link href="/rooms/join"><button className="btn-primary">Join a Room</button></Link>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {myRooms.map(room => (
                                <Link key={room.code} href={`/rooms/${room.code}`} style={{ textDecoration: 'none' }}>
                                    <div className="card" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'box-shadow 0.15s' }}>
                                        <div>
                                            <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.95rem' }}>{room.title}</div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                                                Code: <strong style={{ letterSpacing: '0.05em' }}>{room.code}</strong>
                                                &nbsp;·&nbsp; {room.concept}
                                                &nbsp;·&nbsp; {room.questionCount} questions
                                                &nbsp;·&nbsp; {room.participants.length} participant{room.participants.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span className={`badge ${room.status === 'active' ? 'badge-green' : room.status === 'waiting' ? 'badge-amber' : 'badge-red'}`}>
                                                {room.status === 'waiting' ? 'Waiting' : room.status === 'active' ? 'Live' : 'Ended'}
                                            </span>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </AppLayout>
        </>
    );
}
