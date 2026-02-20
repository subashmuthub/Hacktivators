import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../hooks/useAuth';

// GPay direct link — open Google Pay UPI payment
const GPAY_LINK = 'https://pay.google.com/';

const PREMIUM_FEATURES = [
    { feature: 'Unlimited Practice Sessions', free: true, premium: true },
    { feature: 'AI Socratic Follow-up Explanations', free: 'Limited (5/day)', premium: 'Unlimited' },
    { feature: 'Exam Mode', free: true, premium: true },
    { feature: 'Create Exam Rooms', free: false, premium: true },
    { feature: 'Room Participant Insights', free: false, premium: true },
    { feature: 'Knowledge Galaxy Visualization', free: false, premium: true },
    { feature: 'Learning Analytics Dashboard', free: false, premium: true },
    { feature: 'Adaptive Difficulty Engine', free: 'Basic', premium: 'Full IRT' },
    { feature: 'Performance Predictions', free: false, premium: true },
    { feature: 'Detailed Session History', free: false, premium: true },
];

export default function PremiumPage() {
    const { user, loading, upgradeToPremium } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) router.replace('/login');
    }, [user, loading, router]);

    const handleUpgrade = () => {
        // Open GPay link in new tab
        window.open(GPAY_LINK, '_blank');
        // Simulate premium unlock after user pays (in a real system this would come from a webhook)
        setTimeout(() => {
            upgradeToPremium();
            router.push('/dashboard');
        }, 3000);
    };

    if (loading || !user) return null;

    if (user.isPremium) {
        return (
            <>
                <Head><title>Premium — CogniFlow</title></Head>
                <AppLayout>
                    <div style={{ maxWidth: '520px', margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
                        <div className="card" style={{ padding: '2.5rem' }}>
                            <div style={{ width: '56px', height: '56px', background: '#f5f3ff', borderRadius: '50%', margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
                                    <path d="M20 12V22H4V12" /><path d="M22 7H2v5h20V7z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
                                </svg>
                            </div>
                            <h1 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#1e293b', margin: '0 0 0.5rem' }}>You are on Premium</h1>
                            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>All features are unlocked. Thank you for your support!</p>
                            <button className="btn-primary" style={{ marginTop: '1.5rem', padding: '0.75rem 2rem' }} onClick={() => router.push('/dashboard')}>
                                Back to Dashboard
                            </button>
                        </div>
                    </div>
                </AppLayout>
            </>
        );
    }

    return (
        <>
            <Head><title>Go Premium — CogniFlow</title></Head>
            <AppLayout>
                <div style={{ maxWidth: '780px', margin: '2rem auto', padding: '0 1.5rem' }}>
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <span className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Premium</span>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1e293b', margin: '0 0 0.5rem' }}>Unlock the full CogniFlow experience</h1>
                        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>Everything in Free, plus advanced AI features and room management.</p>
                    </div>

                    {/* Pricing card */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
                        {/* Free */}
                        <div className="card" style={{ padding: '1.75rem' }}>
                            <div style={{ fontWeight: '700', color: '#334155', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Free</div>
                            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#1e293b', marginBottom: '1rem' }}>
                                $0 <span style={{ fontSize: '0.9rem', fontWeight: '400', color: '#64748b' }}>forever</span>
                            </div>
                            <ul style={{ padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {PREMIUM_FEATURES.filter(f => f.free).map((f, i) => (
                                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', color: '#475569' }}>
                                        <svg style={{ marginTop: '2px', flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                        {f.feature}{typeof f.free === 'string' ? ` (${f.free})` : ''}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Premium */}
                        <div className="card" style={{ padding: '1.75rem', border: '2px solid #7c3aed', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)' }}>
                                <span className="badge badge-purple">Most Popular</span>
                            </div>
                            <div style={{ fontWeight: '700', color: '#6d28d9', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Premium</div>
                            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#1e293b', marginBottom: '1rem' }}>
                                $4.99 <span style={{ fontSize: '0.9rem', fontWeight: '400', color: '#64748b' }}>/month</span>
                            </div>
                            <ul style={{ padding: 0, margin: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {PREMIUM_FEATURES.map((f, i) => (
                                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', color: f.premium ? '#1e293b' : '#94a3b8' }}>
                                        {f.premium ? (
                                            <svg style={{ marginTop: '2px', flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                        ) : (
                                            <svg style={{ marginTop: '2px', flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        )}
                                        {f.feature}{typeof f.premium === 'string' ? ` (${f.premium})` : ''}
                                    </li>
                                ))}
                            </ul>

                            <button
                                onClick={handleUpgrade}
                                style={{
                                    marginTop: '1.5rem',
                                    width: '100%',
                                    padding: '0.875rem',
                                    background: '#7c3aed',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.95rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    transition: 'background 0.15s',
                                }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
                                </svg>
                                Pay with Google Pay
                            </button>
                            <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.75rem' }}>
                                Redirects to Google Pay. Cancel any time.
                            </p>
                        </div>
                    </div>
                </div>
            </AppLayout>
        </>
    );
}
