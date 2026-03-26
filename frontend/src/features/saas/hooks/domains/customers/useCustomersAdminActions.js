import { normalizeCustomerFormFromItem } from '../../../helpers';

const CUSTOMER_TRACE = Boolean(import.meta.env?.DEV);

function traceCustomer(...args) {
    if (!CUSTOMER_TRACE) return;
    // eslint-disable-next-line no-console
    console.log(...args);
}

function resolveCustomerId(value = '') {
    if (value && typeof value === 'object') {
        return String(value.customerId || value.customer_id || value.id || '').trim();
    }
    return String(value || '').trim();
}

export default function useCustomersAdminActions({
    selectedCustomer = null,
    customerImportModuleId = '',
    emptyCustomerForm = {},
    setSelectedCustomerId,
    setCustomerPanelMode,
    setCustomerForm
} = {}) {
    const openCustomerCreate = () => {
        setSelectedCustomerId('');
        setCustomerPanelMode('create');
        setCustomerForm({
            ...emptyCustomerForm,
            moduleId: String(customerImportModuleId || '').trim()
        });
    };

    const openCustomerView = (customerId) => {
        const cleanCustomerId = resolveCustomerId(customerId);
        traceCustomer('[Action][Customers][select]', {
            incomingCustomerId: customerId,
            resolvedCustomerId: cleanCustomerId,
            canSetSelectedCustomerId: typeof setSelectedCustomerId === 'function',
            canSetCustomerPanelMode: typeof setCustomerPanelMode === 'function'
        });
        if (!cleanCustomerId) {
            traceCustomer('[Action][Customers][select][error]', { reason: 'customerId-empty' });
            return;
        }
        setSelectedCustomerId(cleanCustomerId);
        setCustomerPanelMode('view');
    };

    const openCustomerEdit = () => {
        if (!selectedCustomer) return;
        setCustomerForm(normalizeCustomerFormFromItem(selectedCustomer));
        setCustomerPanelMode('edit');
    };

    const cancelCustomerEdit = () => {
        if (selectedCustomer) {
            setCustomerForm(normalizeCustomerFormFromItem(selectedCustomer));
            setCustomerPanelMode('view');
            return;
        }
        setCustomerForm(emptyCustomerForm);
        setCustomerPanelMode('view');
    };

    return {
        openCustomerCreate,
        openCustomerView,
        openCustomerEdit,
        cancelCustomerEdit
    };
}
