import type { NextApiRequest, NextApiResponse } from 'next';
import { shouldTriggerSocratic } from '../../lib/behavioral-analyzer';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Model fallback chain — try from best to lightest
const MODELS = [
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
];

function getModelUrl(model: string) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
}

interface SocraticRequest {
    userMessage: string;
    concept: string;
    conversationHistory: Array<{ role: string; content: string }>;
    currentDepth: number;
    misconceptions: string[];
    // Behavioral context for selective trigger
    mode?: 'exam' | 'practice';
    isCorrect?: boolean;
    currentPL?: number;
    prevPL?: number;
    wrongStreakOnConcept?: number;
    guessProbability?: number;
    confidenceScore?: number;
    // Personalization from prior exam
    previousExamSummary?: {
        concept: string;
        date: string;
        score: number;
        wrongTopics: string[];
        avgTimeMs: number;
        difficultyBreakdown: { easy: number; medium: number; hard: number };
        totalQuestions: number;
    } | null;
}

// Smart offline Socratic fallback — contextually aware, not a generic error
function generateOfflineSocraticResponse(
    userMessage: string,
    concept: string,
    depth: number
): string {
    const msg = userMessage.toLowerCase();

    const depthQuestions: Record<number, string[]> = {
        0: [
            `Interesting starting point! But let me ask — can you give me a real-world example where ${concept} appears?`,
            `Good thinking. Now, what would happen if ${concept} didn't exist? What problem would we be unable to solve?`,
            `That's a reasonable description. But in your own words — *why* does ${concept} work the way it does?`,
        ],
        1: [
            `You're getting there. Now push deeper — what are the *conditions* that must be true for ${concept} to apply?`,
            `Okay, so given what you said, what would be the *first step* if you had to actually use ${concept} to solve a problem?`,
            `I see your reasoning. Here's a challenge: could your explanation be wrong in any edge case? Think of one.`,
        ],
        2: [
            `Now you're thinking like a mathematician. But here's the critical question: what's the *difference* between ${concept} and something that looks very similar to it?`,
            `Good. Based on your answer, if a student made a mistake here, what mistake would it most likely be?`,
            `You picked B, but let me challenge you — why is A *definitely* wrong? Explain it to me like I'm confused.`,
        ],
    };

    // Pick based on specific answers
    if (msg.includes('slope') && concept === 'derivatives') {
        return "That's a common way to put it — but slope of what, exactly? A straight line has a constant slope. What makes derivatives special compared to just measuring slope?";
    }
    if (msg.includes('area') && concept === 'integration') {
        return "Yes, area is one interpretation. But integration is used in contexts with no 'area' at all — like calculating work or probability. What does integration really represent at its core?";
    }
    if (msg.includes('both sides') && concept === 'limits') {
        return "Good! So you know the left and right limits must agree. Here's the harder question: can a limit exist at a point where the function is *undefined*? Why or why not?";
    }

    const bucket = depthQuestions[Math.min(depth, 2)] || depthQuestions[2];
    return bucket[Math.floor(Math.random() * bucket.length)];
}

async function callGemini(model: string, systemPrompt: string, contents: any[]) {
    const response = await fetch(getModelUrl(model), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 200,
                topP: 0.9,
            },
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        const status = data?.error?.status;
        throw { status, code: response.status, data };
    }

    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
        userMessage, concept, conversationHistory, currentDepth, misconceptions,
        mode = 'practice', isCorrect = false,
        currentPL = 0.3, prevPL = 0.3,
        wrongStreakOnConcept = 0, guessProbability = 0, confidenceScore = 0.5,
        previousExamSummary = null,
    }: SocraticRequest = req.body;

    // ── Selective trigger guard — skip LLM if conditions not met ──────────
    const triggerDecision = shouldTriggerSocratic({
        mode: mode as 'exam' | 'practice',
        isCorrect, currentPL, prevPL,
        wrongStreakOnConcept, guessProbability, confidenceScore,
    });
    if (!triggerDecision.shouldTrigger) {
        return res.status(200).json({
            socratic_triggered: false,
            reason: triggerDecision.reasons[0] ?? 'Trigger conditions not met',
            response: null,
        });
    }

    // Build adaptive context from prior exam
    let priorExamContext = '';
    if (previousExamSummary) {
        priorExamContext = `
PRIOR EXAM CONTEXT: The student scored ${previousExamSummary.score}% on ${previousExamSummary.concept} (${previousExamSummary.date}).
They struggled with: ${previousExamSummary.wrongTopics.slice(0, 3).join('; ') || 'general concepts'}.
Focus your Socratic questions on probing exactly those weak areas.`;
    }

    const systemPrompt = `You are a friendly and expert AI tutor specializing in ${concept}.
Your goal is to help the student understand deeply, but you must also be a natural conversationalist.

${priorExamContext}

GUIDELINES:
1. **Conversational**: If the user says "Hi", "Hello", or asks a general question, reply warmly and naturally. Do NOT force a Socratic question if it doesn't fit.
   - Example: User: "Hi" -> You: "Hi there! I'm ready to help you master ${concept}. Where would you like to start?"
2. **Socratic Teaching**: When discussing the specific topic (${concept}), use Socratic questioning to guide them.
   - Probe assumptions, ask "why", and encourage critical thinking.
   - Do NOT just give the answer unless they are stuck.
3. **Adaptive**: Adjust your complexity based on their responses.
4. **Concise**: Keep responses under 3-4 sentences.

Probing depth: ${currentDepth} (0=surface, 10=expert level)
Known misconceptions so far: ${misconceptions.join(', ') || 'none'}

Student said: "${userMessage}"`;

    const contents = [
        ...conversationHistory.slice(-6).map(m => ({
            role: m.role === 'ai' ? 'model' : 'user',
            parts: [{ text: m.content }],
        })),
        { role: 'user', parts: [{ text: userMessage }] },
    ];

    // Try each model in fallback chain
    let aiResponse: string | null = null;
    let usedModel = 'offline';

    for (const model of MODELS) {
        try {
            aiResponse = await callGemini(model, systemPrompt, contents);
            if (aiResponse) {
                usedModel = model;
                break;
            }
        } catch (err: any) {
            const isQuota = err?.status === 'RESOURCE_EXHAUSTED' || err?.code === 429;
            const isNotFound = err?.code === 404;
            console.warn(`Model ${model} failed (${isQuota ? 'quota' : isNotFound ? 'not found' : 'error'}), trying next...`);
            // Continue to next model
        }
    }

    // If all models failed, use intelligent offline fallback
    if (!aiResponse) {
        aiResponse = generateOfflineSocraticResponse(userMessage, concept, currentDepth);
        usedModel = 'offline-fallback';
    }

    const analysis = analyzeStudentResponse(userMessage, concept);

    return res.status(200).json({
        response: aiResponse,
        analysis,
        model: usedModel,
    });
}

