/**
 * CogniFlow — Knowledge Graph API
 * POST /api/knowledge-graph
 *
 * Builds the concept graph from session logs stored in the request.
 * Returns nodes (with BKT mastery, community, color) and weighted edges.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
    buildGraph,
    type SessionLog,
} from '../../lib/knowledge-graph-engine';
import { effectiveMastery, forgettingDecay, type MasteryState } from '../../lib/mastery-engine';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { sessionLogs }: { sessionLogs: SessionLog[] } = req.body;

    if (!Array.isArray(sessionLogs) || sessionLogs.length === 0) {
        return res.status(400).json({ error: 'sessionLogs array is required and must not be empty' });
    }

    // Build graph — nodes with Louvain communities, weighted edges
    const { nodes, edges } = buildGraph(sessionLogs);

    // Enrich nodes with effective mastery (BKT × Ebbinghaus decay)
    const enrichedNodes = nodes.map(node => {
        const conceptLogs = sessionLogs.filter(
            l => l.concept.toLowerCase() === node.id.toLowerCase()
        );
        const lastSession = conceptLogs.reduce((max, l) =>
            l.timestamp > max ? l.timestamp : max, 0
        );
        const daysSince = (Date.now() - lastSession) / 86400000;
        const sessionCount = conceptLogs.length;

        // Mock stability estimation (grows with session count)
        const mockState: MasteryState = {
            pL: node.masteryPL,
            stability: 1 + sessionCount * 0.8,
            reviewCount: sessionCount,
            lastReviewMs: lastSession,
        };

        const R = forgettingDecay(mockState, daysSince);
        const effMastery = effectiveMastery(mockState, daysSince);

        return {
            ...node,
            retentionRate: parseFloat(R.toFixed(3)),
            effectiveMastery: parseFloat(effMastery.toFixed(4)),
            daysSinceReview: parseFloat(daysSince.toFixed(1)),
        };
    });

    // Summary stats
    const summary = {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        communities: Array.from(new Set(nodes.map(n => n.community))).length,
        masteredCount: nodes.filter(n => n.masteryPL >= 0.95).length,
        fadingCount: nodes.filter(n => n.effectiveMastery < 0.5).length,
        avgMastery: parseFloat(
            (nodes.reduce((s, n) => s + n.masteryPL, 0) / Math.max(1, nodes.length)).toFixed(3)
        ),
    };

    return res.status(200).json({
        nodes: enrichedNodes,
        edges: edges.map(e => ({
            source: e.source,
            target: e.target,
            weight: parseFloat(e.weight.toFixed(3)),
            type: e.type,
            prerequisiteStrength: parseFloat(e.prerequisiteStrength.toFixed(3)),
        })),
        summary,
    });
}
