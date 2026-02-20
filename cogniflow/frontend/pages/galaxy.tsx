import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../hooks/useAuth';
import KnowledgeGalaxy from '../components/KnowledgeGalaxy';

export default function KnowledgeGalaxyPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [size, setSize] = useState({ w: 0, h: 0 });

    useEffect(() => {
        if (!loading && !user) { router.replace('/login'); return; }
        // Measure full window size
        const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [user, loading, router]);

    if (loading || !user || size.w === 0) return null;

    return (
        <>
            <Head>
                <title>Knowledge Galaxy — CogniFlow</title>
                <meta name="description" content="3D knowledge graph with BKT mastery tracking" />
            </Head>
            {/* Full-window — NO AppLayout so ForceGraph3D gets exact pixel dimensions */}
            <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
                <KnowledgeGalaxy width={size.w} height={size.h} />
            </div>
        </>
    );
}
