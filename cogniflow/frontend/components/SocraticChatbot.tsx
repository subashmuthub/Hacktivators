import React, { useState, useEffect, useRef } from 'react';
import { Send, Brain, AlertCircle, Clock, Zap, RefreshCw } from 'lucide-react';

interface Message {
  id: string;
  type: 'user' | 'ai' | 'system';
  content: string;
  timestamp: Date;
  analysis?: ConceptualAnalysis;
  probing_depth?: number;
}

interface ConceptualAnalysis {
  comprehension_score: number;
  confidence_level: number;
  detected_misconceptions: string[];
  knowledge_gaps: string[];
  emotional_state: 'confident' | 'uncertain' | 'frustrated' | 'engaged';
  next_probing_strategy: string;
}

interface SocraticSession {
  concept: string;
  current_depth: number;
  max_depth_reached: boolean;
  misconceptions_identified: string[];
  understanding_progression: number[];
}

interface ExamHistorySummary {
  concept: string;
  date: string;
  score: number;
  wrongTopics: string[];
  avgTimeMs: number;
  difficultyBreakdown: { easy: number; medium: number; hard: number };
  totalQuestions: number;
}

// All subjects from CONCEPT_CATEGORIES — now full coverage (Top 5 Essential)
const ALL_CONCEPTS: Record<string, string[]> = {
  'Mathematics': ['derivatives', 'integration', 'linear algebra', 'probability', 'geometry'],
  'Physics': ['mechanics', 'thermodynamics', 'electromagnetism', 'optics', 'quantum basics'],
  'Computer Science': ['data structures', 'algorithms', 'operating systems', 'databases', 'networking'],
  'Chemistry': ['atomic structure', 'bonding', 'stoichiometry', 'organic chem', 'periodicity'],
  'Biology': ['cell biology', 'genetics', 'evolution', 'ecology', 'physiology'],
  'History': ['world war i', 'world war ii', 'ancient rome', 'industrial revolution', 'cold war'],
  'English': ['grammar', 'essay structure', 'literary devices', 'reading comp', 'creative writing'],
};

const QUICK_CONCEPTS = ['derivatives', 'limits', 'integration', 'algorithms', 'genetics', 'mechanics', 'grammar'];

function loadPriorExamSummary(concept: string): ExamHistorySummary | null {
  if (typeof window === 'undefined') return null;
  try {
    const all: ExamHistorySummary[] = JSON.parse(localStorage.getItem('cogniflow_exam_history') || '[]');
    const matching = all.filter(e => e.concept.toLowerCase() === concept.toLowerCase().trim());
    return matching.length > 0 ? matching[matching.length - 1] : null;
  } catch { return null; }
}

