import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AppLayout from '../../components/AppLayout';
import { useAuth } from '../../hooks/useAuth';
import { useRooms } from '../../hooks/useRooms';

export default function JoinRoomPage() {
    const { user, loading } = useAuth();
    const { joinRoom } = useRooms();
    const router = useRouter();
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [joining, setJoining] = useState(false);

    useEffect(() => {
        if (!loading && !user) router.replace('/login');
    }, [user, loading, router]);

    const handleJoin = () => {
        if (!code.trim() || !user) return;
        setJoining(true);
        setError('');
        const err = joinRoom(code.trim().toUpperCase(), user.email, user.name);
        if (err) {
            setError(err);
            setJoining(false);
        } else {
            router.push(`/rooms/${code.trim().toUpperCase()}`);
        }
    };

    if (loading || !user) return null;

    return (
        <>
            <Head><title>Join Room — CogniFlow</title></Head>
            <AppLayout>
                <div style={{ maxWidth: '420px', margin: '4rem auto', padding: '0 1.5rem' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>Join an Exam Room</h1>
                        <p style={{ color: '#64748b', marginTop: '0.3rem', fontSize: '0.9rem' }}>Enter the 6-character code from your teacher</p>
                    </div>

                    <div className="card" style={{ padding: '2rem' }}>
                        <label className="section-label">Room Code</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="e.g. A3B7XZ"
                            value={code}
                            onChange={e => setCode(e.target.value.toUpperCase())}
                            maxLength={6}
                            style={{ fontSize: '1.4rem', fontWeight: '700', letterSpacing: '0.15em', textAlign: 'center', marginBottom: '1rem' }}
                            onKeyDown={e => e.key === 'Enter' && handleJoin()}
                        />

                        {error && (
                            <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                                {error}
                            </div>
                        )}

                        <button
                            className="btn-primary"
                            style={{ width: '100%', padding: '0.875rem' }}
                            onClick={handleJoin}
                            disabled={code.length < 4 || joining}
                        >
                            {joining ? 'Joining...' : 'Join Room'}
                        </button>
                    </div>
                </div>
            </AppLayout>
        </>
    );
}
