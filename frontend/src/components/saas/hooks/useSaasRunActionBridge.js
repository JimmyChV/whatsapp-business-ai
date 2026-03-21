import { useCallback, useRef } from 'react';

export default function useSaasRunActionBridge() {
    const runActionFallback = useCallback(async (_label, action) => {
        if (typeof action === 'function') {
            await action();
        }
    }, []);

    const runActionRef = useRef(runActionFallback);

    const setRunAction = useCallback((nextRunAction) => {
        runActionRef.current = typeof nextRunAction === 'function' ? nextRunAction : runActionFallback;
    }, [runActionFallback]);

    const runActionProxy = useCallback((label, action) => runActionRef.current(label, action), []);

    return {
        runActionProxy,
        setRunAction
    };
}
