import React from 'react';

function resolveCompactAssigneeLabel(assigneeName = '') {
  const raw = String(assigneeName || '').trim();
  if (!raw) return 'Asignado';

  const words = raw
    .split(/\s+/)
    .map((token) => String(token || '').trim())
    .filter(Boolean);

  if (words.length >= 2 && words[0].length > 1) {
    return words[0];
  }

  if (words.length === 1 && words[0].length > 1 && !words[0].includes('@')) {
    return words[0];
  }

  const initials = words
    .slice(0, 2)
    .map((token) => String(token || '').charAt(0).toUpperCase())
    .join('')
    .trim();

  if (initials) return initials;

  return String(raw.charAt(0) || 'A').toUpperCase();
}

function resolveAssignmentVisual(assignment = null, isAssignedToMe = false, compact = false) {
  const hasAssignee = Boolean(String(assignment?.assigneeUserId || '').trim());
  const assigneeName = String(
    assignment?.assigneeName
    || assignment?.assigneeDisplayName
    || assignment?.metadata?.assigneeName
    || assignment?.assigneeUserId
    || ''
  ).trim();
  const status = String(assignment?.status || '').trim().toLowerCase();

  if (!hasAssignee || status === 'released') {
    return {
      tone: 'unassigned',
      label: compact ? 'Libre' : 'Sin asignar'
    };
  }

  if (status === 'en_espera') {
    return {
      tone: 'waiting',
      label: compact ? 'Espera' : 'En espera'
    };
  }

  if (isAssignedToMe) {
    return {
      tone: 'mine',
      label: compact ? 'Mio' : 'Asignado a ti'
    };
  }

  return {
    tone: 'assigned',
    label: compact
      ? resolveCompactAssigneeLabel(assigneeName)
      : (assigneeName ? `Asignado: ${assigneeName}` : 'Asignado')
  };
}

export default function AssignmentBadge({
  assignment = null,
  isAssignedToMe = false,
  compact = false,
  className = ''
}) {
  const { tone, label } = resolveAssignmentVisual(assignment, isAssignedToMe, compact);
  return (
    <span
      className={`assignment-badge assignment-badge--${tone}${compact ? ' assignment-badge--compact' : ''}${className ? ` ${className}` : ''}`}
      title={label}
    >
      {label}
    </span>
  );
}
