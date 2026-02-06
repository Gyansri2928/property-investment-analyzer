import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate, useLocation } from 'react-router-dom';
import './PropertyComparison.css'; // Ensure you have your styles
// ✅ Add these imports
import { auth, db, loginWithGoogle } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, orderBy } from 'firebase/firestore';
import axios from 'axios';

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
        homeLoanRate: '',
        homeLoanTerm: '',
        homeLoanShare: 80,
        homeLoanStartMonth: 0,
        homeLoanStartMode: 'default',

        personalLoan1Rate: '',
        personalLoan1Term: '', // ✅ CHANGED from 7 to ''
        personalLoan1StartMonth: 0,
        personalLoan1Share: 10,

        personalLoan2Rate: '',
        personalLoan2Term: '', // ✅ CHANGED from 7 to ''
        personalLoan2StartMonth: '',
        personalLoan2Share: 10,

        downPaymentShare: 0,
        investmentPeriod: '',
        clpDurationYears: '',
        bankDisbursementStartMonth: '',
        bankDisbursementInterval: '',
        lastBankDisbursementMonth: '',
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
const formatCurrency = (value) => (!value && value !== 0) ? '₹0' : `₹${Math.round(value).toLocaleString('en-IN')}`;
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

// --- NEW COMPONENT: Mobile Accordion Timeline ---
const MobileTimelineAccordion = ({ breakdown, onViewSchedule, onViewMonthlyBreakdown }) => {
    const [openSection, setOpenSection] = useState('phase1');

    const toggleSection = (section) => {
        setOpenSection(openSection === section ? '' : section);
    };

    // Calculate Totals for Display
    // 1. Pre-Possession Total is usually just the EMI * months (approx) or the exact total from backend if available
    const prePossessionTotalValue = breakdown.prePossessionTotal;

    // 2. Post-Possession Total = Monthly EMI * Remaining Months
    const postPossessionTotalValue = breakdown.postPossessionTotal;

    // Reusable Accordion Item
    const AccordionItem = ({ id, title, subtitle, amount, totalLabel, totalValue, color, icon, children }) => {
        const isOpen = openSection === id;
        return (
            <div className={`card mb-3 border-${color} shadow-sm overflow-hidden`}>
                {/* Clickable Header */}
                <div
                    className={`card-header bg-${color} bg-opacity-10 p-3`}
                    onClick={() => toggleSection(id)}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="d-flex align-items-center justify-content-between mb-2">
                        <div className="d-flex align-items-center overflow-hidden">
                            <div className={`rounded-circle bg-${color} text-white d-flex align-items-center justify-content-center me-3 flex-shrink-0`}
                                style={{ width: '40px', height: '40px' }}>
                                <i className={`bi ${icon} fs-5`}></i>
                            </div>
                            <div>
                                <h6 className={`mb-0 fw-bold text-${color}`}>{title}</h6>
                                <small className="text-muted text-truncate d-block" style={{ fontSize: '0.75rem' }}>
                                    {subtitle}
                                </small>
                            </div>
                        </div>
                        <div className="text-end ms-2">
                            <div className={`fw-bold text-${color}`} style={{ fontSize: '0.9rem' }}>{amount}</div>
                            <i className={`bi bi-chevron-${isOpen ? 'up' : 'down'} text-muted small`}></i>
                        </div>
                    </div>

                    {/* Total Phase Value Badge (Always Visible or only when open? Let's keep it visible for quick info) */}
                    <div className="d-flex justify-content-end">
                        <span className={`badge bg-${color} bg-opacity border border-opacity-25 rounded-pill px-2 py-1 small fw-normal`}>
                            Total Phase Cost: <strong>{formatLakhs(totalValue)}</strong>
                        </span>
                    </div>
                </div>

                {/* Collapsible Body */}
                {isOpen && (
                    <div className="card-body bg-white animate-fade-in">
                        {children}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="mt-4">

            {/* 1. Pre-Possession Accordion */}
            <AccordionItem
                id="phase1"
                title="Timeline 1: Pre-Possession"
                subtitle={`Month 0 - ${breakdown.possessionMonths} (Construction)`}
                amount={formatCurrency(breakdown.prePossessionTotal)} // Monthly amount
                totalValue={prePossessionTotalValue} // Total for phase
                color="primary"
                icon="bi-hourglass-split"
            >
                <div className="p-2 bg-light rounded border border-light mb-3">
                    <div className="d-flex justify-content-between mb-2 small">
                        <span className="text-muted">Personal Loan 1 EMI</span>
                        <span className="fw-bold">{formatCurrency(breakdown.personalLoan1EMI)}/mo</span>
                    </div>
                    {breakdown.hasIDC && (
                        <div className="d-flex justify-content-between small">
                            <span className="text-muted">Avg. IDC Interest</span>
                            <span className="fw-bold text-warning-emphasis">{formatCurrency(breakdown.monthlyIDCEMI)}/mo</span>
                        </div>
                    )}
                </div>

                {/* Buttons */}
                <div className="d-flex flex-column gap-2">
                    {breakdown.hasIDC && (
                        <button
                            className="btn btn-sm btn-outline-primary w-100 rounded-pill"
                            onClick={onViewSchedule}
                        >
                            <i className="bi bi-table me-2"></i>View Construction Schedule
                        </button>
                    )}
                    <button
                        className="btn btn-sm btn-outline-success w-100 rounded-pill"
                        onClick={onViewMonthlyBreakdown}
                    >
                        <i className="bi bi-calendar-week me-2"></i>View Monthly Breakdown
                    </button>
                </div>
            </AccordionItem>

            {/* 2. Post-Possession Accordion */}
            <AccordionItem
                id="phase2"
                title="Timeline 2: Post-Possession"
                subtitle={`Month ${breakdown.possessionMonths + 1} Onwards`}
                amount={`${formatCurrency(breakdown.postPossessionEMI)}/mo`}
                totalValue={postPossessionTotalValue} // ✅ Correct Total Calculation passed here
                color="success"
                icon="bi-house-check-fill"
            >
                <div className="p-2 bg-light rounded border border-light mb-2">
                    <div className="d-flex justify-content-between mb-2 small">
                        <span className="text-muted">Home Loan EMI</span>
                        <span className="fw-bold">{formatCurrency(breakdown.homeLoanEMI)}</span>
                    </div>
                    <div className="d-flex justify-content-between mb-2 small">
                        <span className="text-muted">PL1 EMI</span>
                        <span className="fw-bold">{formatCurrency(breakdown.personalLoan1EMI)}</span>
                    </div>
                    {breakdown.hasPersonalLoan2 && (
                        <div className="d-flex justify-content-between small">
                            <span className="text-muted">PL2 EMI</span>
                            <span className="fw-bold">{formatCurrency(breakdown.personalLoan2EMI)}</span>
                        </div>
                    )}
                </div>
                <div className="text-end">
                    <small className="text-success fst-italic" style={{ fontSize: '0.7rem' }}>
                        <i className="bi bi-check2-circle me-1"></i>
                        Principal Repayment Starts
                    </small>
                </div>
            </AccordionItem>

        </div>
    );
};
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
    const [showPreview, setShowPreview] = useState(false);
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
    const [activeTab, setActiveTab] = useState(() => {
        // 1. Try to restore from session storage (handles Back button)
        const savedTab = sessionStorage.getItem('propertyCalc_activeTab');

        // 2. Check if we have a specific target passed via navigation (e.g. from a specific link)
        const locationState = window.history.state?.usr; // Access router state safely
        if (locationState && locationState.returnTab) {
            return locationState.returnTab;
        }

        return savedTab || 'inputs';
    });
    useEffect(() => {
        sessionStorage.setItem('propertyCalc_activeTab', activeTab);
    }, [activeTab]);

    const [maxStepReached, setMaxStepReached] = useState(1);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [validationError, setValidationError] = useState('');
    const [showDataEnteredAlert, setShowDataEnteredAlert] = useState(false);
    // ✅ FIREBASE STATE
    const [user, setUser] = useState(null);
    const [showSavedDrawer, setShowSavedDrawer] = useState(false);
    const [savedScenarios, setSavedScenarios] = useState([]);
    const [isLoadingData, setIsLoadingData] = useState(false);

    // ✅ AUTH & SYNC EFFECT
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser) fetchUserScenarios(currentUser.uid);
            else setSavedScenarios([]);
        });
        return () => unsubscribe();
    }, []);

    // ✅ FETCH FUNCTION
    const fetchUserScenarios = async (uid) => {
        setIsLoadingData(true);
        try {
            const q = query(collection(db, "scenarios"), where("userId", "==", uid), orderBy("timestamp", "desc"));
            const querySnapshot = await getDocs(q);
            setSavedScenarios(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
            console.error("Error loading data:", error);
            // Fallback for missing index
            if (error.code === 'failed-precondition') {
                const qSimple = query(collection(db, "scenarios"), where("userId", "==", uid));
                const snap = await getDocs(qSimple);
                setSavedScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
        }
        setIsLoadingData(false);
    };

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
        // 1. Copy the array
        const newProperties = [...propertyData.properties];

        // 2. Parse the value (Keep numbers as numbers, text as text)
        const newValue = (field === 'name' || field === 'location') ? value : parseFloat(value) || '';

        // 3. Update the specific property in the list
        newProperties[index] = {
            ...newProperties[index],
            [field]: newValue
        };

        // 4. Update the main state
        setPropertyData(prev => ({ ...prev, properties: newProperties }));

        // 5. ✅ CRITICAL FIX: Sync "Active Selection" immediately
        // If we are editing the property that is currently selected in the dropdown...
        if (newProperties[index].id === userSelections.selectedPropertyId) {
            // If editing Size, update selectedPropertySize
            if (field === 'size') {
                setUserSelections(prev => ({ ...prev, selectedPropertySize: newValue }));
            }
            // If editing Possession, force re-render/validation trigger if needed
            // (React handles this automatically via state, but size is special because it's duplicated in userSelections)
        }
    };

    const handleAssumptionChange = (field, value) => {
        setPropertyData(prev => ({
            ...prev,
            assumptions: { ...prev.assumptions, [field]: (field === 'holdingPeriodUnit' || field === 'homeLoanStartMode') ? value : (value === '' ? '' : parseFloat(value)) }
        }));
    };

    const handleAddProperty = () => {
        // 1. Find max ID
        const maxId = propertyData.properties.reduce((max, prop) => (prop.id > max ? prop.id : max), 0);
        const newId = maxId + 1;

        // 2. Create new property with EMPTY fields (Don't pre-fill 1000)
        const newProperty = {
            id: newId,
            size: '', // ✅ Change 1000 to '' so validation forces user to enter it
            name: `Property ${newId}`,
            location: '',
            possessionMonths: '' // ✅ Don't assume 24 months
        };

        // 3. Update the List
        setPropertyData(prev => ({
            ...prev,
            properties: [...prev.properties, newProperty]
        }));

        // 4. ✅ CRITICAL FIX: Automatically select the new property
        // This ensures the validator checks THIS property, not the old one.
        setUserSelections(prev => ({
            ...prev,
            selectedPropertyId: newId,
            selectedPropertySize: '',
            scenarioSize: ''
        }));
    };

    const handleRemoveProperty = (id) => {
        if (propertyData.properties.length <= 1) return;

        setPropertyData(prev => ({
            ...prev,
            properties: prev.properties.filter(prop => prop.id !== id)
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

    const handleDeleteExitPriceScenario = (indexToDelete) => {
        setUserSelections(prev => ({
            ...prev,
            scenarioExitPrices: prev.scenarioExitPrices.filter((_, index) => index !== indexToDelete)
        }));
    };

    const handleResetData = () => {
        if (window.confirm("Reset Property Details? \n(Note: Your Loan Distribution & Payment Plan settings will be KEPT)")) {

            setPropertyData(prev => ({
                // 1. Load the clean defaults (Clears Price, Taxes, etc.)
                ...INITIAL_PROPERTY_DATA,

                // 2. Preserve Payment Plan
                paymentPlan: prev.paymentPlan,

                // 3. Selective Assumption Reset
                assumptions: {
                    ...INITIAL_PROPERTY_DATA.assumptions, // Loads empty rates/tenures

                    // ✅ ONLY restore the user's split percentages
                    homeLoanShare: prev.assumptions.homeLoanShare,
                    personalLoan1Share: prev.assumptions.personalLoan1Share,
                    personalLoan2Share: prev.assumptions.personalLoan2Share,
                    downPaymentShare: prev.assumptions.downPaymentShare,

                    // Reset possession since it's property-specific
                    possessionMonths: ''
                },

                // 4. Force-Reset the Property List 
                // (This bypasses any 'sticky' data in the constant)
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
                ]
            }));

            // Reset User Selections
            setUserSelections(INITIAL_USER_SELECTIONS);

            // Reset UI State
            setCurrentStep(1);
            setMaxStepReached(1);
            setValidationError('');

            // alert("Reset Complete"); // Optional feedback
        }
    };

    const validateCurrentStep = () => {
        let isValid = true;
        let errorMsg = '';

        // Helper to check for empty values
        const isEmpty = (val) => val === '' || val === null || val === undefined || val === 0 || Number.isNaN(val);

        // Find the currently selected property object
        const currentProp = propertyData.properties.find(p => p.id === userSelections.selectedPropertyId);

        // --- STEP 1: PROPERTY DETAILS ---
        if (currentStep === 1) {
            if (!currentProp?.name) { isValid = false; errorMsg = 'Please enter a Property Name.'; }
            else if (!currentProp?.location) { isValid = false; errorMsg = 'Please enter a Location.'; }
            else if (isEmpty(currentProp?.size)) { isValid = false; errorMsg = 'Please enter Property Size.'; }
            else if (isEmpty(propertyData.purchasePrice)) { isValid = false; errorMsg = 'Please enter Purchase Price.'; }
        }

        // --- STEP 2: PAYMENT PLAN & TIMELINE ---
        else if (currentStep === 2) {
            // Check Holding Period
            if (isEmpty(propertyData.assumptions.investmentPeriod) || propertyData.assumptions.investmentPeriod <= 0) {
                isValid = false; errorMsg = 'Please enter a valid Holding Period (Years).';
            }
            // Check Custom Plan Total (Must be 100%)
            else if (propertyData.paymentPlan === 'custom') {
                const total = getSafeValue(propertyData.assumptions.downPaymentShare) +
                    getSafeValue(propertyData.assumptions.personalLoan1Share) +
                    getSafeValue(propertyData.assumptions.personalLoan2Share) +
                    getSafeValue(propertyData.assumptions.homeLoanShare);
                if (total !== 100) { isValid = false; errorMsg = `Total allocation is ${total}%. It must be exactly 100%.`; }
            }
            // Check CLP Specifics
            if (propertyData.paymentPlan === 'clp') {
                if (isEmpty(propertyData.assumptions.clpDurationYears)) {
                    isValid = false; errorMsg = 'Please enter Construction Duration.';
                }
                else if (isEmpty(propertyData.assumptions.bankDisbursementInterval)) {
                    isValid = false; errorMsg = 'Please enter Disbursement Interval.';
                }
                else {
                    // Logic Check: Construction vs Possession
                    const constructionMonths = parseFloat(propertyData.assumptions.clpDurationYears) * 12;
                    const possessionMonths = parseFloat(currentProp?.possessionMonths || 0);

                    if (constructionMonths > possessionMonths) {
                        isValid = false;
                        errorMsg = `Error: Construction (${constructionMonths}m) cannot exceed Possession (${possessionMonths}m).`;
                    }
                }
            }
        }

        // --- STEP 3: LOAN CONFIGURATION ---
        else if (currentStep === 3) {
            // Check Possession (Required unless Ready-to-Move)
            if (isEmpty(currentProp?.possessionMonths) && propertyData.paymentPlan !== 'rtm') {
                isValid = false; errorMsg = 'Please enter Possession Months (in Step 1).';
            }
            // Basic Home Loan Checks
            else if (isEmpty(propertyData.assumptions.homeLoanRate)) { isValid = false; errorMsg = 'Please enter Home Loan Rate.'; }
            else if (isEmpty(propertyData.assumptions.homeLoanTerm)) { isValid = false; errorMsg = 'Please enter Home Loan Term.'; }

            // Check Personal Loan 1 (Only if Share > 0)
            if (getSafeValue(propertyData.assumptions.personalLoan1Share) > 0) {
                if (isEmpty(propertyData.assumptions.personalLoan1Rate)) {
                    isValid = false; errorMsg = 'Please enter Personal Loan 1 Rate.';
                } else if (isEmpty(propertyData.assumptions.personalLoan1Term)) {
                    isValid = false; errorMsg = 'Please enter Personal Loan 1 Tenure.';
                }
            }

            // Check Personal Loan 2 (Only if Share > 0)
            if (getSafeValue(propertyData.assumptions.personalLoan2Share) > 0) {
                if (isEmpty(propertyData.assumptions.personalLoan2Rate)) {
                    isValid = false; errorMsg = 'Please enter Personal Loan 2 Rate.';
                } else if (isEmpty(propertyData.assumptions.personalLoan2Term)) {
                    isValid = false; errorMsg = 'Please enter Personal Loan 2 Tenure.';
                }
            }
        }

        // --- STEP 4: EXIT SCENARIOS ---
        else if (currentStep === 4) {
            const selectedPrice = userSelections.selectedExitPrice;
            const scenarioPrices = userSelections.scenarioExitPrices;

            if (isEmpty(selectedPrice)) { isValid = false; errorMsg = 'Please enter a Selected Exit Price.'; }
            else if (scenarioPrices.includes(selectedPrice)) { isValid = false; errorMsg = `Selected Price (${selectedPrice}) cannot be a Scenario Price.`; }
            else if (new Set(scenarioPrices).size !== scenarioPrices.length) { isValid = false; errorMsg = 'Scenario Prices must be unique.'; }
        }

        // --- HANDLE VALIDATION RESULT ---
        if (!isValid) {
            setValidationError(errorMsg);
            // Clear error after 4 seconds
            setTimeout(() => setValidationError(''), 4000);
        } else {
            setValidationError('');
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

    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));// Dependencies: Runs ONLY when inputs change

    const userDefinedTotal = getSafeValue(propertyData.assumptions.downPaymentShare) +
        getSafeValue(propertyData.assumptions.personalLoan1Share) +
        getSafeValue(propertyData.assumptions.personalLoan2Share);
    // ✅ RESTORE RESULTS: Try to load previous analysis from session storage
    const [calculatedData, setCalculatedData] = useState(() => {
        const savedResults = sessionStorage.getItem('propertyCalc_results');
        return savedResults ? JSON.parse(savedResults) : {
            detailedBreakdown: null,
            profits: [],
            multipleScenarios: [],
            stageCalculations: null
        };
    });

    // ✅ PERSIST RESULTS: Save analysis data so it survives navigation/refresh
    useEffect(() => {
        if (calculatedData.detailedBreakdown) {
            sessionStorage.setItem('propertyCalc_results', JSON.stringify(calculatedData));
        }
    }, [calculatedData]);

    const currentTotal = userDefinedTotal + getSafeValue(propertyData.assumptions.homeLoanShare);

    const isError = currentTotal !== 100;

    const handleAnalyzeClick = async () => {
        setIsProcessing(true);
        setLoadingMessage("Connecting to Analysis Engine...");

        try {
            // 1. Prepare Payload
            const payload = {
                purchasePrice: parseFloat(propertyData.purchasePrice),
                otherCharges: parseFloat(propertyData.otherCharges),
                stampDuty: parseFloat(propertyData.stampDuty),
                gstPercentage: parseFloat(propertyData.gstPercentage),
                paymentPlan: propertyData.paymentPlan,
                assumptions: propertyData.assumptions,
                selectedProperty: propertyData.properties.find(p => p.id === userSelections.selectedPropertyId),
                selectedExitPrice: parseFloat(userSelections.selectedExitPrice),
                scenarioExitPrices: userSelections.scenarioExitPrices.map(p => parseFloat(p))
            };

            // 2. Call Backend
            // NOTE: Ensure your mobile device can reach this URL (use IP if on real device)
            const response = await axios.post('https://property-backend-woad.vercel.app/api/calculate', payload);

            if (response.data.success) {
                setCalculatedData(response.data.data); // Update State with Backend Data

                setActiveTab('overview');
                setShowDataEnteredAlert(true);
                window.scrollTo({ top: 0, behavior: 'smooth' });
                setTimeout(() => setShowDataEnteredAlert(false), 3000);
            }
        } catch (error) {
            console.error("Calculation Error:", error);
            alert("Server Error: " + (error.response?.data?.error || error.message));
        } finally {
            setIsProcessing(false);
        }
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
                            <button className="btn btn-outline-primary btn-sm d-flex align-items-center shadow-sm" onClick={handleSaveScenario}>
                                <i className="bi bi-save"></i>
                            </button>
                            <button
                                className="btn btn-outline-primary btn-sm d-flex align-items-center shadow-sm"
                                onClick={() => setShowSavedDrawer(true)}
                                style={{ borderRadius: '50px', padding: '8px 12px' }}
                            >
                                <i className="bi bi-folder2-open"></i>
                            </button>
                            {/* 1. Reset Button */}
                            <button
                                className="btn btn-success btn-sm d-flex align-items-center shadow-sm"
                                onClick={handleResetData}
                                title="Reset All Inputs"
                                style={{
                                    borderRadius: '50px',
                                    padding: '8px 20px',
                                    borderWidth: '2px',
                                    fontWeight: '600'
                                }}
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

                                            {currentStep === 4 ? (
                                                <div className="d-flex gap-2">
                                                    {/* Review Button */}
                                                    <button
                                                        className="btn btn-sm btn-primary rounded-pill px-3"
                                                        onClick={() => setShowPreview(true)}
                                                    >
                                                        Review
                                                    </button>
                                                    {/* Analyze Button */}
                                                    <button
                                                        className="btn btn-sm btn-primary rounded-pill px-4"
                                                        onClick={handleAnalyzeClick}
                                                    >
                                                        Analyze <i className="bi bi-graph-up ms-1"></i>
                                                    </button>
                                                </div>
                                            ) : (
                                                // Normal Next Button for Steps 1-3
                                                <button
                                                    className="btn btn-sm btn-primary rounded-pill px-4"
                                                    onClick={handleNextStep}
                                                >
                                                    Next <i className="bi bi-arrow-right ms-2"></i>
                                                </button>
                                            )}
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
    const renderSavedPropertiesDrawer = () => {
        if (!showSavedDrawer) return null;

        return (
            <>
                <div className="position-fixed top-0 start-0 w-100 h-100 bg-black bg-opacity-75" style={{ zIndex: 1045, backdropFilter: 'blur(3px)' }} onClick={() => setShowSavedDrawer(false)}></div>
                <div className="position-fixed top-0 end-0 h-100 bg-dark text-white shadow-lg d-flex flex-column" style={{ zIndex: 1050, width: '320px', maxWidth: '85vw' }}>

                    {/* Header */}
                    <div className="p-3 border-bottom border-secondary d-flex justify-content-between align-items-center">
                        <div>
                            <h6 className="mb-0 fw-bold"><i className="bi bi-folder2-open me-2 text-primary"></i>My Properties</h6>
                            {user && <small className="text-success" style={{ fontSize: '0.7rem' }}>Synced as {user.displayName}</small>}
                        </div>
                        <button className="btn-close btn-close-white" onClick={() => setShowSavedDrawer(false)}></button>
                    </div>

                    {/* List */}
                    <div className="flex-grow-1 overflow-auto p-3">
                        {!user ? (
                            <div className="text-center mt-5">
                                <p className="text-white-50 small">Sign in to access cloud saves.</p>
                                <button onClick={loginWithGoogle} className="btn btn-primary btn-sm"><i className="bi bi-google me-2"></i>Sign In</button>
                            </div>
                        ) : savedScenarios.length === 0 ? (
                            <div className="text-center mt-5 text-white-50"><small>No saved properties found.</small></div>
                        ) : (
                            <div className="d-flex flex-column gap-3">
                                {savedScenarios.map((item) => (
                                    <div key={item.id} className="card bg-secondary bg-opacity-10 border border-secondary border-opacity-25 shadow-sm">
                                        <div className="card-body p-3">
                                            <div className="d-flex justify-content-between mb-2">
                                                <h6 className="fw-bold text-info mb-0 text-truncate" style={{ maxWidth: '150px' }}>{item.name}</h6>
                                                <small className="text-white-50">{new Date(item.timestamp).toLocaleDateString()}</small>
                                            </div>
                                            <div className="d-flex justify-content-between small mb-3 text-white-50">
                                                <span>Buy: <span className="text-white">{formatLakhs(item.metrics.totalCost)}</span></span>
                                                <span>Net: <span className={item.metrics.netProfit >= 0 ? "text-success" : "text-danger"}>{formatLakhs(item.metrics.netProfit)}</span></span>
                                            </div>
                                            <div className="d-flex gap-2">
                                                <button className="btn btn-sm btn-outline-light flex-grow-1" onClick={() => handleLoadScenario(item)}>Load</button>
                                                <button className="btn btn-sm btn-outline-danger" onClick={() => handleDeleteScenario(item.id)}><i className="bi bi-trash"></i></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </>
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
                <div className="mb-3 bg-white rounded-3 shadow-sm border border-secondary border-opacity-10 overflow-hidden">
                    {/* Header (Clickable) */}
                    <div
                        className="card-header border-0 py-3 px-3 cursor-pointer d-flex justify-content-between align-items-center bg-transparent"
                        onClick={() => setActiveAccordion(isOpen ? '' : id)}
                        style={{ cursor: 'pointer', touchAction: 'manipulation' }} // Optimize for touch
                    >
                        {/* Title (Left) - Using h6 for mobile compactness */}
                        <h6 className={`mb-0 fw-bold`}>
                            <i className={`bi ${icon} me-2 ${isOpen ? '' : 'text-muted'}`}></i>
                            {title}
                        </h6>

                        {/* Arrow Icon (Right) */}
                        <i className={`bi bi-chevron-${isOpen ? 'up' : 'down'} ${isOpen ? '' : 'text-muted'}`}></i>
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
                        {/* 2. ACCORDION A: Property Specifics */}
                        {renderAccordionSection(
                            'prop_mgmt',
                            `Properties (${propertyData.properties.length})`,
                            'bi-building',
                            <div>
                                {/* Add Property Button */}
                                <div className="d-flex justify-content-end mb-3">
                                    <button
                                        className="btn btn-sm btn-primary rounded-pill d-flex align-items-center"
                                        onClick={handleAddProperty}
                                    >
                                        <i className="bi bi-plus-circle me-1"></i> Add
                                    </button>
                                </div>

                                {/* Property List */}
                                {propertyData.properties.map((property, index) => (
                                    <div key={property.id} className="card border-0 shadow-sm mb-3 overflow-hidden">

                                        {/* Property Header (Darker Header for distinction) */}
                                        <div className="card-header bg-light d-flex justify-content-between align-items-center py-2 px-3">
                                            <span className="badge bg-primary rounded-pill">#{index + 1}</span>

                                            {/* Delete Button (Only show if more than 1 property) */}
                                            {propertyData.properties.length > 1 && (
                                                <button
                                                    className="btn btn-link text-danger p-0"
                                                    onClick={() => handleRemoveProperty(property.id)}
                                                    style={{ textDecoration: 'none' }}
                                                >
                                                    <i className="bi bi-trash"></i>
                                                </button>
                                            )}
                                        </div>

                                        <div className="card-body p-3">
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
                                                    placeholder='e.g. 2 Years'
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
                                                    placeholder='e.g. 2 months'
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
                                                        placeholder='e.g. 2'
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
                                    {/* Row 1: Rate and Tenure */}
                                    <div className="col-6">
                                        <label className="form-label small">Rate (%) <span className="text-danger">*</span></label>
                                        <input
                                            type="number" step="0.1" className="form-control form-control-sm"
                                            value={propertyData.assumptions.homeLoanRate}
                                            placeholder='e.g. 8.5'
                                            onChange={(e) => handleAssumptionChange('homeLoanRate', e.target.value)}
                                        />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label small">Tenure (Yrs) <span className="text-danger">*</span></label>
                                        <input
                                            type="number" className="form-control form-control-sm"
                                            value={propertyData.assumptions.homeLoanTerm}
                                            placeholder='e.g. 20'
                                            onChange={(e) => handleAssumptionChange('homeLoanTerm', e.target.value)}
                                        />
                                    </div>

                                    {/* ✅ NEW: EMI Start Logic Section */}
                                    <div className="col-12 mt-3">
                                        <div className="p-3 bg-light rounded border border-secondary border-opacity-10">

                                            {/* Header & Toggle */}
                                            <div className="d-flex justify-content-between align-items-center mb-3">
                                                <label className="form-label mb-0 small fw-bold text-muted">EMI Start Logic</label>
                                                <div className="btn-group btn-group-sm shadow-sm" role="group">
                                                    <button
                                                        type="button"
                                                        className={`btn ${(!propertyData.assumptions.homeLoanStartMode || propertyData.assumptions.homeLoanStartMode === 'default') ? 'btn-primary' : 'btn-white border'}`}
                                                        onClick={() => handleAssumptionChange('homeLoanStartMode', 'default')}
                                                        style={{ fontSize: '0.75rem' }}
                                                    >
                                                        Auto
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`btn ${propertyData.assumptions.homeLoanStartMode === 'manual' ? 'btn-primary' : 'btn-white border'}`}
                                                        onClick={() => handleAssumptionChange('homeLoanStartMode', 'manual')}
                                                        style={{ fontSize: '0.75rem' }}
                                                    >
                                                        Manual
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Slider or Input based on Mode */}
                                            {propertyData.assumptions.homeLoanStartMode === 'manual' ? (
                                                <div className="mb-2">
                                                    <label className="form-label small text-muted">Exact Start Month</label>
                                                    <input
                                                        type="number"
                                                        className="form-control form-control-sm"
                                                        value={propertyData.assumptions.homeLoanStartMonth}
                                                        placeholder="e.g. 25"
                                                        onChange={(e) => handleAssumptionChange('homeLoanStartMonth', e.target.value)}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="mb-2">
                                                    <div className="d-flex justify-content-between mb-1">
                                                        <label className="form-label small text-muted mb-0">Delay after Possession</label>
                                                        <strong className="small">{propertyData.assumptions.homeLoanStartMonth} Months</strong>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        className="form-range"
                                                        min="0" max="24"
                                                        value={propertyData.assumptions.homeLoanStartMonth || 0}
                                                        onChange={(e) => handleAssumptionChange('homeLoanStartMonth', e.target.value)}
                                                    />
                                                </div>
                                            )}

                                            {/* Calculation Summary Box */}
                                            <div className="bg-white p-2 rounded border text-center mt-2">
                                                <small className="text-muted d-block" style={{ fontSize: '0.65rem' }}>
                                                    EMI Starts On
                                                </small>
                                                <div className="fw-bold">
                                                    Month {
                                                        propertyData.assumptions.homeLoanStartMode === 'manual'
                                                            ? (getSafeValue(propertyData.assumptions.homeLoanStartMonth))
                                                            : (() => {
                                                                const explicitLast = getSafeValue(propertyData.assumptions.lastBankDisbursementMonth);
                                                                const constrEnd = getSafeValue(propertyData.assumptions.clpDurationYears) * 12;
                                                                const possession = parseInt(propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.possessionMonths) || 0;
                                                                const base = propertyData.paymentPlan === 'clp'
                                                                    ? (explicitLast > 0 ? explicitLast : (constrEnd > 0 ? constrEnd : possession))
                                                                    : possession;
                                                                return base + getSafeValue(propertyData.assumptions.homeLoanStartMonth) + 1;
                                                            })()
                                                    }
                                                </div>
                                            </div>

                                        </div>
                                    </div>
                                </div>
                            )
                        )}

                        {/* Personal Loan 1 Details (Keep existing logic, just ensure styling matches) */}
                        {renderAccordionSection(
                            'pl1_details', 'Personal Loan 1 Details', 'bi-cash-coin',
                            (
                                <div className="row g-3">
                                    <div className="col-6">
                                        <label className="form-label small">Share (%)</label>
                                        <input type="number" className="form-control form-control-sm"
                                            value={propertyData.assumptions.personalLoan1Share}
                                            onChange={(e) => handleAssumptionChange('personalLoan1Share', e.target.value)}
                                            disabled={propertyData.paymentPlan !== 'custom'}
                                        />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label">Amount</label>
                                        <div className="form-control bg-light border-light text-secondary">
                                            {formatCurrency(
                                                (propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.size || 0) * getSafeValue(propertyData.purchasePrice) * (getSafeValue(propertyData.assumptions.personalLoan1Share) / 100)
                                            )}
                                        </div>
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label small">Tenure (Yrs)</label>
                                        <input type="number" className="form-control form-control-sm"
                                            value={propertyData.assumptions.personalLoan1Term}
                                            placeholder='e.g. 8'
                                            onChange={(e) => handleAssumptionChange('personalLoan1Term', e.target.value)}
                                        />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label small">Rate (%)</label>
                                        <input type="number" step="0.1" className="form-control form-control-sm"
                                            value={propertyData.assumptions.personalLoan1Rate}
                                            placeholder='e.g. 10'
                                            onChange={(e) => handleAssumptionChange('personalLoan1Rate', e.target.value)}
                                        />
                                    </div>
                                    <div className="col-12">
                                        <label className="form-label d-flex justify-content-between">
                                            <span>Start Month</span>
                                            <span className="fw-bold">Month {propertyData.assumptions.personalLoan1StartMonth}</span>
                                        </label>
                                        <div className="d-flex justify-content-between">
                                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>Month 0</small>
                                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>Month 84</small>
                                        </div>
                                        <div className="position-relative mb-4">

                                            {/* The Actual Input Slider */}
                                            <input
                                                type="range"
                                                className="form-range"
                                                min="0"
                                                max="84"
                                                step="1"
                                                value={propertyData.assumptions.personalLoan1StartMonth}
                                                onChange={(e) => handleAssumptionChange('personalLoan1StartMonth', e.target.value)}
                                                style={{ position: 'relative', zIndex: 2 }}
                                            />

                                            {/* The Ticks & Labels Overlay */}
                                            <div
                                                className="position-absolute w-100 top-50 start-0 translate-middle-y pe-none"
                                                style={{ height: '100%', zIndex: 1, paddingLeft: '8px', paddingRight: '8px' }}
                                            >
                                                {[10, 20, 30, 40, 50, 60, 70, 80].map((tickValue) => (
                                                    <React.Fragment key={tickValue}>

                                                        {/* 1. The Vertical Dash */}
                                                        <div
                                                            className="position-absolute bg-secondary opacity-25"
                                                            style={{
                                                                left: `${(tickValue / 84) * 100}%`,
                                                                width: '2px',
                                                                height: '10px', // Slightly shorter for cleaner look
                                                                top: '50%',
                                                                transform: 'translate(-50%, -50%)'
                                                            }}
                                                        ></div>

                                                        {/* 2. The Number Label */}
                                                        <div
                                                            className="position-absolute text-muted opacity-75"
                                                            style={{
                                                                left: `${(tickValue / 84) * 100}%`,
                                                                top: '20px', // Push below the slider
                                                                transform: 'translateX(-50%)', // Center text exactly on the tick
                                                                fontSize: '0.6rem',
                                                                fontWeight: '600'
                                                            }}
                                                        >
                                                            {tickValue}
                                                        </div>

                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>
                                        <small className="text-muted d-block text-end mt-1" style={{ fontSize: '0.65rem' }}>Independent of possession</small>
                                    </div>
                                </div>
                            )
                        )}

                        {/* Personal Loan 2 Details */}
                        {renderAccordionSection(
                            'pl2_details', 'Personal Loan 2 Details', 'bi-cash-coin',
                            (
                                <div className="row g-3">
                                    <div className="col-6">
                                        <label className="form-label small">Share (%)</label>
                                        <input type="number" className="form-control form-control-sm"
                                            value={propertyData.assumptions.personalLoan2Share}
                                            onChange={(e) => handleAssumptionChange('personalLoan2Share', e.target.value)}
                                            disabled={propertyData.paymentPlan !== 'custom'}
                                        />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label">Amount</label>
                                        <div className="form-control bg-light border-light text-secondary" style={{
                                            // Apply standard Bootstrap disabled gray background if not custom
                                            backgroundColor: propertyData.paymentPlan !== 'custom' ? '#e9ecefa6' : '#fff',
                                            // Mute the text color slightly to match disabled state
                                            color: propertyData.paymentPlan !== 'custom' ? '#6c757d' : 'inherit'
                                        }}>
                                            {formatCurrency(
                                                (propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.size || 0) * getSafeValue(propertyData.purchasePrice) * (getSafeValue(propertyData.assumptions.personalLoan1Share) / 100)
                                            )}
                                        </div>
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label small">Tenure (Yrs)</label>
                                        <input type="number" className="form-control form-control-sm"
                                            value={propertyData.assumptions.personalLoan2Term}
                                            onChange={(e) => handleAssumptionChange('personalLoan2Term', e.target.value)}
                                            placeholder='e.g. 8'
                                            disabled={propertyData.assumptions.personalLoan2Share === 0}
                                        />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label small">Rate (%)</label>
                                        <input type="number" step="0.1" className="form-control form-control-sm"
                                            value={propertyData.assumptions.personalLoan2Rate}
                                            onChange={(e) => handleAssumptionChange('personalLoan2Rate', e.target.value)}
                                            placeholder='e.g. 10'
                                            disabled={propertyData.assumptions.personalLoan2Share === 0}
                                        />
                                    </div>
                                    <div className="col-md-6">
                                        <label className="form-label d-flex justify-content-between small">
                                            <span>Start Month (After Possession)</span>
                                            <span className="fw-bold">Month {propertyData.assumptions.personalLoan2StartMonth}</span>
                                        </label>
                                        <div className="d-flex justify-content-between">
                                            <small className="text-muted" style={{ fontSize: '0.65rem' }}>+0 mo</small>
                                            <small className="text-muted" style={{ fontSize: '0.65rem' }}>+36 mo</small>
                                        </div>

                                        {/* Slider Wrapper */}
                                        {/* ✅ Increased margin-bottom (mb-4) to make room for labels */}
                                        <div className="position-relative mb-4">

                                            {/* The Actual Input Slider */}
                                            <input
                                                type="range"
                                                className="form-range"
                                                min="0"
                                                max="36"
                                                step="1"
                                                value={propertyData.assumptions.personalLoan2StartMonth}
                                                onChange={(e) => handleAssumptionChange('personalLoan2StartMonth', e.target.value)}
                                                style={{ position: 'relative', zIndex: 2 }}
                                            />

                                            {/* The Ticks & Labels Overlay */}
                                            <div
                                                className="position-absolute w-100 top-50 start-0 translate-middle-y pe-none"
                                                style={{ height: '100%', zIndex: 1, paddingLeft: '8px', paddingRight: '8px' }}
                                            >
                                                {[4, 8, 12, 16, 20, 24, 28, 32].map((tickValue) => (
                                                    <React.Fragment key={tickValue}>

                                                        {/* 1. The Vertical Dash */}
                                                        <div
                                                            className="position-absolute bg-secondary opacity-25"
                                                            style={{
                                                                left: `${(tickValue / 36) * 100}%`,
                                                                width: '2px',
                                                                height: '10px', // Slightly shorter for cleaner look
                                                                top: '50%',
                                                                transform: 'translate(-50%, -50%)'
                                                            }}
                                                        ></div>

                                                        {/* 2. The Number Label */}
                                                        <div
                                                            className="position-absolute text-muted opacity-75"
                                                            style={{
                                                                left: `${(tickValue / 36) * 100}%`,
                                                                top: '20px', // Push below the slider
                                                                transform: 'translateX(-50%)', // Center text exactly on the tick
                                                                fontSize: '0.6rem',
                                                                fontWeight: '600'
                                                            }}
                                                        >
                                                            {tickValue}
                                                        </div>

                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                );
            case 4:
                return (
                    <div className='animate-fade-in'>
                        {/* Input for the MAIN Exit Price */}
                        <div className="mb-4">
                            <label className="form-label small text-muted fw-bold">
                                Expected Exit Price (Base) <span className="text-danger">*</span>
                            </label>
                            <div className="input-group">
                                <span className="input-group-text bg-white text-muted">₹</span>
                                <input
                                    type="number"
                                    className="form-control"
                                    value={userSelections.selectedExitPrice}
                                    placeholder="e.g. 6000"
                                    onChange={(e) => handleSelectionUpdate('selectedExitPrice', e.target.value)}
                                />
                            </div>
                            <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                                This is your primary target for ROI calculation.
                            </small>
                        </div>

                        <hr className="border-secondary opacity-10 my-4" />

                        {/* Section for Extra Scenarios */}
                        <div className="mb-3">
                            <label className="form-label small text-muted fw-bold d-flex justify-content-between align-items-center">
                                <span>Compare Higher Prices</span>
                                <span className="badge bg-light text-secondary border">
                                    {userSelections.scenarioExitPrices.length} Added
                                </span>
                            </label>

                            {/* The "Add" Button */}
                            <button
                                className="btn btn-outline-primary btn-sm w-100 mb-3 border-dashed d-flex align-items-center justify-content-center py-2"
                                onClick={handleAddExitPriceScenario}
                                style={{ borderStyle: 'dashed' }}
                            >
                                <i className="bi bi-plus-circle me-2"></i> Add Higher Scenario (+500)
                            </button>

                            {/* The Chips with Delete Option */}
                            <div className="d-flex flex-wrap gap-2">
                                {userSelections.scenarioExitPrices.length === 0 && (
                                    <div className="text-center w-100 text-muted fst-italic py-2" style={{ fontSize: '0.75rem' }}>
                                        No extra scenarios added yet.
                                    </div>
                                )}

                                {userSelections.scenarioExitPrices.map((price, index) => (
                                    <div
                                        key={index}
                                        className="d-flex align-items-center border rounded-pill ps-3 pe-1 py-1 shadow-sm"
                                        style={{ fontSize: '0.85rem' }}
                                    >
                                        <span className="fw-bold me-2">₹{price}</span>

                                        {/* The Delete Button (X) */}
                                        <button
                                            className="btn btn-link text-danger p-0 d-flex align-items-center justify-content-center"
                                            style={{ width: '24px', height: '24px', textDecoration: 'none' }}
                                            onClick={() => handleDeleteExitPriceScenario(index)}
                                        >
                                            <i className="bi bi-x-circle-fill fs-6"></i>
                                        </button>
                                    </div>
                                ))}
                            </div>
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
                                    <h6 className="fw-bold mb-1">Standard CLP</h6>
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
                                <span className="fw-bold d-block">{formatCurrency(standardTotalPaid)}</span>
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
                <div className="glass-card mb-4 p-3">
                    <div className="d-flex justify-content-between align-items-center">

                        {/* Left Side: Title */}
                        <div className="d-flex align-items-center">
                            <div className="rounded-circle bg-primary bg-opacity-10 p-2 me-3 d-flex align-items-center justify-content-center" style={{ width: '45px', height: '45px' }}>
                                <i className="bi bi-speedometer2 text-primary fs-4"></i>
                            </div>
                            <div>
                                <h5 className="fw-bold mb-0">Analysis Report</h5>
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
                        <div className="row g-3 mb-4 p-3">

                            {/* 1. Total Cost (Top Left) */}
                            {/* 1. Total Cost */}
                            <div className="col-6">
                                <div className="p-3 h-100 rounded-4 shadow-sm border border-light"
                                    style={{ backgroundColor: '#f0f9ff' }}> {/* Soft Blue bg */}
                                    <div className="d-flex align-items-center mb-2">
                                        <div className="rounded-circle bg-white p-1 d-flex align-items-center justify-content-center shadow-sm"
                                            style={{ width: '32px', height: '32px' }}>
                                            <i className="bi bi-tag-fill text-primary small"></i>
                                        </div>
                                        <small className="text-muted fw-bold ms-2" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Total Cost</small>
                                    </div>
                                    <h5 className="fw-bold mb-0 text-dark">{formatLakhs(breakdown.totalCost)}</h5>
                                </div>
                            </div>

                            {/* 2. Net Profit */}
                            <div className="col-6">
                                <div
                                    className="p-3 h-100 rounded-4 shadow-sm border border-light"
                                    style={{
                                        backgroundColor: breakdown.netGainLoss >= 0 ? '#f0fdf4' : '#fef2f2' // Soft Green or Soft Red
                                    }}
                                >
                                    <div className="d-flex align-items-center mb-2">
                                        <div className="rounded-circle bg-white p-1 d-flex align-items-center justify-content-center shadow-sm"
                                            style={{ width: '32px', height: '32px' }}>
                                            <i className={`bi ${breakdown.netGainLoss >= 0 ? 'bi-graph-up-arrow text-success' : 'bi-graph-down-arrow text-danger'} small`}></i>
                                        </div>
                                        <small className={`fw-bold ms-2 ${breakdown.netGainLoss >= 0 ? 'text-success' : 'text-danger'}`} style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.8 }}>
                                            Net Profit
                                        </small>
                                    </div>
                                    <h5 className={`fw-bold mb-0 ${breakdown.netGainLoss >= 0 ? 'text-success' : 'text-danger'}`}>
                                        {formatLakhs(breakdown.netGainLoss)}
                                    </h5>
                                </div>
                            </div>

                            {/* 3. ROI */}
                            <div className="col-6">
                                <div className="p-3 h-100 rounded-4 shadow-sm border border-light" style={{ backgroundColor: '#f5f3ff' }}> {/* Soft Purple/Indigo */}
                                    <div className="d-flex align-items-center mb-2">
                                        <div className="rounded-circle bg-white p-1 d-flex align-items-center justify-content-center shadow-sm"
                                            style={{ width: '32px', height: '32px' }}>
                                            <i className="bi bi-trophy-fill text-primary small" style={{ color: '#7c3aed' }}></i>
                                        </div>
                                        <small className="text-muted fw-bold ms-2" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>ROI</small>
                                    </div>
                                    <h5 className="fw-bold mb-0" style={{ color: '#7c3aed' }}>{formatPercent(breakdown.roi)}</h5>
                                </div>
                            </div>

                            {/* 4. Cash After Sale */}
                            <div className="col-6">
                                <div className="p-3 h-100 rounded-4 shadow-sm border border-light" style={{ backgroundColor: '#fffbeb' }}> {/* Soft Orange/Yellow */}
                                    <div className="d-flex align-items-center mb-2">
                                        <div className="rounded-circle bg-white p-1 d-flex align-items-center justify-content-center shadow-sm"
                                            style={{ width: '32px', height: '32px' }}>
                                            <i className="bi bi-wallet-fill text-warning small"></i>
                                        </div>
                                        <small className="text-muted fw-bold ms-2" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Cash-in-Hand</small>
                                    </div>
                                    <h5 className="fw-bold mb-0 text-dark">{formatLakhs(breakdown.leftoverCash)}</h5>
                                </div>
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
                                            <span className="fw-bold" style={{ fontSize: '0.75rem' }}>{item.value}</span>
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
                                            <span className="fw-bold" style={{ fontSize: '0.75rem' }}>{item.value}</span>
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
                                            <span className="fw-bold" style={{ fontSize: '0.75rem' }}>{item.value}</span>
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
                                            <span className="fw-bold" style={{ fontSize: '0.75rem' }}>{item.value}</span>
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

    // --- NEW: Loan & Interest Summary Table ---
    const renderLoanSummaryTable = (breakdown) => {
        if (!breakdown) return null;

        // Helper to create a row
        const SummaryRow = ({ label, principal, interest, total, isTotal = false }) => (
            <tr className={isTotal ? "table-primary fw-bold" : ""}>
                <td className="ps-3 text-start">{label}</td>
                <td className="text-end">{formatLakhs(principal)}</td>
                <td className="text-end text-danger">{formatLakhs(interest)}</td>
                <td className="text-end pe-3">{formatLakhs(total)}</td>
            </tr>
        );

        // Calculate Totals
        const totalPrincipal = breakdown.homeLoanAmount +
            (breakdown.hasPersonalLoan1 ? breakdown.personalLoan1Amount : 0) +
            (breakdown.hasPersonalLoan2 ? breakdown.personalLoan2Amount : 0);

        const totalInterest = breakdown.totalInterestPaid; // Includes IDC

        // Total Paid is usually Principal + Interest (approx for display)
        const totalPaid = totalPrincipal + totalInterest;

        return (
            <div className="glass-card mb-4 overflow-hidden">
                <div className="p-3 border-bottom border-secondary border-opacity-10 d-flex justify-content-between align-items-center">
                    <h6 className="fw-bold mb-0 text-primary">
                        <i className="bi bi-table me-2"></i>Total Payment Summary
                    </h6>
                </div>

                <div className="table-responsive">
                    <table className="table table-sm table-borderless mb-0 small align-middle">
                        <thead className="bg-light text-muted border-bottom">
                            <tr>
                                <th className="py-2 ps-3 text-start">Source</th>
                                <th className="py-2 text-end">Principal</th>
                                <th className="py-2 text-end">Interest</th>
                                <th className="py-2 text-end pe-3">Total Paid</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* 1. IDC (Interest Only) */}
                            {breakdown.hasIDC && (
                                <SummaryRow
                                    label="IDC (Const.)"
                                    principal={0}
                                    interest={breakdown.totalIDC}
                                    total={breakdown.totalIDC}
                                />
                            )}

                            {/* 2. Home Loan */}
                            <SummaryRow
                                label="Home Loan"
                                principal={breakdown.homeLoanAmount}
                                interest={breakdown.homeLoanInterestPaid}
                                total={breakdown.homeLoanAmount + breakdown.homeLoanInterestPaid}
                            />

                            {/* 3. Personal Loan 1 */}
                            {breakdown.hasPersonalLoan1 && (
                                <SummaryRow
                                    label="Personal Loan 1"
                                    principal={breakdown.personalLoan1Amount}
                                    interest={breakdown.personalLoan1InterestPaid || 0}
                                    total={breakdown.personalLoan1Amount + (breakdown.personalLoan1InterestPaid || 0)}
                                />
                            )}

                            {/* 4. Personal Loan 2 */}
                            {breakdown.hasPersonalLoan2 && (
                                <SummaryRow
                                    label="Personal Loan 2"
                                    principal={breakdown.personalLoan2Amount}
                                    interest={breakdown.personalLoan2InterestPaid || 0}
                                    total={breakdown.personalLoan2Amount + (breakdown.personalLoan2InterestPaid || 0)}
                                />
                            )}

                            {/* Divider Line */}
                            <tr><td colSpan="4" className="p-0 border-top"></td></tr>

                            {/* 5. GRAND TOTAL */}
                            <SummaryRow
                                label="Total"
                                principal={totalPrincipal}
                                interest={totalInterest}
                                total={totalPaid}
                                isTotal={true}
                            />
                        </tbody>
                    </table>
                </div>
                <div className="p-2 bg-light bg-opacity-50 text-center border-top">
                    <small className="text-muted fst-italic" style={{ fontSize: '0.65rem' }}>
                        * Values in Lakhs (L). Total Paid = Principal + Interest
                    </small>
                </div>
            </div>
        );
    };

    const renderBreakdownTab = () => {
        const breakdown = calculatedData.detailedBreakdown;
        const handleViewScheduleClick = () => {
            handleDelayedNavigation('/schedule', {
                // ✅ PASS THE EXACT SAME DATA STRUCTURE AS DESKTOP
                idcReport: breakdown.idcReport, // Contains schedule, grandTotal, min/max, cutoff etc.
                pl1EMI: breakdown.personalLoan1EMI,
                interestRate: propertyData.assumptions.homeLoanRate,
            }, "Opening Construction Schedule...");
        };
        const handleViewMonthlyBreakdown = () => {
            handleDelayedNavigation('/monthly-breakdown', {
                // Pass the data your MonthlyBreakdownPage likely expects
                monthlyLedger: breakdown.monthlyLedger, // <--- This is the key!
                propertyName: propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.name,
                homeLoanAmount: breakdown.homeLoanAmount,
                homeLoanStartMode: propertyData.assumptions.homeLoanStartMode,
                possessionMonths: breakdown.possessionMonths// Or calculate actual start date
            }, "Generating Repayment Schedule...");
        };

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
                    <h6 className="fw-bold text-primary mb-3 ps-2 border-start border-4 border-primary">
                        EMI Timeline
                    </h6>

                    <MobileTimelineAccordion
                        breakdown={breakdown}
                        onViewSchedule={handleViewScheduleClick}
                        onViewMonthlyBreakdown={handleViewMonthlyBreakdown}
                    />
                </div>

                {/* 3. Interest During Construction (Simplified) */}
                {breakdown.hasIDC && (
                    <div className="glass-card mb-4 p-3">
                        <h6 className="fw-bold mb-3">
                            <i className="bi bi-tools me-2"></i>IDC Summary
                        </h6>
                        <div className="row g-2">
                            {renderStatCard("Avg Monthly", formatCurrency(breakdown.monthlyIDCEMI), "", "info", 6)}
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
                        <h6 className="small fw-bold mb-3 text-uppercase">Home Loan Breakdown</h6>
                        <div className="row g-2">
                            {renderStatCard("EMI Amount", formatCurrency(breakdown.homeLoanEMI), "Monthly", "primary", 6)}
                            {renderStatCard("Total Paid", formatCurrency(breakdown.homeLoanEMIPaid), "Principal + Int", "success", 6)}
                            {renderStatCard("Interest Only", formatCurrency(breakdown.homeLoanInterestPaid), "Cost of Loan", "info", 6)}
                            {renderStatCard("Balance Due", formatCurrency(breakdown.homeLoanOutstanding), "To Close", "danger", 6)}
                        </div>
                    </div>

                    {/* Personal Loans (Conditional) */}
                    {(breakdown.hasPersonalLoan1 || breakdown.hasPersonalLoan2) && (
                        <div className="glass-card p-3">
                            <h6 className="small fw-bold mb-3 text-uppercase">Personal Loans</h6>
                            <div className="row g-2">
                                {breakdown.hasPersonalLoan1 && renderStatCard("PL1 Total Paid", formatCurrency(breakdown.personalLoan1EMIPaid), "Loan 1", "success", 6)}
                                {breakdown.hasPersonalLoan2 && renderStatCard("PL2 Total Paid", formatCurrency(breakdown.personalLoan2EMIPaid), "Loan 2", "info", 6)}
                            </div>
                        </div>
                    )}
                </div>

                {/* 5. Final Financial Summaries */}
                <div className="glass-card mb-4 p-3">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                        <h6 className="fw-bold mb-0">Total Interest Cost</h6>
                        <span className="badge bg-warning">{breakdown.years} Years</span>
                    </div>
                    <h2 className="fw-bold mb-0">{formatLakhs(breakdown.totalInterestPaid)}</h2>
                    {breakdown.hasIDC && <small className="text-muted">Includes construction interest</small>}
                </div>

                <div className="glass-card mb-4 p-3 border-2">
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

    // 4. BOTTOM NAVIGATION - "Expanding Pill" Layout
    const renderBottomNav = () => {
        const navItems = [
            { id: 'inputs', label: 'Inputs', icon: 'bi-sliders' },
            { id: 'overview', label: 'Overview', icon: 'bi-speedometer2' },
            { id: 'breakdown', label: 'Details', icon: 'bi-calculator-fill' },
        ];


        return (
            <div className="mobile-bottom-nav">
                <div className="d-flex justify-content-around align-items-center py-3 px-2">
                    {navItems.map((item) => {
                        const isActive = activeTab === item.id;

                        return (
                            <div
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                role="button"
                                className={`nav-pill-item ${isActive ? 'active' : ''}`}
                            >
                                {/* Icon */}
                                <i className={`bi ${item.icon} fs-5`}></i>

                                {/* Label (Visible only when active) */}
                                <div
                                    style={{
                                        maxWidth: isActive ? '100px' : '0', // Animate width
                                        opacity: isActive ? 1 : 0,           // Animate opacity
                                        overflow: 'hidden',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.3s ease-out',
                                        marginLeft: isActive ? '8px' : '0'
                                    }}
                                >
                                    <span className="fw-bold small">{item.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };
    const renderPreviewModal = () => {
        if (!showPreview) return null;

        const { assumptions, purchasePrice, otherCharges, stampDuty, gstPercentage, paymentPlan, properties } = propertyData;
        const selectedProp = properties.find(p => p.id === userSelections.selectedPropertyId) || properties[0];

        // 1. Navigation Helper: Closes modal -> Goes to specific step
        const handleEditStep = (stepNumber) => {
            setShowPreview(false);
            setCurrentStep(stepNumber);
        };

        // 2. UI Helper: Consistent Row for Data
        const PreviewRow = ({ label, value }) => (
            <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="text-muted small">{label}</span>
                <span className="fw-bold small">{value || '-'}</span>
            </div>
        );

        // 3. UI Helper: Header with Edit Pencil
        const SectionHeader = ({ title, icon, targetStep }) => (
            <div className="d-flex justify-content-between align-items-center mb-3 border-bottom border-secondary border-opacity-10 pb-2">
                <h6 className="fw-bold gradient-text opacity-75 small mb-0 text-uppercase">
                    <i className={`bi ${icon} me-2`}></i>{title}
                </h6>
                <button
                    className="btn btn-sm btn-link text-decoration-none p-0 text-secondary opacity-75 hover-opacity-100"
                    onClick={() => handleEditStep(targetStep)}
                    title={`Edit ${title}`}
                >
                    <i className="bi bi-pencil-square fs-6"></i>
                </button>
            </div>
        );

        return (
            <>
                {/* Backdrop */}
                <div
                    className="position-fixed top-0 start-0 w-100 h-100 bg-dark"
                    style={{ zIndex: 3000, opacity: 0.7, backdropFilter: 'blur(4px)' }}
                    onClick={() => setShowPreview(false)}
                ></div>

                {/* Modal Content */}
                <div
                    className="position-fixed top-50 start-50 translate-middle w-100"
                    style={{ maxWidth: '900px', zIndex: 3010, maxHeight: '95vh', overflowY: 'auto' }}
                >
                    <div className="glass-card p-0 m-3 shadow-lg">

                        {/* Header */}
                        <div className="p-4 border-bottom border-secondary border-opacity-10 d-flex justify-content-between align-items-center">
                            <div>
                                <h4 className="fw-bold gradient-text mb-1">
                                    <i className="bi bi-clipboard-check me-2"></i>Review Inputs
                                </h4>
                                <p className="mb-0 text-muted small">Verify parameters before analysis</p>
                            </div>
                            <button
                                onClick={() => setShowPreview(false)}
                                className="btn btn-sm btn-outline-secondary rounded-circle"
                                style={{ width: '32px', height: '32px', padding: 0 }}
                            >
                                <i className="bi bi-x-lg "></i>
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-4">

                            {/* --- ROW 1: STEP 1 (Property & Costs) --- */}
                            <div className="row g-4 mb-4">
                                <div className="col-md-6">
                                    <div className="p-3 rounded bg-light bg-opacity-10 border border-secondary border-opacity-10 h-100">
                                        <SectionHeader title="Property Details" icon="bi-building" targetStep={1} />

                                        <PreviewRow label="Name" value={selectedProp?.name} />
                                        <PreviewRow label="Location" value={selectedProp?.location} />
                                        <PreviewRow label="Size" value={`${selectedProp?.size} sq.ft`} />
                                        <PreviewRow label="Possession" value={`${selectedProp?.possessionMonths} Months`} />
                                    </div>
                                </div>
                                <div className="col-md-6">
                                    <div className="p-3 rounded bg-light bg-opacity-10 border border-secondary border-opacity-10 h-100">
                                        <SectionHeader title="Cost Breakdown" icon="bi-tag" targetStep={1} />

                                        <PreviewRow label="Purchase Price" value={`${formatCurrency(purchasePrice)}/sq.ft`} />
                                        <PreviewRow label="Other Charges" value={formatCurrency(otherCharges)} />
                                        <PreviewRow label="Stamp Duty" value={`${stampDuty}%`} />
                                        <PreviewRow label="GST" value={`${gstPercentage}%`} />
                                    </div>
                                </div>
                            </div>

                            {/* --- ROW 2: STEP 2 (Payment Plan) --- */}
                            <div className="mb-4">
                                <SectionHeader title="Payment Plan & Timeline" icon="bi-credit-card" targetStep={2} />

                                <div className="row g-3">
                                    <div className="col-md-4">
                                        <div className="mb-2"><span className="text-muted small d-block">Plan Type</span><span className="fw-bold">{paymentPlan.toUpperCase()}</span></div>
                                    </div>
                                    <div className="col-md-4">
                                        <div className="mb-2"><span className="text-muted small d-block">Investment Period</span><span className="fw-bold">{assumptions.investmentPeriod} {assumptions.holdingPeriodUnit || 'Years'}</span></div>
                                    </div>
                                    {paymentPlan === 'clp' && (
                                        <div className="col-md-4">
                                            <div className="mb-2"><span className="text-muted small d-block">Construction</span><span className="fw-bold">{assumptions.clpDurationYears} Yrs</span></div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* --- ROW 3: STEP 3 (Funding Mix) --- */}
                            <div className="mb-4">
                                <SectionHeader title="Funding Mix & Loans" icon="bi-bank" targetStep={3} />

                                <div className="table-responsive rounded border border-secondary border-opacity-10">
                                    <table className="table table-hover table-borderless table-sm mb-0 small bg-transparent">
                                        <thead className="bg-light bg-opacity-10 border-bottom border-secondary border-opacity-10">
                                            <tr>
                                                <th className="fw-bold ps-3 gradient-text">Source</th>
                                                <th className="fw-bold text-end gradient-text">Share</th>
                                                <th className="fw-bold text-end gradient-text">Rate</th>
                                                <th className="fw-bold text-end gradient-text">Tenure</th>
                                                <th className="fw-bold text-end gradient-text pe-3">Start</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td className="ps-3">Down Payment</td>
                                                <td className="text-end">{assumptions.downPaymentShare}%</td>
                                                <td className="text-end text-muted">-</td>
                                                <td className="text-end text-muted">-</td>
                                                <td className="text-end pe-3">Month 0</td>
                                            </tr>
                                            <tr>
                                                <td className="ps-3 fw-bold text-primary">Home Loan</td>
                                                <td className="text-end">{assumptions.homeLoanShare}%</td>
                                                <td className="text-end">{assumptions.homeLoanRate}%</td>
                                                <td className="text-end">{assumptions.homeLoanTerm} Yr</td>
                                                <td className="text-end pe-3">
                                                    {assumptions.homeLoanStartMode === 'manual'
                                                        ? `Month ${assumptions.homeLoanStartMonth}`
                                                        : `Auto (+${assumptions.homeLoanStartMonth}mo)`}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="ps-3">Personal Loan 1</td>
                                                <td className="text-end">{assumptions.personalLoan1Share}%</td>
                                                <td className="text-end">{assumptions.personalLoan1Rate}%</td>
                                                <td className="text-end">{assumptions.personalLoan1Term} Yr</td>
                                                <td className="text-end pe-3">Month {assumptions.personalLoan1StartMonth}</td>
                                            </tr>
                                            <tr>
                                                <td className="ps-3">Personal Loan 2</td>
                                                <td className="text-end">{assumptions.personalLoan2Share}%</td>
                                                <td className="text-end">{assumptions.personalLoan2Rate}%</td>
                                                <td className="text-end">{assumptions.personalLoan2Term} Yr</td>
                                                <td className="text-end pe-3">Possession +{assumptions.personalLoan2StartMonth}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* --- ROW 4: STEP 4 (Exit Scenarios) --- */}
                            <div className="mb-2">
                                <SectionHeader title="Exit Price Scenarios" icon="bi-graph-up-arrow" targetStep={4} />

                                <div className="d-flex flex-wrap gap-2">
                                    <div className="px-3 py-2 rounded border border-primary bg-primary bg-opacity-10">
                                        <span className="d-block small text-primary mb-1 fw-bold">Selected</span>
                                        <span className="fw-bold">{formatCurrency(userSelections.selectedExitPrice)}</span>
                                    </div>
                                    {userSelections.scenarioExitPrices.map((price, idx) => (
                                        <div key={idx} className="px-3 py-2 rounded border border-secondary border-opacity-25 bg-light bg-opacity-10">
                                            <span className="d-block small text-muted mb-1">Scenario {idx + 1}</span>
                                            <span className="fw-bold">{formatCurrency(price)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                        </div>

                        {/* Footer Actions */}
                        <div className="p-3 border-top border-secondary border-opacity-10 bg-light bg-opacity-10 d-flex justify-content-end gap-2">
                            <button
                                className="btn btn-outline-secondary px-4 rounded-pill"
                                onClick={() => setShowPreview(false)}
                            >
                                Close
                            </button>
                            <button
                                className="btn btn-primary px-4 rounded-pill shadow-sm"
                                onClick={() => setShowPreview(false)}
                            >
                                <i className="bi bi-check-lg me-2"></i>Confirm Details
                            </button>
                        </div>

                    </div>
                </div>
            </>
        );
    };
    // ✅ SAVE HANDLER
    const handleSaveScenario = async () => {
        if (!user) {
            if (window.confirm("Sign in to save properties?")) loginWithGoogle();
            return;
        }
        if (!calculatedData.detailedBreakdown || calculatedData.detailedBreakdown.totalCost === 0) {
            alert("Please Analyze first.");
            return;
        }

        const currentProp = propertyData.properties.find(p => p.id === userSelections.selectedPropertyId) || propertyData.properties[0];

        const newScenario = {
            userId: user.uid,
            timestamp: new Date().toISOString(),
            name: currentProp.name || "Untitled Property",
            location: currentProp.location || "Unknown",
            metrics: {
                totalCost: calculatedData.detailedBreakdown.totalCost,
                roi: calculatedData.detailedBreakdown.roi,
                netProfit: calculatedData.detailedBreakdown.netGainLoss,
                years: calculatedData.detailedBreakdown.years,
                // Ensure outstanding is saved
                outstanding: calculatedData.detailedBreakdown.totalLoanOutstanding
            },
            data: propertyData,
            selections: userSelections
        };

        try {
            const docRef = await addDoc(collection(db, "scenarios"), newScenario);
            setSavedScenarios(prev => [{ id: docRef.id, ...newScenario }, ...prev]);
            alert("✅ Property Saved!");
        } catch (e) {
            console.error("Save Error", e);
            alert("Failed to save.");
        }
    };

    // ✅ DELETE HANDLER
    const handleDeleteScenario = async (id) => {
        if (!window.confirm("Delete this property?")) return;
        try {
            await deleteDoc(doc(db, "scenarios", id));
            setSavedScenarios(prev => prev.filter(item => item.id !== id));
        } catch (e) { console.error(e); }
    };

    // ✅ LOAD HANDLER
    const handleLoadScenario = (scenario) => {
        if (window.confirm(`Load "${scenario.name}"? Unsaved changes will be lost.`)) {
            setPropertyData(scenario.data);
            setUserSelections(scenario.selections);
            setShowSavedDrawer(false);
            // Trigger analysis after loading state settles
            setTimeout(() => handleAnalyzeClick(), 500);
        }
    };

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
            {renderPreviewModal()}
            {renderSavedPropertiesDrawer()}
        </div>
    );
};

export default PropertyComparisonMobile;
