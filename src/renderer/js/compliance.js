/**
 * compliance.js — Módulo de Conformidade, Proteção de Dados e Auditoria (Sprint 6.1)
 */

import { State } from './state.js';

let auditLogs = [];
let compliancePolicies = {};
let dataRetentionRules = [];
let userActivityLogs = [];
let securityEvents = [];

export function initializeCompliance() {
  // Load audit logs
  const auditStored = localStorage.getItem('audit-logs');
  if (auditStored) {
    try {
      auditLogs = JSON.parse(auditStored).slice(-500); // Keep last 500 logs
    } catch (e) {
      console.error('Erro ao carregar logs de auditoria:', e);
    }
  }

  // Load compliance policies
  const policiesStored = localStorage.getItem('compliance-policies');
  if (policiesStored) {
    try {
      compliancePolicies = JSON.parse(policiesStored);
    } catch (e) {
      console.error('Erro ao carregar políticas de conformidade:', e);
    }
  }

  // Initialize default policies if none exist
  if (!compliancePolicies.gdpr) {
    compliancePolicies.gdpr = {
      enabled: true,
      dataMinimization: true,
      rightToBeForgotzten: true,
      consentRequired: true,
      dataPortability: true,
      privacyPolicyUrl: 'https://helpdesk.example.com/privacy'
    };
  }

  // Load data retention rules
  const retentionStored = localStorage.getItem('data-retention-rules');
  if (retentionStored) {
    try {
      dataRetentionRules = JSON.parse(retentionStored);
    } catch (e) {
      console.error('Erro ao carregar regras de retenção:', e);
    }
  }

  // Initialize default retention rules
  if (dataRetentionRules.length === 0) {
    dataRetentionRules = [
      {
        id: 'retention-1',
        dataType: 'closed_tickets',
        retentionDays: 365,
        action: 'archive',
        enabled: true
      },
      {
        id: 'retention-2',
        dataType: 'customer_data',
        retentionDays: 365,
        action: 'anonymize',
        enabled: true
      },
      {
        id: 'retention-3',
        dataType: 'logs',
        retentionDays: 90,
        action: 'delete',
        enabled: true
      }
    ];
  }

  // Load user activity logs
  const activityStored = localStorage.getItem('user-activity-logs');
  if (activityStored) {
    try {
      userActivityLogs = JSON.parse(activityStored).slice(-500);
    } catch (e) {
      console.error('Erro ao carregar logs de atividade:', e);
    }
  }

  // Load security events
  const securityStored = localStorage.getItem('security-events');
  if (securityStored) {
    try {
      securityEvents = JSON.parse(securityStored).slice(-200);
    } catch (e) {
      console.error('Erro ao carregar eventos de segurança:', e);
    }
  }

  saveComplianceData();
  return compliancePolicies;
}

export function logAuditEvent(action, resource, userId, details) {
  const event = {
    id: `audit-${Date.now()}`,
    action,
    resource,
    userId,
    details,
    timestamp: new Date().toISOString(),
    ipAddress: 'internal'
  };

  auditLogs.push(event);
  if (auditLogs.length > 500) {
    auditLogs = auditLogs.slice(-500);
  }

  saveComplianceData();
  return event;
}

export function logUserActivity(userId, action, description) {
  const activity = {
    id: `activity-${Date.now()}`,
    userId,
    action,
    description,
    timestamp: new Date().toISOString(),
    status: 'success'
  };

  userActivityLogs.push(activity);
  if (userActivityLogs.length > 500) {
    userActivityLogs = userActivityLogs.slice(-500);
  }

  saveComplianceData();
  return activity;
}

export function logSecurityEvent(eventType, severity, description, userId) {
  const event = {
    id: `security-${Date.now()}`,
    eventType,
    severity, // low, medium, high, critical
    description,
    userId,
    timestamp: new Date().toISOString(),
    resolved: false
  };

  securityEvents.push(event);
  if (securityEvents.length > 200) {
    securityEvents = securityEvents.slice(-200);
  }

  saveComplianceData();
  return event;
}

