/**
 * CogniFlow — Behavioral Analyzer
 * Detects guessing, cheating risk, and decides when to trigger Socratic AI.
 */

// ── Types ──────────────────────────────────────────────────────────────────
export interface SessionResponse {
    questionId: string;
    selectedOption: number;      // 0-3
    isCorrect: boolean;
    responseTimeMs: number;      // time taken in ms
    difficulty: 'easy' | 'medium' | 'hard';
    theta?: number;              // IRT ability at time of answer
    irtB?: number;               // Item difficulty (b parameter)
    irtC?: number;               // Guessing parameter
}

export interface BehaviorSignals {
    tabSwitches: number;
    pasteEvents: number;
    fastHardAnswers: number;     // hard questions answered in < 3s
    totalQuestions: number;
}

export interface GuessingResult {
    probability: number;         // P(guess) [0,1]
    speedFlag: boolean;
    patternFlag: boolean;
    mismatchFlag: boolean;
    reasons: string[];
}

export interface CheatRiskResult {
    score: number;               // CRS [0,1]
    flagged: boolean;            // CRS > 0.5
    breakdown: { tab: number; paste: number; fastHard: number };
}

export interface SocraticDecision {
    shouldTrigger: boolean;
    reasons: string[];
    priority: 'low' | 'medium' | 'high';
}

// ── Expected response times (ms) by difficulty ────────────────────────────
const EXPECTED_TIME_MS: Record<string, number> = {
    easy: 15_000,
    medium: 25_000,
    hard: 40_000,
};

const SIGMA_TIME_MS = 10_000; // std deviation for z-score

/**
 * Sigmoid function.
 */
function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
}

// ── Guessing Detection ─────────────────────────────────────────────────────

/**
 * Rule 1 — Speed anomaly: z-score > 2.5 means answered much faster than expected.
 */
function speedAnomalyFlag(responseTimeMs: number, difficulty: string): boolean {
    const expected = EXPECTED_TIME_MS[difficulty] ?? 25_000;
    const zScore = (expected - responseTimeMs) / SIGMA_TIME_MS;
    return zScore > 2.5;
}

/**
 * Rule 2 — Selection pattern: same option ≥ 4 consecutive, or low entropy.
 */
function selectionPatternFlag(responses: SessionResponse[]): boolean {
    if (responses.length < 4) return false;

    // Check consecutive same option
    const recent = responses.slice(-4).map(r => r.selectedOption);
    if (new Set(recent).size === 1) return true;

    // Option entropy over last 10 questions
    const window = responses.slice(-10);
    if (window.length < 5) return false;
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    window.forEach(r => counts[r.selectedOption]++);
    const total = window.length;
    const entropy = Object.values(counts).reduce((h, c) => {
        if (c === 0) return h;
        const p = c / total;
        return h - p * Math.log2(p);
    }, 0);
    return entropy < 0.5; // max entropy for 4 options = 2.0
}

/**
 * Rule 3 — Ability-difficulty mismatch:
 * P(correct | theta, b, c) < 0.3 but student answered correctly → likely guess.
 */
function abilityMismatchFlag(response: SessionResponse): boolean {
    if (!response.isCorrect || response.theta === undefined || response.irtB === undefined) {
        return false;
    }
    const c = response.irtC ?? 0.25;
    const a = 1.0; // default discrimination
    const exp = Math.exp(-a * (response.theta - response.irtB));
    const pCorrect = c + (1 - c) / (1 + exp);
    return pCorrect < 0.3; // student "shouldn't" have got this right
}

/**
 * Combined guessing probability.
 * P(guess) = sigmoid(w1*speed + w2*pattern + w3*mismatch)
 */
export function detectGuessing(
    response: SessionResponse,
    allResponses: SessionResponse[]
): GuessingResult {
    const speed = speedAnomalyFlag(response.responseTimeMs, response.difficulty);
    const pattern = selectionPatternFlag(allResponses);
    const mismatch = abilityMismatchFlag(response);

    const reasons: string[] = [];
    if (speed) reasons.push(`Answered in ${Math.round(response.responseTimeMs / 1000)}s — much faster than expected`);
    if (pattern) reasons.push('Repetitive option selection pattern detected');
    if (mismatch) reasons.push('Answered correctly despite low predicted ability for this item');

    const rawScore = (speed ? 1.2 : 0) + (pattern ? 1.0 : 0) + (mismatch ? 0.8 : 0);
    const probability = sigmoid(rawScore - 1.5); // calibrated offset

    return {
        probability: Math.min(1, Math.max(0, probability)),
        speedFlag: speed,
        patternFlag: pattern,
        mismatchFlag: mismatch,
        reasons,
    };
}

