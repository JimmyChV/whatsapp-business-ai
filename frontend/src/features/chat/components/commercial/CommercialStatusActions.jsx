import React, { useMemo, useState } from 'react';
import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

const normalizeText = (value = '') => String(value || '').trim();
const normalizeRole = (value = '') => String(value || '').trim().toLowerCase();
const normalizeStatus = (value = '') => String(value || '').trim().toLowerCase();

const MANUAL_STATUS_ROLES = new Set(['seller', 'admin', 'owner', 'superadmin']);

export default function CommercialStatusActions({
  chatId = '',
  commercialStatus = null,
  chatCommercialStatusState = null,
  currentUserRole = ''
}) {
  const { confirm } = useUiFeedback();
  const [pendingStatus, setPendingStatus] = useState('');

  const safeChatId = normalizeText(chatId);
  const currentStatus = normalizeStatus(commercialStatus?.status || '');
  const canManage = useMemo(() => MANUAL_STATUS_ROLES.has(normalizeRole(currentUserRole)), [currentUserRole]);
  const setManualCommercialStatus = typeof chatCommercialStatusState?.setManualCommercialStatus === 'function'
    ? chatCommercialStatusState.setManualCommercialStatus
    : null;

  if (!safeChatId || !canManage || !setManualCommercialStatus) return null;

  const runStatusUpdate = async (targetStatus = '') => {
    const safeStatus = normalizeStatus(targetStatus);
    if (!safeStatus || pendingStatus) return;
    if (safeStatus === currentStatus) return;

    if (safeStatus === 'perdido') {
      const ok = await confirm({
        title: 'Marcar como perdido',
        message: 'Esta accion marcara el chat como perdido. Puedes cambiarlo despues si es necesario.',
        confirmText: 'Marcar perdido',
        cancelText: 'Cancelar',
        tone: 'danger'
      });
      if (!ok) return;
    }

    try {
      setPendingStatus(safeStatus);
      await setManualCommercialStatus(safeChatId, safeStatus);
    } finally {
      setPendingStatus('');
    }
  };

  return (
    <div
      className="commercial-status-actions"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={`commercial-status-action-btn commercial-status-action-btn--sold ${currentStatus === 'vendido' ? 'active' : ''}`}
        onClick={() => runStatusUpdate('vendido')}
        disabled={Boolean(pendingStatus)}
        title="Marcar chat como vendido"
      >
        Vender
      </button>
      <button
        type="button"
        className={`commercial-status-action-btn commercial-status-action-btn--lost ${currentStatus === 'perdido' ? 'active' : ''}`}
        onClick={() => runStatusUpdate('perdido')}
        disabled={Boolean(pendingStatus)}
        title="Marcar chat como perdido"
      >
        Perder
      </button>
    </div>
  );
}