export function getAuditLogs() {
  return auditLogs;
}

export function getUserActivityLogs() {
  return userActivityLogs;
}

export function getSecurityEvents() {
  return securityEvents;
}

export function updateCompliancePolicy(policyName, settings) {
  compliancePolicies[policyName] = {
    ...compliancePolicies[policyName],
    ...settings
  };
  saveComplianceData();
  return compliancePolicies[policyName];
}

export function getCompliancePolicies() {
  return compliancePolicies;
}

export function addDataRetentionRule(dataType, retentionDays, action) {
  const rule = {
    id: `retention-${Date.now()}`,
    dataType,
    retentionDays,
    action, // delete, archive, anonymize
    enabled: true
  };

  dataRetentionRules.push(rule);
  saveComplianceData();
  return rule;
}

export function updateDataRetentionRule(ruleId, updates) {
  const rule = dataRetentionRules.find(r => r.id === ruleId);
  if (rule) {
    Object.assign(rule, updates);
    saveComplianceData();
    return rule;
  }
  return null;
}

export function deleteDataRetentionRule(ruleId) {
  const index = dataRetentionRules.findIndex(r => r.id === ruleId);
  if (index > -1) {
    dataRetentionRules.splice(index, 1);
    saveComplianceData();
    return true;
  }
  return false;
}

export function getDataRetentionRules() {
  return dataRetentionRules;
}

export function executeRetentionPolicy() {
  const results = [];

  dataRetentionRules.forEach(rule => {
    if (!rule.enabled) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - rule.retentionDays);

    let affectedCount = 0;

    if (rule.dataType === 'closed_tickets') {
      const oldTickets = State.ticketsList.filter(t =>
        t.status === 'closed' && new Date(t.closedate) < cutoffDate
      );
      affectedCount = oldTickets.length;
    } else if (rule.dataType === 'logs') {
      affectedCount = auditLogs.filter(l => new Date(l.timestamp) < cutoffDate).length;
    }

    results.push({
      ruleId: rule.id,
      dataType: rule.dataType,
      action: rule.action,
      affectedRecords: affectedCount,
      executedAt: new Date().toISOString()
    });
  });

  return results;
}

export function generateComplianceReport() {
  const report = {
    generatedAt: new Date().toISOString(),
    period: 'monthly',
    summary: {
      totalAuditEvents: auditLogs.length,
      totalSecurityEvents: securityEvents.length,
      unresolvedSecurityEvents: securityEvents.filter(e => !e.resolved).length,
      userActivityCount: userActivityLogs.length,
      policiesActive: Object.values(compliancePolicies).filter(p => p.enabled).length
    },
    securityMetrics: {
      criticalIssues: securityEvents.filter(e => e.severity === 'critical').length,
      highIssues: securityEvents.filter(e => e.severity === 'high').length,
      mediumIssues: securityEvents.filter(e => e.severity === 'medium').length,
      lowIssues: securityEvents.filter(e => e.severity === 'low').length
    },
    complianceStatus: {
      gdprCompliant: compliancePolicies.gdpr?.enabled || false,
      dataProtectionActive: true,
      auditingEnabled: true,
      retentionPoliciesActive: dataRetentionRules.filter(r => r.enabled).length
    }
  };

  return report;
}

function saveComplianceData() {
  localStorage.setItem('audit-logs', JSON.stringify(auditLogs));
  localStorage.setItem('compliance-policies', JSON.stringify(compliancePolicies));
  localStorage.setItem('data-retention-rules', JSON.stringify(dataRetentionRules));
  localStorage.setItem('user-activity-logs', JSON.stringify(userActivityLogs));
  localStorage.setItem('security-events', JSON.stringify(securityEvents));
}

