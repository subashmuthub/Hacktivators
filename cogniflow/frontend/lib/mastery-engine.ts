/**
 * CogniFlow — Mastery Engine
 * Implements Bayesian Knowledge Tracing (BKT) + Ebbinghaus forgetting curve.
 */

// ── BKT Constants ─────────────────────────────────────────────────────────
const P_INIT = 0.3;   // Prior probability of knowing
const P_LEARN = 0.09;  // P(Transit): P(learn) from one attempt
const P_GUESS = 0.2;   // P(Guess): correct without knowing
const P_SLIP = 0.1;   // P(Slip): wrong despite knowing

export interface MasteryState {
    pL: number;            // P(learned) — BKT posterior
    stability: number;     // Memory stability S (grows with successful reviews)
    reviewCount: number;   // Number of successful reviews
    lastReviewMs: number;  // Timestamp of last review (ms)
}

/**
 * Update BKT mastery probability after a response.
 * @param prevPL   - Previous P(L) for the concept
 * @param correct  - Whether the student answered correctly
 * @returns        Updated P(L) after BKT update
 */
export function updateMastery(prevPL: number, correct: boolean): number {
    // P(correct) = P(L)*(1-slip) + P(not L)*guess
    const pCorrect = prevPL * (1 - P_SLIP) + (1 - prevPL) * P_GUESS;
    const pWrong = prevPL * P_SLIP + (1 - prevPL) * (1 - P_GUESS);

    // Posterior P(L | observation)
    const pLGivenObs = correct
        ? (prevPL * (1 - P_SLIP)) / (pCorrect || 1e-9)
        : (prevPL * P_SLIP) / (pWrong || 1e-9);

    // Learning transition: student may have learned even if they didn't know
    const pLNext = pLGivenObs + (1 - pLGivenObs) * P_LEARN;
    return Math.min(0.9999, Math.max(0.0001, pLNext));
}

/**
 * Ebbinghaus forgetting curve: R(t) = e^(-t / (S * difficulty_factor))
 * @param state           - Current mastery state
 * @param daysSinceReview - Days elapsed since last review
 * @param difficulty      - Question difficulty [0,1]
 * @returns Retention ratio [0,1]
 */
export function forgettingDecay(
    state: MasteryState,
    daysSinceReview: number,
    difficulty = 0.5
): number {
    const difficultyFactor = 1 + (1 - state.pL); // harder concepts decay faster
    const t = Math.max(0, daysSinceReview);
    return Math.exp(-t / (state.stability * difficultyFactor));
}

/**
 * Effective mastery = P(L) × retention R(t)
 * This is used for Galaxy node color/size.
 */
export function effectiveMastery(state: MasteryState, daysSinceReview: number): number {
    const R = forgettingDecay(state, daysSinceReview);
    return Math.max(0, state.pL * R);
}

/**
 * Update memory stability after a successful review.
 * S_n = S_{n-1} × e^(0.1 × P(L))
 */
export function updateStability(state: MasteryState, correct: boolean): MasteryState {
    if (!correct) return state; // Only update stability on correct answers
    const newStability = state.stability * Math.exp(0.1 * state.pL);
    return {
        ...state,
        stability: Math.min(newStability, 365), // cap at ~1 year stability
        reviewCount: state.reviewCount + 1,
        lastReviewMs: Date.now(),
    };
}

/**
 * Create initial mastery state for a new concept.
 */
export function createMasteryState(): MasteryState {
    return {
        pL: P_INIT,
        stability: 1, // 1 day initial stability
        reviewCount: 0,
        lastReviewMs: Date.now(),
    };
}

/**
 * Confidence score formula (weighted combination of ability signals).
 * w1=0.4 accuracy, w2=0.2 speed, w3=0.25 consistency, w4=0.15 non-guessing
 */
export function confidenceScore(params: {
    accuracy: number;          // [0,1]
    normalizedResponseTime: number; // [0,1], 0=fastest, 1=slowest
    consistency: number;       // [0,1]
    guessProbability: number;  // [0,1]
}): number {
    const { accuracy, normalizedResponseTime, consistency, guessProbability } = params;
    const speed = 1 - Math.min(1, normalizedResponseTime); // invert: faster = more confident
    return (
        0.4 * accuracy +
        0.2 * speed +
        0.25 * consistency +
        0.15 * (1 - guessProbability)
    );
}

/**
 * Human-readable mastery label from P(L).
 */
export function masteryLabel(pL: number): string {
    if (pL >= 0.95) return 'Mastered';
    if (pL >= 0.75) return 'Proficient';
    if (pL >= 0.5) return 'Learning';
    if (pL >= 0.3) return 'Developing';
    return 'New';
}