// ── Cheating Risk Score (CRS) ──────────────────────────────────────────────

/**
 * CRS = 0.3*(tabSwitches/totalTime_min) + 0.3*(pasteEvents/nQ) + 0.4*(fastHard/hardQ)
 * CRS > 0.5 → flag for review.
 */
export function detectCheating(signals: BehaviorSignals): CheatRiskResult {
    const { tabSwitches, pasteEvents, fastHardAnswers, totalQuestions } = signals;
    if (totalQuestions === 0) return { score: 0, flagged: false, breakdown: { tab: 0, paste: 0, fastHard: 0 } };

    const tabScore = Math.min(1, tabSwitches / (totalQuestions * 2));
    const pasteScore = Math.min(1, pasteEvents / totalQuestions);
    const fastHardScore = Math.min(1, fastHardAnswers / Math.max(1, totalQuestions * 0.3));

    const crs = 0.3 * tabScore + 0.3 * pasteScore + 0.4 * fastHardScore;

    return {
        score: Math.min(1, crs),
        flagged: crs > 0.5,
        breakdown: { tab: tabScore, paste: pasteScore, fastHard: fastHardScore },
    };
}

/**
 * Option entropy: -Σ p(option) × log2(p(option)) over selected options.
 * Range: [0, 2]. Low entropy = picking same options → suspicious.
 */
export function optionEntropy(selectedOptions: number[]): number {
    if (selectedOptions.length === 0) return 2; // max (unknown)
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    selectedOptions.forEach(o => { if (o in counts) counts[o]++; });
    const total = selectedOptions.length;
    return Object.values(counts).reduce((h, c) => {
        if (c === 0) return h;
        const p = c / total;
        return h - p * Math.log2(p);
    }, 0);
}

// ── Selective Socratic Trigger ─────────────────────────────────────────────

/**
 * Decide whether to trigger Socratic AI after an answer.
 *
 * Triggers when ANY condition is met (in Practice mode only).
 * Returns shouldTrigger=false immediately in Exam mode.
 */
export function shouldTriggerSocratic(params: {
    mode: 'exam' | 'practice';
    isCorrect: boolean;
    currentPL: number;
    prevPL: number;
    wrongStreakOnConcept: number;   // consecutive wrong on same concept
    guessProbability: number;
    confidenceScore: number;
    timeRemainingMs?: number;       // for exam mode timeout check
}): SocraticDecision {
    const {
        mode, isCorrect, currentPL, prevPL,
        wrongStreakOnConcept, guessProbability,
        confidenceScore, timeRemainingMs,
    } = params;

    // ── Hard exits ─────────────────────────────────────────────────────────
    if (mode === 'exam') {
        return { shouldTrigger: false, reasons: ['Exam mode — no Socratic interruptions'], priority: 'low' };
    }
    if (currentPL > 0.9) {
        return { shouldTrigger: false, reasons: ['Concept already mastered'], priority: 'low' };
    }
    if (timeRemainingMs !== undefined && timeRemainingMs < 60_000) {
        return { shouldTrigger: false, reasons: ['Time constraint < 60s'], priority: 'low' };
    }

    const reasons: string[] = [];
    let triggerScore = 0;

    // ── Trigger conditions ─────────────────────────────────────────────────
    // 1. High guessing probability
    if (guessProbability > 0.6) {
        reasons.push(`Guessing detected (P=${guessProbability.toFixed(2)}) — probe understanding`);
        triggerScore += 3;
    }

    // 2. Repeated wrong on same concept
    if (wrongStreakOnConcept >= 2) {
        reasons.push(`Wrong on this concept ${wrongStreakOnConcept} times — likely misconception`);
        triggerScore += 3;
    }

    // 3. Mastery dropped significantly
    const deltaML = currentPL - prevPL;
    if (deltaML < -0.15) {
        reasons.push(`Mastery dropped ${(deltaML * 100).toFixed(1)}% — concept confusion`);
        triggerScore += 2;
    }

    // 4. In "learning zone" (0.4–0.7 mastery)
    if (currentPL >= 0.4 && currentPL <= 0.7 && !isCorrect) {
        reasons.push('In active learning zone — Socratic deepening');
        triggerScore += 1;
    }

    // 5. Low confidence but correct — might be lucky
    if (confidenceScore < 0.3 && isCorrect) {
        reasons.push(`Low confidence (${confidenceScore.toFixed(2)}) despite correct answer — probe reasoning`);
        triggerScore += 2;
    }

    const shouldTrigger = triggerScore >= 2;
    const priority: 'low' | 'medium' | 'high' =
        triggerScore >= 5 ? 'high' : triggerScore >= 3 ? 'medium' : 'low';

    return { shouldTrigger, reasons, priority };
}
