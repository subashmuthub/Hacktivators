import React, { useRef, useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────────
interface KnowledgeNode {
  id: string;
  name: string;
  category: string;
  masteryLevel: number;      // BKT: P(mastery)
  cognitiveLoad: number;     // estimated from avg response time
  forgettingProbability: number; // Ebbinghaus decay
  lastAccessed: number;      // timestamp ms
  prerequisites: string[];
  emotional_state: 'confident' | 'struggling' | 'confused' | 'mastered';
  sessionsCount: number;
  correctCount: number;
  totalCount: number;
}

interface LearningEdge {
  source: string;
  target: string;
  strength: number;
  type: 'prerequisite' | 'similar' | 'application' | 'contradiction';
}

// ── BKT (Bayesian Knowledge Tracing) ────────────────────────────────────────
// P(L_n) = P(L_{n-1}|correct) or P(L_{n-1}|wrong) updated per response
const BKT_P_LEARN = 0.3;   // P(transit): prob of learning from a wrong→right
const BKT_P_GUESS = 0.2;   // P(guess): prob of correct answer without mastery
const BKT_P_SLIP = 0.1;   // P(slip): prob of wrong answer despite mastery
const BKT_P_INIT = 0.1;   // Starting prior

function bktUpdate(pL: number, isCorrect: boolean): number {
  // P(correct) = pL*(1-slip) + (1-pL)*guess
  const pCorrect = pL * (1 - BKT_P_SLIP) + (1 - pL) * BKT_P_GUESS;
  const pWrong = pL * BKT_P_SLIP + (1 - pL) * (1 - BKT_P_GUESS);
  // Posterior P(L | obs)
  const pLGivenObs = isCorrect
    ? (pL * (1 - BKT_P_SLIP)) / pCorrect
    : (pL * BKT_P_SLIP) / pWrong;
  // Apply learning transition
  return pLGivenObs + (1 - pLGivenObs) * BKT_P_LEARN;
}

// Ebbinghaus forgetting curve: R = e^(-t/S) where t=hours since last access, S=stability
function forgettingDecay(lastAccessedMs: number, sessionsCount: number): number {
  const hoursElapsed = (Date.now() - lastAccessedMs) / 3600000;
  const stability = 1 + sessionsCount * 2; // more practice = slower forgetting
  return 1 - Math.exp(-hoursElapsed / stability);
}

function emotionalState(mastery: number, load: number): KnowledgeNode['emotional_state'] {
  if (mastery >= 0.9) return 'mastered';
  if (mastery >= 0.65) return 'confident';
  if (load > 0.75) return 'confused';
  return 'struggling';
}

// ── PREREQUISITE MAP (static domain knowledge) ────────────────────────────
const PREREQ_MAP: Record<string, string[]> = {
  'derivatives': ['limits'],
  'integration': ['derivatives'],
  'differential equations': ['integration', 'derivatives'],
  'vectors': ['linear algebra'],
  'statistics': ['probability'],
  'kinematics': ['derivatives'],
  "newton's laws": ['kinematics'],
  'waves': ["newton's laws"],
  'dynamic programming': ['algorithms', 'data structures'],
  'graph theory': ['data structures'],
  'electrochemistry': ['redox reactions', 'acids & bases'],
  'organic chemistry': ['atomic structure', 'chemical bonding'],
};

const SIMILAR_MAP: Record<string, string[]> = {
  'probability': ['statistics', 'combinatorics'],
  'algorithms': ['data structures'],
  'kinematics': ['mechanics'],
  'integration': ['sequences & series'],
};

// ── Read session history from localStorage ────────────────────────────────
const GALAXY_KEY = 'cogniflow_galaxy_nodes';

interface StoredResponse {
  concept: string;
  isCorrect: boolean;
  timeMs: number;
  timestamp: number;
}

function loadSessionHistory(): StoredResponse[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GALAXY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveSessionToGalaxy(concept: string, responses: { isCorrect: boolean; timeMs: number }[]) {
  if (typeof window === 'undefined') return;
  const existing = loadSessionHistory();
  const newEntries: StoredResponse[] = responses.map(r => ({
    concept: concept.toLowerCase().trim(),
    isCorrect: r.isCorrect,
    timeMs: r.timeMs,
    timestamp: Date.now(),
  }));
  const combined = [...existing, ...newEntries].slice(-2000); // keep last 2000 responses
  localStorage.setItem(GALAXY_KEY, JSON.stringify(combined));
}

// ── Build graph from session history ─────────────────────────────────────
function buildGraphFromHistory(history: StoredResponse[]): { nodes: KnowledgeNode[]; links: LearningEdge[] } {
  // Group by concept
  const conceptMap: Record<string, StoredResponse[]> = {};
  for (const r of history) {
    if (!conceptMap[r.concept]) conceptMap[r.concept] = [];
    conceptMap[r.concept].push(r);
  }

  const nodes: KnowledgeNode[] = [];
  const conceptIds = Object.keys(conceptMap);

  for (const concept of conceptIds) {
    const responses = conceptMap[concept].sort((a, b) => a.timestamp - b.timestamp);
    let pL = BKT_P_INIT;
    for (const r of responses) pL = bktUpdate(pL, r.isCorrect);

    const correct = responses.filter(r => r.isCorrect).length;
    const total = responses.length;
    const avgTime = responses.reduce((s, r) => s + r.timeMs, 0) / total;
    const lastAccessed = Math.max(...responses.map(r => r.timestamp));
    const forgetting = forgettingDecay(lastAccessed, Math.ceil(total / 5));
    const cogLoad = Math.min(1, avgTime / 60000); // 1 min = max load
    const mastery = Math.max(0, pL - forgetting * 0.3);

    nodes.push({
      id: concept,
      name: concept.charAt(0).toUpperCase() + concept.slice(1),
      category: 'Assessed',
      masteryLevel: mastery,
      cognitiveLoad: cogLoad,
      forgettingProbability: forgetting,
      lastAccessed,
      prerequisites: PREREQ_MAP[concept] || [],
      emotional_state: emotionalState(mastery, cogLoad),
      sessionsCount: Math.ceil(total / 5),
      correctCount: correct,
      totalCount: total,
    });
  }

  // Build edges
  const links: LearningEdge[] = [];
  const ids = new Set(conceptIds);
  for (const node of nodes) {
    for (const prereq of node.prerequisites) {
      if (ids.has(prereq)) {
        links.push({ source: prereq, target: node.id, strength: 0.85, type: 'prerequisite' });
      }
    }
    const sims = SIMILAR_MAP[node.id] || [];
    for (const sim of sims) {
      if (ids.has(sim)) {
        links.push({ source: node.id, target: sim, strength: 0.5, type: 'similar' });
      }
    }
  }
  // Read courses
  let courses: any[] = [];
  try {
    const stored = localStorage.getItem('cogniflow_courses');
    if (stored) courses = JSON.parse(stored);
  } catch { }

  // Add Course Nodes
  for (const c of courses) {
    if (!nodes.find(n => n.id === c.id)) {
      nodes.push({
        id: c.id,
        name: `📚 ${c.title}`,
        category: 'Course',
        masteryLevel: 1, // Courses themselves aren't mastery-tracked yet, maybe aggregation?
        cognitiveLoad: 0,
        forgettingProbability: 0,
        lastAccessed: Date.now(),
        prerequisites: [],
        emotional_state: 'mastered',
        sessionsCount: 0,
        correctCount: 0,
        totalCount: 0
      });
    }
    // Link course to its concept
    const conceptId = c.concept.toLowerCase();
    // Ensure concept node exists (if strictly needed, or just link if it does)
    // We will only link if target exists to avoid dangling edges, or create a placeholder concept node?
    // Let's create the concept node if missing.
    let conceptNode = nodes.find(n => n.id === conceptId);
    if (!conceptNode) {
      // Create placeholder concept node
      conceptNode = {
        id: conceptId,
        name: c.concept,
        category: 'Concept',
        masteryLevel: 0.1,
        cognitiveLoad: 0,
        forgettingProbability: 0,
        lastAccessed: Date.now(),
        prerequisites: [],
        emotional_state: 'neutral' as any,
        sessionsCount: 0,
        correctCount: 0,
        totalCount: 0
      };
      nodes.push(conceptNode);
    }

    links.push({
      source: c.id,
      target: conceptId,
      strength: 0.9,
      type: 'application' // "Course applies to Concept"
    });
  }

  return { nodes, links };
}

// ── Seed data — used when no session history exists ───────────────────────
function buildSeedGraph(): { nodes: KnowledgeNode[]; links: LearningEdge[] } {
  const now = Date.now();
  const agoMs = (h: number) => now - h * 3600000;
  const makeNode = (id: string, name: string, cat: string, mastery: number, load: number, fp: number, hoursAgo: number, prereqs: string[]): KnowledgeNode => ({
    id, name, category: cat, masteryLevel: mastery, cognitiveLoad: load, forgettingProbability: fp,
    lastAccessed: agoMs(hoursAgo), prerequisites: prereqs,
    emotional_state: emotionalState(mastery, load),
    sessionsCount: 3, correctCount: Math.round(mastery * 20), totalCount: 20,
  });

  const nodes: KnowledgeNode[] = [
    makeNode('limits', 'Limits', 'Mathematics', 0.82, 0.3, 0.1, 2, []),
    makeNode('derivatives', 'Derivatives', 'Mathematics', 0.75, 0.45, 0.15, 4, ['limits']),
    makeNode('integration', 'Integration', 'Mathematics', 0.55, 0.65, 0.3, 24, ['derivatives']),
    makeNode('differential equations', 'Differential Equations', 'Mathematics', 0.3, 0.85, 0.55, 72, ['integration', 'derivatives']),
    makeNode('linear algebra', 'Linear Algebra', 'Mathematics', 0.6, 0.5, 0.2, 10, []),
    makeNode('probability', 'Probability', 'Mathematics', 0.92, 0.2, 0.05, 1, []),
    makeNode('statistics', 'Statistics', 'Mathematics', 0.78, 0.35, 0.12, 3, ['probability']),
    makeNode('vectors', 'Vectors', 'Mathematics', 0.68, 0.4, 0.18, 8, ['linear algebra']),
    makeNode('kinematics', 'Kinematics', 'Physics', 0.88, 0.25, 0.08, 2, ['derivatives']),
    makeNode("newton's laws", "Newton's Laws", 'Physics', 0.71, 0.4, 0.2, 6, ['kinematics']),
    makeNode('waves', 'Waves', 'Physics', 0.45, 0.7, 0.4, 48, ["newton's laws"]),
    makeNode('thermodynamics', 'Thermodynamics', 'Physics', 0.5, 0.6, 0.35, 36, []),
    makeNode('algorithms', 'Algorithms', 'CS', 0.65, 0.55, 0.22, 5, []),
    makeNode('data structures', 'Data Structures', 'CS', 0.72, 0.45, 0.18, 4, []),
    makeNode('dynamic programming', 'Dynamic Programming', 'CS', 0.28, 0.92, 0.62, 96, ['algorithms', 'data structures']),
    makeNode('graph theory', 'Graph Theory', 'CS', 0.52, 0.65, 0.3, 20, ['data structures']),
  ];

  const links: LearningEdge[] = [
    { source: 'limits', target: 'derivatives', strength: 0.9, type: 'prerequisite' },
    { source: 'derivatives', target: 'integration', strength: 0.85, type: 'prerequisite' },
    { source: 'integration', target: 'differential equations', strength: 0.8, type: 'prerequisite' },
    { source: 'derivatives', target: 'differential equations', strength: 0.6, type: 'prerequisite' },
    { source: 'linear algebra', target: 'vectors', strength: 0.75, type: 'prerequisite' },
    { source: 'probability', target: 'statistics', strength: 0.88, type: 'prerequisite' },
    { source: 'derivatives', target: 'kinematics', strength: 0.7, type: 'application' },
    { source: 'kinematics', target: "newton's laws", strength: 0.85, type: 'prerequisite' },
    { source: "newton's laws", target: 'waves', strength: 0.6, type: 'prerequisite' },
    { source: 'algorithms', target: 'dynamic programming', strength: 0.9, type: 'prerequisite' },
    { source: 'data structures', target: 'dynamic programming', strength: 0.8, type: 'prerequisite' },
    { source: 'data structures', target: 'graph theory', strength: 0.75, type: 'prerequisite' },
    { source: 'probability', target: 'statistics', strength: 0.5, type: 'similar' },
    { source: 'algorithms', target: 'data structures', strength: 0.55, type: 'similar' },
  ];

  return { nodes, links };
}

// ── Colors ────────────────────────────────────────────────────────────────
function nodeColor(node: any): string {
  const n = node as KnowledgeNode;
  if (n.masteryLevel >= 0.9) return '#00ff88';
  if (n.masteryLevel >= 0.7) return '#ffff00';
  if (n.cognitiveLoad > 0.8) return '#ff4400';
  if (n.forgettingProbability > 0.5) return '#ff8800';
  if (n.masteryLevel >= 0.5) return '#44aaff';
  return '#cc44ff';
}

function nodeVal(node: any): number {
  const n = node as KnowledgeNode;
  return 4 + n.masteryLevel * 10 + (n.prerequisites?.length || 0) * 1.5;
}

function linkColor(link: any): string {
  switch ((link as LearningEdge).type) {
    case 'prerequisite': return '#ff6b6b';
    case 'similar': return '#4ecdc4';
    case 'application': return '#45b7d1';
    case 'contradiction': return '#f9ca24';
    default: return 'rgba(255,255,255,0.3)';
  }
}

// ── Pre-calculate fixed cluster positions so nodes NEVER animate/explode ─────
// Sets fx/fy/fz on each node — D3 treats these as immovable anchors.
function calcClusterPositions(nodes: KnowledgeNode[]): (KnowledgeNode & { fx: number; fy: number; fz: number })[] {
  // Group by category
  const catMap: Record<string, KnowledgeNode[]> = {};
  for (const n of nodes) {
    if (!catMap[n.category]) catMap[n.category] = [];
    catMap[n.category].push(n);
  }
  const cats = Object.keys(catMap);
  const clusterRadius = 220;      // distance between cluster centers
  const nodeSpread = 70;          // radius of nodes within a cluster
  const result: (KnowledgeNode & { fx: number; fy: number; fz: number })[] = [];

  cats.forEach((cat, ci) => {
    // Evenly space cluster centers in a ring on the XY plane
    const angle = (ci / cats.length) * 2 * Math.PI;
    const cx = Math.cos(angle) * clusterRadius;
    const cy = Math.sin(angle) * clusterRadius;
    const cz = 0;

    const nodesInCluster = catMap[cat];
    nodesInCluster.forEach((node, ni) => {
      const innerAngle = (ni / Math.max(nodesInCluster.length, 1)) * 2 * Math.PI;
      const r = nodesInCluster.length === 1 ? 0 : nodeSpread;
      // Spread on XY plane, small Z variation for 3D depth
      const zVariation = (ni % 3 - 1) * 30;
      result.push({
        ...node,
        fx: cx + Math.cos(innerAngle) * r,
        fy: cy + Math.sin(innerAngle) * r,
        fz: cz + zVariation,
      });
    });
  });
  return result;
}

export default function KnowledgeGalaxy({ width, height }: { width?: number; height?: number }) {
  const fgRef = useRef<any>();
  const [graphData, setGraphData] = useState<{ nodes: KnowledgeNode[]; links: LearningEdge[] }>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<KnowledgeNode | null>(null);
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mastered' | 'atrisk' | 'new'>('all');
  const [liveUpdateToast, setLiveUpdateToast] = useState(false);
  const [prevNodeCount, setPrevNodeCount] = useState(0);
  const [newNodeIds, setNewNodeIds] = useState<Set<string>>(new Set());
  const forceConfigured = useRef(false);

  const rebuildGraph = useCallback(() => {
    const history = loadSessionHistory();
    const raw = history.length >= 3 ? buildGraphFromHistory(history) : buildSeedGraph();
    const positioned = calcClusterPositions(raw.nodes);
    setGraphData(prev => {
      const prevIds = new Set(prev.nodes.map((n: any) => n.id));
      const added = positioned.filter(n => !prevIds.has(n.id)).map(n => n.id);
      if (added.length > 0) setNewNodeIds(new Set(added));
      return { nodes: positioned as any, links: raw.links };
    });
    setLiveUpdateToast(true);
    setTimeout(() => setLiveUpdateToast(false), 3000);
    setTimeout(() => setNewNodeIds(new Set()), 4000);
  }, []);

  // Load graph on mount
  useEffect(() => {
    setMounted(true);
    rebuildGraph();
  }, [rebuildGraph]);

  // Listen for live updates from assessment (cogniflow_update event)
  useEffect(() => {
    const handler = () => rebuildGraph();
    window.addEventListener('cogniflow_update', handler);
    window.addEventListener('storage', (e) => { if (e.key === 'cogniflow_galaxy_nodes') rebuildGraph(); });
    return () => {
      window.removeEventListener('cogniflow_update', handler);
    };
  }, [rebuildGraph]);

  // Reset force config flag whenever graph data changes so forces re-apply
  useEffect(() => {
    forceConfigured.current = false;
  }, [graphData.nodes.length]);

  // Forgetting curve decay every 10 seconds
  useEffect(() => {
    if (graphData.nodes.length === 0) return;
    const id = setInterval(() => {
      setGraphData(prev => ({
        ...prev,
        nodes: prev.nodes.map(n => {
          const fp = forgettingDecay(n.lastAccessed, n.sessionsCount);
          const mastery = Math.max(0, n.masteryLevel - (fp - n.forgettingProbability) * 0.01);
          return { ...n, forgettingProbability: fp, masteryLevel: mastery, emotional_state: emotionalState(mastery, n.cognitiveLoad) };
        }),
      }));
    }, 10000);
    return () => clearInterval(id);
  }, [graphData.nodes.length]);

  const w = width ?? (typeof window !== 'undefined' ? window.innerWidth : 1200);
  const h = height ?? (typeof window !== 'undefined' ? window.innerHeight : 700);

  const filteredNodes = filter === 'all' ? graphData.nodes
    : filter === 'mastered' ? graphData.nodes.filter(n => n.masteryLevel >= 0.7)
      : filter === 'atrisk' ? graphData.nodes.filter(n => n.forgettingProbability > 0.5 || n.cognitiveLoad > 0.7)
        : graphData.nodes.filter(n => n.totalCount < 5);

  const filteredLinks = graphData.links.filter(l =>
    filteredNodes.some(n => n.id === (l.source as any)?.id || n.id === l.source) &&
    filteredNodes.some(n => n.id === (l.target as any)?.id || n.id === l.target)
  );

  const mastered = graphData.nodes.filter(n => n.masteryLevel >= 0.9).length;
  const learning = graphData.nodes.filter(n => n.masteryLevel >= 0.5 && n.masteryLevel < 0.9).length;
  const atRisk = graphData.nodes.filter(n => n.forgettingProbability > 0.5).length;
  const overloaded = graphData.nodes.filter(n => n.cognitiveLoad > 0.7).length;

  const nodeColorWithNew = useCallback((node: any) => {
    if (newNodeIds.has(node.id)) return '#ffffff'; // flash white for new nodes
    return nodeColor(node);
  }, [newNodeIds]);

  return (
    <div style={{ width: w, height: h, background: '#050810', position: 'relative', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>
      {/* Live Update Toast */}
      {liveUpdateToast && (
        <div style={{
          position: 'absolute', top: '60px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(37,99,235,0.95)', color: 'white', padding: '8px 20px',
          borderRadius: '24px', fontSize: '13px', fontWeight: '700', zIndex: 100,
          border: '1px solid rgba(147,197,253,0.4)', backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 20px rgba(37,99,235,0.4)', animation: 'fadeInDown 0.3s ease',
        }}>
          🔄 Knowledge Galaxy Updated
        </div>
      )}
      {/* 3D Graph */}
      {mounted && graphData.nodes.length > 0 && (
        <ForceGraph3D
          ref={fgRef}
          width={w}
          height={h}
          graphData={{ nodes: filteredNodes, links: filteredLinks }}
          nodeColor={nodeColor}
          nodeVal={nodeVal}
          nodeLabel={(node: any) => {
            const n = node as KnowledgeNode;
            return `<div style="background:rgba(5,8,16,0.95);color:white;padding:12px 14px;border-radius:10px;font-family:Inter,sans-serif;min-width:190px;border:1px solid rgba(100,150,255,0.2);box-shadow:0 4px 20px rgba(0,0,0,0.5)">
              <div style="font-weight:700;font-size:14px;margin-bottom:8px;color:#88ccff">${n.name}</div>
              <div style="font-size:11px;color:#aaa;margin-bottom:2px">Category: <span style="color:#fff">${n.category}</span></div>
              <div style="font-size:11px;color:#aaa;margin-bottom:2px">BKT Mastery: <span style="color:${n.masteryLevel >= 0.7 ? '#00ff88' : n.masteryLevel >= 0.4 ? '#ffff00' : '#ff6b6b'}">${(n.masteryLevel * 100).toFixed(1)}%</span></div>
              <div style="font-size:11px;color:#aaa;margin-bottom:2px">Cognitive Load: <span style="color:${n.cognitiveLoad > 0.7 ? '#ff4400' : '#00ff88'}">${(n.cognitiveLoad * 100).toFixed(1)}%</span></div>
              <div style="font-size:11px;color:#aaa;margin-bottom:2px">Forgetting Risk: <span style="color:${n.forgettingProbability > 0.5 ? '#ff8800' : '#00ff88'}">${(n.forgettingProbability * 100).toFixed(1)}%</span></div>
              <div style="font-size:11px;color:#aaa;margin-bottom:4px">Accuracy: <span style="color:#88ccff">${n.totalCount > 0 ? Math.round((n.correctCount / n.totalCount) * 100) : 0}% (${n.totalCount} attempts)</span></div>
              <div style="font-size:10px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);color:#666">State: <span style="color:#cc88ff;text-transform:capitalize">${n.emotional_state}</span></div>
            </div>`;
          }}
          linkColor={linkColor}
          linkWidth={(link: any) => (link as LearningEdge).strength * 2.5}
          linkOpacity={0.75}
          linkDirectionalParticles={3}
          linkDirectionalParticleSpeed={0.007}
          linkDirectionalParticleWidth={2}
          onNodeClick={(node: any) => setSelectedNode(node as KnowledgeNode)}
          backgroundColor="#050810"
          showNavInfo={false}
          warmupTicks={0}
          cooldownTicks={0}
          d3AlphaDecay={1}
          d3VelocityDecay={1}
        />

      )}

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '48px', background: 'rgba(5,8,16,0.9)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: '16px', zIndex: 20, backdropFilter: 'blur(8px)' }}>
        <span style={{ fontWeight: '700', fontSize: '14px', color: '#88ccff' }}>Knowledge Galaxy</span>
        <div style={{ flex: 1 }} />
        {/* Filter buttons */}
        {([['all', 'All Nodes'], ['mastered', 'Mastered'], ['atrisk', 'At Risk'], ['new', 'New']] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '4px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: filter === f ? '700' : '400', cursor: 'pointer', border: 'none', transition: 'all 0.15s',
            background: filter === f ? '#2563eb' : 'rgba(255,255,255,0.06)',
            color: filter === f ? '#fff' : '#aaa',
          }}>{label}</button>
        ))}
        <span style={{ fontSize: '11px', color: '#555' }}>{filteredNodes.length} nodes</span>
        <button onClick={() => window.history.back()} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#aaa', padding: '4px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>← Back</button>
      </div>

      {/* Legend — left panel */}
      <div style={{ position: 'absolute', top: '60px', left: '12px', background: 'rgba(5,8,16,0.85)', color: 'white', padding: '14px 16px', borderRadius: '10px', zIndex: 10, border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)', minWidth: '170px' }}>
        <div style={{ fontWeight: '700', fontSize: '12px', marginBottom: '10px', color: '#88ccff', letterSpacing: '0.5px' }}>NODE COLORS</div>
        {[
          { color: '#00ff88', label: 'Mastered (BKT ≥90%)' },
          { color: '#ffff00', label: 'Proficient (70–90%)' },
          { color: '#44aaff', label: 'Learning (50–70%)' },
          { color: '#cc44ff', label: 'Developing (<50%)' },
          { color: '#ff8800', label: 'Fading (review now)' },
          { color: '#ff4400', label: 'Cognitive Overload' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: item.color, flexShrink: 0, boxShadow: `0 0 8px ${item.color}66` }} />
            <span style={{ fontSize: '11px', color: '#bbb' }}>{item.label}</span>
          </div>
        ))}
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '10px', color: '#555' }}>
          EDGE TYPES<br />
          <span style={{ color: '#ff6b6b' }}>— prerequisite</span>{' · '}
          <span style={{ color: '#4ecdc4' }}>— similar</span>{' · '}
          <span style={{ color: '#45b7d1' }}>— application</span>
        </div>
      </div>

      {/* Cognitive State — right panel */}
      <div style={{ position: 'absolute', top: '60px', right: '12px', background: 'rgba(5,8,16,0.85)', color: 'white', padding: '14px 16px', borderRadius: '10px', zIndex: 10, border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)', minWidth: '170px' }}>
        <div style={{ fontWeight: '700', fontSize: '12px', marginBottom: '10px', color: '#88ccff', letterSpacing: '0.5px' }}>COGNITIVE STATE</div>
        {[
          { label: 'Total Concepts', value: graphData.nodes.length, color: '#88ccff' },
          { label: 'Mastered (BKT)', value: mastered, color: '#00ff88' },
          { label: 'Learning', value: learning, color: '#ffff00' },
          { label: 'Fading (at risk)', value: atRisk, color: '#ff8800' },
          { label: 'Overloaded', value: overloaded, color: '#ff4400' },
        ].map((stat, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '5px', fontSize: '12px' }}>
            <span style={{ color: '#888' }}>{stat.label}</span>
            <span style={{ fontWeight: '700', color: stat.color }}>{stat.value}</span>
          </div>
        ))}
        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.07)', fontSize: '10px', color: '#555', lineHeight: '1.5' }}>
          BKT: Bayesian Knowledge Tracing<br />
          Forgetting: Ebbinghaus decay curve
        </div>
      </div>

      {/* Selected node detail — bottom left */}
      {selectedNode && (
        <div style={{ position: 'absolute', bottom: '16px', left: '12px', background: 'rgba(5,8,16,0.95)', color: 'white', padding: '18px', borderRadius: '12px', maxWidth: '300px', zIndex: 10, border: '1px solid rgba(100,150,255,0.2)', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <h2 style={{ fontSize: '15px', fontWeight: '700', margin: 0, color: '#88ccff' }}>{selectedNode.name}</h2>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{selectedNode.category}</div>
            </div>
            <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0, marginLeft: '12px' }}>✕</button>
          </div>
          {/* Mastery bar */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '11px' }}>
              <span style={{ color: '#888' }}>BKT Mastery</span>
              <span style={{ color: '#00ff88', fontWeight: '700' }}>{(selectedNode.masteryLevel * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px' }}>
              <div style={{ height: '100%', background: `linear-gradient(90deg, #ff4400, #ffff00, #00ff88)`, borderRadius: '3px', width: `${selectedNode.masteryLevel * 100}%`, transition: 'width 0.5s' }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
            {[
              { label: 'Accuracy', value: `${selectedNode.totalCount > 0 ? Math.round((selectedNode.correctCount / selectedNode.totalCount) * 100) : 0}% (${selectedNode.correctCount}/${selectedNode.totalCount})`, color: '#88ccff' },
              { label: 'Cognitive Load', value: `${(selectedNode.cognitiveLoad * 100).toFixed(1)}%`, color: selectedNode.cognitiveLoad > 0.7 ? '#ff4400' : '#00ff88' },
              { label: 'Forgetting Risk', value: `${(selectedNode.forgettingProbability * 100).toFixed(1)}%`, color: selectedNode.forgettingProbability > 0.5 ? '#ff8800' : '#00ff88' },
              { label: 'State', value: selectedNode.emotional_state, color: '#cc88ff' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#777' }}>{item.label}</span>
                <span style={{ color: item.color, fontWeight: '600', textTransform: 'capitalize' }}>{item.value}</span>
              </div>
            ))}
            {selectedNode.prerequisites.length > 0 && (
              <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.07)', color: '#555', fontSize: '10px' }}>
                Requires: {selectedNode.prerequisites.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}