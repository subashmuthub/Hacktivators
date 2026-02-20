/**
 * CogniFlow — Knowledge Graph Engine
 * Builds weighted concept graph and runs Louvain community detection.
 *
 * Edge weight: w(i,j) = α*prerequisite + β*co-occurrence + γ*confusion
 * Clustering:  Louvain modularity optimization Q = community score
 */

// ── Edge weight constants ─────────────────────────────────────────────────
const ALPHA = 0.5;  // prerequisite weight
const BETA = 0.3;  // co-occurrence weight
const GAMMA = 0.2;  // confusion correlation weight

// ── Curriculum prerequisite DAG (hand-coded domain knowledge) ─────────────
export const PREREQUISITE_STRENGTH: Record<string, Record<string, number>> = {
    // Mathematics
    'limits': { 'derivatives': 0.95, 'continuity': 0.85 },
    'derivatives': { 'integration': 0.90, 'differential equations': 0.80 },
    'integration': { 'differential equations': 0.85 },
    'algebra': { 'calculus': 0.80, 'linear algebra': 0.75 },
    'calculus': { 'differential equations': 0.80, 'statistics': 0.60 },
    'linear algebra': { 'statistics': 0.70, 'algorithms': 0.55 },
    'statistics': { 'machine learning': 0.80, 'probability': 0.85 },
    'probability': { 'statistics': 0.75 },
    // Physics
    'kinematics': { 'newton\'s laws': 0.90, 'energy': 0.70 },
    'newton\'s laws': { 'energy': 0.85, 'momentum': 0.80, 'waves': 0.60 },
    'energy': { 'thermodynamics': 0.70, 'waves': 0.65 },
    'waves': { 'optics': 0.80, 'electromagnetism': 0.60 },
    // CS
    'data structures': { 'algorithms': 0.90, 'graph theory': 0.75 },
    'algorithms': { 'graph theory': 0.70, 'machine learning': 0.60 },
    'graph theory': { 'algorithms': 0.65 },
};

// ── Types ──────────────────────────────────────────────────────────────────
export interface GraphNode {
    id: string;
    name: string;
    category: string;
    masteryPL: number;
    effectiveMastery: number;
    community: number;         // Louvain cluster id
    degree: number;
    // visual
    color: string;
    size: number;
}

export interface GraphEdge {
    source: string;
    target: string;
    weight: number;
    prerequisiteStrength: number;
    coOccurrenceRate: number;
    confusionCorrelation: number;
    type: 'prerequisite' | 'similar' | 'application';
}

export interface SessionLog {
    concept: string;
    category: string;
    isCorrect: boolean;
    responseTimeMs: number;
    masteryPL: number;
    timestamp: number;
}

// ── Edge Weight Calculation ────────────────────────────────────────────────

/**
 * Calculate prerequisite strength from curriculum DAG.
 */
function prerequisiteStrength(conceptA: string, conceptB: string): number {
    const a = conceptA.toLowerCase();
    const b = conceptB.toLowerCase();
    return PREREQUISITE_STRENGTH[a]?.[b] ?? PREREQUISITE_STRENGTH[b]?.[a] ?? 0;
}

/**
 * Co-occurrence rate: fraction of sessions where both concepts appear together.
 */
function coOccurrenceRate(conceptA: string, conceptB: string, logs: SessionLog[]): number {
    const sessions = new Map<number, Set<string>>();
    logs.forEach(log => {
        const day = Math.floor(log.timestamp / 86400000);
        if (!sessions.has(day)) sessions.set(day, new Set());
        sessions.get(day)!.add(log.concept.toLowerCase());
    });

    let coOccur = 0;
    let eitherOccur = 0;
    const a = conceptA.toLowerCase();
    const b = conceptB.toLowerCase();

    sessions.forEach(concepts => {
        const hasA = concepts.has(a);
        const hasB = concepts.has(b);
        if (hasA || hasB) {
            eitherOccur++;
            if (hasA && hasB) coOccur++;
        }
    });

    return eitherOccur > 0 ? coOccur / eitherOccur : 0;
}

/**
 * Confusion correlation: P(wrong on B | wrong on A).
 */
