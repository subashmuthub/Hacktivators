import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';
import { ReactNode } from 'react';

const NAV_LINKS = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/courses', label: 'Courses' },
    { href: '/assessment', label: 'Assessment' },
    { href: '/rooms', label: 'Rooms' },
    { href: '/tutor', label: 'AI Tutor' },
    { href: '/galaxy', label: 'Knowledge Galaxy' },
    { href: '/analytics', label: 'Analytics' },
];

export default function AppLayout({ children }: { children: ReactNode }) {
    const { user, logout } = useAuth();
    const router = useRouter();

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
            {/* Top nav */}
            <nav style={{
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                padding: '0 1.5rem',
                height: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'sticky',
                top: 0,
                zIndex: 100,
            }}>
                {/* Brand */}
                <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                    <div style={{ width: '30px', height: '30px', background: '#2563eb', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                            <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                        </svg>
                    </div>
                    <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '1rem', letterSpacing: '-0.01em' }}>CogniFlow</span>
                </Link>

                {/* Nav links */}
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    {NAV_LINKS.map(link => {
                        const active = router.pathname.startsWith(link.href);
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                style={{
                                    padding: '0.4rem 0.875rem',
                                    borderRadius: '6px',
                                    fontSize: '0.875rem',
                                    fontWeight: active ? '600' : '500',
                                    color: active ? '#2563eb' : '#475569',
                                    background: active ? '#eff6ff' : 'transparent',
                                    textDecoration: 'none',
                                    transition: 'all 0.15s',
                                }}
                            >
                                {link.label}
                            </Link>
                        );
                    })}
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {user && !user.isPremium && (
                        <Link
                            href="/premium"
                            style={{
                                padding: '0.35rem 0.875rem',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                fontWeight: '600',
                                color: '#b45309',
                                background: '#fef3c7',
                                border: '1px solid #fde68a',
                                textDecoration: 'none',
                            }}
                        >
                            Go Premium
                        </Link>
                    )}
                    {user && user.isPremium && (
                        <span className="badge badge-purple">Premium</span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: '#e0e7ff', color: '#3730a3',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.8rem', fontWeight: '700',
                        }}>
                            {user?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <button
                            onClick={handleLogout}
                            style={{ fontSize: '0.8rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem 0.5rem' }}
                        >
                            Sign out
                        </button>
                    </div>
                </div>
            </nav>

            {/* Page content */}
            <main style={{ flex: 1 }}>
                {children}
            </main>
        </div>
    );
}
