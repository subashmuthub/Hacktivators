import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../hooks/useAuth';

export default function SignupPage() {
    const { signup } = useAuth();
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'student' | 'teacher'>('student');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
        setLoading(true);
        const err = signup(email.trim().toLowerCase(), password, name.trim(), role);
        if (err) {
            setError(err);
            setLoading(false);
        } else {
            router.push('/dashboard');
        }
    };

    return (
        <>
            <Head>
                <title>Create Account — CogniFlow</title>
                <meta name="description" content="Create your CogniFlow account" />
            </Head>

            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '1.5rem' }}>
                <div style={{ width: '100%', maxWidth: '420px' }}>
                    {/* Logo */}
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <div style={{ width: '36px', height: '36px', background: '#2563eb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                                    <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                                </svg>
                            </div>
                            <span style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b', letterSpacing: '-0.02em' }}>CogniFlow</span>
                        </div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1e293b', margin: 0 }}>Create your account</h1>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.25rem' }}>Start your adaptive learning journey</p>
                    </div>

                    <div className="card" style={{ padding: '2rem' }}>
                        <form onSubmit={handleSubmit}>
                            {/* Role selector */}
                            <div style={{ marginBottom: '1.25rem' }}>
                                <p className="section-label">I am a</p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    {(['student', 'teacher'] as const).map(r => (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={() => setRole(r)}
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '8px',
                                                border: role === r ? '2px solid #2563eb' : '2px solid #e2e8f0',
                                                background: role === r ? '#eff6ff' : '#ffffff',
                                                color: role === r ? '#1d4ed8' : '#475569',
                                                fontWeight: '600',
                                                fontSize: '0.9rem',
                                                cursor: 'pointer',
                                                textTransform: 'capitalize',
                                                transition: 'all 0.15s',
                                            }}
                                        >
                                            {r === 'student' ? 'Student' : 'Teacher / Creator'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#374151', marginBottom: '0.4rem' }}>Full name</label>
                                <input type="text" className="input" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#374151', marginBottom: '0.4rem' }}>Email address</label>
                                <input type="email" className="input" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '500', color: '#374151', marginBottom: '0.4rem' }}>Password</label>
                                <input type="password" className="input" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} required />
                            </div>

                            {error && (
                                <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                                    {error}
                                </div>
                            )}

                            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '0.75rem' }} disabled={loading}>
                                {loading ? 'Creating account...' : 'Create Account'}
                            </button>
                        </form>
                    </div>

                    <p style={{ textAlign: 'center', marginTop: '1.25rem', color: '#64748b', fontSize: '0.9rem' }}>
                        Already have an account?{' '}
                        <Link href="/login" style={{ color: '#2563eb', fontWeight: '600', textDecoration: 'none' }}>
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </>
    );
}
