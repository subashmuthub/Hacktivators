/**
 * CogniFlow — Item Response Theory (IRT) Engine
 * Implements the 3-Parameter Logistic (3PL) model.
 *
 * P(correct | θ, a, b, c) = c + (1-c) / (1 + exp(-a*(θ-b)))
 *   θ = student ability estimate
 *   a = discrimination parameter (slope)
 *   b = item difficulty (threshold)
 *   c = pseudo-guessing parameter (lower asymptote ≈ 1/nOptions)
 */

export interface IRTItem {
    id: string;
    a: number;  // discrimination (typically 0.2–2.0)
    b: number;  // difficulty (-3 to +3, standard normal scale)
    c: number;  // pseudo-guessing (typically 1/nOptions = 0.25 for MCQ)
}

export interface IRTResponse {
    item: IRTItem;
    correct: boolean;
}

/**
 * 3PL probability of correct response.
 */
export function threeParamLogistic(theta: number, a: number, b: number, c: number): number {
    const exp = Math.exp(-a * (theta - b));
    return c + (1 - c) / (1 + exp);
}

/**
 * Fisher information for an item at given theta.
 * I(θ) = a² × (P(θ) - c)² / ((1-c)² × P(θ) × (1-P(θ)))
 */
export function fisherInformation(theta: number, a: number, b: number, c: number): number {
    const P = threeParamLogistic(theta, a, b, c);
    const numerator = a * a * Math.pow(P - c, 2);
    const denominator = Math.pow(1 - c, 2) * P * (1 - P);
    if (denominator < 1e-12) return 0;
    return numerator / denominator;
}

/**
 * EAP (Expected A Posteriori) theta update using sum-score approximation.
 * Iterates over a grid of theta values and returns the posterior mean.
 */
export function updateTheta(responses: IRTResponse[], priorTheta = 0.0): number {
    if (responses.length === 0) return priorTheta;

    // Grid from -4 to +4 (covers 99.9% of ability range)
    const GRID_SIZE = 41;
    const thetas = Array.from({ length: GRID_SIZE }, (_, i) => -4 + 8 * i / (GRID_SIZE - 1));

    // Standard normal prior N(0,1)
    const prior = thetas.map(t => Math.exp(-0.5 * t * t) / Math.sqrt(2 * Math.PI));

    // Likelihood under each theta
    const likelihood = thetas.map(theta => {
        return responses.reduce((acc, { item, correct }) => {
            const p = threeParamLogistic(theta, item.a, item.b, item.c);
            return acc * (correct ? p : 1 - p);
        }, 1.0);
    });

    // Posterior ∝ likelihood × prior
    const unnormalized = thetas.map((_, i) => likelihood[i] * prior[i]);
    const sum = unnormalized.reduce((a, b) => a + b, 0);
    if (sum < 1e-15) return priorTheta; // degenerate case

    const posterior = unnormalized.map(v => v / sum);

    // EAP = sum(theta_i × posterior_i)
    const eap = thetas.reduce((acc, theta, i) => acc + theta * posterior[i], 0);
    return Math.max(-4, Math.min(4, eap));
}

/**
 * Standard error of measurement at current theta.
 * SE(θ) = 1 / sqrt(sum of Fisher information)
 */
export function standardError(theta: number, responses: IRTResponse[]): number {
    const totalInfo = responses.reduce((acc, { item }) =>
        acc + fisherInformation(theta, item.a, item.b, item.c), 0);
    return totalInfo < 1e-12 ? Infinity : 1 / Math.sqrt(totalInfo);
}

/**
 * Select the next item that maximises Fisher information at current theta.
 * Excludes already-administered items.
 */
export function selectNextItem(
    theta: number,
    itemBank: IRTItem[],
    usedIds: Set<string>
): IRTItem | null {
    const available = itemBank.filter(item => !usedIds.has(item.id));
    if (available.length === 0) return null;

    let bestItem = available[0];
    let bestInfo = fisherInformation(theta, bestItem.a, bestItem.b, bestItem.c);

    for (const item of available.slice(1)) {
        const info = fisherInformation(theta, item.a, item.b, item.c);
        if (info > bestInfo) { bestInfo = info; bestItem = item; }
    }
    return bestItem;
}

/**
 * Convert IRT theta to a 0-100 ability score (normalized).
 * Theta range [-4, +4] → [0, 100]
 */
export function thetaToScore(theta: number): number {
    return Math.round(((theta + 4) / 8) * 100);
}

/**
 * Estimate difficulty label from b parameter.
 */
export function difficultyLabel(b: number): 'easy' | 'medium' | 'hard' {
    if (b < -0.5) return 'easy';
    if (b < 0.5) return 'medium';
    return 'hard';
}

/**
 * Map difficulty string to IRT b parameter.
 */
export function difficultyToB(difficulty: 'easy' | 'medium' | 'hard'): number {
    switch (difficulty) {
        case 'easy': return -1.0 + Math.random() * 0.5;  // [-1.0, -0.5]
        case 'medium': return -0.25 + Math.random() * 0.5; // [-0.25, 0.25]
        case 'hard': return 0.5 + Math.random() * 1.0;   // [0.5, 1.5]
    }
}
