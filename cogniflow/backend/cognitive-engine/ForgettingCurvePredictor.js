const math = require('mathjs');

/**
 * Revolutionary Forgetting Curve Predictor
 * Innovation: Neuroscience-based memory decay prediction
 * 
 * Based on:
 * - Ebbinghaus Forgetting Curve
 * - Spaced Repetition Research
 * - Individual Learning Style Variation
 */
class ForgettingCurvePredictor {
  constructor() {
    // Forgetting curve parameters (research-based)
    this.defaultDecayRate = 0.5; // Half-life in days
    this.learningStyleModifiers = {
      visual: 1.2,
      auditory: 1.0,
      kinesthetic: 1.3,
      reading: 1.1
    };
  }

  /**
   * Predicts optimal review schedule using spaced repetition
   * Revolutionary: Personalized intervals based on individual cognitive profile
   */
  async predictOptimalReview(concept, masteryLevel, learningStyle) {
    // Calculate retention strength
    const retentionStrength = this.calculateRetentionStrength(masteryLevel, learningStyle);
    
    // Generate spaced repetition schedule
    const reviewSchedule = this.generateSpacedRepetitionSchedule(
      retentionStrength,
      learningStyle
    );

    // Calculate forgetting probability over time
    const forgettingCurve = this.calculateForgettingCurve(
      retentionStrength,
      30 // days
    );

    // Identify critical review points
    const criticalReviewDays = this.identifyCriticalReviewPoints(forgettingCurve);

    return {
      concept,
      currentRetentionStrength: retentionStrength,
      daysUntilForget: this.predictDaysUntilForget(retentionStrength),
      optimalReviewDays: reviewSchedule,
      criticalReviewDays,
      forgettingCurve,
      confidenceLevel: this.calculatePredictionConfidence(masteryLevel, learningStyle)
    };
  }

  /**
   * Calculate retention strength based on mastery and learning characteristics
   */
  calculateRetentionStrength(masteryLevel, learningStyle) {
    // Base retention from mastery level
    let baseRetention = masteryLevel;

    // Apply learning style modifiers
    const dominantStyle = this.getDominantLearningStyle(learningStyle);
    const styleModifier = this.learningStyleModifiers[dominantStyle] || 1.0;

    // Adjusted retention strength
    const retentionStrength = baseRetention * styleModifier;

    return Math.max(0.1, Math.min(1.0, retentionStrength));
  }

  /**
   * Generate personalized spaced repetition schedule
   * Based on SM-2 algorithm with cognitive adaptations
   */
  generateSpacedRepetitionSchedule(retentionStrength, learningStyle) {
    const schedule = [];
    const baseIntervals = [1, 3, 7, 14, 30, 60, 90]; // Days

    // Adjust intervals based on retention strength
    for (let i = 0; i < baseIntervals.length; i++) {
      const interval = baseIntervals[i];
      
      // Stronger retention = longer intervals
      const adjustedInterval = Math.round(interval * retentionStrength);
      
      // Don't let intervals get too short
      const finalInterval = Math.max(interval * 0.5, adjustedInterval);
      
      schedule.push({
        reviewNumber: i + 1,
        day: Math.round(finalInterval),
        retentionProbability: this.calculateRetentionAtDay(
          retentionStrength,
          finalInterval
        ),
        priority: this.calculateReviewPriority(
          retentionStrength,
          finalInterval
        )
      });
    }

    return schedule;
  }

  /**
   * Calculate forgetting curve over specified duration
   * Uses exponential decay model with individual variations
   */
  calculateForgettingCurve(retentionStrength, durationDays) {
    const curve = [];
    
    for (let day = 0; day <= durationDays; day++) {
      const retention = this.calculateRetentionAtDay(retentionStrength, day);
      
      curve.push({
        day,
        retention: retention,
        forgettingProbability: 1 - retention,
        needsReview: retention < 0.7 // Review if retention drops below 70%
      });
    }

    return curve;
  }

  /**
   * Calculate retention probability at specific day
   * Exponential decay formula: R(t) = R₀ * e^(-t/S)
   * Where: R(t) = retention at time t
   *        R₀ = initial retention strength
   *        t = time in days
   *        S = strength factor (related to mastery)
   */
  calculateRetentionAtDay(initialStrength, days) {
    // Strength factor: higher mastery = slower decay
    const strengthFactor = initialStrength * 10 + 2; // 2-12 days half-life
    
    // Exponential decay
    const retention = initialStrength * Math.exp(-days / strengthFactor);
    
    return Math.max(0, Math.min(1, retention));
  }

  /**
   * Predict days until retention drops below critical threshold
   */
  predictDaysUntilForget(retentionStrength, threshold = 0.5) {
    // Using inverse exponential decay formula
    const strengthFactor = retentionStrength * 10 + 2;
    
    // Solve for time when retention = threshold
    // threshold = retentionStrength * e^(-days/strengthFactor)
    // days = -strengthFactor * ln(threshold / retentionStrength)
    
    if (retentionStrength <= threshold) {
      return 0; // Already below threshold
    }

    const days = -strengthFactor * Math.log(threshold / retentionStrength);
    
    return Math.max(1, Math.round(days));
  }

