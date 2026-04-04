import { normalizeCustomerFormFromItem } from '../../../helpers';

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
        if (!cleanCustomerId) return;
        setSelectedCustomerId(cleanCustomerId);
        setCustomerPanelMode('view');
    };

    const openCustomerEdit = () => {
        if (selectedCustomer) {
            setCustomerForm(normalizeCustomerFormFromItem(selectedCustomer));
        }
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
