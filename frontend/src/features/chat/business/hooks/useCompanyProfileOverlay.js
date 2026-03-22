import { useEffect } from 'react';

export const useCompanyProfileOverlay = ({
    openCompanyProfileToken = 0,
    showCompanyProfile = false,
    companyProfileRef,
    setShowCompanyProfile
} = {}) => {
    useEffect(() => {
        if (openCompanyProfileToken > 0) {
            setShowCompanyProfile(true);
        }
    }, [openCompanyProfileToken, setShowCompanyProfile]);

    useEffect(() => {
        if (!showCompanyProfile) return;
        const handleOutsideClick = (event) => {
            const target = event.target;
            if (companyProfileRef?.current?.contains(target)) return;
            setShowCompanyProfile(false);
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [showCompanyProfile, companyProfileRef, setShowCompanyProfile]);
};
