/**
 * intelligence.js — Módulo de IA Inteligente e ML (Sprint 5.1)
 */

import { State } from './state.js';

let aiModels = {};
let suggestedResponses = [];
let sentimentAnalysisCache = {};
let routingHistory = [];

export function initializeIntelligence() {
  const stored = localStorage.getItem('ai-models');
  if (stored) {
    try {
      aiModels = JSON.parse(stored);
    } catch (e) {
      console.error('Erro ao carregar modelos de IA:', e);
    }
  }

  // Initialize default models
  if (!aiModels.categorization) {
    aiModels.categorization = {
      enabled: true,
      confidence: 0.85,
      trainingData: []
    };
  }

  if (!aiModels.sentiment) {
    aiModels.sentiment = {
      enabled: true,
      confidence: 0.8,
      trainingData: []
    };
  }

  if (!aiModels.routing) {
    aiModels.routing = {
      enabled: true,
      confidence: 0.75,
      trainingData: []
    };
  }

  saveIntelligenceData();
  return aiModels;
}

export function intelligentCategorize(ticketTitle, ticketDescription) {
  const allText = `${ticketTitle} ${ticketDescription}`.toLowerCase();

  // Keyword-based categorization (simulated ML)
  const categories = State.categoriesList || [];
  let suggestedCategory = null;
  let highestScore = 0;

  categories.forEach(cat => {
    const keywords = [
      'network', 'internet', 'wifi', 'lan', 'vpn', 'connectivity',
      'printer', 'hardware', 'device', 'computer', 'mouse', 'keyboard',
      'software', 'install', 'update', 'application', 'license',
      'password', 'login', 'account', 'user', 'authentication',
      'email', 'outlook', 'exchange', 'calendar'
    ];

    let score = 0;
    keywords.forEach(keyword => {
      if (allText.includes(keyword)) score += 1;
    });

    if (score > highestScore) {
      highestScore = score;
      suggestedCategory = cat;
    }
  });

  return {
    categoryId: suggestedCategory?.id || null,
    categoryName: suggestedCategory?.name || 'General',
    confidence: Math.min(0.95, 0.6 + (highestScore * 0.1))
  };
}

export function analyzeSentiment(text) {
  // Simulated sentiment analysis
  const positive = ['good', 'great', 'excellent', 'awesome', 'happy', 'thanks', 'thank you'];
  const negative = ['bad', 'terrible', 'awful', 'hate', 'angry', 'frustrated', 'urgent', 'asap'];

  const lowerText = text.toLowerCase();
  let posScore = 0, negScore = 0;

  positive.forEach(word => {
    if (lowerText.includes(word)) posScore += 1;
  });

  negative.forEach(word => {
    if (lowerText.includes(word)) negScore += 1;
  });

  let sentiment = 'neutral';
  let score = 0;

  if (posScore > negScore) {
    sentiment = 'positive';
    score = Math.min(1, 0.5 + (posScore * 0.1));
  } else if (negScore > posScore) {
    sentiment = 'negative';
    score = -Math.min(1, 0.5 + (negScore * 0.1));
  }

  const analysis = {
    sentiment,
    score,
    confidence: 0.75,
    positiveWords: posScore,
    negativeWords: negScore
  };

  sentimentAnalysisCache[text] = analysis;
  return analysis;
}

export function suggestResponses(ticketId) {
  const ticket = State.ticketsList.find(t => t.id === ticketId);
  if (!ticket) return [];

  const sentiment = analyzeSentiment(ticket.description);
  const responses = [];

  if (sentiment.sentiment === 'positive') {
    responses.push({
      id: 'resp-1',
      type: 'acknowledgment',
      text: 'Obrigado por sua mensagem positiva! Continuaremos dedicados a fornecer o melhor suporte.'
    });
  } else if (sentiment.sentiment === 'negative') {
    responses.push({
      id: 'resp-2',
      type: 'apology',
      text: 'Lamentamos qualquer inconveniente causado. Vamos resolver seu problema o mais rápido possível.'
    });
  }

  // Category-based suggestions
  const categoryId = ticket.category;
  if (categoryId === 'network') {
    responses.push({
      id: 'resp-3',
      type: 'network-suggestion',
      text: 'Você testou a conectividade com "ping 8.8.8.8"? Pode ajudar a diagnosticar o problema.'
    });
  } else if (categoryId === 'password') {
    responses.push({
      id: 'resp-4',
      type: 'password-suggestion',
      text: 'Certifique-se de usar maiúsculas, números e caracteres especiais em sua senha.'
    });
  }

  // Priority-based suggestions
  if (ticket.priority === 'high' || ticket.priority === 'critical') {
    responses.push({
      id: 'resp-5',
      type: 'priority-escalation',
      text: 'Sua solicitação foi marcada como prioritária e será tratada em breve.'
    });
  }

  suggestedResponses = responses;
  return responses;
}