function confusionCorrelation(conceptA: string, conceptB: string, logs: SessionLog[]): number {
    const wrongA = logs.filter(l => l.concept.toLowerCase() === conceptA.toLowerCase() && !l.isCorrect);
    if (wrongA.length === 0) return 0;

    // Sessions where A was wrong
    const wrongASessions = new Set(wrongA.map(l => Math.floor(l.timestamp / 86400000)));

    // How many of those sessions also had wrong on B?
    const wrongBInSameSession = logs.filter(l =>
        l.concept.toLowerCase() === conceptB.toLowerCase() &&
        !l.isCorrect &&
        wrongASessions.has(Math.floor(l.timestamp / 86400000))
    );

    return wrongBInSameSession.length / wrongA.length;
}

/**
 * Calculate weighted edge between two concepts.
 * w(i,j) = α*prerequisite + β*co-occurrence + γ*confusion
 */
export function calculateEdgeWeight(
    conceptA: string,
    conceptB: string,
    logs: SessionLog[]
): number {
    const prereq = prerequisiteStrength(conceptA, conceptB);
    const coOccur = coOccurrenceRate(conceptA, conceptB, logs);
    const confusion = confusionCorrelation(conceptA, conceptB, logs);
    return ALPHA * prereq + BETA * coOccur + GAMMA * confusion;
}

// ── Louvain Community Detection ────────────────────────────────────────────

/**
 * Simplified Louvain modularity optimization.
 * Returns a map of nodeId → communityId.
 *
 * Q = (1/2m) Σᵢⱼ [Aᵢⱼ - kᵢkⱼ/2m] × δ(cᵢ, cⱼ)
 */
export function louvainCluster(
    nodes: string[],
    edges: { source: string; target: string; weight: number }[]
): Map<string, number> {
    // Initialize each node in its own community
    const communities = new Map<string, number>();
    nodes.forEach((n, i) => communities.set(n, i));

    const totalWeight = edges.reduce((s, e) => s + e.weight, 0);
    if (totalWeight === 0) return communities;

    // Build adjacency: nodeId → Map<neighborId, weight>
    const adj = new Map<string, Map<string, number>>();
    nodes.forEach(n => adj.set(n, new Map()));
    edges.forEach(({ source, target, weight }) => {
        adj.get(source)?.set(target, (adj.get(source)?.get(target) ?? 0) + weight);
        adj.get(target)?.set(source, (adj.get(target)?.get(source) ?? 0) + weight);
    });

    // Node degree (sum of incident weights)
    const degree = new Map<string, number>();
    nodes.forEach(n => {
        const d = Array.from(adj.get(n)?.values() ?? []).reduce((a, b) => a + b, 0);
        degree.set(n, d);
    });

    // Greedy phase: try moving each node to best neighboring community
    const m2 = 2 * totalWeight;
    let improved = true;
    let maxIterations = 20;

    while (improved && maxIterations-- > 0) {
        improved = false;
        for (const node of nodes) {
            const currentCom = communities.get(node)!;
            const kI = degree.get(node) ?? 0;

            // Sum of weights to each community
            const weightToCom = new Map<number, number>();
            adj.get(node)?.forEach((w, neighbor) => {
                const nCom = communities.get(neighbor)!;
                weightToCom.set(nCom, (weightToCom.get(nCom) ?? 0) + w);
            });

            // Sum of degrees in each community
            const degSumInCom = new Map<number, number>();
            nodes.forEach(n => {
                const c = communities.get(n)!;
                degSumInCom.set(c, (degSumInCom.get(c) ?? 0) + (degree.get(n) ?? 0));
            });

            // Find best community to move node into
            let bestGain = 0;
            let bestCom = currentCom;

            weightToCom.forEach((kIinC, com) => {
                const sigma = (degSumInCom.get(com) ?? 0) - (com === currentCom ? kI : 0);
                const gain = kIinC / totalWeight - (sigma * kI) / (m2 * m2);
                if (gain > bestGain) { bestGain = gain; bestCom = com; }
            });

            if (bestCom !== currentCom) {
                communities.set(node, bestCom);
                improved = true;
            }
        }
    }

    // Renumber communities 0, 1, 2...
    const idMap = new Map<number, number>();
    let nextId = 0;
    communities.forEach((c, n) => {
        if (!idMap.has(c)) idMap.set(c, nextId++);
        communities.set(n, idMap.get(c)!);
    });

    return communities;
}

