import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import AppLayout from '../components/AppLayout';
import { useAuth } from '../hooks/useAuth';
import LearningAnalyticsDashboard from '../components/LearningAnalyticsDashboard';

export default function AnalyticsPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) router.replace('/login');
    }, [user, loading, router]);

    if (loading || !user) return null;

    return (
        <>
            <Head>
                <title>Analytics — CogniFlow</title>
                <meta name="description" content="View your learning analytics and performance data" />
            </Head>
            <AppLayout>
                <LearningAnalyticsDashboard />
            </AppLayout>
        </>
    );
}