export function predictBestTechnician(ticketId) {
  const ticket = State.ticketsList.find(t => t.id === ticketId);
  if (!ticket) return null;

  // Simulated routing based on technician skills and workload
  const technicians = State.usersList || [];
  let bestTechnician = null;
  let bestScore = -1;

  technicians.forEach(tech => {
    let score = 0;

    // Calculate based on current ticket count (lower is better)
    const techTickets = State.ticketsList.filter(t => t.assigned_to === tech.id).length;
    score += (10 - Math.min(techTickets, 10)) * 2;

    // Calculate based on expertise (simulated)
    if (tech.expertise && ticket.category) {
      if (tech.expertise.includes(ticket.category)) score += 5;
    }

    // Priority match
    if (ticket.priority === 'high' && tech.tier === 'senior') score += 3;

    if (score > bestScore) {
      bestScore = score;
      bestTechnician = tech;
    }
  });

  if (bestTechnician) {
    routingHistory.push({
      ticketId,
      suggestedTechId: bestTechnician.id,
      score: bestScore,
      timestamp: new Date().toISOString()
    });
  }

  return bestTechnician ? {
    technicianId: bestTechnician.id,
    technicianName: bestTechnician.name,
    score: Math.round((bestScore / 20) * 100),
    reason: 'Based on workload, expertise, and priority match'
  } : null;
}

export function detectAnomalies() {
  const anomalies = [];
  const avgResolutionTime = calculateAverageResolutionTime();
  const avgTicketsPerDay = calculateAverageTicketsPerDay();

  // Anomaly: Very high resolution time
  const slowTickets = State.ticketsList.filter(ticket => {
    if (!ticket.closedate) return false;
    const created = new Date(ticket.date).getTime();
    const closed = new Date(ticket.closedate).getTime();
    const hours = (closed - created) / (1000 * 60 * 60);
    return hours > avgResolutionTime * 2;
  });

  if (slowTickets.length > 0) {
    anomalies.push({
      type: 'slow-resolution',
      severity: 'warning',
      count: slowTickets.length,
      message: `${slowTickets.length} tickets com tempo de resolução 2x acima da média`
    });
  }

  // Anomaly: Unusual volume spike
  const todayTickets = State.ticketsList.filter(t => {
    const ticketDate = new Date(t.date).toDateString();
    const today = new Date().toDateString();
    return ticketDate === today;
  }).length;

  if (todayTickets > avgTicketsPerDay * 1.5) {
    anomalies.push({
      type: 'volume-spike',
      severity: 'info',
      count: todayTickets,
      message: `Aumento de ${Math.round((todayTickets / avgTicketsPerDay - 1) * 100)}% no volume de tickets hoje`
    });
  }

  // Anomaly: High abandon rate
  const assignedButNotResponded = State.ticketsList.filter(t => {
    return t.status !== 'closed' && t.assigned_to && (!t.followups || t.followups.length === 0);
  }).length;

  if (assignedButNotResponded > State.ticketsList.length * 0.2) {
    anomalies.push({
      type: 'high-abandon',
      severity: 'critical',
      count: assignedButNotResponded,
      message: `${assignedButNotResponded} tickets atribuídos sem resposta`
    });
  }

  return anomalies;
}

function calculateAverageResolutionTime() {
  const closedTickets = State.ticketsList.filter(t => t.status === 'closed' && t.closedate);
  if (closedTickets.length === 0) return 24;

  const totalHours = closedTickets.reduce((sum, t) => {
    const created = new Date(t.date).getTime();
    const closed = new Date(t.closedate).getTime();
    return sum + (closed - created) / (1000 * 60 * 60);
  }, 0);

  return totalHours / closedTickets.length;
}

function calculateAverageTicketsPerDay() {
  if (State.ticketsList.length === 0) return 10;

  const oldestTicket = State.ticketsList.reduce((min, t) => {
    const date = new Date(t.date).getTime();
    const minDate = new Date(min.date).getTime();
    return date < minDate ? t : min;
  });

  const days = (Date.now() - new Date(oldestTicket.date).getTime()) / (1000 * 60 * 60 * 24);
  return Math.round(State.ticketsList.length / Math.max(days, 1));
}

function saveIntelligenceData() {
  localStorage.setItem('ai-models', JSON.stringify(aiModels));
  localStorage.setItem('routing-history', JSON.stringify(routingHistory));
}

export function renderIntelligenceDashboard() {
  const container = document.getElementById('intelligence-dashboard-container');
  if (!container) return;

  const anomalies = detectAnomalies();

  let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">';

  // AI Features Status
  html += `
    <div class="card">
      <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">🤖 Recursos de IA</h3>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255, 255, 255, 0.02); border-radius: 4px;">
          <span style="font-size: 12px;">Categorização Inteligente</span>
          <span style="font-size: 12px; color: var(--success);">✓ Ativa</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255, 255, 255, 0.02); border-radius: 4px;">
          <span style="font-size: 12px;">Análise de Sentimento</span>
          <span style="font-size: 12px; color: var(--success);">✓ Ativa</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255, 255, 255, 0.02); border-radius: 4px;">
          <span style="font-size: 12px;">Roteamento Inteligente</span>
          <span style="font-size: 12px; color: var(--success);">✓ Ativa</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255, 255, 255, 0.02); border-radius: 4px;">
          <span style="font-size: 12px;">Detecção de Anomalias</span>
          <span style="font-size: 12px; color: var(--success);">✓ Ativa</span>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">⚠️ Anomalias Detectadas</h3>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${anomalies.length > 0 ? anomalies.map(anom => `
          <div style="padding: 10px; background: ${anom.severity === 'critical' ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255, 193, 7, 0.05)'}; border-left: 3px solid ${anom.severity === 'critical' ? 'var(--danger)' : 'var(--warning)'}; border-radius: 4px; font-size: 11px;">
            <div style="font-weight: 600; margin-bottom: 2px;">${anom.message}</div>
          </div>
        `).join('') : '<p style="color: var(--text-muted); font-size: 12px;">Sem anomalias detectadas.</p>'}
      </div>
    </div>
  `;

  html += '</div>';
  container.innerHTML = html;
}

export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
