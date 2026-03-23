import useModuleConfigActions from './useModuleConfigActions';
import useSaasPanelSectionChange from './panel/useSaasPanelSectionChange';
import useSaasWaModuleEditor from './useSaasWaModuleEditor';

export default function useSaasModuleSectionActions({
  waModuleEditor,
  moduleConfig,
  sectionChange
}) {
  const {
    resetWaModuleForm,
    openWaModuleEditor
  } = useSaasWaModuleEditor(waModuleEditor);

  const {
    clearConfigSelection,
    openConfigModuleCreate,
    openConfigModuleEdit,
    openConfigModuleView,
    openConfigSettingsEdit,
    openConfigSettingsView,
    syncQuickReplyLibrariesForModule,
    toggleAssignedUserForModule,
    toggleCatalogForModule,
    toggleQuickReplyLibraryForModuleDraft
  } = useModuleConfigActions({
    ...moduleConfig,
    openWaModuleEditor,
    resetWaModuleForm
  });

  const handleSectionChange = useSaasPanelSectionChange({
    ...sectionChange,
    clearConfigSelection
  });

  return {
    resetWaModuleForm,
    openWaModuleEditor,
    clearConfigSelection,
    openConfigModuleCreate,
    openConfigModuleEdit,
    openConfigModuleView,
    openConfigSettingsEdit,
    openConfigSettingsView,
    syncQuickReplyLibrariesForModule,
    toggleAssignedUserForModule,
    toggleCatalogForModule,
    toggleQuickReplyLibraryForModuleDraft,
    handleSectionChange
  };
}
