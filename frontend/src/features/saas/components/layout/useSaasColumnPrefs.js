import useSaasViewPreferences from './useSaasViewPreferences';

const useSaasColumnPrefs = (sectionKey, defaultColumns = [], options = {}) => {
    const prefs = useSaasViewPreferences(sectionKey, defaultColumns, options);
    return {
        visibleKeys: prefs.visibleColumnKeys,
        visibleColumnKeys: prefs.visibleColumnKeys,
        setVisibleKeys: prefs.setVisibleColumnKeys,
        setVisibleColumnKeys: prefs.setVisibleColumnKeys,
        sort: prefs.sort,
        setSort: prefs.setSort,
        isColumnVisible: prefs.isColumnVisible,
        toggleColumn: prefs.toggleColumn,
        resetVisibleKeys: prefs.resetColumns,
        resetColumns: prefs.resetColumns,
        storageKey: prefs.storageKey
    };
};

export default useSaasColumnPrefs;
