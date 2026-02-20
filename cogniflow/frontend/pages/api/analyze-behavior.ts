/**
 * CogniFlow — Behavioral Analysis API
 * POST /api/analyze-behavior
 *
 * Accepts full session behavioral data.
 * Returns: guessing flags per response, cheating risk score, IRT ability estimate.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import {
    detectGuessing,
    detectCheating,
    optionEntropy,
    shouldTriggerSocratic,
    type SessionResponse,
    type BehaviorSignals,
} from '../../lib/behavioral-analyzer';
import { updateTheta, thetaToScore, type IRTItem, type IRTResponse } from '../../lib/irt-model';
import { updateMastery } from '../../lib/mastery-engine';

interface AnalyzeBehaviorRequest {
    mode: 'exam' | 'practice';
    responses: Array<{
        questionId: string;
        selectedOption: number;
        isCorrect: boolean;
        responseTimeMs: number;
        difficulty: 'easy' | 'medium' | 'hard';
        concept: string;
        irt?: { a: number; b: number; c: number };
    }>;
    behaviorSignals: BehaviorSignals;
    currentPL?: number;
    concept?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const {
        mode = 'practice',
        responses = [],
        behaviorSignals,
        currentPL = 0.3,
        concept = 'general',
    }: AnalyzeBehaviorRequest = req.body;

    if (!behaviorSignals) return res.status(400).json({ error: 'behaviorSignals is required' });

    // ── Convert responses to SessionResponse format ────────────────────────
    const sessionResponses: SessionResponse[] = responses.map(r => ({
        questionId: r.questionId,
        selectedOption: r.selectedOption,
        isCorrect: r.isCorrect,
        responseTimeMs: r.responseTimeMs,
        difficulty: r.difficulty,
        irtB: r.irt?.b,
        irtC: r.irt?.c,
    }));

    // ── Guessing analysis per response ─────────────────────────────────────
    const guessingResults = sessionResponses.map((resp, i) =>
        detectGuessing(resp, sessionResponses.slice(0, i + 1))
    );

    // ── Cheating Risk Score ────────────────────────────────────────────────
    const cheatRisk = detectCheating(behaviorSignals);

    // ── IRT Ability estimate (theta) ──────────────────────────────────────
    const irtResponses: IRTResponse[] = responses
        .filter(r => r.irt)
        .map(r => ({
            item: {
                id: r.questionId,
                a: r.irt!.a,
                b: r.irt!.b,
                c: r.irt!.c,
            } as IRTItem,
            correct: r.isCorrect,
        }));
    const theta = updateTheta(irtResponses);
    const abilityScore = thetaToScore(theta);

    // ── BKT mastery trajectory ─────────────────────────────────────────────
    let pL = currentPL;
    const masteryTrajectory = responses.map(r => {
        pL = updateMastery(pL, r.isCorrect);
        return { after: r.questionId, pL: parseFloat(pL.toFixed(4)) };
    });
    const finalPL = pL;

    // ── Option entropy ─────────────────────────────────────────────────────
    const selectedOptions = responses.map(r => r.selectedOption);
    const entropy = optionEntropy(selectedOptions);

    // ── Overall guessing probability across session ─────────────────────────
    const avgGuessProbability = guessingResults.length > 0
        ? guessingResults.reduce((s, g) => s + g.probability, 0) / guessingResults.length
        : 0;

    // Concept-level wrong streak
    const wrongStreak = responses
        .slice().reverse()
        .findIndex(r => r.isCorrect);
    const wrongStreakOnConcept = wrongStreak === -1 ? responses.length : wrongStreak;

    // ── Socratic trigger for last response ────────────────────────────────
    const lastResponse = responses[responses.length - 1];
    const socraticDecision = lastResponse
        ? shouldTriggerSocratic({
            mode,
            isCorrect: lastResponse.isCorrect,
            currentPL: finalPL,
            prevPL: masteryTrajectory.length >= 2
                ? masteryTrajectory[masteryTrajectory.length - 2].pL
                : currentPL,
            wrongStreakOnConcept,
            guessProbability: avgGuessProbability,
            confidenceScore: 0.5, // placeholder; real value from frontend
        })
        : null;

    // ── Response ───────────────────────────────────────────────────────────
    return res.status(200).json({
        // Per-response guessing analysis
        guessingPerResponse: guessingResults.map((g, i) => ({
            questionId: responses[i]?.questionId,
            probability: parseFloat(g.probability.toFixed(3)),
            flags: {
                speed: g.speedFlag,
                pattern: g.patternFlag,
                mismatch: g.mismatchFlag,
            },
            reasons: g.reasons,
        })),
        // Session-level summary
        sessionSummary: {
            theta: parseFloat(theta.toFixed(3)),
            abilityScore,             // 0–100 scale
            finalMasteryPL: parseFloat(finalPL.toFixed(4)),
            masteryLabel: finalPL >= 0.95 ? 'Mastered'
                : finalPL >= 0.75 ? 'Proficient'
                    : finalPL >= 0.5 ? 'Learning'
                        : finalPL >= 0.3 ? 'Developing'
                            : 'New',
            avgGuessProbability: parseFloat(avgGuessProbability.toFixed(3)),
            optionEntropy: parseFloat(entropy.toFixed(3)),
            masteryTrajectory,
        },
        // Cheating risk
        cheatRisk: {
            score: parseFloat(cheatRisk.score.toFixed(3)),
            flagged: cheatRisk.flagged,
            breakdown: cheatRisk.breakdown,
        },
        // Socratic recommendation for next step
        socratic: socraticDecision,
    });
}
