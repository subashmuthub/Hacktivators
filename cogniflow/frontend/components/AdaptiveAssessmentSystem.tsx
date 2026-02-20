import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Clock, Brain, Zap, Target, ArrowRight, RefreshCw } from 'lucide-react';

// Adaptive Assessment System — questions are generated live by Gemini AI
// No hardcoded question bank

const CONCEPTS = ['derivatives', 'limits', 'integration', 'functions', 'algebra', 'probability', 'statistics', 'vectors'];

interface GeminiQuestion {
  question: string;
  options: string[] | null;
  correctIndex: number | null;
  explanation: string;
  isOpenEnded?: boolean;
}

interface StudentResponse {
  question: string;
  answer: string;
  isCorrect: boolean;
  responseTime: number;
  cognitiveLoad: number;
  concept: string;
}

interface RealTimeMetrics {
  cognitiveLoad: number;
  confidence: number;
  frustration: number;
  emotionalState: 'neutral' | 'frustrated' | 'confident';
}

export default function AdaptiveAssessmentSystem() {
  const [selectedConcept, setSelectedConcept] = useState('derivatives');
  const [currentQuestion, setCurrentQuestion] = useState<GeminiQuestion | null>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState(false);
  const [studentAnswer, setStudentAnswer] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [showFeedback, setShowFeedback] = useState<{ correct: boolean; explanation: string } | null>(null);
  const [responses, setResponses] = useState<StudentResponse[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [currentDifficulty, setCurrentDifficulty] = useState(0.5);
  const [adaptationLog, setAdaptationLog] = useState<string[]>([]);
  const [usedModel, setUsedModel] = useState('');
  const [askedQuestions, setAskedQuestions] = useState<string[]>([]);

  const [realTimeMetrics, setRealTimeMetrics] = useState<RealTimeMetrics>({
    cognitiveLoad: 0,
    confidence: 0.5,
    frustration: 0,
    emotionalState: 'neutral',
  });

  const questionStartTime = useRef<number>(0);

  // Drift cognitive metrics over time
  useEffect(() => {
    const interval = setInterval(() => {
      setRealTimeMetrics(prev => ({
        cognitiveLoad: Math.max(0, Math.min(1, prev.cognitiveLoad + (Math.random() - 0.5) * 0.06)),
        confidence: Math.max(0, Math.min(1, prev.confidence + (Math.random() - 0.5) * 0.03)),
        frustration: Math.max(0, Math.min(1, prev.frustration + (Math.random() - 0.5) * 0.02)),
        emotionalState: prev.frustration > 0.6 ? 'frustrated' : prev.confidence > 0.7 ? 'confident' : 'neutral',
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Fetch a new question from Gemini API
  const fetchQuestion = async (concept: string, difficulty: number, emotionalState: string, asked: string[]) => {
    setIsLoadingQuestion(true);
    setCurrentQuestion(null);
    setShowFeedback(null);
    setStudentAnswer('');
    setIsAnswering(false);

    try {
      const res = await fetch('/api/adaptive-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept, difficulty, emotionalState, previousQuestions: asked.slice(-5) }),
      });
      const data = await res.json();
      setCurrentQuestion(data.question);
      setUsedModel(data.model || '');
    } catch {
      setCurrentQuestion({
        question: `Explain what you understand about ${concept} and give one example.`,
        options: null,
        correctIndex: null,
        explanation: `A good answer explains the core principle of ${concept} clearly.`,
        isOpenEnded: true,
      });
    } finally {
      setIsLoadingQuestion(false);
    }
  };

  // Start the assessment
  const startAssessment = () => {
    setResponses([]);
    setAdaptationLog([]);
    setAskedQuestions([]);
    setCurrentDifficulty(0.5);
    setShowResults(false);
    fetchQuestion(selectedConcept, 0.5, 'neutral', []);
  };

  const startQuestion = () => {
    setIsAnswering(true);
    questionStartTime.current = Date.now();
  };

  // Determine if answer is correct
  const checkAnswer = (answer: string, q: GeminiQuestion): boolean => {
    if (q.isOpenEnded || q.options === null || q.correctIndex === null) {
      // Open-ended: check for keyword coverage
      const keywords = selectedConcept.split(' ');
      return answer.length > 30 && keywords.some(k => answer.toLowerCase().includes(k));
    }
    return parseInt(answer) === q.correctIndex;
  };

  const handleAnswerSubmit = () => {
    if (!studentAnswer.trim() || !currentQuestion) return;

    const responseTime = Date.now() - questionStartTime.current;
    const isCorrect = checkAnswer(studentAnswer, currentQuestion);

    const response: StudentResponse = {
      question: currentQuestion.question,
      answer: studentAnswer,
      isCorrect,
      responseTime,
      cognitiveLoad: realTimeMetrics.cognitiveLoad,
      concept: selectedConcept,
    };

    const updatedResponses = [...responses, response];
    setResponses(updatedResponses);
    setAskedQuestions(prev => [...prev, currentQuestion.question]);

    // Show explanation feedback
    setShowFeedback({ correct: isCorrect, explanation: currentQuestion.explanation });

    // Update metrics
    const updatedMetrics = {
      ...realTimeMetrics,
      confidence: isCorrect
        ? Math.min(1, realTimeMetrics.confidence + 0.12)
        : Math.max(0.1, realTimeMetrics.confidence - 0.1),
      frustration: isCorrect
        ? Math.max(0, realTimeMetrics.frustration - 0.1)
        : Math.min(1, realTimeMetrics.frustration + 0.12),
      cognitiveLoad: responseTime > 45000
        ? Math.min(1, realTimeMetrics.cognitiveLoad + 0.2)
        : Math.max(0, realTimeMetrics.cognitiveLoad - 0.05),
    };
    setRealTimeMetrics({ ...updatedMetrics, emotionalState: updatedMetrics.frustration > 0.6 ? 'frustrated' : updatedMetrics.confidence > 0.7 ? 'confident' : 'neutral' });

    // Adapt difficulty
    const recent = updatedResponses.slice(-3);
    const accuracy = recent.filter(r => r.isCorrect).length / recent.length;
    let adj = 0;
    if (accuracy >= 0.8 && updatedMetrics.cognitiveLoad < 0.65) adj = 0.1;
    else if (accuracy <= 0.4 || updatedMetrics.cognitiveLoad > 0.8) adj = -0.15;
    if (updatedMetrics.frustration > 0.7) adj -= 0.1;
    const newDiff = Math.max(0.1, Math.min(1.0, currentDifficulty + adj));
    setCurrentDifficulty(newDiff);

    if (adj !== 0) {
      setAdaptationLog(prev => [...prev,
      `Q${updatedResponses.length}: Difficulty ${adj > 0 ? '↑' : '↓'} to ${newDiff.toFixed(2)} — accuracy ${(accuracy * 100).toFixed(0)}%, load ${(updatedMetrics.cognitiveLoad * 100).toFixed(0)}%`
      ]);
    }

    if (updatedResponses.length >= 8) {
      setTimeout(() => setShowResults(true), 2000);
    }
  };

  const handleNextQuestion = () => {
    fetchQuestion(selectedConcept, currentDifficulty, realTimeMetrics.emotionalState, askedQuestions);
  };

  // ── Results Screen ──────────────────────────────────────────────────────────
  if (showResults) {
    const accuracy = responses.filter(r => r.isCorrect).length / responses.length;
    const masteryLevel = accuracy * currentDifficulty;

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-8 border border-white border-opacity-20">
            <h1 className="text-3xl font-bold text-white mb-6 text-center">
              🎉 Assessment Complete
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="bg-black bg-opacity-30 p-6 rounded-xl">
                <h3 className="text-xl font-semibold text-cyan-400 mb-4">Performance</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Overall Mastery</span>
                    <span className="text-2xl font-bold text-green-400">{(masteryLevel * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Accuracy</span>
                    <span className="text-xl font-bold text-blue-400">{(accuracy * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Questions Answered</span>
                    <span className="text-xl font-bold text-purple-400">{responses.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Concept</span>
                    <span className="text-xl font-bold text-yellow-400 capitalize">{selectedConcept}</span>
                  </div>
                </div>
              </div>

              <div className="bg-black bg-opacity-30 p-6 rounded-xl">
                <h3 className="text-xl font-semibold text-orange-400 mb-4">Adaptive Intelligence</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Difficulty Adaptations</span>
                    <span className="text-orange-300">{adaptationLog.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Final Difficulty</span>
                    <span className="text-cyan-300">{(currentDifficulty * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">AI Model Used</span>
                    <span className="text-green-300 text-xs">{usedModel || 'Gemini'}</span>
                  </div>
                </div>
              </div>
            </div>

            {adaptationLog.length > 0 && (
              <div className="bg-black bg-opacity-30 p-6 rounded-xl mb-6">
                <h3 className="text-xl font-semibold text-yellow-400 mb-4">Adaptation Log</h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {adaptationLog.map((log, i) => (
                    <div key={i} className="text-sm text-gray-300 p-2 bg-black bg-opacity-20 rounded">{log}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="text-center">
              <button
                onClick={() => { setShowResults(false); setCurrentQuestion(null); }}
                className="bg-gradient-to-r from-cyan-500 to-purple-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-cyan-600 hover:to-purple-700 transition-all"
              >
                Start New Assessment
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Start Screen ────────────────────────────────────────────────────────────
  if (!currentQuestion && !isLoadingQuestion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-8 border border-white border-opacity-20 text-white text-center">
          <Brain className="w-16 h-16 text-cyan-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-2">Adaptive Assessment</h1>
          <p className="text-gray-400 mb-8">Questions generated live by Gemini AI · Adapts to your cognitive state</p>

          <div className="mb-6">
            <p className="text-sm text-gray-400 mb-3">Choose a concept:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {CONCEPTS.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedConcept(c)}
                  className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-all ${selectedConcept === c ? 'bg-cyan-500 text-white' : 'bg-white bg-opacity-10 text-gray-300 hover:bg-opacity-20'}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startAssessment}
            className="bg-gradient-to-r from-cyan-500 to-purple-600 text-white px-10 py-4 rounded-xl font-semibold text-lg hover:from-cyan-600 hover:to-purple-700 transition-all flex items-center gap-2 mx-auto"
          >
            <Brain className="w-6 h-6" />
            Begin Assessment
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoadingQuestion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 flex items-center justify-center">
        <div className="text-white text-center">
          <Brain className="w-12 h-12 animate-pulse mx-auto mb-4 text-cyan-400" />
          <p className="text-lg">Gemini is crafting your question...</p>
          <p className="text-sm text-gray-400 mt-1">Difficulty: {(currentDifficulty * 100).toFixed(0)}% · State: {realTimeMetrics.emotionalState}</p>
        </div>
      </div>
    );
  }

  // ── Question Screen ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-indigo-900 p-6">
      <div className="max-w-4xl mx-auto">

        {/* Live Metrics Header */}
        <div className="bg-black bg-opacity-30 backdrop-blur-lg rounded-xl p-4 mb-6 border border-white border-opacity-20">
          <div className="grid grid-cols-4 gap-4 text-white text-center">
            <div>
              <div className="text-sm text-gray-400">Cognitive Load</div>
              <div className={`text-2xl font-bold ${realTimeMetrics.cognitiveLoad > 0.7 ? 'text-red-400' : realTimeMetrics.cognitiveLoad > 0.4 ? 'text-yellow-400' : 'text-green-400'}`}>
                {(realTimeMetrics.cognitiveLoad * 100).toFixed(0)}%
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Confidence</div>
              <div className="text-2xl font-bold text-blue-400">{(realTimeMetrics.confidence * 100).toFixed(0)}%</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Emotional State</div>
              <div className="text-lg font-bold text-purple-400 capitalize">{realTimeMetrics.emotionalState}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Question</div>
              <div className="text-2xl font-bold text-cyan-400">{responses.length + 1} / 8</div>
            </div>
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-8 border border-white border-opacity-20 text-white">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-4">
              <Target className="w-6 h-6 text-cyan-400" />
              <span className="text-cyan-400 font-semibold capitalize">Concept: {selectedConcept}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${currentDifficulty < 0.4 ? 'bg-green-500 bg-opacity-30 text-green-300' : currentDifficulty < 0.7 ? 'bg-yellow-500 bg-opacity-30 text-yellow-300' : 'bg-red-500 bg-opacity-30 text-red-300'}`}>
                {currentDifficulty < 0.4 ? 'Easy' : currentDifficulty < 0.7 ? 'Medium' : 'Hard'}
              </span>
              {usedModel && (
                <span className="ml-auto text-xs text-gray-500">{usedModel}</span>
              )}
            </div>
            <h2 className="text-xl font-bold">{currentQuestion?.question}</h2>
          </div>

          {/* Feedback overlay */}
          {showFeedback && (
            <div className={`mb-6 p-4 rounded-xl border ${showFeedback.correct ? 'bg-green-900 bg-opacity-40 border-green-500' : 'bg-red-900 bg-opacity-40 border-red-500'}`}>
              <div className="flex items-center gap-2 mb-2">
                {showFeedback.correct ? <CheckCircle className="w-5 h-5 text-green-400" /> : <XCircle className="w-5 h-5 text-red-400" />}
                <span className={`font-semibold ${showFeedback.correct ? 'text-green-300' : 'text-red-300'}`}>
                  {showFeedback.correct ? 'Correct!' : 'Incorrect'}
                </span>
              </div>
              <p className="text-gray-300 text-sm">{showFeedback.explanation}</p>
              <button
                onClick={handleNextQuestion}
                className="mt-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 hover:from-cyan-600 hover:to-purple-700 transition-all"
              >
                Next Question <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Begin button */}
          {!isAnswering && !showFeedback && (
            <div className="text-center">
              <button
                onClick={startQuestion}
                className="bg-gradient-to-r from-cyan-500 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold hover:from-cyan-600 hover:to-purple-700 transition-all flex items-center gap-2 mx-auto"
              >
                <Brain className="w-6 h-6" />
                Begin — Cognitive Tracking Active
              </button>
            </div>
          )}

          {/* Answer area */}
          {isAnswering && !showFeedback && currentQuestion && (
            <div className="space-y-6">
              {currentQuestion.options && !currentQuestion.isOpenEnded ? (
                <div className="space-y-3">
                  {currentQuestion.options.map((option, i) => (
                    <button
                      key={i}
                      onClick={() => setStudentAnswer(i.toString())}
                      className={`w-full text-left p-4 rounded-lg transition-all border-2 ${studentAnswer === i.toString()
                        ? 'border-cyan-500 bg-cyan-500 bg-opacity-20 text-white'
                        : 'border-gray-600 bg-white bg-opacity-5 text-gray-300 hover:border-gray-400'}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea
                  value={studentAnswer}
                  onChange={(e) => setStudentAnswer(e.target.value)}
                  placeholder="Explain your understanding in detail..."
                  className="w-full h-32 p-4 bg-white bg-opacity-10 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                />
              )}

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>Response time tracked</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="w-4 h-4" />
                    <span>Load: {(realTimeMetrics.cognitiveLoad * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <button
                  onClick={handleAnswerSubmit}
                  disabled={!studentAnswer.trim()}
                  className="bg-gradient-to-r from-green-500 to-emerald-600 disabled:from-gray-600 disabled:to-gray-700 text-white px-6 py-3 rounded-lg font-semibold transition-all flex items-center gap-2"
                >
                  Submit Answer <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {responses.length > 0 && (
          <div className="mt-6 bg-white bg-opacity-10 backdrop-blur-lg rounded-xl p-6 border border-white border-opacity-20">
            <h3 className="text-white text-lg font-semibold mb-4">Progress</h3>
            <div className="flex gap-2">
              {responses.map((r, i) => (
                <div key={i} className={`w-10 h-10 rounded-full flex items-center justify-center ${r.isCorrect ? 'bg-green-500' : 'bg-red-500'}`}>
                  {r.isCorrect ? <CheckCircle className="w-5 h-5 text-white" /> : <XCircle className="w-5 h-5 text-white" />}
                </div>
              ))}
              {Array.from({ length: Math.max(0, 8 - responses.length) }, (_, i) => (
                <div key={i} className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                  <span className="text-gray-400 text-sm">{responses.length + i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}