function analyzeStudentResponse(response: string, concept: string) {
    const words = response.toLowerCase().split(/\s+/);

    const conceptKeywords: Record<string, string[]> = {
        derivatives: ['rate', 'change', 'slope', 'tangent', 'limit', 'instantaneous', 'function'],
        limits: ['approaches', 'infinity', 'continuous', 'exists', 'value', 'tends', 'both sides'],
        integration: ['area', 'antiderivative', 'sum', 'accumulation', 'integral'],
        algebra: ['variable', 'equation', 'solve', 'expression', 'coefficient'],
        functions: ['input', 'output', 'domain', 'range', 'mapping'],
    };

    const keywords = conceptKeywords[concept] || [];
    const keywordHits = words.filter(w => keywords.includes(w)).length;
    const comprehensionScore = Math.min(1.0,
        keywordHits * 0.15 +
        (words.length > 20 ? 0.3 : words.length > 10 ? 0.2 : 0.1) +
        (response.includes('because') || response.includes('therefore') ? 0.2 : 0) +
        (response.includes('example') ? 0.15 : 0)
    );

    const uncertaintyMarkers = ['maybe', 'i think', 'probably', 'not sure', 'might', 'perhaps'];
    const confidenceMarkers = ['definitely', 'clearly', 'certainly', 'always'];
    const uncertaintyCount = uncertaintyMarkers.filter(m => response.toLowerCase().includes(m)).length;
    const confidenceCount = confidenceMarkers.filter(m => response.toLowerCase().includes(m)).length;
    const confidenceLevel = Math.max(0.1, Math.min(1.0, 0.5 + (confidenceCount - uncertaintyCount) * 0.15));

    const misconceptionPatterns: Record<string, Array<{ pattern: string; misconception: string }>> = {
        derivatives: [
            { pattern: 'just the slope', misconception: 'Oversimplifying derivative as just slope' },
            { pattern: 'the function itself', misconception: 'Confusing derivative with original function' },
        ],
        limits: [
            { pattern: 'equals zero', misconception: 'Assuming limit is always zero at undefined points' },
        ],
    };

    const detected = (misconceptionPatterns[concept] || [])
        .filter(p => response.toLowerCase().includes(p.pattern))
        .map(p => p.misconception);

    const emotionalState =
        response.toLowerCase().includes('confused') || response.toLowerCase().includes("don't understand")
            ? 'frustrated'
            : uncertaintyCount > 1
                ? 'uncertain'
                : response.length > 80 && confidenceCount > 0
                    ? 'confident'
                    : 'engaged';

    return {
        comprehension_score: comprehensionScore,
        confidence_level: confidenceLevel,
        detected_misconceptions: detected,
        knowledge_gaps: response.length < 20 ? ['Response too brief'] : [],
        emotional_state: emotionalState as 'confident' | 'uncertain' | 'frustrated' | 'engaged',
        next_probing_strategy:
            detected.length > 0 ? 'address_misconceptions' : comprehensionScore < 0.5 ? 'simplify_and_clarify' : 'deepen_understanding',
    };
}
