import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

function toActionKey(actionKey) {
    return String(actionKey || '').trim() || 'section_action';
}

const DEFAULT_ACTION_LABELS = {
    autoassign: 'asignacion',
    delete_auto: 'automatizacion',
    delete_catalog: 'catalogo',
    delete_customer: 'cliente',
    delete_label: 'etiqueta',
    delete_qr_item: 'respuesta rapida',
    delete_qr_library: 'biblioteca de respuestas',
    delete_schedule: 'horario',
    delete_template: 'plantilla Meta',
    delete_zone: 'zona de envio',
    create_ci: 'perfil comercial',
    delete_ci: 'perfil comercial',
    recalculate_zones: 'zonas de envio',
    reload_templates: 'plantillas Meta',
    refresh_ops_kpis: 'KPI operativos',
    save_ai: 'asistente IA',
    save_ai_default: 'asistente IA',
    save_ai_status: 'asistente IA',
    save_auto: 'automatizacion',
    save_catalog: 'catalogo',
    save_catalog_default: 'catalogo',
    save_catalog_product: 'producto del catalogo',
    save_company: 'empresa',
    save_company_status: 'empresa',
    save_customer: 'cliente',
    save_ci: 'perfil comercial',
    save_ci_rules: 'reglas comerciales',
    save_label: 'etiqueta',
    save_module: 'modulo',
    save_module_status: 'modulo',
    save_ops: 'reglas de operacion',
    save_plan: 'plan',
    save_qr: 'respuesta rapida',
    save_role: 'rol',
    save_schedule: 'horario',
    save_template: 'plantilla Meta',
    save_user: 'usuario',
    save_user_status: 'usuario',
    save_zone: 'zona de envio',
    sync_catalog: 'catalogo',
    sync_catalog_interval: 'catalogo',
    sync_template: 'plantillas Meta'
};

function toActionLabel(actionKey, options = {}) {
    const explicit = String(options?.label || '').trim();
    if (explicit) return explicit;
    const cleanKey = toActionKey(actionKey);
    return DEFAULT_ACTION_LABELS[cleanKey] || cleanKey.replace(/[_-]+/g, ' ');
}

function toErrorMessage(error, fallback = 'No se pudo completar la accion.') {
    return String(error?.message || error || fallback);
}

export default function useSaasSectionAction() {
    const { notify } = useUiFeedback();
    const savingRef = useRef(new Map());
    const retryRef = useRef(new Map());
    const clearTimersRef = useRef(new Map());
    const [savingActions, setSavingActions] = useState(() => new Map());

    const clearActionTimer = useCallback((actionKey) => {
        const cleanKey = toActionKey(actionKey);
        const timerId = clearTimersRef.current.get(cleanKey);
        if (timerId) {
            clearTimeout(timerId);
            clearTimersRef.current.delete(cleanKey);
        }
    }, []);

    const setSectionAction = useCallback((actionKey, value) => {
        const cleanKey = toActionKey(actionKey);
        clearActionTimer(cleanKey);
        const next = new Map(savingRef.current);
        if (value && typeof value === 'object') {
            next.set(cleanKey, {
                label: toActionLabel(cleanKey, value),
                status: value.status || 'saving',
                error: value.error || '',
                updatedAt: value.updatedAt || Date.now()
            });
        } else {
            next.delete(cleanKey);
        }
        savingRef.current = next;
        setSavingActions(next);
    }, [clearActionTimer]);

    const clearSectionAction = useCallback((actionKey) => {
        setSectionAction(actionKey, null);
    }, [setSectionAction]);

    const isSaving = useCallback((actionKey) => {
        const cleanKey = toActionKey(actionKey);
        return savingRef.current.get(cleanKey)?.status === 'saving';
    }, []);

    const isAnySaving = useCallback(() => {
        for (const entry of savingRef.current.values()) {
            if (entry?.status === 'saving') return true;
        }
        return false;
    }, []);

    const runSectionAction = useCallback(async (actionKey, asyncFn, options = {}) => {
        const cleanKey = toActionKey(actionKey);
        if (savingRef.current.get(cleanKey)?.status === 'saving') return undefined;
        if (typeof asyncFn !== 'function') return undefined;
        const label = toActionLabel(cleanKey, options);

        retryRef.current.set(cleanKey, { asyncFn, options });
        setSectionAction(cleanKey, { ...options, label, status: 'saving', updatedAt: Date.now() });
        try {
            const result = await asyncFn();
            if (typeof options.reloadSection === 'function') {
                await options.reloadSection(result);
            }
            if (typeof options.onSuccess === 'function') {
                await options.onSuccess(result);
            }
            if (options.successMessage) {
                notify({ type: 'info', message: String(options.successMessage) });
            }
            setSectionAction(cleanKey, { ...options, label, status: 'success', updatedAt: Date.now() });
            const timerId = setTimeout(() => {
                clearTimersRef.current.delete(cleanKey);
                const current = savingRef.current.get(cleanKey);
                if (current?.status === 'success') {
                    clearSectionAction(cleanKey);
                }
            }, 3000);
            clearTimersRef.current.set(cleanKey, timerId);
            return result;
        } catch (error) {
            if (typeof options.onError === 'function') {
                await options.onError(error);
            }
            const message = toErrorMessage(error, options.errorMessage);
            setSectionAction(cleanKey, {
                ...options,
                label,
                status: 'error',
                error: message,
                updatedAt: Date.now()
            });
            notify({
                type: 'error',
                message
            });
            if (options.throwOnError === true) throw error;
            return undefined;
        }
    }, [clearSectionAction, notify, setSectionAction]);

    const retryAction = useCallback((actionKey) => {
        const cleanKey = toActionKey(actionKey);
        const retry = retryRef.current.get(cleanKey);
        if (!retry || typeof retry.asyncFn !== 'function') return undefined;
        return runSectionAction(cleanKey, retry.asyncFn, retry.options || {});
    }, [runSectionAction]);

    useEffect(() => () => {
        clearTimersRef.current.forEach((timerId) => clearTimeout(timerId));
        clearTimersRef.current.clear();
        retryRef.current.clear();
    }, []);

    return useMemo(() => ({
        savingActions,
        runSectionAction,
        isSaving,
        isAnySaving,
        retryAction,
        clearSectionAction
    }), [clearSectionAction, isAnySaving, isSaving, retryAction, runSectionAction, savingActions]);
}
