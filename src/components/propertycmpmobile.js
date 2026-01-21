import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate, useLocation } from 'react-router-dom';
import './PropertyComparison.css'; // Ensure you have your styles

// ===================== CONSTANTS =====================
const INITIAL_PROPERTY_DATA = {
    purchasePrice: '',
    otherCharges: '',
    stampDuty: '',
    gstPercentage: '',
    exitPrices: [],
    properties: [
        {
            id: 1,
            size: '',
            name: '',
            location: '',
            rating: 0,
            isHighlighted: true,
            possessionMonths: ''
        }
    ],
    paymentPlan: 'clp',
    assumptions: {
        homeLoanRate: '', homeLoanTerm: '', homeLoanShare: 80, homeLoanStartMonth: 0,
        homeLoanStartMode: 'default',
        personalLoan1Rate: '', personalLoan1Term: 7, personalLoan1StartMonth: 0, personalLoan1Share: 10,
        personalLoan2Rate: '', personalLoan2Term: 7, personalLoan2StartMonth: '', personalLoan2Share: 10,
        downPaymentShare: 0,
        investmentPeriod: '', clpDurationYears: '', bankDisbursementStartMonth: '', bankDisbursementInterval: '', lastBankDisbursementMonth: '',
        holdingPeriodUnit: 'years'
    }
};

const INITIAL_USER_SELECTIONS = {
    selectedPropertyId: 1,
    selectedExitPrice: '',
    selectedYears: '',
    selectedPropertySize: '',
    scenarioSize: '',
    scenarioExitPrice: '',
    scenarioExitPrices: []
};

// ===================== UTILITIES =====================
const formatLakhs = (value) => (!value && value !== 0) ? '₹0L' : `₹${(value / 100000).toFixed(2)}L`;
const formatCurrency = (value) => (!value && value !== 0) ? '₹0' : `₹${Math.round(value).toLocaleString()}`;
const formatPercent = (value) => (!value && value !== 0) ? '0%' : `${value.toFixed(1)}%`;
const getSafeValue = (value) => (value === '' || value === null || isNaN(value)) ? 0 : parseFloat(value);

const calculateEMI = (principal, annualRate, years) => {
    if (!principal || principal === 0) return 0;
    if (!years || years <= 0) return 0;
    if (!annualRate || annualRate === 0) return principal / (years * 12);
    const monthlyRate = annualRate / (12 * 100);
    const months = years * 12;
    return principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
};

const calculateOutstandingAfterPayments = (principal, annualRate, years, paymentsMade) => {
    if (!principal || principal === 0) return 0;
    if (paymentsMade <= 0) return principal;
    const monthlyRate = annualRate / (12 * 100);
    const totalMonths = years * 12;
    if (paymentsMade >= totalMonths) return 0;
    return Math.max(0, principal * (Math.pow(1 + monthlyRate, totalMonths) - Math.pow(1 + monthlyRate, paymentsMade)) / (Math.pow(1 + monthlyRate, totalMonths) - 1));
};

const calculateTotalInterestPaid = (principal, annualRate, years, paymentsMade) => {
    if (!principal || principal === 0 || paymentsMade <= 0) return 0;
    const monthlyRate = annualRate / (12 * 100);
    const emi = calculateEMI(principal, annualRate, years);
    let interestPaid = 0;
    let remainingPrincipal = principal;
    for (let i = 0; i < paymentsMade; i++) {
        const interestForMonth = remainingPrincipal * monthlyRate;
        const principalForMonth = emi - interestForMonth;
        interestPaid += interestForMonth;
        remainingPrincipal -= principalForMonth;
    }
    return interestPaid;
};

// ===================== UI RENDERERS =====================
const renderMetricCard = (label, value, icon, color) => (
    <div className="col-6 mb-3">
        <div className="metric-card glass-card text-center h-100 p-3 shadow-sm border-0">
            <div className={`rounded-circle bg-${color} text-white d-flex align-items-center justify-content-center mx-auto mb-2 shadow-sm`} style={{ width: '50px', height: '50px' }}>
                <i className={`bi ${icon} fs-4`}></i>
            </div>
            <h5 className="fw-bold mb-0">{value}</h5>
            <small className="text-muted">{label}</small>
        </div>
    </div>
);