export default function SocraticChatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [currentSession, setCurrentSession] = useState<SocraticSession | null>(null);
  const [responseLatency, setResponseLatency] = useState<number[]>([]);
  const [selectedConcept, setSelectedConcept] = useState('derivatives');
  const [customConceptInput, setCustomConceptInput] = useState('');
  const [showConceptPicker, setShowConceptPicker] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>('Mathematics');
  const [error, setError] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<string>('gemini-2.0-flash');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [priorExam, setPriorExam] = useState<ExamHistorySummary | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputStartTime = useRef<number>(0);

  const assessCognitiveLoad = (latencies: number[]): number => {
    if (latencies.length < 2) return 0.5;
    const recentLatencies = latencies.slice(-5);
    const avgLatency = recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length;
    return Math.min(avgLatency / 30000, 1.0);
  };

  const callGeminiAI = async (
    userMessage: string,
    conversationHistory: Array<{ role: string; content: string }>,
    depth: number,
    misconceptions: string[]
  ) => {
    const response = await fetch('/api/socratic-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage,
        concept: selectedConcept,
        conversationHistory,
        currentDepth: depth,
        misconceptions,
        // Always trigger for standalone chatbot (not gated by behavior)
        mode: 'practice',
        isCorrect: false,
        currentPL: 0.1, // low to force trigger
        prevPL: 0.1,
        wrongStreakOnConcept: 3,
        guessProbability: 0,
        confidenceScore: 0.5,
        previousExamSummary: priorExam,
      })
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isThinking) return;

    const responseTime = Date.now() - inputStartTime.current;
    setResponseLatency(prev => [...prev, responseTime].slice(-10));
    setError(null);

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    const userInput = inputValue;
    setInputValue('');
    setIsThinking(true);

    try {
      const history = messages.map(m => ({
        role: m.type === 'user' ? 'user' : 'ai',
        content: m.content
      }));
      const depth = currentSession?.current_depth || 0;
      const misconceptions = currentSession?.misconceptions_identified || [];

      const result = await callGeminiAI(userInput, history, depth, misconceptions);

      // Handle socratic_triggered: false — show fallback message
      const responseText = result.socratic_triggered === false || !result.response
        ? `Let's explore **${selectedConcept}** further! Here's a question to deepen your thinking: Can you give a real-world example where ${selectedConcept} is applied? What makes it work in that context?`
        : result.response;

      const offline = result.model === 'offline-fallback' || result.model?.includes('fallback');
      setActiveModel(offline ? 'Smart Fallback' : (result.model || 'gemini-2.0-flash'));
      setIsOfflineMode(offline);
      setError(null);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: responseText,
        timestamp: new Date(),
        analysis: result.analysis,
        probing_depth: depth + 1
      };

      setMessages(prev => [...prev, aiMessage]);

      setCurrentSession(prev => ({
        concept: selectedConcept,
        current_depth: (prev?.current_depth || 0) + 1,
        max_depth_reached: (prev?.current_depth || 0) >= 10,
        misconceptions_identified: [
          ...(prev?.misconceptions_identified || []),
          ...(result.analysis?.detected_misconceptions || [])
        ],
        understanding_progression: [
          ...(prev?.understanding_progression || []),
          result.analysis?.comprehension_score || 0.5
        ]
      }));

    } catch (err) {
      console.error('Failed to get AI response:', err);
      setError('Could not reach Gemini. Check that npm run dev is running and GEMINI_API_KEY is set.');
    } finally {
      setIsThinking(false);
    }
  };

  const startNewSession = (concept: string) => {
    const c = concept.trim().toLowerCase();
    setSelectedConcept(c);
    setCustomConceptInput('');
    setShowConceptPicker(false);
    const prior = loadPriorExamSummary(c);
    setPriorExam(prior);
    setMessages([]);
    setCurrentSession({
      concept: c,
      current_depth: 0,
      max_depth_reached: false,
      misconceptions_identified: [],
      understanding_progression: []
    });

    const priorNote = prior
      ? `\n\n📊 **Your prior exam on this topic:** Score ${prior.score}%, date ${prior.date}. I'll specifically probe areas where you struggled.`
      : '';

    const welcome: Message = {
      id: '0',
      type: 'ai',
      content: `Hello! I'm your Socratic AI tutor, powered by Gemini. I don't just ask questions — I challenge your understanding to build true mastery. Let's explore **${concept}** together.${priorNote}\n\nTo start: Can you explain what ${concept} means to you in your own words?`,
      timestamp: new Date()
    };
    setMessages([welcome]);
  };

  useEffect(() => {
    startNewSession('derivatives');
  }, []); // eslint-disable-line

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const latestComprehension = currentSession?.understanding_progression?.slice(-1)[0];

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      {/* Header */}
      <div className="bg-black bg-opacity-50 p-4 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Brain className="w-8 h-8 text-purple-400" />
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                Socratic AI Tutor
                <span className="text-xs bg-purple-600 px-2 py-0.5 rounded-full font-normal">Gemini Powered</span>
              </h1>
              <p className="text-sm text-gray-300">Real AI · Deep Comprehension Testing · Adaptive to Your Performance</p>
            </div>
          </div>

          {/* Concept Selector */}
          <div className="flex flex-col gap-2">
            {/* Quick buttons */}
            <div className="flex gap-2 flex-wrap">
              {QUICK_CONCEPTS.map(c => (
                <button
                  key={c}
                  onClick={() => startNewSession(c)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all capitalize ${selectedConcept === c
                    ? 'bg-purple-500 text-white'
                    : 'bg-white bg-opacity-10 text-gray-300 hover:bg-opacity-20'
                    }`}
                >
                  {c}
                </button>
              ))}
              <button
                onClick={() => setShowConceptPicker(!showConceptPicker)}
                className="px-3 py-1.5 rounded-full text-sm font-medium bg-white bg-opacity-10 text-gray-300 hover:bg-opacity-20"
              >
                + More
              </button>
            </div>
            {/* Custom concept input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={customConceptInput}
                onChange={e => setCustomConceptInput(e.target.value)}
                onKeyPress={e => { if (e.key === 'Enter' && customConceptInput.trim()) startNewSession(customConceptInput); }}
                placeholder="Or type any topic..."
                className="flex-1 bg-white bg-opacity-10 text-white placeholder-gray-400 px-3 py-1.5 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-purple-400 border border-white border-opacity-10"
              />
              {customConceptInput.trim() && (
                <button
                  onClick={() => startNewSession(customConceptInput)}
                  className="bg-purple-600 text-white px-3 py-1.5 rounded-full text-sm font-medium"
                >Go</button>
              )}
            </div>
          </div>

          {/* Prior exam badge */}
          {priorExam && (
            <div className="bg-blue-900 bg-opacity-60 border border-blue-500 text-blue-200 px-3 py-1.5 rounded-lg text-xs">
              📊 Prior exam: <strong>{priorExam.score}%</strong> · Targeting weak areas
            </div>
          )}

          {currentSession && (
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <p className="text-gray-400">Probing Depth</p>
                <p className="font-bold text-lg text-purple-300">{currentSession.current_depth}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-400">Misconceptions</p>
                <p className="font-bold text-lg text-red-400">{currentSession.misconceptions_identified.length}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-400">Comprehension</p>
                <p className="font-bold text-lg text-green-400">
                  {latestComprehension !== undefined ? `${(latestComprehension * 100).toFixed(0)}%` : '—'}
                </p>
              </div>
              <div className="text-center">
                <p className="text-gray-400">Cognitive Load</p>
                <p className="font-bold text-lg text-orange-400">
                  {(assessCognitiveLoad(responseLatency) * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Full concept picker dropdown */}
        {showConceptPicker && (
          <div className="mt-3 bg-black bg-opacity-70 rounded-xl p-3 border border-white border-opacity-10">
            <div className="flex gap-2 flex-wrap mb-2">
              {Object.keys(ALL_CONCEPTS).map(cat => (
                <button key={cat} onClick={() => setOpenCategory(openCategory === cat ? null : cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${openCategory === cat ? 'bg-purple-600 text-white' : 'bg-white bg-opacity-10 text-gray-300'}`}>
                  {cat}
                </button>
              ))}
            </div>
            {openCategory && (
              <div className="flex flex-wrap gap-2">
                {ALL_CONCEPTS[openCategory]?.map(c => (
                  <button key={c} onClick={() => startNewSession(c)}
                    className="px-3 py-1 rounded-full text-xs bg-white bg-opacity-10 text-gray-200 hover:bg-purple-600 hover:text-white transition-all capitalize">
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-900 bg-opacity-80 border border-red-500 text-red-200 px-4 py-2 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Offline fallback notice */}
      {isOfflineMode && !error && (
        <div className="bg-amber-900 bg-opacity-60 border border-amber-600 text-amber-200 px-4 py-2 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Gemini quota reached — using smart offline Socratic mode. Responses are still contextually adaptive.
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-3xl p-4 rounded-xl ${message.type === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-white bg-opacity-10 text-white backdrop-blur-lg border border-white border-opacity-10'
              }`}>
              <div className="flex items-start gap-3">
                {message.type === 'ai' && <Brain className="w-6 h-6 text-purple-400 mt-1 flex-shrink-0" />}
                <div className="flex-1">
                  <p className="mb-2 whitespace-pre-wrap">{message.content}</p>

                  {/* Cognitive Analysis Panel */}
                  {message.analysis && (
                    <div className="mt-3 p-3 bg-black bg-opacity-30 rounded-lg text-sm space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-yellow-400 text-xs font-semibold uppercase tracking-wide">Real-time Cognitive Analysis</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-gray-400 text-xs">Comprehension</span>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${message.analysis.comprehension_score > 0.7 ? 'bg-green-400' : message.analysis.comprehension_score > 0.4 ? 'bg-yellow-400' : 'bg-red-400'}`}
                                style={{ width: `${message.analysis.comprehension_score * 100}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold ${message.analysis.comprehension_score > 0.7 ? 'text-green-400' : 'text-yellow-400'}`}>
                              {(message.analysis.comprehension_score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-400 text-xs">Confidence</span>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${message.analysis.confidence_level * 100}%` }} />
                            </div>
                            <span className="text-xs font-bold text-blue-400">
                              {(message.analysis.confidence_level * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {message.analysis.detected_misconceptions.length > 0 && (
                        <div className="mt-1">
                          <div className="flex items-center gap-1 mb-1">
                            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-red-400 text-xs font-semibold">Detected Misconceptions:</span>
                          </div>
                          <ul className="text-red-300 text-xs space-y-0.5">
                            {message.analysis.detected_misconceptions.map((m, idx) => (
                              <li key={idx}>• {m}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${message.analysis.emotional_state === 'confident' ? 'bg-green-400' :
                          message.analysis.emotional_state === 'frustrated' ? 'bg-red-400' :
                            message.analysis.emotional_state === 'uncertain' ? 'bg-yellow-400' : 'bg-blue-400'
                          }`} />
                        <span className="text-gray-400 text-xs">
                          State: <span className="capitalize text-white">{message.analysis.emotional_state}</span>
                          {' · '}Strategy: <span className="text-purple-300">{message.analysis.next_probing_strategy.replace(/_/g, ' ')}</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Thinking Indicator */}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-white bg-opacity-10 backdrop-blur-lg p-4 rounded-xl text-white border border-white border-opacity-10">
              <div className="flex items-center gap-3">
                <Brain className="w-6 h-6 text-purple-400 animate-pulse" />
                <div className="flex space-x-1">
                  {[0, 0.15, 0.3].map((delay, i) => (
                    <div key={i} className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}s` }} />
                  ))}
                </div>
                <span className="text-sm text-gray-300">Gemini is analyzing your response...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-black bg-opacity-50">
        <div className="flex gap-3">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={(e) => { if (e.key === 'Enter' && !isThinking) handleSendMessage(); }}
            onFocus={() => { inputStartTime.current = Date.now(); }}
            placeholder={`Explain your understanding of ${selectedConcept}... (Gemini will probe deeper)`}
            className="flex-1 bg-white bg-opacity-10 backdrop-blur-lg text-white placeholder-gray-400 px-4 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 border border-white border-opacity-10"
            disabled={isThinking}
          />
          <button
            onClick={handleSendMessage}
            disabled={isThinking || !inputValue.trim()}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl transition-colors flex items-center gap-2 font-medium"
          >
            {isThinking ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Response time tracked for cognitive load analysis</span>
          </div>
          {responseLatency.length > 0 && (
            <div>Last response: {(responseLatency[responseLatency.length - 1] / 1000).toFixed(1)}s</div>
          )}
          <div className="ml-auto flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${isOfflineMode ? 'bg-amber-400' : 'bg-green-400'} animate-pulse`} />
            <span className={isOfflineMode ? 'text-amber-400' : 'text-green-400'}>
              {isOfflineMode ? 'Smart Fallback Active' : `${activeModel} Active`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}