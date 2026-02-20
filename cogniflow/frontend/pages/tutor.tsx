import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../hooks/useAuth';
import SocraticChatbot from '../components/SocraticChatbot';

export default function ChatbotPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) router.replace('/login');
    }, [user, loading, router]);

    if (loading || !user) return null;

    return (
        <>
            <Head>
                <title>AI Tutor — CogniFlow</title>
                <meta name="description" content="Chat with your Socratic AI tutor" />
            </Head>
            <AppLayout>
                <div style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem' }}>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h1 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>AI Tutor</h1>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                            Ask questions and get Socratic-style guidance from your AI tutor.
                        </p>
                    </div>
                    <SocraticChatbot />
                </div>
            </AppLayout>
        </>
    );
}
