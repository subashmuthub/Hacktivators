const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const CognitiveModelingEngine = require('./cognitive-engine/CognitiveModelingEngine');
const ForgettingCurvePredictor = require('./cognitive-engine/ForgettingCurvePredictor');

// Revolutionary Real-time Cognitive Modeling Server
// Innovation: Live brain-state tracking and prediction for personalized learning

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Initialize Cognitive Engine
const cognitiveEngine = new CognitiveModelingEngine();
const forgettingPredictor = new ForgettingCurvePredictor();

// Store active learning sessions
const activeSessions = new Map();

// Revolutionary Real-time Cognitive State Tracking
io.on('connection', (socket) => {
  console.log('🧠 New cognitive session started:', socket.id);
  
  // Initialize student session with cognitive profile
  socket.on('initialize_session', async (data) => {
    const { studentId, subject, currentKnowledge } = data;
    
    const cognitiveProfile = await cognitiveEngine.createCognitiveProfile({
      studentId,
      subject,
      initialKnowledge: currentKnowledge,
      sessionId: socket.id
    });
    
    activeSessions.set(socket.id, {
      studentId,
      cognitiveProfile,
      interactionHistory: [],
      realTimeMetrics: {
        responseTime: [],
        clickPatterns: [],
        scrollBehavior: [],
        focusEvents: []
      }
    });

    socket.emit('session_initialized', { cognitiveProfile });
  });

  // Track Micro-Interactions for Cognitive Load Assessment
  socket.on('track_interaction', async (data) => {
    const session = activeSessions.get(socket.id);
    if (!session) return;

    const { type, timestamp, metadata } = data;
    
    // Revolutionary Micro-Interaction Analysis
    session.realTimeMetrics[type] = session.realTimeMetrics[type] || [];
    session.realTimeMetrics[type].push({
      timestamp,
      ...metadata
    });

    // Real-time Cognitive Load Assessment
    const cognitiveLoad = calculateCognitiveLoad(session.realTimeMetrics);
    const attentionState = assessAttentionState(session.realTimeMetrics);
    
    // Update cognitive profile in real-time
    const updatedProfile = await cognitiveEngine.updateCognitiveState(
      session.cognitiveProfile,
      { cognitiveLoad, attentionState, interaction: data }
    );

    session.cognitiveProfile = updatedProfile;
    
    // Broadcast real-time updates
    socket.emit('cognitive_state_update', {
      cognitiveLoad,
      attentionState,
      predictedPerformance: updatedProfile.predictedPerformance
    });
  });

  // Process Learning Interaction (Quiz, Discussion, etc.)
  socket.on('learning_interaction', async (data) => {
    const session = activeSessions.get(socket.id);
    if (!session) return;

    const { 
      concept, 
      response, 
      responseTime, 
      interactionType,
      contextualData 
    } = data;

    // Revolutionary Multi-Modal Analysis
    const analysisResult = await cognitiveEngine.analyzeLearningInteraction({
      concept,
      response,
      responseTime,
      interactionType,
      contextualData,
      currentProfile: session.cognitiveProfile,
      sessionHistory: session.interactionHistory
    });

    // Update Knowledge Graph in Real-time
    const updatedKnowledgeState = await cognitiveEngine.updateKnowledgeGraph(
      session.cognitiveProfile.knowledgeGraph,
      analysisResult
    );

    // Predict Forgetting Schedule
    const forgettingPrediction = await forgettingPredictor.predictOptimalReview(
      concept,
      analysisResult.masteryLevel,
      session.cognitiveProfile.learningStyle
    );

    // Store interaction
    session.interactionHistory.push({
      timestamp: new Date(),
      concept,
      analysis: analysisResult,
      forgettingPrediction
    });

    // Send comprehensive update
    socket.emit('learning_analysis', {
      conceptAnalysis: analysisResult,
      knowledgeGraph: updatedKnowledgeState,
      forgettingPrediction,
      recommendations: generatePersonalizedRecommendations(analysisResult)
    });
  });

  // Disconnect handling
  socket.on('disconnect', () => {
    console.log('🧠 Cognitive session ended:', socket.id);
    activeSessions.delete(socket.id);
  });
});