export function renderAuditLogs() {
  const container = document.getElementById('audit-logs-container');
  if (!container) return;

  if (auditLogs.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhum log de auditoria.</p>';
    return;
  }

  const recentLogs = auditLogs.slice(-20).reverse();

  let html = `
    <table class="table-container" style="width: 100%; font-size: 12px;">
      <thead>
        <tr>
          <th style="width: 80px;">Ação</th>
          <th style="flex: 1;">Recurso</th>
          <th style="width: 80px;">Usuário</th>
          <th style="width: 120px;">Timestamp</th>
        </tr>
      </thead>
      <tbody>
  `;

  recentLogs.forEach(log => {
    html += `
      <tr>
        <td><strong>${escapeHtml(log.action)}</strong></td>
        <td style="font-size: 11px;">${escapeHtml(log.resource)}</td>
        <td>${escapeHtml(log.userId)}</td>
        <td>${new Date(log.timestamp).toLocaleString('pt-BR')}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

export function renderSecurityEvents() {
  const container = document.getElementById('security-events-container');
  if (!container) return;

  if (securityEvents.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px;">Nenhum evento de segurança.</p>';
    return;
  }

  let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';

  securityEvents.slice(-10).reverse().forEach(event => {
    const severityColor = {
      critical: 'var(--danger)',
      high: 'var(--warning)',
      medium: 'var(--accent-cyan)',
      low: 'var(--success)'
    }[event.severity] || 'var(--text-secondary)';

    html += `
      <div style="padding: 10px; background: rgba(255, 255, 255, 0.02); border-left: 3px solid ${severityColor}; border-radius: 4px; font-size: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <strong style="color: ${severityColor};">${event.eventType}</strong>
          <span style="font-size: 11px; color: var(--text-muted);">${event.resolved ? '✓ Resolvido' : '⚠️ Pendente'}</span>
        </div>
        <div style="color: var(--text-secondary); font-size: 11px;">${event.description}</div>
        <div style="color: var(--text-muted); font-size: 11px; margin-top: 4px;">${new Date(event.timestamp).toLocaleString('pt-BR')}</div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

export function renderDataRetention() {
  const container = document.getElementById('data-retention-container');
  if (!container) return;

  let html = `
    <table class="table-container" style="width: 100%; font-size: 13px;">
      <thead>
        <tr>
          <th>Tipo de Dado</th>
          <th style="width: 100px;">Retenção (dias)</th>
          <th style="width: 100px;">Ação</th>
          <th style="width: 80px;">Status</th>
        </tr>
      </thead>
      <tbody>
  `;

  dataRetentionRules.forEach(rule => {
    const statusBadge = rule.enabled
      ? '<span class="badge badge-high" style="background: rgba(0, 210, 147, 0.1); color: var(--success);">Ativa</span>'
      : '<span class="badge badge-critical">Inativa</span>';

    html += `
      <tr>
        <td>${escapeHtml(rule.dataType)}</td>
        <td>${rule.retentionDays}</td>
        <td>${rule.action}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

export function renderComplianceStatus() {
  const container = document.getElementById('compliance-status-container');
  if (!container) return;

  const report = generateComplianceReport();

  let html = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">GDPR Conformidade</div>
        <div style="font-size: 24px; font-weight: 700; color: ${report.complianceStatus.gdprCompliant ? 'var(--success)' : 'var(--danger)'};">
          ${report.complianceStatus.gdprCompliant ? '✓' : '✕'}
        </div>
      </div>

      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Eventos de Segurança</div>
        <div style="font-size: 24px; font-weight: 700; color: ${report.securityMetrics.criticalIssues > 0 ? 'var(--danger)' : 'var(--success)'};">
          ${report.securityMetrics.criticalIssues}
        </div>
        <div style="font-size: 11px; color: var(--text-secondary);">Críticos</div>
      </div>

      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Logs de Auditoria</div>
        <div style="font-size: 24px; font-weight: 700; color: var(--accent-neon);">${report.summary.totalAuditEvents}</div>
        <div style="font-size: 11px; color: var(--text-secondary);">Registros</div>
      </div>

      <div class="card" style="padding: 16px;">
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">Políticas Ativas</div>
        <div style="font-size: 24px; font-weight: 700; color: var(--accent-cyan);">${report.complianceStatus.retentionPoliciesActive}</div>
        <div style="font-size: 11px; color: var(--text-secondary);">Retenção</div>
      </div>
    </div>
  `;

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