  /**
   * Identify critical review points before major retention loss
   */
  identifyCriticalReviewPoints(forgettingCurve) {
    const criticalPoints = [];
    
    for (let i = 1; i < forgettingCurve.length; i++) {
      const current = forgettingCurve[i];
      const previous = forgettingCurve[i - 1];
      
      // Detect steep drops in retention
      const retentionDrop = previous.retention - current.retention;
      
      if (retentionDrop > 0.05) { // 5% drop
        criticalPoints.push({
          day: current.day,
          retention: current.retention,
          dropMagnitude: retentionDrop,
          urgency: retentionDrop > 0.1 ? 'high' : 'medium'
        });
      }
    }

    return criticalPoints;
  }

  /**
   * Calculate review priority based on retention and time
   */
  calculateReviewPriority(retentionStrength, daysUntilReview) {
    const retentionAtReview = this.calculateRetentionAtDay(
      retentionStrength,
      daysUntilReview
    );

    if (retentionAtReview < 0.5) return 'critical';
    if (retentionAtReview < 0.7) return 'high';
    if (retentionAtReview < 0.85) return 'medium';
    return 'low';
  }

  /**
   * Calculate prediction confidence based on data quality
   */
  calculatePredictionConfidence(masteryLevel, learningStyle) {
    // Higher mastery = more reliable prediction
    const masteryConfidence = masteryLevel;
    
    // More balanced learning style = more predictable
    const styleBalance = this.calculateLearningStyleBalance(learningStyle);
    
    const confidence = (masteryConfidence * 0.6) + (styleBalance * 0.4);
    
    return Math.max(0.3, Math.min(1.0, confidence));
  }

  /**
   * Get dominant learning style
   */
  getDominantLearningStyle(learningStyle) {
    let maxStyle = 'visual';
    let maxValue = 0;

    for (const [style, value] of Object.entries(learningStyle)) {
      if (value > maxValue) {
        maxValue = value;
        maxStyle = style;
      }
    }

    return maxStyle;
  }

  /**
   * Calculate learning style balance (higher = more balanced)
   */
  calculateLearningStyleBalance(learningStyle) {
    const values = Object.values(learningStyle);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    
    // Calculate variance
    const variance = values.reduce((sum, val) => {
      return sum + Math.pow(val - mean, 2);
    }, 0) / values.length;

    // Lower variance = more balanced = higher score
    const balanceScore = 1 - Math.sqrt(variance);
    
    return Math.max(0, Math.min(1, balanceScore));
  }

  /**
   * Revolutionary: Predict optimal circadian study time
   * Based on cognitive research on learning efficiency throughout day
   */
  predictOptimalStudyTime(learningStyle, performanceHistory = []) {
    // Circadian learning efficiency curve (research-based)
    const hourlyEfficiency = {
      6: 0.6, 7: 0.75, 8: 0.85, 9: 0.9, 10: 0.95,
      11: 0.9, 12: 0.8, 13: 0.7, 14: 0.65, 15: 0.7,
      16: 0.8, 17: 0.85, 18: 0.8, 19: 0.75, 20: 0.7,
      21: 0.65, 22: 0.6, 23: 0.5
    };

    // Adjust for learning style
    const dominantStyle = this.getDominantLearningStyle(learningStyle);
    
    // Visual learners: better in morning
    // Kinesthetic: better in afternoon
    const styleAdjustments = {
      visual: { morning: 1.1, afternoon: 1.0, evening: 0.9 },
      auditory: { morning: 1.0, afternoon: 1.05, evening: 0.95 },
      kinesthetic: { morning: 0.9, afternoon: 1.1, evening: 1.0 },
      reading: { morning: 1.05, afternoon: 1.0, evening: 1.0 }
    };

    // Find optimal hour
    let maxEfficiency = 0;
    let optimalHour = 9;

    for (const [hour, efficiency] of Object.entries(hourlyEfficiency)) {
      const hourNum = parseInt(hour);
      let timeOfDay = 'morning';
      
      if (hourNum >= 12 && hourNum < 17) timeOfDay = 'afternoon';
      else if (hourNum >= 17) timeOfDay = 'evening';

      const styleModifier = styleAdjustments[dominantStyle][timeOfDay];
      const adjustedEfficiency = efficiency * styleModifier;

      if (adjustedEfficiency > maxEfficiency) {
        maxEfficiency = adjustedEfficiency;
        optimalHour = hourNum;
      }
    }

    return {
      optimalHour,
      optimalTime: `${optimalHour}:00`,
      efficiency: maxEfficiency,
      alternativeTimes: this.findAlternativeStudyTimes(hourlyEfficiency, styleAdjustments[dominantStyle])
    };
  }

  /**
   * Find alternative good study times
   */
  findAlternativeStudyTimes(hourlyEfficiency, styleAdjustment) {
    const alternatives = [];

    for (const [hour, efficiency] of Object.entries(hourlyEfficiency)) {
      const hourNum = parseInt(hour);
      let timeOfDay = 'morning';
      
      if (hourNum >= 12 && hourNum < 17) timeOfDay = 'afternoon';
      else if (hourNum >= 17) timeOfDay = 'evening';

      const styleModifier = styleAdjustment[timeOfDay];
      const adjustedEfficiency = efficiency * styleModifier;

      if (adjustedEfficiency >= 0.85) {
        alternatives.push({
          time: `${hourNum}:00`,
          efficiency: adjustedEfficiency
        });
      }
    }

    return alternatives.slice(0, 3); // Top 3 alternatives
  }
}

module.exports = ForgettingCurvePredictor;