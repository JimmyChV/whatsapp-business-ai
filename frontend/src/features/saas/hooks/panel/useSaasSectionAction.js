import { useCallback, useMemo, useRef, useState } from 'react';

import useUiFeedback from '../../../../app/ui-feedback/useUiFeedback';

function toActionKey(actionKey) {
    return String(actionKey || '').trim() || 'section_action';
}

function toErrorMessage(error, fallback = 'No se pudo completar la accion.') {
    return String(error?.message || error || fallback);
}

export default function useSaasSectionAction() {
    const { notify } = useUiFeedback();
    const savingRef = useRef(new Map());
    const [savingActions, setSavingActions] = useState(() => new Map());

    const setSectionSaving = useCallback((actionKey, value) => {
        const cleanKey = toActionKey(actionKey);
        const next = new Map(savingRef.current);
        if (value) {
            next.set(cleanKey, true);
        } else {
            next.delete(cleanKey);
        }
        savingRef.current = next;
        setSavingActions(next);
    }, []);

    const isSaving = useCallback((actionKey) => {
        const cleanKey = toActionKey(actionKey);
        return savingRef.current.get(cleanKey) === true;
    }, []);

    const isAnySaving = useCallback(() => savingRef.current.size > 0, []);

    const runSectionAction = useCallback(async (actionKey, asyncFn, options = {}) => {
        const cleanKey = toActionKey(actionKey);
        if (savingRef.current.get(cleanKey) === true) return undefined;
        if (typeof asyncFn !== 'function') return undefined;

        setSectionSaving(cleanKey, true);
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
            return result;
        } catch (error) {
            if (typeof options.onError === 'function') {
                await options.onError(error);
            }
            notify({
                type: 'error',
                message: toErrorMessage(error, options.errorMessage)
            });
            if (options.throwOnError === true) throw error;
            return undefined;
        } finally {
            setSectionSaving(cleanKey, false);
        }
    }, [notify, setSectionSaving]);

    return useMemo(() => ({
        savingActions,
        runSectionAction,
        isSaving,
        isAnySaving
    }), [isAnySaving, isSaving, runSectionAction, savingActions]);
}
