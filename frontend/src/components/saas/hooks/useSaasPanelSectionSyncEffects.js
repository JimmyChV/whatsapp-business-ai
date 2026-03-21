import { useEffect } from 'react';

export default function useSaasPanelSectionSyncEffects({
    isOpen = false,
    canManageSaas = false,
    initialSection = '',
    activeSection = '',
    selectedPlanId = '',
    planMatrix = {},
    selectedConfigKey = '',
    selectedConfigModule = null,
    normalizePlanForm,
    setPlanForm,
    setCurrentSection,
    setSelectedConfigKey,
    setSelectedRoleKey,
    setSelectedWaModuleId,
    setWaModulePanelMode,
    resetWaModuleForm
} = {}) {
    useEffect(() => {
        const cleanPlanId = String(selectedPlanId || '').trim().toLowerCase();
        if (!cleanPlanId) return;
        const limits = planMatrix?.[cleanPlanId] && typeof planMatrix[cleanPlanId] === 'object' ? planMatrix[cleanPlanId] : {};
        setPlanForm(normalizePlanForm(cleanPlanId, limits));
    }, [normalizePlanForm, planMatrix, selectedPlanId, setPlanForm]);

    useEffect(() => {
        if (!String(selectedConfigKey || '').startsWith('wa_module:')) return;
        if (selectedConfigModule) return;
        setSelectedConfigKey('');
        setSelectedRoleKey('');
        setSelectedWaModuleId('');
        setWaModulePanelMode('view');
        resetWaModuleForm();
    }, [
        resetWaModuleForm,
        selectedConfigKey,
        selectedConfigModule,
        setSelectedConfigKey,
        setSelectedRoleKey,
        setSelectedWaModuleId,
        setWaModulePanelMode
    ]);

    useEffect(() => {
        if (!isOpen || !canManageSaas) return;
        const sectionId = String(initialSection || '').trim();
        if (!sectionId) return;
        setCurrentSection(sectionId);
    }, [canManageSaas, initialSection, isOpen, setCurrentSection]);

    useEffect(() => {
        const next = String(activeSection || '').trim();
        if (!next) return;
        setCurrentSection(next);
    }, [activeSection, setCurrentSection]);
}