const renderStatCard = (label, value, subtext, color, colSize = 6) => (
    <div className={`col-${colSize} mb-2`}>
        <div className={`p-2 bg-${color} text-white rounded text-center h-100 shadow-sm`}>
            <small className="text-white opacity-75 d-block" style={{ fontSize: '0.7rem' }}>{label}</small>
            <div className="fw-bold my-1">{value}</div>
            <small className="text-white opacity-75 d-block" style={{ fontSize: '0.65rem' }}>{subtext}</small>
        </div>
    </div>
);
const renderTimelineCard = (title, icon, color, mainEMI, period, duration, componentsJSX, totalAmount, calcText, footerSubtitle, extraHeader = null, extraFooter = null) => (
    <div className="col-md-6">
        <div className={`card h-100 border-${color}`}>
            <div className={`card-header bg-${color} text-white`}>
                <h6 className="mb-0"><i className={`bi ${icon} me-2`}></i>{title}</h6>
                {extraHeader}
            </div>
            <div className="card-body">
                <div className="text-center mb-3 ps-2 pe-2">
                    {/* 1. We removed "/month" - now it just prints what you pass */}
                    <h3 className={`text-${color} fw-bold`}>{mainEMI}</h3>

                    {/* 2. We removed the hardcoded logic - now it prints the subtitle argument */}
                    <small className="text-muted">{footerSubtitle}</small>
                </div>
                <div className="row g-2">
                    <div className="col-6">
                        <div className="p-2 bg-light rounded"><small className="text-muted">Period</small><div className="fw-bold">{period}</div></div>
                    </div>
                    <div className="col-6">
                        <div className="p-2 bg-light rounded"><small className="text-muted">Duration</small><div className="fw-bold">{duration}</div></div>
                    </div>
                    <div className="col-12">
                        <div className="p-2 bg-light rounded"><small className="text-muted">EMI Components</small><div className="row g-1">{componentsJSX}</div></div>
                    </div>
                    <div className="col-12">
                        <div className={`p-3 bg-${color} text-white rounded text-center mt-2`}>
                            <small className="text-white">Total {title.split(':')[0]} EMI</small>
                            <div className="fw-bold fs-4">{totalAmount}</div>
                            <small className="text-white">{calcText}</small>
                            {extraFooter}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
);
// Add this with your other render functions at the top
const renderProfitChart = (profits) => {
    if (!profits || profits.length === 0) return null;

    // Find max profit to scale the bars
    const maxProfit = Math.max(...profits.map(p => p.netProfit));

    return (
        <div className="glass-card mb-4 p-4">
            <h5 className="mb-4 fw-bold " style={{ fontSize: '1.1rem' }}><i className="bi bi-bar-chart-fill me-2 text-primary" ></i>Profit Potential</h5>

            <div className="d-flex justify-content-around align-items-end" style={{ height: '200px' }}>
                {profits.map((item, index) => (
                    <div key={index} className="text-center w-100 px-2">

                        {/* The Bar */}
                        <div
                            className={`rounded-top w-100 ${item.netProfit >= 0 ? 'bg-success' : 'bg-danger'}`}
                            style={{
                                height: `${Math.max(10, (Math.abs(item.netProfit) / maxProfit) * 150)}px`, // Scale height
                                opacity: 0.8,
                                transition: 'height 0.5s ease'
                            }}
                        >
                            {/* Tooltip value on hover (or simple text inside) */}
                            <div className="text-white small py-1 d-none d-md-block" style={{ fontSize: '0.7rem' }}>
                                {((Math.abs(item.netProfit) / maxProfit) * 100).toFixed(0)}%
                            </div>
                        </div>

                        {/* The Label (Price) */}
                        <div className="mt-2 small fw-bold">@{item.exitPrice}</div>

                        {/* The Profit Value */}
                        <div className={`small ${item.netProfit >= 0 ? 'text-success' : 'text-danger'}`} style={{ fontSize: '0.75rem' }}>
                            {item.netProfit >= 0 ? '+' : ''}{(item.netProfit / 100000).toFixed(1)}L
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// Add this helper function at the top with other render functions
const renderKeyInsights = (breakdown) => {
    if (!breakdown) return null;

    return (
        <div className="glass-card mb-5 p-3">
            <div className="card-header">
                <h5 className="mb-2">
                    <i className="bi bi-lightbulb-fill me-2"></i>
                    Key Financial Insights
                </h5>
            </div>
            <div className="card-body">
                <div className="row g-4">
                    {/* Quick Summary Column */}
                    <div className="col-md-6">
                        <div className="p-3 bg-light rounded h-100">
                            <h6 className="text-muted mb-3 fw-bold">Quick Summary</h6>
                            <ul className="list-unstyled">
                                <li className="mb-2 border-bottom pb-2">
                                    <i className="bi bi-check-circle-fill text-success me-2"></i>
                                    <strong>Home Loan EMI:</strong> {formatCurrency(breakdown.homeLoanEMI)}/month
                                </li>
                                <li className="mb-2 border-bottom pb-2">
                                    <i className="bi bi-check-circle-fill text-success me-2"></i>
                                    <strong>Personal Loan EMI:</strong> {formatCurrency(breakdown.personalLoan1EMI)}/month
                                </li>
                                <li className="mb-2 border-bottom pb-2">
                                    <i className="bi bi-check-circle-fill text-success me-2"></i>
                                    <strong>Total Outstanding:</strong> {formatLakhs(breakdown.totalLoanOutstanding)}
                                </li>
                                <li className="mb-2">
                                    <i className="bi bi-check-circle-fill text-success me-2"></i>
                                    <strong>Total Interest Paid:</strong> {formatLakhs(breakdown.totalInterestPaid)}
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Recommendations Column */}
                    <div className="col-md-6">
                        <div className="p-3 bg-light rounded h-100">
                            <h6 className="text-muted mb-3 fw-bold">Recommendations</h6>
                            <div className="alert alert-success mb-2 py-2">
                                <i className="bi bi-trophy-fill me-2"></i>
                                <strong>Sell after {breakdown.years} years</strong> for optimal returns
                            </div>
                            <div className="alert alert-info mb-2 py-2">
                                <i className="bi bi-info-circle-fill me-2"></i>
                                Consider refinancing if interest rates drop by 1%
                            </div>
                            <div className="alert alert-warning mb-0 py-2">
                                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                Ensure you can handle monthly EMI of <strong>{formatCurrency(breakdown.totalEMIPaid / breakdown.years / 12)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ===================== MAIN COMPONENT =====================
const PropertyComparisonMobile = () => {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(() => {
        // Check if we have saved data in LocalStorage
        const savedData = localStorage.getItem('propertyCalc_data');
        if (savedData) {
            const parsed = JSON.parse(savedData);
            // Logic: If "Purchase Price" exists, assume user has entered data -> Start at Step 4
            if (parsed.purchasePrice && parsed.purchasePrice > 0) {
                return 4;
            }
        }
        // Else start at Step 1
        return 1;
    });
    // Tracks which accordion section is currently expanded
    const [activeAccordion, setActiveAccordion] = useState('prop_mgmt');

    // Reset the accordion to the first section whenever the Step changes
    useEffect(() => {
        if (currentStep === 1) setActiveAccordion('prop_mgmt');
        if (currentStep === 2) setActiveAccordion('pay_plan');
        if (currentStep === 3) setActiveAccordion('home_loan');
        if (currentStep === 4) setActiveAccordion('exit_scenarios');
    }, [currentStep]);
    const [activeTab, setActiveTab] = useState('inputs'); // inputs, overview, breakdown

    const [maxStepReached, setMaxStepReached] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [validationError, setValidationError] = useState('');
    const [showDataEnteredAlert, setShowDataEnteredAlert] = useState(false);

    // --- STATE INITIALIZATION ---
    const [propertyData, setPropertyData] = useState(() => {
        try {
            const saved = localStorage.getItem('propertyCalc_data');
            return saved ? JSON.parse(saved) : INITIAL_PROPERTY_DATA;
        } catch { return INITIAL_PROPERTY_DATA; }
    });

    const [userSelections, setUserSelections] = useState(() => {
        try {
            const saved = localStorage.getItem('propertyCalc_selections');
            return saved ? JSON.parse(saved) : INITIAL_USER_SELECTIONS;
        } catch { return INITIAL_USER_SELECTIONS; }
    });

    // --- PERSISTENCE ---
    useEffect(() => localStorage.setItem('propertyCalc_data', JSON.stringify(propertyData)), [propertyData]);
    useEffect(() => localStorage.setItem('propertyCalc_selections', JSON.stringify(userSelections)), [userSelections]);

    const handleDelayedNavigation = (path, stateData, message = "Processing Data...") => {
        setIsProcessing(true);
        setLoadingMessage(message);

        // 1.5 Second Artificial Delay
        setTimeout(() => {
            navigate(path, { state: stateData });
            // We don't strictly need to set processing false here because 
            // the component will unmount/navigate away, but it's good practice.
            setIsProcessing(false);
        }, 1500);
    };
    // --- AUTO CALCULATE EXIT PRICE ---
    useEffect(() => {
        if (currentStep === 4) {
            const purchasePrice = parseFloat(propertyData.purchasePrice) || 0;
            if (purchasePrice > 0 && (!userSelections.selectedExitPrice || userSelections.selectedExitPrice === 0)) {
                let years = parseFloat(propertyData.assumptions.investmentPeriod) || 0;
                if (propertyData.assumptions.holdingPeriodUnit === 'months') years = years / 12;
                let increment = years < 1 ? 500 : years < 2 ? 1000 : years < 3 ? 2000 : years < 4 ? 2500 : years < 5 ? 3000 : 3500;
                setUserSelections(prev => ({ ...prev, selectedExitPrice: purchasePrice + increment }));
            }
        }
    }, [currentStep, propertyData.purchasePrice, propertyData.assumptions.investmentPeriod]);

    // --- HANDLERS ---
    const handleInputChange = (field, value) => setPropertyData(prev => ({ ...prev, [field]: value }));

    const updatePropertyField = (index, field, value) => {
        const newProperties = [...propertyData.properties];
        const newValue = (field === 'name' || field === 'location') ? value : parseFloat(value) || '';
        newProperties[index][field] = newValue;
        setPropertyData(prev => ({ ...prev, properties: newProperties }));

        if (newProperties[index].id === userSelections.selectedPropertyId && field === 'size') {
            setUserSelections(prev => ({ ...prev, selectedPropertySize: newValue }));
        }
    };

    const handleAssumptionChange = (field, value) => {
        setPropertyData(prev => ({
            ...prev,
            assumptions: { ...prev.assumptions, [field]: (field === 'holdingPeriodUnit' || field === 'homeLoanStartMode') ? value : (value === '' ? '' : parseFloat(value)) }
        }));
    };

    const handlePaymentPlanChange = (plan) => {
        setPropertyData(prev => {
            let newAssumptions = { ...prev.assumptions };
            let newProperties = [...prev.properties];
            const idx = newProperties.findIndex(p => p.id === userSelections.selectedPropertyId);

            if (plan === 'clp') {
                newAssumptions = { ...newAssumptions, personalLoan1Share: 10, personalLoan2Share: 10, downPaymentShare: 0, homeLoanShare: 80, personalLoan1Term: 7, personalLoan2Term: 7 };
                if (idx !== -1 && !newProperties[idx].possessionMonths) {
                    newProperties[idx].possessionMonths = 24;
                    newAssumptions.homeLoanStartMonth = 25;
                }
            } else if (plan === '80-20') {
                newAssumptions = { ...newAssumptions, personalLoan1Share: 20, personalLoan2Share: 0, downPaymentShare: 0, homeLoanShare: 80 };
            } else if (plan === 'rtm') {
                newAssumptions = { ...newAssumptions, personalLoan1Share: 20, personalLoan2Share: 0, downPaymentShare: 0, homeLoanShare: 80 };
                if (idx !== -1) { newProperties[idx].possessionMonths = 0; newAssumptions.homeLoanStartMonth = 0; }
            }
            return { ...prev, paymentPlan: plan, assumptions: newAssumptions, properties: newProperties };
        });
    };

    const handleSelectionUpdate = (field, value) => setUserSelections(prev => ({ ...prev, [field]: value }));

    const handleAddExitPriceScenario = () => {
        const baseline = userSelections.scenarioExitPrices.length > 0 ? Math.max(...userSelections.scenarioExitPrices) : (parseFloat(userSelections.selectedExitPrice) || parseFloat(propertyData.purchasePrice) || 0);
        setUserSelections(prev => ({ ...prev, scenarioExitPrices: [...prev.scenarioExitPrices, baseline + 500] }));
    };

    const handleResetData = () => {
        if (window.confirm("Reset all inputs?")) {
            setPropertyData({ ...INITIAL_PROPERTY_DATA, paymentPlan: propertyData.paymentPlan, assumptions: propertyData.assumptions });
            setUserSelections(INITIAL_USER_SELECTIONS);
            setCurrentStep(1);
            setMaxStepReached(1);
        }
    };

    const validateCurrentStep = () => {
        let isValid = true;
        const currentProp = propertyData.properties.find(p => p.id === userSelections.selectedPropertyId);
        const isEmpty = (val) => val === '' || val === null || val === undefined || val === 0;

        if (currentStep === 1) {
            if (!currentProp?.name || !currentProp?.location || isEmpty(currentProp?.size) || isEmpty(propertyData.purchasePrice)) isValid = false;
        } else if (currentStep === 2) {
            if (isEmpty(propertyData.assumptions.investmentPeriod)) isValid = false;
            if (propertyData.paymentPlan === 'clp' && (isEmpty(propertyData.assumptions.clpDurationYears) || isEmpty(propertyData.assumptions.bankDisbursementInterval))) isValid = false;
        } else if (currentStep === 3) {
            if (isEmpty(propertyData.assumptions.homeLoanRate) || isEmpty(propertyData.assumptions.homeLoanTerm)) isValid = false;
        }

        if (!isValid) {
            setValidationError('Please fill required fields *');
            setTimeout(() => setValidationError(''), 3000);
        }
        return isValid;
    };

    const handleNextStep = () => {
        if (validateCurrentStep()) {
            const next = currentStep + 1;
            setCurrentStep(Math.min(next, 4));
            setMaxStepReached(prev => Math.max(prev, next));
        }
    };

    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    // --- CALCULATION ENGINE (Simplified Copy) ---
    const calculatedData = useMemo(() => {
        // New Helper: Handles "Manual" Home Loan Strategy
        const calculateManualStrategy = (params) => {
            const {
                homeLoanAmount,
                manualStartMonth,
                possessionMonths,
                totalHoldingMonths,
                idcSchedule,
                hlRate,
                hlTerm,
                personalLoan1Amount,
                personalLoan1EMI, // Pre-calculated
                assumptions
            } = params;

            // 1. Calculate Full Fixed EMI
            let fullHL_EMI = 0;
            if (homeLoanAmount > 0 && hlTerm > 0) {
                const r = hlRate / 12 / 100;
                const n = hlTerm * 12;
                fullHL_EMI = (homeLoanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
            }

            let runningTotalOutflow = 0;
            let runningTotalHLPaid = 0;
            const loopEnd = Math.min(totalHoldingMonths || possessionMonths, possessionMonths);

            // 2. Simple Loop: Payment based on "Start Month"
            for (let m = 1; m <= loopEnd; m++) {
                let monthlyHLPayment = 0;

                // Logic: If current month >= user's start month, pay Full EMI.
                // Before that? Usually 0 (Moratorium) or Interest (Standard).
                // Based on your requirement ("Only HL EMI"), we assume 0 before start.
                if (m >= manualStartMonth) {
                    monthlyHLPayment = fullHL_EMI;
                }

                runningTotalHLPaid += monthlyHLPayment;
                runningTotalOutflow += (monthlyHLPayment + personalLoan1EMI);
            }

            // 3. Return Simplified Data
            return {
                totalIDC: 0, // No separate "IDC" cost to show, it's all EMI
                minIDCEMI: fullHL_EMI, // Min and Max are just the EMI
                maxIDCEMI: fullHL_EMI,
                monthlyIDCEMI: fullHL_EMI, // Average is just the EMI

                idcSchedule: idcSchedule,

                // Return the Total Outflow calculated in the loop
                truePrePossessionTotal: runningTotalOutflow
            };
        };
        // 1. Internal Helper: Performs the core financial math
        const calculateFinancials = (propertySize, exitPrice, years) => {
            // ... (Inputs extraction and setup remains the same) ...
            const { purchasePrice, otherCharges, stampDuty, gstPercentage, assumptions, paymentPlan } = propertyData;

            const selectedProperty = propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)
                || propertyData.properties[0] || {};

            const periodUnit = propertyData.assumptions.holdingPeriodUnit || 'years';
            let totalHoldingMonths;
            if (periodUnit === 'months') {
                totalHoldingMonths = parseFloat(years) || 0;
            } else {
                totalHoldingMonths = (parseFloat(years) || 0) * 12;
            }

            const valYears = totalHoldingMonths / 12;
            const displayYears = Math.round(valYears * 100) / 100;
            const possessionMonths = getSafeValue(selectedProperty?.possessionMonths) || 0;
            const baseCost = propertySize * getSafeValue(purchasePrice);
            const extraCharges = getSafeValue(otherCharges);
            const agreementValue = baseCost + extraCharges;
            const stampDutyCost = agreementValue * (getSafeValue(stampDuty) / 100);
            const gstCost = agreementValue * (getSafeValue(gstPercentage) / 100);
            const totalCost = baseCost;

            const constructionPeriodMonths = paymentPlan === 'clp'
                ? (getSafeValue(assumptions.clpDurationYears) * 12)
                : possessionMonths;

            let lastDemandMonth = possessionMonths;
            if (paymentPlan === 'clp') {
                const explicitLast = getSafeValue(assumptions.lastBankDisbursementMonth);
                const constructionEnd = getSafeValue(assumptions.clpDurationYears) * 12;
                lastDemandMonth = explicitLast > 0 ? explicitLast : (constructionEnd > 0 ? constructionEnd : possessionMonths);
            }

            const hlMode = assumptions.homeLoanStartMode || 'default';
            const hlInputValue = getSafeValue(assumptions.homeLoanStartMonth);
            let realHomeLoanStartMonth;

            if (hlMode === 'manual') {
                realHomeLoanStartMonth = hlInputValue;
            } else {
                realHomeLoanStartMonth = lastDemandMonth + hlInputValue + 1;
            }

            let homeLoanShare, personalLoan1Share, personalLoan2Share, downPaymentShare;

            if (paymentPlan === 'clp') {
                homeLoanShare = 80; personalLoan1Share = 10; personalLoan2Share = 10; downPaymentShare = 0;
            } else if (paymentPlan === '20-80') {
                homeLoanShare = 80; personalLoan1Share = 20; personalLoan2Share = 0; downPaymentShare = 0;
            } else if (paymentPlan === '40-60') {
                homeLoanShare = 60; personalLoan1Share = 40; personalLoan2Share = 0; downPaymentShare = 0;
            } else if (paymentPlan === 'rtm') {
                homeLoanShare = 80; personalLoan1Share = 20; personalLoan2Share = 0; downPaymentShare = 0;
            } else {
                personalLoan1Share = getSafeValue(assumptions.personalLoan1Share);
                personalLoan2Share = getSafeValue(assumptions.personalLoan2Share);
                downPaymentShare = getSafeValue(assumptions.downPaymentShare);
                homeLoanShare = getSafeValue(assumptions.homeLoanShare);
            }

            const homeLoanAmount = totalCost * (homeLoanShare / 100);
            const personalLoan1Amount = totalCost * (personalLoan1Share / 100);
            const personalLoan2Amount = totalCost * (personalLoan2Share / 100);
            const downPaymentAmount = totalCost * (downPaymentShare / 100);
            const totalCashInvested = downPaymentAmount + personalLoan1Amount + personalLoan2Amount;

            const totalHomeLoanAtCompletion = homeLoanAmount;
            const homeLoanEMI = homeLoanAmount > 0 ? calculateEMI(totalHomeLoanAtCompletion, assumptions.homeLoanRate, assumptions.homeLoanTerm) : 0;
            const personalLoan1EMI = personalLoan1Amount > 0 ? calculateEMI(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term) : 0;
            const personalLoan2EMI = personalLoan2Amount > 0 ? calculateEMI(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term) : 0;

            const constructionMonths = possessionMonths;
            let totalIDC = 0;
            let monthlyIDCEMI = 0;
            let minIDCEMI = 0;
            let maxIDCEMI = 0;
            let idcSchedule = [];
            let truePrePossessionTotal = 0;
            let totalLifetimeInterest = 0;

            const isManualMode = assumptions.homeLoanStartMode === 'manual';

            if (paymentPlan === 'clp' && homeLoanAmount > 0) {

                // ============================================================
                // 1. GENERATE SCHEDULE FIRST (Moved OUT of the else block)
                //    This ensures 'idcSchedule' exists for BOTH strategies.
                // ============================================================
                const interval = getSafeValue(assumptions.bankDisbursementInterval) || 3;
                let rawStart = getSafeValue(assumptions.bankDisbursementStartMonth);
                let startMonth = (rawStart !== undefined && rawStart !== null && rawStart !== '') ? parseInt(rawStart) : 1;
                const manualCutoff = getSafeValue(assumptions.lastBankDisbursementMonth);
                const fundingEndMonth = manualCutoff > 0 ? manualCutoff : possessionMonths;

                const calculatedSlabs = Math.floor((fundingEndMonth - startMonth) / interval) + 1;
                const numberOfSlabs = Math.max(1, calculatedSlabs);
                const slabAmount = homeLoanAmount / numberOfSlabs;
                const hlRate = getSafeValue(assumptions.homeLoanRate);

                for (let i = 0; i < numberOfSlabs; i++) {
                    const month = startMonth + (i * interval);
                    if (month <= fundingEndMonth) {
                        const slabMonthlyInterest = (slabAmount * (hlRate / 100)) / 12;
                        const duration = Math.max(0, possessionMonths - month);
                        const thisSlabTotalCost = slabMonthlyInterest * duration;

                        idcSchedule.push({
                            slabNo: i + 1,
                            releaseMonth: month,
                            amount: slabAmount,
                            interestCost: thisSlabTotalCost
                        });
                        totalLifetimeInterest += thisSlabTotalCost;
                    }
                }

                // ============================================================
                // 2. NOW EXECUTE STRATEGY
                // ============================================================
                if (isManualMode) {
                    // MANUAL:
                    const manualStart = getSafeValue(assumptions.homeLoanStartMonth);
                    const mStart = (manualStart !== undefined && manualStart !== null) ? parseInt(manualStart) : 0;

                    const manualResult = calculateManualStrategy({
                        homeLoanAmount,
                        manualStartMonth: mStart,
                        possessionMonths,
                        totalHoldingMonths,
                        hlRate: getSafeValue(assumptions.homeLoanRate),
                        hlTerm: getSafeValue(assumptions.homeLoanTerm),
                        personalLoan1Amount,
                        personalLoan1EMI,
                        assumptions,
                        idcSchedule: idcSchedule // ✅ Now this contains data!
                    });

                    totalIDC = manualResult.totalIDC;
                    minIDCEMI = manualResult.minIDCEMI;
                    maxIDCEMI = manualResult.maxIDCEMI;
                    monthlyIDCEMI = manualResult.monthlyIDCEMI;
                    truePrePossessionTotal = manualResult.truePrePossessionTotal;
                    // Note: idcSchedule is already updated in memory

                } else {
                    // DEFAULT: Run standard simulation loop for IDC
                    let cumulativeDisbursement = 0;
                    let runningTotalIDC = 0;
                    let runningTotalOutflow = 0;
                    let isFirstIDCPayment = false;

                    if (startMonth === 0) {
                        cumulativeDisbursement += slabAmount;
                    }

                    const hlTerm = getSafeValue(assumptions.homeLoanTerm);
                    let fullHL_EMI = 0;
                    if (homeLoanAmount > 0 && hlTerm > 0) {
                        const r = hlRate / 12 / 100;
                        const n = hlTerm * 12;
                        fullHL_EMI = (homeLoanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                    }

                    const loopEnd = Math.min(totalHoldingMonths || possessionMonths, possessionMonths);

                    for (let m = 1; m <= loopEnd; m++) {
                        const isPhase1_IDC = m <= fundingEndMonth;
                        let monthlyHLComponent = 0;

                        if (isPhase1_IDC) {
                            const isScheduleMonth = (m >= startMonth) && ((m - startMonth) % interval === 0) && (m !== startMonth);
                            const isStartMonthTrigger = (startMonth !== 0 && m === startMonth);

                            if ((isScheduleMonth || isStartMonthTrigger) && cumulativeDisbursement < (homeLoanAmount - 10)) {
                                cumulativeDisbursement += slabAmount;
                                if (cumulativeDisbursement > homeLoanAmount) cumulativeDisbursement = homeLoanAmount;
                            }

                            monthlyHLComponent = (cumulativeDisbursement * (hlRate / 100)) / 12;
                            runningTotalIDC += monthlyHLComponent;

                            if (monthlyHLComponent > 0) {
                                if (!isFirstIDCPayment) {
                                    minIDCEMI = monthlyHLComponent;
                                    isFirstIDCPayment = true;
                                }
                                maxIDCEMI = monthlyHLComponent;
                            }
                        } else {
                            monthlyHLComponent = fullHL_EMI;
                        }

                        const monthlyPL1 = personalLoan1Amount > 0 ? calculateEMI(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term) : 0;
                        runningTotalOutflow += (monthlyHLComponent + monthlyPL1);
                    }

                    totalIDC = runningTotalIDC;
                    truePrePossessionTotal = runningTotalOutflow;

                    const activeMonths = Math.min(loopEnd, fundingEndMonth) - startMonth + 1;
                    monthlyIDCEMI = activeMonths > 0 ? (totalIDC / activeMonths) : 0;

                    // Update schedule with calculated interest costs
                    idcSchedule = idcSchedule.map(slab => ({
                        ...slab,
                        interestCost: (slab.amount * (hlRate / 100) / 12) * (possessionMonths - slab.releaseMonth + 1)
                    }));
                }
            }

            // ... (Rest of function remains identical) ...
            const homeLoanPaymentsMade = Math.max(0, totalHoldingMonths - (realHomeLoanStartMonth - 1));
            const pl1PaymentsMade = Math.max(0, totalHoldingMonths - assumptions.personalLoan1StartMonth);
            const pl2PaymentsMade = Math.max(0, totalHoldingMonths - (possessionMonths + assumptions.personalLoan2StartMonth));
            const homeLoanOutstanding = homeLoanAmount > 0 ? calculateOutstandingAfterPayments(totalHomeLoanAtCompletion, assumptions.homeLoanRate, assumptions.homeLoanTerm, homeLoanPaymentsMade) : 0;
            const personalLoan1Outstanding = personalLoan1Amount > 0 ? calculateOutstandingAfterPayments(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term, pl1PaymentsMade) : 0;
            const personalLoan2Outstanding = personalLoan2Amount > 0 ? calculateOutstandingAfterPayments(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term, pl2PaymentsMade) : 0;

            const homeLoanInterestPaid = homeLoanAmount > 0 ? calculateTotalInterestPaid(totalHomeLoanAtCompletion, assumptions.homeLoanRate, assumptions.homeLoanTerm, homeLoanPaymentsMade) : 0;
            const personalLoan1InterestPaid = personalLoan1Amount > 0 ? calculateTotalInterestPaid(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term, pl1PaymentsMade) : 0;
            const personalLoan2InterestPaid = personalLoan2Amount > 0 ? calculateTotalInterestPaid(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term, pl2PaymentsMade) : 0;

            const totalLoanOutstanding = homeLoanOutstanding + personalLoan1Outstanding + personalLoan2Outstanding;
            const totalEMIPaid = (homeLoanEMI * homeLoanPaymentsMade) + (personalLoan1EMI * pl1PaymentsMade) + (personalLoan2EMI * pl2PaymentsMade) + totalIDC;
            const saleValue = propertySize * exitPrice;
            const leftoverCash = saleValue - totalLoanOutstanding;
            const trueNetProfit = leftoverCash - totalEMIPaid - downPaymentAmount;
            const totalActualInvestment = downPaymentAmount + totalEMIPaid;
            const roi = totalActualInvestment > 0 ? (trueNetProfit / totalActualInvestment) * 100 : 0;
            const netGainLoss = trueNetProfit;

            const prePossessionMonths = Math.min(totalHoldingMonths, possessionMonths);
            const postPossessionMonths = Math.max(0, totalHoldingMonths - possessionMonths);
            const prePossessionEMI = personalLoan1EMI + monthlyIDCEMI;
            const postPossessionEMI = homeLoanEMI + personalLoan1EMI + personalLoan2EMI;
            const actualIDCPaid = monthlyIDCEMI * prePossessionMonths;
            const totalInterestPaid = homeLoanInterestPaid + personalLoan1InterestPaid + personalLoan2InterestPaid + actualIDCPaid;

            return {
                minIDCEMI, maxIDCEMI, idcSchedule, propertySize, totalCost, totalCashInvested, totalLoanOutstanding,
                homeLoanEMI, personalLoan1EMI, personalLoan2EMI, gstCost,
                homeLoanAmount, personalLoan1Amount, personalLoan2Amount, downPaymentAmount,
                totalHomeLoanAtCompletion, homeLoanOutstanding, personalLoan1Outstanding, personalLoan2Outstanding,
                totalInterestPaid, totalIDC: paymentPlan === 'clp' ? totalLifetimeInterest : totalIDC,
                monthlyIDCEMI,
                homeLoanInterestPaid, personalLoan1InterestPaid, personalLoan2InterestPaid,
                homeLoanEMIPaid: homeLoanEMI * homeLoanPaymentsMade,
                personalLoan1EMIPaid: personalLoan1EMI * pl1PaymentsMade,
                personalLoan2EMIPaid: personalLoan2EMI * pl2PaymentsMade,
                totalEMIPaid, homeLoanPaymentsMade, pl1PaymentsMade, pl2PaymentsMade,
                saleValue, leftoverCash, stampDutyCost, netGainLoss, roi, exitPrice,
                homeLoanShare, personalLoan1Share, personalLoan2Share, downPaymentShare,
                years: displayYears,
                hasHomeLoan: homeLoanAmount > 0,
                hasPersonalLoan1: personalLoan1Amount > 0,
                hasPersonalLoan2: personalLoan2Amount > 0,
                hasDownPayment: downPaymentAmount > 0,
                hasIDC: totalIDC > 0,
                homeLoanStartMonth: realHomeLoanStartMonth,
                pl1StartMonth: assumptions.personalLoan1StartMonth,
                pl2StartMonth: possessionMonths,
                homeLoanSelectedMonths: assumptions.homeLoanStartMonth,
                pl1SelectedMonths: assumptions.personalLoan1StartMonth,
                pl2SelectedMonths: assumptions.personalLoan2StartMonth,
                possessionMonths: possessionMonths,
                totalHoldingMonths,
                prePossessionMonths,
                postPossessionMonths,
                prePossessionEMI,
                postPossessionEMI,
                prePossessionTotal: (paymentPlan === 'clp' && truePrePossessionTotal > 0) ? truePrePossessionTotal : (prePossessionEMI * prePossessionMonths),
                postPossessionTotal: postPossessionEMI * postPossessionMonths,
                prePossessionComponents: {
                    pl1EMI: personalLoan1EMI,
                    monthlyIDCEMI,
                    total: prePossessionEMI
                },
                constructionMonths: paymentPlan === 'clp' ? assumptions.clpDurationYears * 12 : 0
            };
        };

        const allExitPrices = Array.from(new Set([
            userSelections.selectedExitPrice,
            ...userSelections.scenarioExitPrices
        ])).sort((a, b) => a - b);
        // 2. Perform All Calculations
        const propertySize = userSelections.selectedPropertySize;
        const detailedBreakdown = calculateFinancials(propertySize, userSelections.selectedExitPrice, propertyData.assumptions.investmentPeriod);
        const comparisonTargetPrice = userSelections.scenarioExitPrices?.[0] || 0;
        const scenarioBreakdown = calculateFinancials(propertySize, comparisonTargetPrice, propertyData.assumptions.investmentPeriod);

        const profits = allExitPrices.map(price => {
            const breakdown = calculateFinancials(propertySize, price, propertyData.assumptions.investmentPeriod);
            return {
                exitPrice: price,
                saleValue: breakdown.saleValue,
                netProfit: breakdown.netGainLoss,
                roi: breakdown.totalCashInvested > 0 ? (breakdown.netGainLoss / breakdown.totalCashInvested) * 100 : 0,
                appreciation: ((price - propertyData.purchasePrice) / propertyData.purchasePrice) * 100,
                cashInvested: breakdown.totalCashInvested,
                loanOutstanding: breakdown.totalLoanOutstanding
            };
        });

        const multipleScenarios = allExitPrices.map(price => {
            const breakdown = calculateFinancials(propertySize, price, propertyData.assumptions.investmentPeriod);
            return {
                exitPrice: price,
                saleValue: breakdown.saleValue,
                netProfit: breakdown.netGainLoss,
                roi: breakdown.roi,
                appreciation: ((price - propertyData.purchasePrice) / propertyData.purchasePrice) * 100,
                cashInvested: breakdown.totalCashInvested,
                loanOutstanding: breakdown.totalLoanOutstanding,
                leftoverCash: breakdown.leftoverCash,
                totalEMIPaid: breakdown.totalEMIPaid,
                isSelected: price === userSelections.selectedExitPrice
            };
        });

        // 3. Stage Wise Data Preparation
        const stageCalculations = {
            stage1: {
                title: "Stage 1: Basic Property Cost",
                items: [
                    { label: "Property Size", value: `${propertySize} sq.ft` },
                    { label: "Purchase Price", value: `₹${propertyData.purchasePrice}/sq.ft` },
                    { label: "Stamp Duty", value: formatCurrency(detailedBreakdown.stampDutyCost) },
                    { label: "GST charges", value: formatCurrency(detailedBreakdown.gstCost) },
                    { label: "Total Property Cost", value: formatCurrency(detailedBreakdown.totalCost) }
                ]
            },
            stage2: {
                title: "Stage 2: Payment Plan Breakdown",
                items: [
                    { label: "Down Payment", value: `${detailedBreakdown.downPaymentShare}% (${formatCurrency(detailedBreakdown.downPaymentAmount)})` },
                    { label: "Home Loan", value: `${detailedBreakdown.homeLoanShare}% (${formatCurrency(detailedBreakdown.homeLoanAmount)})` },
                    { label: "PL1", value: `${detailedBreakdown.personalLoan1Share}% (${formatCurrency(detailedBreakdown.personalLoan1Amount)})` },
                    { label: "PL2", value: `${detailedBreakdown.personalLoan2Share}% (${formatCurrency(detailedBreakdown.personalLoan2Amount)})` },
                    { label: "Total PL Amount", value: formatCurrency(detailedBreakdown.totalCashInvested) }
                ]
            },
            stage3: {
                title: "Stage 3: EMI Calculations",
                items: [
                    { label: "Home Loan EMI", value: `${formatCurrency(detailedBreakdown.homeLoanEMI)}/month` },
                    { label: "PL1 EMI", value: `${formatCurrency(detailedBreakdown.personalLoan1EMI)}/month` },
                    { label: "PL2 EMI", value: `${formatCurrency(detailedBreakdown.personalLoan2EMI)}/month` },
                    { label: "Total Monthly", value: `${formatCurrency(detailedBreakdown.homeLoanEMI + detailedBreakdown.personalLoan1EMI + detailedBreakdown.personalLoan2EMI)}/month` }
                ]
            },
            stage4: {
                title: "Stage 4: Holding Period",
                items: [
                    { label: "Duration", value: `${detailedBreakdown.years || 0} years (${detailedBreakdown.totalHoldingMonths} months)` },
                    { label: "Possession", value: `After ${detailedBreakdown.possessionMonths} months` },
                    { label: "Exit Price", value: `₹${userSelections.selectedExitPrice}/sq.ft` },
                    { label: "Sale Value", value: formatCurrency(detailedBreakdown.saleValue) }
                ]
            }
        };

        return { profits, detailedBreakdown, scenarioBreakdown, multipleScenarios, stageCalculations };

    }, [propertyData, userSelections]); // Dependencies: Runs ONLY when inputs change

    const userDefinedTotal = getSafeValue(propertyData.assumptions.downPaymentShare) +
        getSafeValue(propertyData.assumptions.personalLoan1Share) +
        getSafeValue(propertyData.assumptions.personalLoan2Share);

    const currentTotal = userDefinedTotal + getSafeValue(propertyData.assumptions.homeLoanShare);

    const isError = currentTotal !== 100;

    const handleAnalyzeClick = () => {
        // 1. Start Loading Animation
        setIsProcessing(true);
        setLoadingMessage("Analyzing Property Parameters...");

        // 2. Wait 1.5 seconds before showing results
        setTimeout(() => {
            // A. Switch to Overview Tab
            setActiveTab('overview');

            // B. Stop Loading
            setIsProcessing(false);

            // C. Show Success Alert
            setShowDataEnteredAlert(true);

            // D. Scroll to top to see results
            window.scrollTo({ top: 0, behavior: 'smooth' });

            // E. Auto-hide alert after 3 seconds
            setTimeout(() => {
                setShowDataEnteredAlert(false);
            }, 3000);

        }, 1500);
    };

    const handlePrintReport = () => {
        window.print();
    };
    const handleExportExcel = () => {
        if (!calculatedData.detailedBreakdown) return;
        const bd = calculatedData.detailedBreakdown;
        const inputs = propertyData;
        const sel = userSelections;
        const propName = inputs.properties.find(p => p.id === sel.selectedPropertyId)?.name || "Property";

        // --- SHEET 1: DETAILED INVESTMENT SUMMARY ---
        const summaryData = [
            ["PROPERTY INVESTMENT ANALYSIS REPORT"],
            ["Generated Date:", new Date().toLocaleDateString()],
            [],
            ["1. PROPERTY & COST DETAILS"],
            ["Property Name", propName],
            ["Location", inputs.properties.find(p => p.id === sel.selectedPropertyId)?.location || "-"],
            ["Size", `${bd.propertySize} sq.ft`],
            ["Purchase Price", `${formatCurrency(inputs.purchasePrice)}/sq.ft`],
            ["Stamp Duty", `${inputs.stampDuty}%`],
            ["Other Charges", formatCurrency(inputs.otherCharges)],
            ["TOTAL PROPERTY COST", formatCurrency(bd.totalCost)],
            [],
            ["2. FUNDING PLAN (How you pay)"],
            ["Payment Plan", inputs.paymentPlan.toUpperCase()],
            ["Down Payment (Self)", `${bd.downPaymentShare}%`, formatCurrency(bd.downPaymentAmount)],
            ["Home Loan", `${bd.homeLoanShare}%`, formatCurrency(bd.homeLoanAmount), `@ ${inputs.assumptions.homeLoanRate}% for ${inputs.assumptions.homeLoanTerm} yrs`],
            ["Personal Loan 1", `${bd.personalLoan1Share}%`, formatCurrency(bd.personalLoan1Amount), `@ ${inputs.assumptions.personalLoan1Rate}% for ${inputs.assumptions.personalLoan1Term} yrs`],
            ["Personal Loan 2", `${bd.personalLoan2Share}%`, formatCurrency(bd.personalLoan2Amount), `@ ${inputs.assumptions.personalLoan2Rate}% for ${inputs.assumptions.personalLoan2Term} yrs`],
            ["TOTAL CASH INVESTED (Upfront)", formatCurrency(bd.totalCashInvested)],
            [],
            ["3. MONTHLY CASH FLOW (EMIs)"],
            ["Home Loan EMI", formatCurrency(bd.homeLoanEMI)],
            ["Personal Loan 1 EMI", formatCurrency(bd.personalLoan1EMI)],
            ["Personal Loan 2 EMI", formatCurrency(bd.personalLoan2EMI)],
            ["Avg. IDC (During Construction)", formatCurrency(bd.monthlyIDCEMI)],
            ["Max Monthly Commitment", formatCurrency(bd.homeLoanEMI + bd.personalLoan1EMI + bd.personalLoan2EMI)],
            [],
            ["4. RETURN ANALYSIS (After " + sel.selectedYears + " Years)"],
            ["Exit Price", `${formatCurrency(sel.selectedExitPrice)}/sq.ft`],
            ["Sale Value", formatCurrency(bd.saleValue)],
            ["(-) Outstanding Loan Balance", formatCurrency(bd.totalLoanOutstanding)],
            ["(-) Total EMIs Paid", formatCurrency(bd.totalEMIPaid)],
            ["(-) Initial Cash Down Payment", formatCurrency(bd.downPaymentAmount)],
            ["NET PROFIT / LOSS", formatCurrency(bd.netGainLoss)],
            ["ROI %", formatPercent(bd.roi)]
        ];

        // --- SHEET 2: TIMELINE PHASES ---
        const timelineData = [
            ["PHASE", "PERIOD", "DURATION", "TOTAL MONTHLY PAY", "BREAKDOWN OF PAYMENTS"],
            [
                "Timeline 1 (Pre-Possession)",
                `Month 0 - ${bd.possessionMonths}`,
                `${bd.prePossessionMonths} Months`,
                formatCurrency(bd.prePossessionEMI),
                `PL1 EMI (${formatCurrency(bd.personalLoan1EMI)}) + IDC Interest (${formatCurrency(bd.monthlyIDCEMI)})`
            ],
            [
                "Timeline 2 (Post-Possession)",
                `Month ${bd.possessionMonths + 1} - ${bd.totalHoldingMonths}`,
                `${bd.postPossessionMonths} Months`,
                formatCurrency(bd.postPossessionEMI),
                `HL EMI (${formatCurrency(bd.homeLoanEMI)}) + PL1 EMI (${formatCurrency(bd.personalLoan1EMI)}) + PL2 EMI (${formatCurrency(bd.personalLoan2EMI)})`
            ]
        ];

        // Create Workbook
        const wb = XLSX.utils.book_new();
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        const wsTimeline = XLSX.utils.aoa_to_sheet(timelineData);

        // Set Column Widths for better visibility
        const wscols = [{ wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 30 }];
        wsSummary['!cols'] = wscols;
        wsTimeline['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 50 }];

        // Append Sheets
        XLSX.utils.book_append_sheet(wb, wsSummary, "Detailed Summary");
        XLSX.utils.book_append_sheet(wb, wsTimeline, "Timeline Breakdown");

        // Download
        XLSX.writeFile(wb, "Property_Investment_Detailed_Report.xlsx");
    };
    // ===================== MOBILE RENDERERS =====================

    // 1. VERTICAL STEPPER (Checklist Style) - FIXED NAVIGATION
    const renderMobileStepper = () => {
        const mobileSteps = [
            { id: 1, label: "Property Details", isCompleted: currentStep > 1 },
            { id: 2, label: "Payment Plan", isCompleted: currentStep > 2 },
            { id: 3, label: "Loan Config", isCompleted: currentStep > 3 },
            { id: 4, label: "Exit Scenarios", isCompleted: currentStep > 4 }
        ];

        return (
            <div className="mb-5 pb-5 px-2">
                <div className="glass-card mb-4 p-3">
                    <div className="d-flex justify-content-between align-items-center">

                        {/* Left Side: Title */}
                        <div className="d-flex align-items-center">
                            <div className="rounded-circle bg-primary bg-opacity-10 p-2 me-3 d-flex align-items-center justify-content-center" style={{ width: '45px', height: '45px' }}>
                                <i className="bi bi-sliders text-primary fs-4"></i>
                            </div>
                            <div>
                                <h5 className="fw-bold mb-0">Inputs</h5>
                            </div>
                        </div>

                        {/* Right Side: Action Buttons */}
                        <div className="d-flex gap-2">
                            {/* 1. Excel Button */}
                            <button
                                className="btn btn-success btn-sm d-flex align-items-center shadow-sm"
                                onClick={handleResetData}
                                title="Export to Excel"
                            >
                                Reset
                            </button>
                        </div>

                    </div>
                </div>

                {mobileSteps.map((step, index) => {
                    const isActive = step.id === currentStep;
                    const isLast = index === mobileSteps.length - 1;

                    return (
                        <div key={step.id} className="d-flex">
                            {/* Left Column: Line & Circle */}
                            <div className="d-flex flex-column align-items-center me-3" style={{ width: '24px' }}>
                                <div
                                    className={`rounded-circle d-flex align-items-center justify-content-center text-white fw-bold shadow-sm transition-all`}
                                    style={{
                                        width: '28px', height: '28px', fontSize: '0.8rem',
                                        backgroundColor: step.isCompleted ? '#198754' : (isActive ? '#0d6efd' : '#e9ecef'),
                                        color: (step.isCompleted || isActive) ? '#fff' : '#6c757d',
                                        zIndex: 2, border: isActive ? '2px solid #fff' : 'none',
                                        boxShadow: isActive ? '0 0 0 2px #0d6efd' : 'none'
                                    }}
                                    onClick={() => step.id <= maxStepReached && setCurrentStep(step.id)}
                                >
                                    {step.isCompleted ? <i className="bi bi-check"></i> : step.id}
                                </div>
                                {!isLast && (
                                    <div className="flex-grow-1 my-1" style={{ width: '2px', backgroundColor: step.isCompleted ? '#198754' : '#e9ecef', minHeight: isActive ? '20px' : '40px' }}></div>
                                )}
                            </div>

                            {/* Right Column: Content */}
                            <div className={`pb-4 flex-grow-1 ${isActive ? '' : 'opacity-50'}`}>
                                <div className="fw-bold mb-1" onClick={() => step.id <= maxStepReached && setCurrentStep(step.id)}>
                                    {step.label}
                                </div>

                                {isActive && (
                                    <div className="mt-2 animate-fade-in">
                                        {/* Render the Accordion Content */}
                                        {renderMobileStepContent(step.id)}

                                        {/* Validation Error Message */}
                                        {validationError && (
                                            <div className="text-danger small mt-2 animate-fade-in">
                                                <i className="bi bi-exclamation-circle me-1"></i>{validationError}
                                            </div>
                                        )}

                                        {/* Navigation Buttons */}
                                        <div className="d-flex justify-content-between mt-3 pt-2">
                                            <button
                                                className="btn btn-sm btn-outline-secondary rounded-pill px-3"
                                                onClick={prevStep}
                                                disabled={currentStep === 1}
                                            >
                                                Back
                                            </button>

                                            {/* ✅ FIX IS HERE: Conditional onClick */}
                                            <button
                                                className="btn btn-sm btn-primary rounded-pill px-4"
                                                onClick={currentStep === 4 ? handleAnalyzeClick : handleNextStep}
                                            >
                                                {currentStep === 4 ? 'Analyze' : 'Next'}
                                                <i className="bi bi-arrow-right ms-2"></i>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };
    const placeholders = {
        // ... existing Step 1 fields ...
        name: "e.g. Supernova Tower A",
        location: "e.g. Sector 94, Noida",
        size: "e.g. 1250",
        purchasePrice: "e.g. 6500",
        otherCharges: "e.g. 500000",
        stampDuty: "e.g. 7",
    };

    // 2. INPUT FORMS
    const renderPropertyInput = (index, property, label, field, type = "text", placeholder, required = false) => (
        <div className="mb-2">
            <label className="form-label small text-muted mb-1">{label} {required && <span className="text-danger">*</span>}</label>
            <input
                type={type}
                className="form-control form-control-sm"
                placeholder={placeholder}
                value={property[field]}
                onChange={(e) => updatePropertyField(index, field, e.target.value)}
            />
        </div>
    );

    const renderMobileStepContent = (stepId) => {
        // Helper: Renders a collapsible accordion section
        // --- HELPER: Renders the Glass Accordion (Mobile Optimized) ---
        const renderAccordionSection = (id, title, icon, content) => {
            const isOpen = activeAccordion === id;

            return (
                <div className="mb-2"> {/* Reduced bottom margin */}

                    {/* Header (Clickable) */}
                    <div
                        className="card-header border-0 py-3 px-3 cursor-pointer d-flex justify-content-between align-items-center bg-transparent"
                        onClick={() => setActiveAccordion(isOpen ? '' : id)}
                        style={{ cursor: 'pointer', touchAction: 'manipulation' }} // Optimize for touch
                    >
                        {/* Title (Left) - Using h6 for mobile compactness */}
                        <h6 className={`mb-0 fw-bold ${isOpen ? '' : 'text-dark'}`}>
                            <i className={`bi ${icon} me-2 ${isOpen ? '' : 'text-muted'}`}></i>
                            {title}
                        </h6>

                        {/* Arrow Icon (Right) */}
                        <i className={`bi bi-chevron-${isOpen ? 'up' : 'down'} ${isOpen ? 'text-primary' : 'text-muted'}`}></i>
                    </div>

                    {/* Content (Visible only if open) */}
                    {isOpen && (
                        // Reduced padding from p-4 to p-3 for mobile
                        <div className="card-body p-3 border-top border-secondary border-opacity-10 animate-fade-in">
                            {content}
                        </div>
                    )}
                </div>
            );
        };
        switch (stepId) {
            case 1:
                return (
                    <div className='animate-fade-in'>
                        {/* 2. ACCORDION A: Individual Property Details */}
                        {renderAccordionSection(
                            'prop_mgmt',
                            'Property Specifics',
                            'bi-building',
                            <div>
                                {propertyData.properties.map((property, index) => (
                                    <div key={property.id} className="mb-3 border-bottom pb-3 last-child-no-border">
                                        {/* Property Name & Location */}
                                        <div className="mb-2">
                                            {renderPropertyInput(index, property, "Property Name", "name", "text", "e.g. Supernova", true)}
                                        </div>
                                        <div className="mb-2">
                                            {renderPropertyInput(index, property, "Location", "location", "text", "e.g. Noida", true)}
                                        </div>

                                        {/* Size & Possession Row */}
                                        <div className="row g-2">
                                            <div className="col-6">
                                                {renderPropertyInput(index, property, "Size (sq.ft)", "size", "number", "e.g. 1000", true)}
                                            </div>
                                            <div className="col-6">
                                                {renderPropertyInput(index, property, "Possession (Mo)", "possessionMonths", "number", "e.g. 24", true)}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 3. ACCORDION B: Common Financial Info (YOUR NEW SECTION) */}
                        {renderAccordionSection(
                            'common_info',
                            'Financial & Tax Details',
                            'bi-cash-coin',
                            <div className="row g-3">
                                {/* Row 1: Basic Pricing */}
                                <div className="col-6">
                                    <label className="form-label small text-muted mb-1 fw-bold">
                                        Price (₹/sq.ft) <span className="text-danger">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        className="form-control form-control-sm"
                                        value={propertyData.purchasePrice}
                                        placeholder="e.g. 5000"
                                        onChange={(e) => handleInputChange('purchasePrice', parseFloat(e.target.value))}
                                    />
                                </div>
                                <div className="col-6">
                                    <label className="form-label small text-muted mb-1">Other Charges</label>
                                    <input
                                        type="number"
                                        className="form-control form-control-sm"
                                        value={propertyData.otherCharges}
                                        placeholder="Lumpsum"
                                        onChange={(e) => handleInputChange('otherCharges', parseFloat(e.target.value))}
                                    />
                                </div>

                                {/* Row 2: Stamp Duty & Selector */}
                                <div className="col-6">
                                    <label className="form-label small text-muted mb-1">Stamp Duty (%)</label>
                                    <div className="input-group input-group-sm">
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={propertyData.stampDuty}
                                            placeholder="e.g. 5"
                                            onChange={(e) => handleInputChange('stampDuty', parseFloat(e.target.value))}
                                        />
                                        <span className="input-group-text">%</span>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <label className="form-label small text-muted mb-1">Active Property</label>
                                    <select
                                        className="form-select form-select-sm"
                                        value={userSelections.selectedPropertyId}
                                        onChange={(e) => {
                                            const propId = parseInt(e.target.value);
                                            handleSelectionUpdate('selectedPropertyId', propId);
                                            const selectedProp = propertyData.properties.find(p => p.id === propId);
                                            if (selectedProp) handleSelectionUpdate('selectedPropertySize', selectedProp.size);
                                        }}
                                    >
                                        {propertyData.properties.map(property => (
                                            <option key={property.id} value={property.id}>{property.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Divider */}
                                <div className="col-12 my-1">
                                    <div className="border-top border-secondary border-opacity-10"></div>
                                </div>

                                {/* Row 3: GST Section */}
                                <div className="col-6">
                                    <label className="form-label small text-muted mb-1 fw-bold">
                                        GST % <span className="text-danger">*</span>
                                    </label>
                                    <div className="input-group input-group-sm">
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={propertyData.gstPercentage}
                                            placeholder="e.g.5"
                                            onChange={(e) => handleInputChange('gstPercentage', parseFloat(e.target.value))}
                                        />
                                        <span className="input-group-text">%</span>
                                    </div>
                                </div>
                                <div className="col-6">
                                    <label className="form-label small text-muted mb-1">GST Amount</label>
                                    <div className="form-control form-control-sm bg-light text-secondary text-end">
                                        {(() => {
                                            const size = userSelections.selectedPropertySize || 0;
                                            const price = getSafeValue(propertyData.purchasePrice);
                                            const others = getSafeValue(propertyData.otherCharges);
                                            const gst = getSafeValue(propertyData.gstPercentage);
                                            const totalVal = (size * price) + others;
                                            return formatCurrency(totalVal * (gst / 100));
                                        })()}
                                    </div>
                                </div>
                                <div className="col-12">
                                    <small className="text-muted fst-italic" style={{ fontSize: '0.7rem' }}>
                                        * GST is calculated on Total Cost (Base + Other Charges)
                                    </small>
                                </div>
                            </div>
                        )}
                    </div>
                );
            case 2:
                return (
                    <div>
                        <div className="mb-3">
                            <label className="form-label small text-muted">Payment Plan <span className="text-danger">*</span></label>
                            <select className="form-select form-select-sm" value={propertyData.paymentPlan} onChange={(e) => handlePaymentPlanChange(e.target.value)}>
                                <option value="clp">CLP (Construction Linked)</option>
                                <option value="80-20">80%-20% (80% HL, 20% Self)</option>
                                <option value="25-75">25%-75% (75% HL, 25% Self)</option>
                                <option value="rtm">Ready to Move</option>
                                <option value="custom">Custom</option>
                            </select>
                        </div>
                        <div className="mb-3">
                            <div className="col-md-6">
                                <label className="form-label small text-muted">
                                    Holding Period <span className="text-danger fw-bold">*</span>
                                </label>
                                <div className="input-group">
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={propertyData.assumptions.investmentPeriod}
                                        placeholder={propertyData.assumptions.holdingPeriodUnit === 'months' ? "e.g. 18" : "e.g. 5"}
                                        onChange={(e) => handleAssumptionChange('investmentPeriod', e.target.value)}
                                    />
                                    <select
                                        className="form-select"
                                        style={{ maxWidth: '100px', backgroundColor: '#f8f9fa' }}
                                        value={propertyData.assumptions.holdingPeriodUnit}
                                        onChange={(e) => handleAssumptionChange('holdingPeriodUnit', e.target.value)}
                                    >
                                        <option value="years">Years</option>
                                        <option value="months">Months</option>
                                    </select>
                                </div>
                                <small className="text-muted p-2">
                                    {propertyData.assumptions.holdingPeriodUnit === 'months'
                                        ? `${(getSafeValue(propertyData.assumptions.investmentPeriod) / 12).toFixed(1)} Years`
                                        : `${getSafeValue(propertyData.assumptions.investmentPeriod) * 12} Months`
                                    }
                                </small>
                            </div>
                        </div>
                        {propertyData.paymentPlan === 'custom' && (
                            <div className="mt-4 p-3 bg-light rounded border border-light">
                                <h6 className="fw-bold mb-3 small text-uppercase text-muted">
                                    <i className="bi bi-sliders me-2"></i>
                                    Custom Configuration
                                </h6>
                                <div className="row g-3">
                                    <div className="col-md-3">
                                        <label className="form-label">Down Payment (%)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            min="0"
                                            max="100"
                                            value={propertyData.assumptions.downPaymentShare}
                                            placeholder={placeholders.investmentPeriod}
                                            onChange={(e) => handleAssumptionChange('downPaymentShare', e.target.value)}
                                        />
                                        <small className="text-muted">Cash payment (no loan)</small>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">
                                            Home Loan (%)
                                        </label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            min="0"
                                            max="80"
                                            value={propertyData.assumptions.homeLoanShare}
                                            placeholder="e.g. 80"
                                            onChange={(e) => handleAssumptionChange('homeLoanShare', e.target.value)}
                                        />
                                        <small className="text-muted">Bank Funding (Max 80%)</small>
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Personal Loan 1 (%)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            min="0"
                                            max="100"
                                            value={propertyData.assumptions.personalLoan1Share}
                                            placeholder={placeholders.investmentPeriod}
                                            onChange={(e) => handleAssumptionChange('personalLoan1Share', e.target.value)}
                                        />
                                    </div>
                                    <div className="col-md-3">
                                        <label className="form-label">Personal Loan 2 (%)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            min="0"
                                            max="100"
                                            value={propertyData.assumptions.personalLoan2Share}
                                            placeholder={placeholders.investmentPeriod}
                                            onChange={(e) => handleAssumptionChange('personalLoan2Share', e.target.value)}
                                        />
                                    </div>
                                </div>

                                {isError && (
                                    <div className="mt-3 alert alert-danger mb-0">
                                        <small>
                                            <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                            <strong>Error:</strong> Your inputs total {userDefinedTotal}%. They cannot exceed 100%.
                                        </small>
                                    </div>
                                )}

                                {!isError && (
                                    <div className="mt-3 alert alert-info mb-0 py-2">
                                        <div className="d-flex justify-content-between align-items-center">
                                            <small><i className="bi bi-check-circle me-2"></i>Total Allocation</small>
                                            <small className="fw-bold">{currentTotal}%</small>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        {propertyData.paymentPlan === 'clp' && (
                            renderAccordionSection(
                                'clp_details',
                                'CLP Construction Details',
                                '',
                                (
                                    <>
                                        {/* Row 1: Duration & Interval */}
                                        <div className="row g-3 mb-3">
                                            <div className="col-md-6">
                                                <label className="form-label small text-muted">
                                                    Construction Duration (Years) <span className="text-danger fw-bold">*</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    className="form-control"
                                                    value={propertyData.assumptions.clpDurationYears}
                                                    placeholder={placeholders.clpDurationYears}
                                                    onChange={(e) => handleAssumptionChange('clpDurationYears', e.target.value)}
                                                />
                                                <small className="small text-muted">Total construction period</small>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label small text-muted">
                                                    Disbursement Interval (Months) <span className="text-danger fw-bold">*</span></label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={propertyData.assumptions.bankDisbursementInterval}
                                                    placeholder={placeholders.bankDisbursementInterval}
                                                    onChange={(e) => handleAssumptionChange('bankDisbursementInterval', e.target.value)}
                                                />
                                                <small className="small text-muted">Months between disbursements</small>
                                            </div>
                                        </div>

                                        {/* Row 2: Funding Window (Start & End) */}
                                        <div className="p-3 bg-light rounded border border-light mb-3">
                                            <h6 className="fw-bold mb-3 small text-uppercase text-muted">
                                                <i className="bi bi-calendar-range me-2"></i>Bank Funding Window
                                            </h6>
                                            <div className="row g-3">
                                                <div className="col-md-6">
                                                    <label className="form-label small">
                                                        First Disbursement (Month) <span className="text-danger fw-bold">*</span>
                                                    </label>
                                                    <input
                                                        type="number"
                                                        className="form-control"
                                                        value={propertyData.assumptions.bankDisbursementStartMonth}
                                                        placeholder={placeholders.bankDisbursementStartMonth}
                                                        onChange={(e) => handleAssumptionChange('bankDisbursementStartMonth', e.target.value)}
                                                    />
                                                </div>

                                                {/* Last Disbursement Field */}
                                                <div className="col-md-6">
                                                    <label className="form-label small">
                                                        Last Disbursement (Month) <span className="text-danger fw-bold">*</span>
                                                    </label>
                                                    <input
                                                        type="number"
                                                        className="form-control"
                                                        value={propertyData.assumptions.lastBankDisbursementMonth}
                                                        // Auto-suggest a value based on possession if empty
                                                        placeholder={`e.g. ${getSafeValue(propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.possessionMonths) - 6 || 24}`}
                                                        onChange={(e) => handleAssumptionChange('lastBankDisbursementMonth', e.target.value)}
                                                    />
                                                    <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                                                        Stops IDC growth (e.g. when structure is ready)
                                                    </small>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )
                            )
                        )}
                    </div>
                );
            case 3:
                return (
                    <div className='animate-fade-in'>
                        {renderAccordionSection(
                            'home_loan',
                            'Home Loan Details',
                            'bi-bank',
                            (
                                <div className="row g-3">
                                    {/* Column 1: Rate */}
                                    <div className="col-md-3">
                                        <label className="form-label small">
                                            Home Loan Rate <span className="text-danger fw-bold">*</span>
                                        </label>
                                        <div className="input-group input-group-sm">
                                            <input
                                                type="number"
                                                step="0.1"
                                                className="form-control"
                                                value={propertyData.assumptions.homeLoanRate}
                                                placeholder={placeholders.homeLoanRate}
                                                onChange={(e) => handleAssumptionChange('homeLoanRate', e.target.value)}
                                            />
                                            <span className="input-group-text bg-white text-muted">%</span>
                                        </div>
                                    </div>

                                    {/* Column 2: Term */}
                                    <div className="col-md-3">
                                        <label className="form-label">
                                            Loan Term (Years) <span className="text-danger fw-bold">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={propertyData.assumptions.homeLoanTerm}
                                            placeholder={placeholders.investmentPeriod}
                                            onChange={(e) => handleAssumptionChange('homeLoanTerm', e.target.value)}
                                        />
                                    </div>

                                    {/* Column 3: EMI Start Logic (Toggle & Inputs) */}
                                    <div className="col-md-3">
                                        <div className="d-flex justify-content-between align-items-center mb-1">
                                            <label className="form-label mb-0 small fw-bold">EMI Start Logic</label>

                                            {/* Mode Toggle Buttons */}
                                            <div className="btn-group btn-group-sm" role="group">
                                                <button
                                                    type="button"
                                                    className={`btn ${(!propertyData.assumptions.homeLoanStartMode || propertyData.assumptions.homeLoanStartMode === 'default') ? 'btn-primary' : 'btn-outline-secondary'}`}
                                                    onClick={() => handleAssumptionChange('homeLoanStartMode', 'default')}
                                                    style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
                                                >
                                                    Default
                                                </button>
                                                <button
                                                    type="button"
                                                    className={`btn ${propertyData.assumptions.homeLoanStartMode === 'manual' ? 'btn-primary' : 'btn-outline-secondary'}`}
                                                    onClick={() => handleAssumptionChange('homeLoanStartMode', 'manual')}
                                                    style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}
                                                >
                                                    Manual
                                                </button>
                                            </div>
                                        </div>

                                        {/* CONDITIONAL RENDER: Based on Mode */}
                                        {propertyData.assumptions.homeLoanStartMode === 'manual' ? (
                                            // Option B: MANUAL MODE
                                            <div className="mt-2">
                                                <input
                                                    type="number"
                                                    className="form-control form-control-sm"
                                                    value={propertyData.assumptions.homeLoanStartMonth}
                                                    placeholder="e.g. 25"
                                                    onChange={(e) => handleAssumptionChange('homeLoanStartMonth', e.target.value)}
                                                />
                                                <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                                                    Enter exact start month (e.g. 25)
                                                </small>
                                            </div>
                                        ) : (
                                            // Option A: DEFAULT MODE
                                            <div>
                                                {/* The Message */}
                                                <div className="alert border p-1 mb-2 text-center text-muted" style={{ fontSize: '0.70rem', color: '#666', lineHeight: '1.2' }}>
                                                    HL EMI may start after Last Demand (Constr. + Delay)
                                                </div>

                                                {/* The Slider */}
                                                <label className="form-label small text-muted mb-0" style={{ fontSize: '0.75rem' }}>
                                                    Delay: <strong>{propertyData.assumptions.homeLoanStartMonth} months</strong>
                                                </label>
                                                <input
                                                    type="range"
                                                    className="form-range"
                                                    min="0"
                                                    max="24" // Limit delay to 24 months
                                                    value={propertyData.assumptions.homeLoanStartMonth || 0}
                                                    onChange={(e) => handleAssumptionChange('homeLoanStartMonth', e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Column 4: Display Logic */}
                                    <div className="col-md-3">
                                        <div className="p-3 bg-light rounded h-100 d-flex flex-column justify-content-center border border-light">
                                            <small className="text-muted text-center" style={{ fontSize: '0.75rem' }}>Actual EMI Start</small>
                                            <div className="fw-bold text-center fs-5 ">
                                                Month {
                                                    propertyData.assumptions.homeLoanStartMode === 'manual'
                                                        ? (getSafeValue(propertyData.assumptions.homeLoanStartMonth))
                                                        : (
                                                            // Show calculated Result: Last Demand + Delay + 1
                                                            (() => {
                                                                const explicitLast = getSafeValue(propertyData.assumptions.lastBankDisbursementMonth);
                                                                const constrEnd = getSafeValue(propertyData.assumptions.clpDurationYears) * 12;
                                                                const possession = parseInt(propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.possessionMonths) || 0;

                                                                // Logic matches calculateFinancials
                                                                const base = propertyData.paymentPlan === 'clp'
                                                                    ? (explicitLast > 0 ? explicitLast : (constrEnd > 0 ? constrEnd : possession))
                                                                    : possession; // RTM uses possession

                                                                return base + getSafeValue(propertyData.assumptions.homeLoanStartMonth) + 1;
                                                            })()
                                                        )
                                                }
                                            </div>
                                            <small className="text-muted text-center" style={{ fontSize: '0.65rem' }}>
                                                {propertyData.assumptions.homeLoanStartMode === 'manual'
                                                    ? "(User Defined)"
                                                    : "(Last Demand + Delay + 1)"}
                                            </small>
                                        </div>
                                    </div>
                                </div>
                            )
                        )}
                        {/* Personal Loan 1 Details (Accordion) */}
                        {renderAccordionSection(
                            'pl1_details',
                            'Personal Loan 1 Details',
                            'bi-cash-coin',
                            (
                                <div className="row g-3">
                                    {/* Column 1: Share % */}
                                    <div className="col-md-3">
                                        <label className="form-label">Share of Total Cost (%)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={propertyData.assumptions.personalLoan1Share}
                                            onChange={(e) => handleAssumptionChange('personalLoan1Share', e.target.value)}
                                            placeholder={placeholders.investmentPeriod}
                                            disabled={propertyData.paymentPlan !== 'custom'}
                                        />
                                        {propertyData.paymentPlan !== 'custom' && (
                                            <small className="text-muted">Set by payment plan</small>
                                        )}
                                    </div>

                                    {/* Column 2: Calculated Amount */}
                                    <div className="col-md-3">
                                        <label className="form-label">Amount</label>
                                        <div className="form-control bg-light border-light text-secondary">
                                            {formatCurrency(
                                                (propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.size || 0) * getSafeValue(propertyData.purchasePrice) * (getSafeValue(propertyData.assumptions.personalLoan1Share) / 100)
                                            )}
                                        </div>
                                    </div>

                                    {/* Column 3: Interest Rate */}
                                    <div className="col-md-3">
                                        <label className="form-label">
                                            Personal Loan Rate (%) <span className="text-danger fw-bold">*</span>
                                        </label>
                                        <div className="input-group">
                                            <input
                                                type="number"
                                                step="0.1"
                                                className="form-control"
                                                value={propertyData.assumptions.personalLoan1Rate}
                                                placeholder={placeholders.personalLoan1Rate}
                                                onChange={(e) => handleAssumptionChange('personalLoan1Rate', e.target.value)}
                                            />
                                            <span className="input-group-text bg-white text-muted">%</span>
                                        </div>
                                    </div>

                                    {/* Column 4: Start Month Slider */}
                                    <div className="col-md-3">
                                        <label className="form-label d-flex justify-content-between">
                                            <span>Start Month</span>
                                            <span className="fw-bold">Month {propertyData.assumptions.personalLoan1StartMonth}</span>
                                        </label>
                                        <input
                                            type="range"
                                            className="form-range"
                                            min="0"
                                            max="84"
                                            value={propertyData.assumptions.personalLoan1StartMonth}
                                            onChange={(e) => handleAssumptionChange('personalLoan1StartMonth', e.target.value)}
                                        />
                                        <div className="d-flex justify-content-between">
                                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>Month 0</small>
                                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>Month 84</small>
                                        </div>
                                        <small className="text-muted d-block text-end mt-1" style={{ fontSize: '0.65rem' }}>Independent of possession</small>
                                    </div>
                                </div>
                            )
                        )}
                        {/* Personal Loan 2 Details (Accordion) */}
                        {renderAccordionSection(
                            'pl2_details',
                            'Personal Loan 2 Details',
                            'bi-cash-coin',
                            (
                                <div className="row g-3">
                                    {/* Column 1: Share % */}
                                    <div className="col-md-3">
                                        <label className="form-label">Share of Total Cost (%)</label>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={propertyData.assumptions.personalLoan2Share}
                                            onChange={(e) => handleAssumptionChange('personalLoan2Share', e.target.value)}
                                            placeholder={placeholders.investmentPeriod}
                                            disabled={propertyData.paymentPlan !== 'custom'}
                                        />
                                        {propertyData.paymentPlan !== 'custom' && (
                                            <small className="text-muted">Set by payment plan</small>
                                        )}
                                    </div>

                                    {/* Column 2: Calculated Amount */}
                                    <div className="col-md-3">
                                        <label className="form-label">Amount</label>
                                        <div className="form-control bg-light border-light text-secondary">
                                            {formatCurrency(
                                                (propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.size || 0) * getSafeValue(propertyData.purchasePrice) * (getSafeValue(propertyData.assumptions.personalLoan2Share) / 100)
                                            )}
                                        </div>
                                    </div>

                                    {/* Column 3: Interest Rate */}
                                    <div className="col-md-3">
                                        <label className="form-label">
                                            Personal Loan Rate (%) <span className="text-danger fw-bold">*</span>
                                        </label>
                                        <div className="input-group">
                                            <input
                                                type="number"
                                                step="0.1"
                                                className="form-control"
                                                value={propertyData.assumptions.personalLoan2Rate}
                                                placeholder={placeholders.personalLoan2Rate}
                                                onChange={(e) => handleAssumptionChange('personalLoan2Rate', e.target.value)}
                                                disabled={propertyData.assumptions.personalLoan2Share === 0}
                                            />
                                            <span className="input-group-text bg-white text-muted">%</span>
                                        </div>
                                        {propertyData.assumptions.personalLoan2Share === 0 && (
                                            <small className="text-muted">Not applicable (0% share)</small>
                                        )}
                                    </div>

                                    {/* Column 4: Start Month Slider */}
                                    <div className="col-md-3">
                                        <label className="form-label d-flex justify-content-between">
                                            <span>Start After <br></br>Possession</span>
                                            <span className="fw-bold text-muted">Delay: {propertyData.assumptions.personalLoan2StartMonth} mo</span>
                                        </label>
                                        <input
                                            type="range"
                                            className="form-range"
                                            min="0"
                                            max="36"
                                            value={propertyData.assumptions.personalLoan2StartMonth}
                                            onChange={(e) => handleAssumptionChange('personalLoan2StartMonth', e.target.value)}
                                            disabled={propertyData.assumptions.personalLoan2Share === 0}
                                        />
                                        <div className="d-flex justify-content-between">
                                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>+0 mo</small>
                                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>+36 mo</small>
                                        </div>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                );
            case 4:
                return (
                    <div>
                        <label className="form-label small text-muted">Expected Exit Price <span className="text-danger">*</span></label>
                        <input type="number" className="form-control form-control-sm mb-3" value={userSelections.selectedExitPrice} onChange={(e) => handleSelectionUpdate('selectedExitPrice', e.target.value)} />

                        <label className="form-label small text-muted">Add Scenarios</label>
                        <div className="d-flex gap-2 mb-3">
                            <button className="btn btn-outline-primary btn-sm flex-grow-1" onClick={handleAddExitPriceScenario}>+ Add Higher Price</button>
                        </div>
                        <div className="d-flex flex-wrap gap-2">
                            {userSelections.scenarioExitPrices.map((p, i) => (
                                <span key={i} className="badge bg-light text-dark border">₹{p}</span>
                            ))}
                        </div>
                    </div>
                );
            default: return null;
        }
    };

    // 1. Helper for the Progress Bars (Left Side)
    const renderFundingBar = (label, value, color) => (
        <div className="d-flex align-items-center mb-2">
            <div className={`bg-${color} me-2`} style={{ width: '15px', height: '15px', borderRadius: '3px' }}></div>
            <div className="flex-grow-1">
                <div className="d-flex justify-content-between mb-1">
                    <span className="small">{label}</span>
                    <span className="small">{formatPercent(value)}</span>
                </div>
                <div className="progress" style={{ height: '6px' }}>
                    <div className={`progress-bar bg-${color}`} style={{ width: `${value}%` }}></div>
                </div>
            </div>
        </div>
    );
    // 2. Helper for the Metric Boxes (Right Side)
    const renderMetricBox = (label, value, textClass = "") => (
        <div className="col-6">
            <div className="p-2 bg-light rounded h-100">
                <small className="text-muted">{label}</small>
                <div className={`fw-bold ${textClass}`}>{value}</div>
            </div>
        </div>
    );

    // Helper to render the large action buttons
    const renderActionBtn = (label, subtext, icon, tab, btnClass) => (
        <div className="col-6">
            <button
                className={`btn ${btnClass} w-100 py-3 d-flex align-items-center justify-content-center`}
                onClick={() => setActiveTab(tab)}
            >
                <i className={`bi ${icon} me-3 fs-5`}></i>
                <div className="text-start">
                    <div className="fw-bold">{label}</div>
                    <small className="opacity-75">{subtext}</small>
                </div>
            </button>
        </div>
    );
    // Helper: Strategy Comparison Card (Theme Adaptive)
    const renderStrategyComparison = () => {
        // 1. GET DATA
        const breakdown = calculatedData.detailedBreakdown;
        const { assumptions, paymentPlan } = propertyData;

        // 🛑 GUARD CLAUSE: Only show for CLP
        if (paymentPlan !== 'clp') return null;

        // Safety check
        if (!breakdown || !breakdown.homeLoanAmount) return null;

        const hlAmount = breakdown.homeLoanAmount;
        const rate = assumptions.homeLoanRate;
        const tenure = assumptions.homeLoanTerm;
        const possession = breakdown.possessionMonths;
        const fullEMI = calculateEMI(hlAmount, rate, tenure);

        // --- SIMULATION A: STANDARD CLP ---
        let standardTotalPaid = 0;
        let cumulativeDisbursement = 0;

        const slabCount = breakdown.idcSchedule?.length || 6;
        const slabAmount = hlAmount / slabCount;
        const disbursementInterval = assumptions.bankDisbursementInterval || 3;

        for (let m = 1; m <= possession; m++) {
            if (m % disbursementInterval === 0 && cumulativeDisbursement < hlAmount) {
                cumulativeDisbursement += slabAmount;
                if (cumulativeDisbursement > hlAmount) cumulativeDisbursement = hlAmount;
            }
            standardTotalPaid += (cumulativeDisbursement * (rate / 100)) / 12;
        }
        const standardBalance = hlAmount;

        // --- SIMULATION B: SMART SAVER ---
        let manualTotalPaid = 0;
        let manualPrincipalPaid = 0;
        let manualLoanBalance = 0;
        cumulativeDisbursement = 0;

        for (let m = 1; m <= possession; m++) {
            if (m % disbursementInterval === 0 && cumulativeDisbursement < hlAmount) {
                cumulativeDisbursement += slabAmount;
                manualLoanBalance += slabAmount;
                if (cumulativeDisbursement > hlAmount) cumulativeDisbursement = hlAmount;
            }
            const monthlyInterest = (manualLoanBalance * (rate / 100)) / 12;
            const principalComponent = fullEMI - monthlyInterest;

            manualLoanBalance -= principalComponent;
            manualPrincipalPaid += principalComponent;
            manualTotalPaid += fullEMI;
        }
        const profit = manualPrincipalPaid;

        // --- MOBILE UI RETURN ---
        return (
            <div className="mb-5 px-1">
                <div className="text-center mb-4">
                    <h6 className="fw-bold gradient-text">
                        <i className="bi bi-arrow-left-right me-2"></i>
                        Compare Payment Plans
                    </h6>
                </div>

                <div className="d-flex flex-column gap-3" style={{ maxWidth: '600px', margin: '0 auto' }}>

                    {/* OPTION 1: Standard Plan (Looks like unselected radio) */}
                    <div className="p-3 rounded-4 border border-secondary border-opacity-25 bg-white shadow-sm position-relative">
                        <div className="d-flex justify-content-between align-items-start">
                            <div className="d-flex gap-3">
                                {/* Radio Icon */}
                                <div className="mt-1">
                                    <i className="bi bi-circle text-muted fs-4"></i>
                                </div>
                                {/* Content */}
                                <div>
                                    <h6 className="fw-bold text-dark mb-1">Standard CLP</h6>
                                    <p className="text-muted small mb-2" style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
                                        Lower monthly burden. Best for cash flow management.
                                    </p>
                                    {/* Key Stat */}
                                    <div className="d-inline-block bg-light px-2 py-1 rounded border border-light">
                                        <small className="text-muted fw-bold" style={{ fontSize: '0.7rem' }}>Bal: {formatLakhs(standardBalance)}</small>
                                    </div>
                                </div>
                            </div>

                            {/* Price */}
                            <div className="text-end">
                                <span className="fw-bold d-block text-dark">{formatCurrency(standardTotalPaid)}</span>
                                <small className="text-muted" style={{ fontSize: '0.65rem' }}>Paid till Poss.</small>
                            </div>
                        </div>
                    </div>

                    {/* OPTION 2: Smart Saver (Looks like Selected/Recommended radio) */}
                    <div className="p-3 rounded-4 border border-primary bg-primary bg-opacity-10 shadow-sm position-relative">
                        {/* Recommended Badge */}
                        <div className="position-absolute top-0 end-0 mt-2 me-2">
                            <span className="badge bg-primary text-white" style={{ fontSize: '0.6rem' }}>RECOMMENDED</span>
                        </div>

                        <div className="d-flex justify-content-between align-items-start pt-3">
                            <div className="d-flex gap-3">
                                {/* Checked Radio Icon */}
                                <div className="mt-1">
                                    <i className="bi bi-check-circle-fill text-primary fs-4"></i>
                                </div>
                                {/* Content */}
                                <div>
                                    <h6 className="fw-bold text-primary mb-1">Smart Saver (Full EMI)</h6>
                                    <p className="text-primary text-opacity-75 small mb-2" style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>
                                        Massive principal reduction. Saves interest long-term.
                                    </p>
                                    {/* Key Stat */}
                                    <div className="d-inline-block bg-white px-2 py-1 rounded border border-primary border-opacity-25">
                                        <small className="text-success fw-bold" style={{ fontSize: '0.7rem' }}>Bal: {formatLakhs(hlAmount - profit)}</small>
                                    </div>
                                </div>
                            </div>

                            {/* Price */}
                            <div className="text-end align-self-center mt-4">
                                <span className="fw-bold d-block text-primary">{formatCurrency(manualTotalPaid)}</span>
                                <small className="text-primary text-opacity-75" style={{ fontSize: '0.65rem' }}>Paid till Poss.</small>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        );
    };

    const RenderEmptyState = ({ title, message }) => (
        <div className="d-flex flex-column align-items-center justify-content-center text-center py-5 mt-5">
            <div className="glass-card mb-4 ps-4 mt-4 pt-4">
                <div className="mb-4 text-muted opacity-50">
                    <i className="bi bi-clipboard-data" style={{ fontSize: '4rem' }}></i>
                </div>
                <h3 className="fw-bold text-secondary mb-3">{title}</h3>
                <p className="text-muted mb-4">{message}</p>

                <button
                    className="btn btn-primary rounded-pill px-4 py-2 shadow-sm scale-hover"
                    onClick={() => setActiveTab('inputs')}
                >
                    <i className="bi bi-pencil-square me-2"></i>
                    Start Your Analysis
                </button>
            </div>
        </div>
    );

    // 3. TAB CONTENT
    const renderOverviewTab = () => {
        const breakdown = calculatedData.detailedBreakdown;

        // 1. Loading State
        if (!breakdown) {
            return (
                <div className="text-center py-5">
                    <div className="spinner-border text-primary mb-3" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                    <p>Calculating analysis... Please wait.</p>
                    <button
                        className="btn btn-outline-primary mt-3"
                        onClick={() => setActiveTab('inputs')}
                    >
                        <i className="bi bi-arrow-left me-2"></i>
                        Go Back to Inputs
                    </button>
                </div>
            );
        }
        if (breakdown.totalCost === 0) {
            return (
                <RenderEmptyState
                    title="No Analysis Generated Yet"
                    message="It looks like you haven't entered any property details. Head over to the Input Parameters tab to configure your investment model."
                />
            );
        }

        // 2. Main Overview Content
        return (
            <div className="mb-5">

                {/* Success Alert */}
                {showDataEnteredAlert && (
                    <div className="alert alert-success alert-dismissible fade show glass-card mb-4" role="alert">
                        <div className="d-flex align-items-center">
                            <i className="bi bi-check-circle-fill fs-4 me-3"></i>
                            <div>
                                <strong>Analysis Complete!</strong>
                                <p className="mb-0 small">Your property data has been analyzed. View results below.</p>
                            </div>
                        </div>
                        <button type="button" className="btn-close" onClick={() => setShowDataEnteredAlert(false)}></button>
                    </div>
                )}

                {/* Header Section */}
                {/* Header Section (Responsive Action Bar) */}
                <div className="glass-card mb-4 p-3">
                    <div className="d-flex justify-content-between align-items-center">

                        {/* Left Side: Title */}
                        <div className="d-flex align-items-center">
                            <div className="rounded-circle bg-primary bg-opacity-10 p-2 me-3 d-flex align-items-center justify-content-center" style={{ width: '45px', height: '45px' }}>
                                <i className="bi bi-speedometer2 text-primary fs-4"></i>
                            </div>
                            <div>
                                <h5 className="fw-bold mb-0">Analysis Report</h5>
                                <small className="text-muted d-none d-sm-block">Generated on {new Date().toLocaleDateString()}</small>
                            </div>
                        </div>

                        {/* Right Side: Action Buttons */}
                        <div className="d-flex gap-2">
                            {/* 1. Excel Button */}
                            <button
                                className="btn btn-outline-success btn-sm d-flex align-items-center shadow-sm"
                                onClick={handleExportExcel}
                                title="Export to Excel"
                            >
                                <i className="bi bi-file-earmark-spreadsheet fs-5"></i>
                                <span className="d-none d-md-inline ms-2 fw-bold">Excel</span>
                            </button>

                            {/* 2. Print/PDF Button */}
                            <button
                                className="btn btn-outline-secondary btn-sm d-flex align-items-center shadow-sm"
                                onClick={handlePrintReport}
                                title="Save as PDF"
                            >
                                <i className="bi bi-printer fs-5"></i>
                                <span className="d-none d-md-inline ms-2 fw-bold">Print</span>
                            </button>

                            {/* 3. Edit Button */}
                            <button
                                className="btn btn-primary btn-sm d-flex align-items-center shadow-sm"
                                onClick={() => setActiveTab('inputs')}
                                title="Edit Inputs"
                            >
                                <i className="bi bi-pencil-square fs-5"></i>
                                <span className="d-none d-md-inline ms-2 fw-bold">Edit</span>
                            </button>
                        </div>

                    </div>
                </div>

                {/* 1. Quick Stats Row */}
                <div style={{ maxWidth: '768px', margin: '0 auto' }}>
                    {/* 2x2 Grid Layout (Consolidated Card Style) */}
                    <div className="card border-0 shadow-sm mb-4 overflow-hidden" style={{ borderRadius: '16px' }}>
                        <div className="row g-0">

                            {/* 1. Total Cost (Top Left) */}
                            <div className="col-6 p-3 border-end border-bottom text-center">
                                <i className="bi bi-cash-stack fs-3 text-primary mb-2 d-block"></i>
                                <small className="text-muted fw-bold d-block mb-1" style={{ fontSize: '0.7rem' }}>Total Cost</small>
                                <h5 className="fw-bold mb-0 text-dark">{formatLakhs(breakdown.totalCost)}</h5>
                            </div>

                            {/* 2. Net Profit (Top Right) - Swapped Holding Period for Profit to match Image */}
                            <div className="col-6 p-3 border-bottom text-center">
                                <i className={`bi bi-graph-up-arrow fs-3 mb-2 d-block ${breakdown.netGainLoss >= 0 ? 'text-success' : 'text-danger'}`}></i>
                                <small className="text-muted fw-bold d-block mb-1" style={{ fontSize: '0.7rem' }}>Net Profit</small>
                                <h5 className={`fw-bold mb-0 ${breakdown.netGainLoss >= 0 ? 'text-success' : 'text-danger'}`}>
                                    {formatLakhs(breakdown.netGainLoss)}
                                </h5>
                            </div>

                            {/* 3. ROI (Bottom Left) */}
                            <div className="col-6 p-3 border-end text-center">
                                <div className="d-flex align-items-center justify-content-center mb-2">
                                    <i className="bi bi-percent fs-3 text-primary"></i>
                                </div>
                                <small className="text-muted fw-bold d-block mb-1" style={{ fontSize: '0.7rem' }}>ROI</small>
                                <h5 className="fw-bold mb-0 text-primary">{formatPercent(breakdown.roi)}</h5>
                                {/* Optional: Show Exit Price if needed */}
                                {/* <small className="text-muted d-block" style={{fontSize: '0.6rem'}}>@ ₹{breakdown.exitPrice}</small> */}
                            </div>

                            {/* 4. Cash After Sale (Bottom Right) */}
                            <div className="col-6 p-3 text-center">
                                <i className="bi bi-wallet2 fs-3 text-info mb-2 d-block"></i>
                                <small className="text-muted fw-bold d-block mb-1" style={{ fontSize: '0.7rem' }}>Cash-in-Hand</small>
                                <h5 className="fw-bold mb-0 text-dark">{formatLakhs(breakdown.leftoverCash)}</h5>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. STAGE WISE BREAKDOWN (Moved Here) */}
                {calculatedData.stageCalculations && (
                    <div className="glass-card mb-5 p-4">
                        <h6 className="mb-3 fw-bold text-secondary d-flex align-items-center">
                            <i className="bi bi-layers-half me-2"></i>
                            Stage-wise Breakdown
                        </h6>
                        {/* Stage 1: Cost (Primary/Blue) */}
                        <div className="mb-3 pb-3 border-bottom border-secondary border-opacity-10">
                            <div className="d-flex align-items-center mb-2">
                                <div className="rounded-circle bg-primary bg-opacity-10 p-1 me-2 d-flex justify-content-center align-items-center" style={{ width: '24px', height: '24px' }}>
                                    <i className="bi bi-tag-fill text-primary" style={{ fontSize: '0.7rem' }}></i>
                                </div>
                                <span className="fw-bold small text-primary">Stage 1: Cost</span>
                            </div>
                            <div className="ps-4 ms-1 border-start border-primary border-opacity-25">
                                <ul className="list-unstyled mb-0 ps-3">
                                    {calculatedData.stageCalculations.stage1.items.map((item, idx) => (
                                        <li key={idx} className="d-flex justify-content-between mb-1">
                                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>{item.label}</span>
                                            <span className="fw-bold text-dark" style={{ fontSize: '0.75rem' }}>{item.value}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Stage 2: Funding (Success/Green) */}
                        <div className="mb-3 pb-3 border-bottom border-secondary border-opacity-10">
                            <div className="d-flex align-items-center mb-2">
                                <div className="rounded-circle bg-success bg-opacity-10 p-1 me-2 d-flex justify-content-center align-items-center" style={{ width: '24px', height: '24px' }}>
                                    <i className="bi bi-pie-chart-fill text-success" style={{ fontSize: '0.7rem' }}></i>
                                </div>
                                <span className="fw-bold small text-success">Stage 2: Funding</span>
                            </div>
                            <div className="ps-4 ms-1 border-start">
                                <ul className="list-unstyled mb-0 ps-3">
                                    {calculatedData.stageCalculations.stage2.items.map((item, idx) => (
                                        <li key={idx} className="d-flex justify-content-between mb-1">
                                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>{item.label}</span>
                                            <span className="fw-bold text-dark" style={{ fontSize: '0.75rem' }}>{item.value}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Stage 3: Monthly (Warning/Yellow) */}
                        <div className="mb-3 pb-3 border-bottom border-secondary border-opacity-10">
                            <div className="d-flex align-items-center mb-2">
                                <div className="rounded-circle bg-warning bg-opacity-10 p-1 me-2 d-flex justify-content-center align-items-center" style={{ width: '24px', height: '24px' }}>
                                    <i className="bi bi-calculator-fill text-warning" style={{ fontSize: '0.7rem' }}></i>
                                </div>
                                <span className="fw-bold small text-warning">Stage 3: Monthly</span>
                            </div>
                            <div className="ps-4 ms-1 border-start">
                                <ul className="list-unstyled mb-0 ps-3">
                                    {calculatedData.stageCalculations.stage3.items.map((item, idx) => (
                                        <li key={idx} className="d-flex justify-content-between mb-1">
                                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>{item.label}</span>
                                            <span className="fw-bold text-dark" style={{ fontSize: '0.75rem' }}>{item.value}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* Stage 4: Exit (Info/Blue) - No Bottom Border */}
                        <div>
                            <div className="d-flex align-items-center mb-2">
                                <div className="rounded-circle bg-info bg-opacity-10 p-1 me-2 d-flex justify-content-center align-items-center" style={{ width: '24px', height: '24px' }}>
                                    <i className="bi bi-door-open-fill text-info" style={{ fontSize: '0.7rem' }}></i>
                                </div>
                                <span className="fw-bold small text-info">Stage 4: Exit</span>
                            </div>
                            <div className="ps-4 ms-1 border-start">
                                <ul className="list-unstyled mb-0 ps-3">
                                    {calculatedData.stageCalculations.stage4.items.map((item, idx) => (
                                        <li key={idx} className="d-flex justify-content-between mb-1">
                                            <span className="text-muted" style={{ fontSize: '0.75rem' }}>{item.label}</span>
                                            <span className="fw-bold text-dark" style={{ fontSize: '0.75rem' }}>{item.value}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Profit Chart */}
                {renderProfitChart(calculatedData.profits)}

                {/* Multiple Exit Price Scenarios */}
                <div style={{ maxWidth: '768px', margin: '0 auto' }}>
                    <div className="row m-1">
                        <div className="col-12">

                            {/* ✅ CHANGED: Replaced 'p-3 bg-light rounded' with 'glass-card' */}
                            <div className="glass-card mb-5 p-4">

                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <h6 className="mb-0 fw-bold small">
                                        <i className="bi bi-bar-chart me-2"></i>
                                        Multiple Exit Price Scenarios
                                    </h6>
                                    <span className="badge bg-primary">
                                        {calculatedData.multipleScenarios?.length || 0} scenarios
                                    </span>
                                </div>

                                <div className="table-responsive">
                                    <table className="table table-bordered table-hover mb-0">
                                        <thead className='small'>
                                            <tr>
                                                <th>Scenario</th>
                                                <th>Exit Price (₹/sq.ft)</th>
                                                <th>Sale Value</th>
                                                <th>Leftover Cash</th>
                                                <th>Net Profit/Loss</th>
                                                <th>ROI</th>
                                            </tr>
                                        </thead>
                                        <tbody className='small'>
                                            {calculatedData.multipleScenarios?.map((scenario, index) => (
                                                <tr key={index} className={scenario.exitPrice === userSelections.selectedExitPrice ? 'table-primary' : ''}>
                                                    <td>Scenario {index + 1}</td>
                                                    <td>
                                                        <strong>₹{scenario.exitPrice}</strong>
                                                        {scenario.exitPrice === userSelections.selectedExitPrice && (
                                                            <span className="badge bg-primary ms-2">Selected</span>
                                                        )}
                                                    </td>
                                                    <td>{formatLakhs(scenario.saleValue)}</td>
                                                    <td className={scenario.leftoverCash >= 0 ? 'text-success' : 'text-danger'}>
                                                        {formatLakhs(scenario.leftoverCash)}
                                                    </td>
                                                    <td className={scenario.netProfit >= 0 ? 'text-success' : 'text-danger'}>
                                                        {formatLakhs(scenario.netProfit)}
                                                    </td>
                                                    <td className={scenario.roi >= 0 ? 'text-success' : 'text-danger'}>
                                                        {formatPercent(scenario.roi)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>

                {/* 5. Payment Plan Summary */}
                <div className="glass-card mb-5 pt-3 ps-3 pe-3">
                    <h5 className="mb-4 ps-2 fw-bold">
                        <i className="bi bi-pie-chart me-2"></i>
                        Payment Plan Breakdown
                    </h5>
                    <div className="row">
                        <div className="col-md-4 mb-4 mb-md-0">
                            <div className="p-2">
                                <h6 className="mb-3 opacity-75">Funding Distribution</h6>
                                {renderFundingBar("Home Loan", breakdown.homeLoanShare, "primary")}
                                {breakdown.hasDownPayment && renderFundingBar("Down Payment", breakdown.downPaymentShare, "info")}
                                {breakdown.hasPersonalLoan1 && renderFundingBar("Personal Loan 1", breakdown.personalLoan1Share, "success")}
                                {breakdown.hasPersonalLoan2 && renderFundingBar("Personal Loan 2", breakdown.personalLoan2Share, "warning")}
                            </div>
                        </div>
                        <div className="col-md-8">
                            <div className="p-2">
                                <h6 className="mb-3 opacity-75">Key Metrics</h6>
                                <div className="row g-2">
                                    {renderMetricBox("Monthly EMI", formatCurrency(breakdown.homeLoanEMI + breakdown.personalLoan1EMI + breakdown.personalLoan2EMI))}
                                    {renderMetricBox("Cash Invested", formatLakhs(breakdown.totalCashInvested))}
                                    {renderMetricBox("Interest Paid", formatLakhs(breakdown.totalInterestPaid))}
                                    {renderMetricBox("Net Position", formatLakhs(breakdown.netGainLoss), breakdown.netGainLoss >= 0 ? 'text-success' : 'text-danger')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 6. Key Insights */}
                {renderKeyInsights(breakdown)}

                <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
                    {renderStrategyComparison()}
                </div>

                {/* 7. Action Buttons */}
                <div style={{ maxWidth: '768px', margin: '0 auto' }}>
                    <div className="row g-2 pb-4">
                        {renderActionBtn("Breakdown", "", "bi-calculator", "breakdown", "btn-primary")}
                        {renderActionBtn("Edit ", "", "bi-pencil-square", "inputs", "btn-outline-primary")}
                    </div>
                </div>
            </div>
        );
    };
    // 1. Helper for the small EMI Component boxes (inner grid)
    const renderComponentBox = (label, value, colSize = 6, bgClass = "bg-white", textClass = "") => (
        <div className={`col-${colSize}`}>
            <div className={`p-2 border rounded ${bgClass}`}>
                <small className="text-muted d-block">{label}</small>
                <div className={`fw-bold ${textClass}`}>{value}</div>
            </div>
        </div>
    );

    // 2. Loan Section Generator (Handles Home Loan, PL1, and PL2)
    const renderLoanSection = (title, icon, color, emi, paid, interest, outstanding, count, paymentsLabel) => (
        <div className="row mb-4 ps-3 pe-3">
            <div className="col-12">
                <h5 className="mb-3">
                    <i className={`bi ${icon} text-${color} me-2`}></i>
                    {title}
                </h5>
                <div className="row g-3">
                    {renderStatCard("Total EMI per Month", emi, "Monthly payment", "primary", 3)}
                    {renderStatCard("Total EMI Paid", paid, `${count} payments made`, "success", 3)}
                    {renderStatCard("Total Interest Paid", interest, `Over ${paymentsLabel || count} months`, "warning", 3)}
                    {renderStatCard("Total EMI Due", outstanding, "Outstanding balance", "danger", 3)}
                </div>
            </div>
        </div>
    );

    // 3. Wide Banner Generator (For Interest, Sale, Net Position)
    const renderBanner = (title, value, subtext, color, icon, extraContent = null) => (
        <div className="row mb-4 ps-3 pe-3">
            <div className="col-12">
                <h5 className="mb-3">
                    <i className={`bi ${icon} text-${color} me-2`}></i>
                    {title}
                </h5>
                <div className={`p-3 bg-${color} text-white rounded shadow-sm`}>
                    <div className="d-flex justify-content-between align-items-center">
                        <div>
                            <h4 className="fw-bold mb-1">{value}</h4>
                            <small className="text-white">{subtext}</small>
                        </div>
                        {extraContent}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderBreakdownTab = () => {
        const breakdown = calculatedData.detailedBreakdown;

        if (!breakdown) {
            return (
                <div className="text-center py-5">
                    <div className="spinner-border text-primary mb-3" role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                    <p>Loading detailed breakdown...</p>
                    <button
                        className="btn btn-outline-primary mt-3 rounded-pill px-4"
                        onClick={() => setActiveTab('overview')}
                    >
                        <i className="bi bi-arrow-left me-2"></i>
                        Back to Overview
                    </button>
                </div>
            );
        }
        if (breakdown.totalCost === 0) {
            return (
                <RenderEmptyState
                    title="No Calculation Yet"
                    message="Please enter property details in the Inputs tab to generate this report."
                />
            );
        }

        // ✅ MOBILE OPTIMIZED LAYOUT
        return (
            <div className="mb-5 pb-5"> {/* Added pb-5 for bottom nav spacing */}

                {/* 1. Header Section */}
                <div className="glass-card mb-4 p-3">
                    <div className="d-flex align-items-center">
                        <div className="rounded-circle bg-primary bg-opacity-10 p-3 me-3">
                            <i className="bi bi-calculator text-primary fs-3"></i>
                        </div>
                        <div>
                            <h5 className="fw-bold mb-1">Detailed Breakdown</h5>
                            <small className="text-muted">Financial Details & Schedules</small>
                        </div>
                    </div>
                </div>

                {/* 2. Monthly EMI Timeline */}
                <div className="mb-4">
                    <h6 className="fw-bold text-secondary mb-3 ps-2 border-start">
                        EMI Timeline
                    </h6>

                    <div className="d-flex flex-column gap-3">
                        {/* Timeline 1: Pre-Possession */}
                        {renderTimelineCard(
                            "Phase 1: Pre-Possession",
                            "bi-calendar-week",
                            "primary",
                            formatCurrency(breakdown.prePossessionTotal),
                            `Months 0 - ${breakdown.prePossessionMonths}`,
                            `${breakdown.prePossessionMonths} mo`,
                            <>
                                {/* PL1 Card */}
                                <div className="col-12 mt-2">
                                    <div
                                        className="p-3 rounded border bg-white shadow-sm"
                                        onClick={() => handleDelayedNavigation('/monthly-breakdown', { /* ... pass params ... */ }, "Loading Schedule...")}
                                    >
                                        <div className="d-flex justify-content-between align-items-center">
                                            <div>
                                                <small className="text-muted d-block">Personal Loan 1</small>
                                                <span className="fw-bold text-primary">{formatCurrency(breakdown.personalLoan1EMI)}</span>
                                            </div>
                                            <i className="bi bi-chevron-right text-muted"></i>
                                        </div>
                                    </div>
                                </div>

                                {/* IDC Card */}
                                {breakdown.hasIDC && (
                                    <div className="col-12 mt-2">
                                        <div
                                            className="p-3 rounded border bg-white shadow-sm"
                                            onClick={() => handleDelayedNavigation('/schedule', { /* ... pass params ... */ }, "Loading IDC...")}
                                        >
                                            <div className="d-flex justify-content-between align-items-center mb-2">
                                                <small className="text-muted">IDC (Interest)</small>
                                                <i className="bi bi-chevron-right text-muted"></i>
                                            </div>
                                            <div className="d-flex justify-content-between text-center small">
                                                <div>
                                                    <span className="d-block text-muted" style={{ fontSize: '0.65rem' }}>Start</span>
                                                    <span className="fw-bold">{formatCurrency(breakdown.minIDCEMI)}</span>
                                                </div>
                                                <div className="border-start border-end px-3">
                                                    <span className="d-block text-muted" style={{ fontSize: '0.65rem' }}>Avg</span>
                                                    <span className="fw-bold text-primary">{formatCurrency(breakdown.monthlyIDCEMI)}</span>
                                                </div>
                                                <div>
                                                    <span className="d-block text-muted" style={{ fontSize: '0.65rem' }}>Peak</span>
                                                    <span className="fw-bold text-danger">{formatCurrency(breakdown.maxIDCEMI)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>,
                            formatCurrency(breakdown.prePossessionTotal),
                            `Total Paid: ${formatCurrency(breakdown.prePossessionTotal)}`,
                            "Total Outflow",
                            null
                        )}

                        {/* Timeline 2: Post-Possession */}
                        {breakdown.postPossessionMonths > 0 ? (
                            renderTimelineCard(
                                "Phase 2: Post-Possession",
                                "bi-calendar-check",
                                "success",
                                `${formatCurrency(breakdown.postPossessionEMI)}/mo`,
                                `Months ${breakdown.possessionMonths + 1} - ${breakdown.totalHoldingMonths}`,
                                `${breakdown.postPossessionMonths} mo`,
                                <div className="row g-2 mt-1">
                                    {renderComponentBox("Home Loan", formatCurrency(breakdown.homeLoanEMI), 6)}
                                    {renderComponentBox("PL 1", formatCurrency(breakdown.personalLoan1EMI), 6)}
                                    {breakdown.hasPersonalLoan2 && renderComponentBox("PL 2", formatCurrency(breakdown.personalLoan2EMI), 12)}
                                </div>,
                                formatCurrency(breakdown.postPossessionTotal),
                                "Total during holding period"
                            )
                        ) : (
                            <div className="alert alert-secondary d-flex align-items-center mb-0">
                                <i className="bi bi-info-circle me-3 fs-4"></i>
                                <small className="lh-sm">Investment exit planned before Phase 2 starts.</small>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Interest During Construction (Simplified) */}
                {breakdown.hasIDC && (
                    <div className="glass-card mb-4 p-3">
                        <h6 className="fw-bold text-muted mb-3">
                            <i className="bi bi-tools me-2"></i>IDC Summary
                        </h6>
                        <div className="row g-2">
                            {renderStatCard("Avg Monthly", formatCurrency(breakdown.monthlyIDCEMI), "", "warning", 6)}
                            {renderStatCard("Total Interest", formatCurrency(breakdown.totalIDC), "Construction Phase", "danger", 6)}
                        </div>
                    </div>
                )}

                {/* 4. Loan Analysis Grids (2x2 for Mobile) */}
                <div className="mb-4">
                    <h6 className="fw-bold text-primary mb-3 ps-2 border-start border-4 border-primary">
                        Loan Analysis
                    </h6>

                    {/* Home Loan */}
                    <div className="glass-card p-3 mb-3">
                        <h6 className="small fw-bold text-muted mb-3 text-uppercase">Home Loan Breakdown</h6>
                        <div className="row g-2">
                            {renderStatCard("EMI Amount", formatCurrency(breakdown.homeLoanEMI), "Monthly", "primary", 6)}
                            {renderStatCard("Total Paid", formatCurrency(breakdown.homeLoanEMIPaid), "Principal + Int", "success", 6)}
                            {renderStatCard("Interest Only", formatCurrency(breakdown.homeLoanInterestPaid), "Cost of Loan", "warning", 6)}
                            {renderStatCard("Balance Due", formatCurrency(breakdown.homeLoanOutstanding), "To Close", "danger", 6)}
                        </div>
                    </div>

                    {/* Personal Loans (Conditional) */}
                    {(breakdown.hasPersonalLoan1 || breakdown.hasPersonalLoan2) && (
                        <div className="glass-card p-3">
                            <h6 className="small fw-bold text-muted mb-3 text-uppercase">Personal Loans</h6>
                            <div className="row g-2">
                                {breakdown.hasPersonalLoan1 && renderStatCard("PL1 Total Paid", formatCurrency(breakdown.personalLoan1EMIPaid), "Loan 1", "info", 6)}
                                {breakdown.hasPersonalLoan2 && renderStatCard("PL2 Total Paid", formatCurrency(breakdown.personalLoan2EMIPaid), "Loan 2", "info", 6)}
                            </div>
                        </div>
                    )}
                </div>

                {/* 5. Final Financial Summaries */}
                <div className="glass-card mb-4 p-3 border-warning">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <h6 className="fw-bold mb-0">Total Interest Cost</h6>
                        <span className="badge bg-warning text-dark">{breakdown.years} Years</span>
                    </div>
                    <h2 className="fw-bold text-dark mb-0">{formatLakhs(breakdown.totalInterestPaid)}</h2>
                    {breakdown.hasIDC && <small className="text-muted">Includes construction interest</small>}
                </div>

                <div className="glass-card mb-4 p-3 border-2 border-success">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <h6 className="fw-bold mb-0">Projected Cash Exit</h6>
                        <span className="badge bg-success">@ ₹{breakdown.exitPrice}</span>
                    </div>
                    <h2 className="fw-bold text-success mb-0">{formatLakhs(breakdown.leftoverCash)}</h2>
                    <small className="text-muted">Cash in hand after loan closure</small>
                </div>

                {/* 6. Net Profit Banner */}
                <div className={`p-4 rounded-3 text-center text-white shadow-sm ${breakdown.netGainLoss >= 0 ? 'bg-success' : 'bg-danger'}`}>
                    <small className="text-uppercase opacity-75 fw-bold">Net Position</small>
                    <h1 className="fw-bold my-2">{formatLakhs(Math.abs(breakdown.netGainLoss))}</h1>
                    <div className="badge bg-white text-muted bg-opacity-50 px-3 py-1 rounded-pill">
                        {breakdown.netGainLoss >= 0 ? 'NET PROFIT' : 'NET LOSS'}
                    </div>
                </div>

            </div>
        );
    };

    // 4. BOTTOM NAVIGATION (Dark Blue in Dark Mode)
    const renderBottomNav = () => (
        <div 
            className="fixed-bottom shadow-lg pb-safe-area mobile-bottom-nav" 
            style={{ 
                zIndex: 1050, 
                transition: 'background-color 0.3s ease, border-color 0.3s ease'
            }} 
        >
            <div className="d-flex justify-content-around py-2">
                
                {/* 1. INPUTS TAB */}
                <button
                    type="button"
                    className="btn btn-link text-decoration-none p-1"
                    onClick={() => setActiveTab('inputs')}
                    style={{ minWidth: '70px' }} 
                >
                    {activeTab === 'inputs' ? (
                        <div className="d-flex flex-column align-items-center animate-fade-in">
                            <span className="badge rounded-pill bg-primary px-3 py-1 mb-1 shadow-sm">
                                <i className="bi bi-sliders fs-6 text-white"></i>
                            </span>
                            <span className="text-primary fw-bold" style={{ fontSize: '0.7rem' }}>Inputs</span>
                        </div>
                    ) : (
                        <div 
                            className="d-flex flex-column align-items-center opacity-75 nav-item-inactive"
                        >
                            <i className="bi bi-sliders fs-5 mb-1"></i>
                            <span style={{ fontSize: '0.7rem' }}>Inputs</span>
                        </div>
                    )}
                </button>

                {/* 2. OVERVIEW TAB */}
                <button
                    type="button"
                    className="btn btn-link text-decoration-none p-1"
                    onClick={() => setActiveTab('overview')}
                    style={{ minWidth: '70px' }}
                >
                    {activeTab === 'overview' ? (
                        <div className="d-flex flex-column align-items-center animate-fade-in">
                            <span className="badge rounded-pill bg-primary px-3 py-1 mb-1 shadow-sm">
                                <i className="bi bi-speedometer2 fs-6 text-white"></i>
                            </span>
                            <span className="text-primary fw-bold" style={{ fontSize: '0.7rem' }}>Overview</span>
                        </div>
                    ) : (
                        <div 
                            className="d-flex flex-column align-items-center opacity-75 nav-item-inactive"
                        >
                            <i className="bi bi-speedometer2 fs-5 mb-1"></i>
                            <span style={{ fontSize: '0.7rem' }}>Overview</span>
                        </div>
                    )}
                </button>

                {/* 3. DETAILS TAB */}
                <button
                    type="button"
                    className="btn btn-link text-decoration-none p-1"
                    onClick={() => setActiveTab('breakdown')}
                    style={{ minWidth: '70px' }}
                >
                    {activeTab === 'breakdown' ? (
                        <div className="d-flex flex-column align-items-center animate-fade-in">
                            <span className="badge rounded-pill bg-primary px-3 py-1 mb-1 shadow-sm">
                                <i className="bi bi-calculator-fill fs-6 text-white"></i>
                            </span>
                            <span className="text-primary fw-bold" style={{ fontSize: '0.7rem' }}>Details</span>
                        </div>
                    ) : (
                        <div 
                            className="d-flex flex-column align-items-center opacity-75 nav-item-inactive"
                        >
                            <i className="bi bi-calculator fs-5 mb-1"></i>
                            <span style={{ fontSize: '0.7rem' }}>Details</span>
                        </div>
                    )}
                </button>

            </div>
        </div>
    );

    // --- MAIN RENDER ---
    return (
        <div className="property-comparison-mobile bg-light min-vh-100">

            {/* Content Area */}
            <div className="container-fluid pt-3">
                {activeTab === 'inputs' && renderMobileStepper()}
                {activeTab === 'overview' && renderOverviewTab()}
                {activeTab === 'breakdown' && renderBreakdownTab()}
            </div>

            {/* Bottom Nav */}
            {renderBottomNav()}

            {/* Loading Overlay */}
            {isProcessing && (
                <div className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-75 d-flex flex-column align-items-center justify-content-center text-white" style={{ zIndex: 2000 }}>
                    <div className="spinner-border mb-3"></div>
                    <div>{loadingMessage || 'Processing...'}</div>
                </div>
            )}
        </div>
    );
};

export default PropertyComparisonMobile;