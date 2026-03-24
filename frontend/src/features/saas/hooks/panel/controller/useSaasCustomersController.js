export default function useSaasCustomersController(input = {}) {
    const {
        panelCoreState = {},
        panelDerivedData = {},
        customersAdminActions = null,
        loadCustomers = null,
        tenantScopeId = '',
        waModules = [],
        busy = false,
        runAction = null,
        requestJson = null,
        setError = null,
        formatDateTimeLabel = null
    } = input;

    const customersState = {
        customers: panelCoreState.customers,
        setCustomers: panelCoreState.setCustomers,
        selectedCustomerId: panelCoreState.selectedCustomerId,
        setSelectedCustomerId: panelCoreState.setSelectedCustomerId,
        customerForm: panelCoreState.customerForm,
        setCustomerForm: panelCoreState.setCustomerForm,
        customerPanelMode: panelCoreState.customerPanelMode,
        setCustomerPanelMode: panelCoreState.setCustomerPanelMode,
        customerSearch: panelCoreState.customerSearch,
        setCustomerSearch: panelCoreState.setCustomerSearch,
        customerCsvText: panelCoreState.customerCsvText,
        setCustomerCsvText: panelCoreState.setCustomerCsvText,
        customerImportModuleId: panelCoreState.customerImportModuleId,
        setCustomerImportModuleId: panelCoreState.setCustomerImportModuleId
    };

    const customersActions = {
        ...customersAdminActions,
        loadCustomers
    };

    const customersDerived = {
        filteredCustomers: panelDerivedData.filteredCustomers,
        selectedCustomer: panelDerivedData.selectedCustomer
    };

    // TODO(phase6): canManageCustomers existe en access-control pero CustomersSection aun no lo consume;
    // centralizar policy de customers en este subcontrolador en el siguiente corte.
    void tenantScopeId;
    void waModules;
    void busy;
    void runAction;
    void requestJson;
    void setError;
    void formatDateTimeLabel;

    return {
        customersState,
        customersActions,
        customersDerived
    };
}
