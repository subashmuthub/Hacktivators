import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { loadPriorExamSummary, predictNextScore } from '../lib/history-utils';
import { Brain, CheckCircle, XCircle, Clock, Award, ArrowRight } from 'lucide-react';

interface QuizModuleProps {
    concept: string;
    questionCount: number;
    difficulty: string;
    onComplete: (score: number) => void;
}

export default function QuizModule({ concept, questionCount, difficulty, onComplete }: QuizModuleProps) {
    const { user } = useAuth();
    const [phase, setPhase] = useState<'intro' | 'quiz' | 'results'>('intro');
    const [loading, setLoading] = useState(false);
    const [prediction, setPrediction] = useState<any>(null);
    const [questions, setQuestions] = useState<any[]>([]);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [responses, setResponses] = useState<any[]>([]);

    // Question State
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [startTime, setStartTime] = useState<number>(0);

    // AI Prediction on Mount
    useEffect(() => {
        const loadPrediction = () => {
            const pred = predictNextScore(concept);
            if (pred) {
                setPrediction({ score: pred.score, confidence: pred.confidence, reasoning: pred.reasoning });
            }
        };
        loadPrediction();
    }, [concept]);

    const startQuiz = async () => {
        setLoading(true);
        try {
            // Initial question fetch
            await fetchNextQuestion([]);
            setPhase('quiz');
        } catch (e) {
            console.error(e);
            alert('Failed to start quiz. AI service might be busy.');
        } finally {
            setLoading(false);
        }
    };

    const fetchNextQuestion = async (history: any[]) => {
        setLoading(true);
        const seed = Date.now() + Math.random();

        try {
            const res = await fetch('/api/adaptive-assessment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concept,
                    difficulty,
                    previousQuestions: history.map(h => h.question),
                    previousExamSummary: loadPriorExamSummary(concept),
                    seed
                })
            });
            const data = await res.json();

            // Standardize format
            const standardized = {
                question: data.question.question,
                options: data.question.options,
                correctIndex: data.question.correctIndex,
                explanation: data.question.explanation,
                difficulty: data.question.difficulty || 'medium'
            };

            setQuestions(prev => [...prev, standardized]);
            setStartTime(Date.now());
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = () => {
        if (selectedOption === null) return;
        setIsSubmitted(true);

        const currentQ = questions[currentQIndex];
        const isCorrect = selectedOption === currentQ.correctIndex;
        const timeSpent = (Date.now() - startTime) / 1000;

        const newResponse = {
            question: currentQ.question,
            selected: selectedOption,
            correct: currentQ.correctIndex,
            isCorrect,
            timeSpent,
            difficulty: currentQ.difficulty
        };

        setResponses(prev => [...prev, newResponse]);
        setFeedback(isCorrect ? "Correct! " + currentQ.explanation : "Incorrect. " + currentQ.explanation);
    };

    const handleNext = async () => {
        setSelectedOption(null);
        setIsSubmitted(false);
        setFeedback(null);

        if (currentQIndex + 1 >= questionCount) {
            setPhase('results');
            // Derived score will be calculated in render
        } else {
            // Fetch next
            await fetchNextQuestion(responses);
            setCurrentQIndex(prev => prev + 1);
        }
    };

    // Handle completion callback
    useEffect(() => {
        if (phase === 'results' && responses.length >= questionCount) {
            const correct = responses.filter(r => r.isCorrect).length;
            const score = Math.round((correct / questionCount) * 100);
            onComplete(score);
        }
    }, [phase, responses, questionCount, onComplete]);

    if (phase === 'intro') {
        return (
            <div className="card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
                <Brain size={48} className="text-purple-600 mb-4" />
                <h2 className="text-2xl font-bold mb-2">{concept} Assessment</h2>
                <p className="text-gray-600 mb-6">{questionCount} Questions · AI-Generated · Adaptive</p>

                {prediction && (
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-4 rounded-xl mb-6 border border-indigo-100">
                        <div className="text-sm text-gray-500 uppercase tracking-wide font-bold mb-1">AI Performance Prediction</div>
                        <div className="text-3xl font-bold text-indigo-700">{prediction.score}%</div>
                        <p className="text-xs text-gray-500 mt-1">Based on your past performance in similar topics.</p>
                        <div className="text-xs text-gray-400 mt-1 italic">{prediction.reasoning}</div>
                    </div>
                )}

                <button
                    onClick={startQuiz}
                    disabled={loading}
                    className="btn-primary"
                    style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }}
                >
                    {loading ? 'Initializing AI...' : 'Start Quiz'}
                </button>
            </div>
        );
    }

    if (phase === 'results') {
        const correct = responses.filter(r => r.isCorrect).length;
        const score = Math.round((correct / questionCount) * 100);

        return (
            <div className="card" style={{ padding: '2rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
                <Award size={48} className={score >= 70 ? "text-green-500 mb-4" : "text-orange-500 mb-4"} />
                <h2 className="text-2xl font-bold mb-2">Quiz Complete</h2>
                <div className="text-4xl font-bold mb-4" style={{ color: score >= 70 ? '#16a34a' : '#ea580c' }}>
                    {score}%
                </div>
                <p className="text-gray-600 mb-6">You answered {correct} out of {questionCount} correctly.</p>
                <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
                    <h3 className="font-bold mb-2">Review</h3>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {responses.map((r, i) => (
                            <div key={i} style={{ padding: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                    {r.isCorrect ? <CheckCircle size={16} className="text-green-500" /> : <XCircle size={16} className="text-red-500" />}
                                    <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Question {i + 1}</span>
                                </div>
                                <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0 }}>{r.question}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const currentQ = questions[currentQIndex];

    if (!currentQ && loading) {
        return (
            <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                <div className="spinner mb-4" style={{ margin: '0 auto' }}></div>
                <p>Generating adaptive question...</p>
                <style jsx>{`
                    .spinner {
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #3b82f6;
                        border-radius: 50%;
                        width: 30px;
                        height: 30px;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    if (!currentQ) return <div>Error loading question.</div>;

    return (
        <div className="card" style={{ padding: '2rem', maxWidth: '700px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <span className="badge badge-blue">{concept}</span>
                <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Question {currentQIndex + 1} of {questionCount}</span>
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                {currentQ.question}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                {currentQ.options.map((opt: string, i: number) => {
                    const isCorrect = i === currentQ.correctIndex;
                    const isSelected = selectedOption === i;

                    let borderColor = '#e2e8f0';
                    let bgColor = '#fff';

                    if (isSubmitted) {
                        if (isCorrect) {
                            borderColor = '#22c55e';
                            bgColor = '#f0fdf4';
                        } else if (isSelected) {
                            borderColor = '#ef4444';
                            bgColor = '#fef2f2';
                        }
                    } else if (isSelected) {
                        borderColor = '#3b82f6';
                        bgColor = '#eff6ff';
                    }

                    return (
                        <button
                            key={i}
                            onClick={() => !isSubmitted && setSelectedOption(i)}
                            disabled={isSubmitted}
                            style={{
                                padding: '1rem',
                                textAlign: 'left',
                                borderRadius: '10px',
                                border: `2px solid ${borderColor}`,
                                background: bgColor,
                                cursor: isSubmitted ? 'default' : 'pointer',
                                transition: 'all 0.2s',
                                fontWeight: isSelected ? '600' : '400'
                            }}
                        >
                            {opt}
                        </button>
                    );
                })}
            </div>

            {isSubmitted && (
                <div style={{ padding: '1rem', background: feedback?.startsWith('Correct') ? '#f0fdf4' : '#fef2f2', borderRadius: '8px', marginBottom: '1.5rem', border: feedback?.startsWith('Correct') ? '1px solid #bbf7d0' : '1px solid #fecaca' }}>
                    <p style={{ margin: 0, color: feedback?.startsWith('Correct') ? '#166534' : '#991b1b' }}>{feedback}</p>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {!isSubmitted ? (
                    <button
                        className="btn-primary"
                        onClick={handleSubmit}
                        disabled={selectedOption === null}
                    >
                        Submit Answer
                    </button>
                ) : (
                    <button
                        className="btn-primary"
                        onClick={handleNext}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        {currentQIndex + 1 >= questionCount ? 'Finish Quiz' : 'Next Question'} <ArrowRight size={18} />
                    </button>
                )}
            </div>
        </div>
    );
}