// ── Node State ────────────────────────────────────────────────────────────

/**
 * Get visual state (color, size) for a node based on mastery + community.
 */
export function getNodeState(masteryPL: number, cognitiveLoad: number, forgettingRisk: number): {
    color: string;
    size: number;
    label: string;
} {
    const effective = masteryPL * (1 - forgettingRisk * 0.4);

    let color: string;
    let label: string;

    if (effective >= 0.9) { color = '#00ff88'; label = 'Mastered'; }
    else if (effective >= 0.7) { color = '#ffff00'; label = 'Proficient'; }
    else if (cognitiveLoad > 0.8) { color = '#ff4400'; label = 'Overloaded'; }
    else if (forgettingRisk > 0.5) { color = '#ff8800'; label = 'Fading'; }
    else if (effective >= 0.5) { color = '#44aaff'; label = 'Learning'; }
    else { color = '#cc44ff'; label = 'Developing'; }

    const size = 3 + masteryPL * 8 + cognitiveLoad * 2;
    return { color, size, label };
}

// ── Graph Builder ──────────────────────────────────────────────────────────

/**
 * Build the full knowledge graph from session logs.
 * Returns nodes with community assignments and weighted edges.
 */
export function buildGraph(logs: SessionLog[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
    // Unique concepts
    const conceptMap = new Map<string, SessionLog[]>();
    logs.forEach(log => {
        const key = log.concept.toLowerCase();
        if (!conceptMap.has(key)) conceptMap.set(key, []);
        conceptMap.get(key)!.push(log);
    });

    const conceptIds = Array.from(conceptMap.keys());
    const edges: GraphEdge[] = [];
    const edgeSet = new Set<string>();

    // Build edges (only if weight > 0.1)
    for (let i = 0; i < conceptIds.length; i++) {
        for (let j = i + 1; j < conceptIds.length; j++) {
            const a = conceptIds[i];
            const b = conceptIds[j];
            const w = calculateEdgeWeight(a, b, logs);
            if (w < 0.05) continue;

            const key = `${a}|${b}`;
            if (edgeSet.has(key)) continue;
            edgeSet.add(key);

            const prereq = prerequisiteStrength(a, b);
            const type: GraphEdge['type'] =
                prereq > 0.7 ? 'prerequisite' :
                    prereq > 0.3 ? 'application' :
                        'similar';

            edges.push({
                source: a, target: b, weight: w,
                prerequisiteStrength: prereq,
                coOccurrenceRate: coOccurrenceRate(a, b, logs),
                confusionCorrelation: confusionCorrelation(a, b, logs),
                type,
            });
        }
    }

    // Louvain clustering
    const communities = louvainCluster(
        conceptIds,
        edges.map(e => ({ source: e.source, target: e.target, weight: e.weight }))
    );

    // Build node degree map
    const degreeMap = new Map<string, number>();
    edges.forEach(e => {
        degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
        degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
    });

    // Build nodes
    const nodes: GraphNode[] = conceptIds.map(id => {
        const conceptLogs = conceptMap.get(id)!;
        const latestLog = conceptLogs[conceptLogs.length - 1];
        const avg = conceptLogs.reduce((s, l) => s + l.masteryPL, 0) / conceptLogs.length;
        const daysSince = (Date.now() - latestLog.timestamp) / 86400000;
        const forgetting = 1 - Math.exp(-daysSince / Math.max(1, conceptLogs.length));
        const cogLoad = Math.min(1, conceptLogs.reduce((s, l) => s + l.responseTimeMs, 0) / (conceptLogs.length * 60000));
        const state = getNodeState(avg, cogLoad, forgetting);

        return {
            id,
            name: id.charAt(0).toUpperCase() + id.slice(1),
            category: latestLog.category,
            masteryPL: avg,
            effectiveMastery: avg * (1 - forgetting * 0.4),
            community: communities.get(id) ?? 0,
            degree: degreeMap.get(id) ?? 0,
            color: state.color,
            size: state.size,
        };
    });

    return { nodes, edges };
}
