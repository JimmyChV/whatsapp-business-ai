import useSaasViewPreferences from './useSaasViewPreferences';

const useSaasColumnPrefs = (sectionKey, defaultColumns = [], options = {}) => {
    const prefs = useSaasViewPreferences(sectionKey, defaultColumns, options);
    return {
        visibleColumnKeys: prefs.visibleColumnKeys,
        setVisibleColumnKeys: prefs.setVisibleColumnKeys,
        isColumnVisible: prefs.isColumnVisible,
        toggleColumn: prefs.toggleColumn,
        resetColumns: prefs.resetColumns,
        storageKey: prefs.storageKey
    };
};

export default useSaasColumnPrefs;
