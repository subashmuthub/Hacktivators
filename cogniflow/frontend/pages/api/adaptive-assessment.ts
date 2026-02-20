import type { NextApiRequest, NextApiResponse } from 'next';
import { shouldTriggerSocratic } from '../../lib/behavioral-analyzer';
import { difficultyToB } from '../../lib/irt-model';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
];

function getModelUrl(model: string) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

interface PreviousExamSummary {
    concept: string;
    date: string;
    score: number;
    wrongTopics: string[];
    avgTimeMs: number;
    difficultyBreakdown: { easy: number; medium: number; hard: number };
    totalQuestions: number;
}

interface QuestionRequest {
    concept: string;
    difficulty: number;
    emotionalState: string;
    previousQuestions: string[];
    theta?: number;
    mode?: 'exam' | 'practice';
    currentPL?: number;
    prevPL?: number;
    wrongStreakOnConcept?: number;
    guessProbability?: number;
    confidenceScore?: number;
    previousExamSummary?: PreviousExamSummary | null;
    seed?: number;
}

async function callGemini(model: string, prompt: string) {
    const response = await fetch(getModelUrl(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.9, maxOutputTokens: 600, topP: 0.95 },
        }),
    });
    const data = await response.json();
    if (!response.ok) { const s = data?.error?.status; throw { status: s, code: response.status, data }; }
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

function difficultyLabel(d: number): string {
    if (d < 0.35) return 'very easy (suitable for a beginner who just started)';
    if (d < 0.55) return 'easy (introductory level)';
    if (d < 0.7) return 'medium (requires solid understanding)';
    if (d < 0.85) return 'hard (requires deep mastery)';
    return 'expert (graduate level, tricky edge case)';
}

function toneInstruction(state: string): string {
    if (state === 'frustrated') return 'Use an encouraging and supportive tone. Keep the question simple enough to rebuild confidence.';
    if (state === 'confident') return 'Be challenging and push deeper. Ask about edge cases or advanced applications.';
    return 'Use a neutral, clear, academic tone.';
}

function buildPrompt(req: QuestionRequest): string {
    const avoid = req.previousQuestions.length > 0
        ? `\nAvoid repeating these questions:\n${req.previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
        : '';
    const unique = req.seed ? `\nUniqueness Seed: ${req.seed} (Ensure this question is unique and distinct)` : '';

    // Build adaptive context from prior exam performance
    let adaptiveContext = '';
    if (req.previousExamSummary) {
        const prev = req.previousExamSummary;
        const weakAreas = prev.wrongTopics.length > 0
            ? `The student previously struggled specifically with: ${prev.wrongTopics.join(', ')}. TARGET these weak areas.`
            : 'The student showed overall weakness. Target fundamental understanding.';
        const timeNote = prev.avgTimeMs > 40000
            ? 'The student was also slow (high cognitive load). Keep phrasing clear and avoid trick wording.'
            : '';
        const diffNote = prev.difficultyBreakdown.easy < 70
            ? 'Even easy questions were missed — reinforce basics before advancing.'
            : prev.difficultyBreakdown.hard < 40
                ? 'The student handles easy/medium well but struggles with hard — push harder concepts.'
                : '';

        adaptiveContext = `
PRIOR EXAM PERFORMANCE ANALYSIS (use this to personalize the question):
- Previous score on ${prev.concept}: ${prev.score}% (${prev.totalQuestions} questions)
- ${weakAreas}
- ${timeNote}
- ${diffNote}
Based on this analysis, generate a question that specifically targets the student's identified weaknesses.`;
    }

    return `You are an adaptive AI exam generator for the topic: "${req.concept}".
Difficulty level: ${difficultyLabel(req.difficulty)}
Tone: ${toneInstruction(req.emotionalState)}
${adaptiveContext}
${avoid}
${unique}

Generate ONE multiple-choice question. Output ONLY valid JSON:
{
  "question": "...",
  "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
  "correctIndex": 0,
  "explanation": "...",
  "hint": "..."
}
Rules: correctIndex is 0-indexed. explanation=one clear sentence why correct. hint=subtle clue without giving away answer. Question must end with ?. Options must be distinct and plausible. No text outside JSON.`;
}

function generateFallbackQuestion(concept: string, difficulty: number): object {
    const dw = difficulty < 0.4 ? 'basic' : difficulty < 0.7 ? 'intermediate' : 'advanced';
    return {
        question: `Which of the following best describes a ${dw} aspect of ${concept}?`,
        options: ['A. Core foundational principles', 'B. Advanced mathematical reasoning', 'C. Experimental with no theory', 'D. No real-world applications'],
        correctIndex: 0,
        explanation: `A good understanding of ${concept} starts with its foundational principles.`,
        hint: `Think about what ${concept} is most commonly defined by.`,
        isFallback: true,
    };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const {
        concept, difficulty, emotionalState, previousQuestions,
        mode = 'practice',
        currentPL = 0.3, prevPL = 0.3,
        wrongStreakOnConcept = 0, guessProbability = 0, confidenceScore = 0.5,
        previousExamSummary = null,
    }: QuestionRequest = req.body;

    if (!concept) return res.status(400).json({ error: 'concept is required' });

    // IRT item parameters
    const diffStr: 'easy' | 'medium' | 'hard' =
        (difficulty ?? 0.5) < 0.35 ? 'easy' : (difficulty ?? 0.5) < 0.7 ? 'medium' : 'hard';
    const irtB = difficultyToB(diffStr);
    const irtA = 0.8 + Math.random() * 0.8;
    const irtC = 0.25;

    // Socratic trigger decision
    const socratic = shouldTriggerSocratic({
        mode: mode as 'exam' | 'practice',
        isCorrect: false,
        currentPL, prevPL, wrongStreakOnConcept, guessProbability, confidenceScore,
    });

    const prompt = buildPrompt({
        concept, difficulty: difficulty ?? 0.5,
        emotionalState: emotionalState ?? 'neutral',
        previousQuestions: previousQuestions ?? [],
        previousExamSummary,
    });

    let rawText: string | null = null;
    let usedModel = 'offline';

    for (const model of MODELS) {
        try {
            rawText = await callGemini(model, prompt);
            if (rawText) { usedModel = model; break; }
        } catch {
            console.warn(`Model ${model} failed, trying next...`);
        }
    }

    const fallback = generateFallbackQuestion(concept, difficulty ?? 0.5);
    const irt = { a: irtA, b: irtB, c: irtC };

    if (!rawText) return res.status(200).json({ question: fallback, model: 'offline-fallback', irt, socratic });

    try {
        const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const parsed = JSON.parse(cleaned);
        return res.status(200).json({ question: parsed, model: usedModel, irt, socratic });
    } catch {
        return res.status(200).json({ question: fallback, model: 'parse-error-fallback', irt, socratic });
    }
}
