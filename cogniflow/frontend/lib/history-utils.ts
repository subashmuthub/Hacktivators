
export const EXAM_HISTORY_KEY = 'cogniflow_exam_history';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type Confidence = 'sure' | 'unsure' | 'guess';

export interface ExamHistorySummary {
    concept: string;
    date: string;
    score: number;
    wrongTopics: string[];
    avgTimeMs: number;
    difficultyBreakdown: { easy: number; medium: number; hard: number };
    totalQuestions: number;
}

export interface ResponseRecord {
    question: string;
    selectedIndex: number;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
    difficulty: Difficulty;
    confidence: Confidence | null;
    timeMs: number;
    xpGained: number;
}

export function saveExamHistory(concept: string, recs: ResponseRecord[]) {
    if (typeof window === 'undefined') return;
    const correct = recs.filter(r => r.isCorrect).length;
    const total = recs.length;
    if (total === 0) return;
    const wrongTopics = recs
        .filter(r => !r.isCorrect)
        .map(r => r.question.slice(0, 80)) // store question snippet as topic hint
        .slice(0, 6);
    const avgTimeMs = recs.reduce((s, r) => s + r.timeMs, 0) / total;
    const easyRecs = recs.filter(r => r.difficulty === 'easy');
    const medRecs = recs.filter(r => r.difficulty === 'medium');
    const hardRecs = recs.filter(r => r.difficulty === 'hard');
    const pct = (arr: ResponseRecord[]) => arr.length > 0 ? Math.round(arr.filter(r => r.isCorrect).length / arr.length * 100) : -1;
    const summary: ExamHistorySummary = {
        concept: concept.toLowerCase().trim(),
        date: new Date().toISOString().slice(0, 10),
        score: Math.round(correct / total * 100),
        wrongTopics,
        avgTimeMs,
        difficultyBreakdown: { easy: pct(easyRecs), medium: pct(medRecs), hard: pct(hardRecs) },
        totalQuestions: total,
    };
    try {
        const existing: ExamHistorySummary[] = JSON.parse(localStorage.getItem(EXAM_HISTORY_KEY) || '[]');
        localStorage.setItem(EXAM_HISTORY_KEY, JSON.stringify([...existing, summary].slice(-100)));
    } catch { /* ignore */ }
}

export function loadPriorExamSummary(concept: string): ExamHistorySummary | null {
    if (typeof window === 'undefined') return null;
    try {
        const all: ExamHistorySummary[] = JSON.parse(localStorage.getItem(EXAM_HISTORY_KEY) || '[]');
        const matching = all.filter(e => e.concept.toLowerCase() === concept.toLowerCase().trim());
        return matching.length > 0 ? matching[matching.length - 1] : null;
    } catch { return null; }
}

export function predictNextScore(concept: string): { score: number; confidence: string; reasoning: string } | null {
    if (typeof window === 'undefined') return null;
    try {
        const all: ExamHistorySummary[] = JSON.parse(localStorage.getItem(EXAM_HISTORY_KEY) || '[]');
        // Filter exams for this concept OR related concepts? For now, specific concept.
        const relevant = all
            .filter(e => e.concept.toLowerCase() === concept.toLowerCase().trim())
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        if (relevant.length === 0) return null;

        // Weighted moving average (giving more weight to recent exams)
        // If 1 exam: 100%
        // If 2 exams: 60%, 40%
        // If 3+ exams: 50%, 30%, 20%
        let prediction = 0;
        let reasoning = '';

        if (relevant.length === 1) {
            prediction = relevant[0].score;
            reasoning = "Based on your single previous attempt.";
        } else if (relevant.length === 2) {
            prediction = relevant[1].score * 0.6 + relevant[0].score * 0.4;
            const trend = relevant[1].score - relevant[0].score;
            reasoning = `Weighted average of 2 exams. Trend: ${trend >= 0 ? 'Improving 📈' : 'Declining 📉'}.`;
        } else {
            const last3 = relevant.slice(-3);
            prediction = last3[2].score * 0.5 + last3[1].score * 0.3 + last3[0].score * 0.2;
            const volatility = Math.abs(last3[2].score - last3[1].score);
            reasoning = `Analysis of recent performance consistency (Volatility: ${volatility < 10 ? 'Low' : 'High'}).`;
        }

        // Cap calculation
        prediction = Math.min(100, Math.max(0, Math.round(prediction)));

        return {
            score: prediction,
            confidence: relevant.length > 2 ? 'High' : 'Medium',
            reasoning
        };
    } catch { return null; }
}