// Revolutionary Cognitive Load Calculation
function calculateCognitiveLoad(metrics) {
  const responseTimeVariability = calculateVariability(metrics.responseTime || []);
  const clickFrequency = calculateClickFrequency(metrics.clickPatterns || []);
  const scrollPatterns = analyzeScrollPatterns(metrics.scrollBehavior || []);
  
  // Advanced cognitive load formula based on research
  const cognitiveLoad = Math.min(1.0, 
    (responseTimeVariability * 0.4) +
    (clickFrequency * 0.3) +
    (scrollPatterns.agitation * 0.3)
  );
  
  return {
    overall: cognitiveLoad,
    components: {
      temporalProcessing: responseTimeVariability,
      motorControl: clickFrequency,
      attentionalControl: scrollPatterns.agitation
    }
  };
}

// Attention State Assessment
function assessAttentionState(metrics) {
  const focusEvents = metrics.focusEvents || [];
  const recentFocus = focusEvents.slice(-10);
  
  const focusLost = recentFocus.filter(e => e.type === 'blur').length;
  const totalEvents = recentFocus.length;
  
  if (totalEvents === 0) return 'unknown';
  
  const distractionRate = focusLost / totalEvents;
  
  if (distractionRate > 0.7) return 'highly_distracted';
  if (distractionRate > 0.4) return 'moderately_distracted';
  if (distractionRate > 0.2) return 'slightly_distracted';
  return 'focused';
}

// Utility Functions
function calculateVariability(timeSeries) {
  if (timeSeries.length < 2) return 0;
  
  const mean = timeSeries.reduce((a, b) => a + b, 0) / timeSeries.length;
  const variance = timeSeries.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / timeSeries.length;
  return Math.sqrt(variance) / mean; // Coefficient of variation
}

function calculateClickFrequency(clickPatterns) {
  if (clickPatterns.length < 2) return 0;
  
  const timeSpan = clickPatterns[clickPatterns.length - 1].timestamp - clickPatterns[0].timestamp;
  return Math.min(clickPatterns.length / (timeSpan / 1000 / 60), 1.0); // Clicks per minute, normalized
}

function analyzeScrollPatterns(scrollBehavior) {
  if (scrollBehavior.length < 5) return { agitation: 0, engagement: 0.5 };
  
  let directionChanges = 0;
  let totalDistance = 0;
  
  for (let i = 1; i < scrollBehavior.length; i++) {
    const prev = scrollBehavior[i - 1];
    const curr = scrollBehavior[i];
    
    const distance = Math.abs(curr.scrollY - prev.scrollY);
    totalDistance += distance;
    
    if (i > 1) {
      const prevDirection = scrollBehavior[i - 1].scrollY - scrollBehavior[i - 2].scrollY;
      const currDirection = curr.scrollY - prev.scrollY;
      
      if (prevDirection * currDirection < 0) { // Sign change indicates direction change
        directionChanges++;
      }
    }
  }
  
  const agitationScore = Math.min(directionChanges / scrollBehavior.length, 1.0);
  const engagementScore = Math.min(totalDistance / 10000, 1.0); // Normalize scroll distance
  
  return {
    agitation: agitationScore,
    engagement: engagementScore
  };
}

function generatePersonalizedRecommendations(analysisResult) {
  const recommendations = [];
  
  if (analysisResult.masteryLevel < 0.6) {
    recommendations.push({
      type: 'content_reinforcement',
      message: 'Consider reviewing foundational concepts',
      priority: 'high'
    });
  }
  
  if (analysisResult.confidenceLevel > analysisResult.masteryLevel + 0.2) {
    recommendations.push({
      type: 'confidence_calibration',
      message: 'Let\'s challenge your understanding with deeper questions',
      priority: 'medium'
    });
  }
  
  if (analysisResult.cognitiveLoad > 0.8) {
    recommendations.push({
      type: 'cognitive_break',
      message: 'Consider taking a short break to reduce mental fatigue',
      priority: 'high'
    });
  }
  
  return recommendations;
}

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeSessions: activeSessions.size,
    service: 'CogniFlow Cognitive Engine'
  });
});

// Cognitive Analytics Endpoint
app.get('/analytics/:sessionId', (req, res) => {
  const session = activeSessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    cognitiveProfile: session.cognitiveProfile,
    interactionCount: session.interactionHistory.length,
    realTimeMetrics: session.realTimeMetrics
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('🚀 CogniFlow Cognitive Engine running on port', PORT);
  console.log('🧠 Real-time cognitive modeling active');
});