import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate, useLocation } from 'react-router-dom'; // Add this import
import './PropertyComparison.css';

// ===================== CONSTANTS =====================
// ... existing DEFAULT_PROPERTY constant ...

// 1. CONSTANT: Initial State for Property Data
const INITIAL_PROPERTY_DATA = {
    purchasePrice: '',
    otherCharges: '',
    stampDuty: '',
    gstPercentage: '',
    exitPrices: [],
    properties: [
        {
            id: '',
            size: '',
            name: '',
            location: '',
            rating: 0,
            isHighlighted: true,
        }
    ],
    paymentPlan: 'clp',
    assumptions: {
        homeLoanRate: '', homeLoanTerm: '', homeLoanShare: 80, homeLoanStartMonth: 0, // This now acts as "Delay" in Default mode, or "Month" in Manual mode
        homeLoanStartMode: 'default',
        personalLoan1Rate: '', personalLoan1Term: 7, personalLoan1StartMonth: 0, personalLoan1Share: 10,
        personalLoan2Rate: '', personalLoan2Term: 7, personalLoan2StartMonth: 30, personalLoan2Share: 10,
        downPaymentShare: 0,
        investmentPeriod: '', clpDurationYears: '', bankDisbursementStartMonth: '', bankDisbursementInterval: '', lastBankDisbursementMonth: ''
    }
};

// 2. CONSTANT: Initial State for User Selections
const INITIAL_USER_SELECTIONS = {
    selectedPropertyId: 1, // Default to the first empty property
    selectedExitPrice: '', // Blank
    selectedYears: '',
    selectedPropertySize: '', // Blank
    scenarioSize: '',
    scenarioExitPrice: '',
    scenarioExitPrices: []
};

// ===================== 1. PURE UTILITIES (Moved Outside for Speed) =====================

// Formatting Helpers

const formatLakhs = (value) => (!value && value !== 0) ? '₹0L' : `₹${(value / 100000).toFixed(2)}L`;
const formatCurrency = (value) => (!value && value !== 0) ? '₹0' : `₹${Math.round(value).toLocaleString()}`;
const formatPercent = (value) => (!value && value !== 0) ? '0%' : `${value.toFixed(1)}%`;

// Math Helpers (Standard Formulas)
const calculateEMI = (principal, annualRate, years) => {
    // 1. Safety Check: If Principal or Years are 0/Invalid, return 0 to prevent Infinity
    if (!principal || principal === 0) return 0;
    if (!years || years <= 0) return 0; // <--- ADD THIS LINE

    // 2. Handle 0% Interest Case (Simple Division)
    if (!annualRate || annualRate === 0) return principal / (years * 12);

    const monthlyRate = annualRate / (12 * 100);
    const months = years * 12;

    // Standard EMI Formula
    return principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
};

const calculateOutstandingAfterPayments = (principal, annualRate, years, paymentsMade) => {
    if (!principal || principal === 0) return 0;
    if (paymentsMade <= 0) return principal;
    const monthlyRate = annualRate / (12 * 100);
    const totalMonths = years * 12;
    if (paymentsMade >= totalMonths) return 0;
    const outstanding = principal * (Math.pow(1 + monthlyRate, totalMonths) - Math.pow(1 + monthlyRate, paymentsMade)) / (Math.pow(1 + monthlyRate, totalMonths) - 1);
    return Math.max(0, outstanding);
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


// ===================== 2. UI TEMPLATES (Stateless) =====================

const renderMetricCard = (label, value, icon, color) => (
    <div className="col-6 col-md-3">
        <div className="metric-card glass-card text-center h-100 p-3">
            {/* Fixed width/height ensures a perfect circle */}
            <div
                className={`rounded-circle bg-${color} bg-opacity-20 d-flex align-items-center justify-content-center mx-auto mb-3`}
                style={{ width: '60px', height: '60px' }}
            >
                <i className={`bi ${icon} text-${color} fs-3`}></i>
            </div>
            <h4 className="fw-bold mb-1">{value}</h4>
            <p className="text-muted mb-0 small">{label}</p>
        </div>
    </div>
);

const renderStatCard = (label, value, subtext, color, colSize = 4) => (
    <div className={`col-6 col-md-${colSize}`}>
        <div className={`p-3 bg-${color} text-white rounded text-center h-100`}>
            <small className="text-white opacity-75">{label}</small>
            <div className="fw-bold fs-4 my-1">{value}</div>
            <small className="text-white opacity-75">{subtext}</small>
        </div>
    </div>
);
// Helper: Converts empty strings or invalid numbers to 0 for calculations
const getSafeValue = (value) => {
    if (value === '' || value === null || isNaN(value)) return 0;
    return parseFloat(value);
};
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
            <h5 className="mb-4 fw-bold"><i className="bi bi-bar-chart-fill me-2 text-primary"></i>Profit Potential</h5>

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

// ===================== 3. MAIN COMPONENT =====================

const PropertyComparison = () => {
    // --- STATE ---
    // Inside PropertyComparison component, with other states
    const [validationError, setValidationError] = useState('');
    const location = useLocation();
    // Add this with your other state variables
    const [showExitLogic, setShowExitLogic] = useState(false);
    // ... existing state definitions ...
    const [activeTab, setActiveTab] = useState(location.state?.returnTab || 'inputs');
    const navigate = useNavigate();
    // --- SCROLL & NAV LOGIC ---
    const [showNav, setShowNav] = useState(true); // Is the floating nav visible?
    const [isSticky, setIsSticky] = useState(false); // Are we past the threshold?
    const [lastScrollY, setLastScrollY] = useState(0);
    const navRef = useRef(null);
    // ⬇️ ADD THIS USEEFFECT ⬇️
    // This clears the "redirect" instruction from the browser history
    // so that if you refresh later, it doesn't force you back to 'breakdown'.
    useEffect(() => {
        if (location.state?.returnTab) {
            // Replace the current history entry with a clean state
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.pathname, location.state, navigate]);
    // ⬆️ END ADDITION ⬆️

    useEffect(() => {
        const controlNavbar = () => {
            const currentScrollY = window.scrollY;

            // 1. Determine Sticky State (Float only after scrolling 220px)
            if (currentScrollY > 220) {
                setIsSticky(true);
            } else {
                setIsSticky(false);
            }

            // 2. Smart Hide/Show Logic (Only applies when sticky)
            if (currentScrollY > lastScrollY && currentScrollY > 220) {
                setShowNav(false); // Scrolling Down -> Hide
            } else {
                setShowNav(true);  // Scrolling Up -> Show
            }

            setLastScrollY(currentScrollY);
        };

        window.addEventListener('scroll', controlNavbar);
        return () => window.removeEventListener('scroll', controlNavbar);
    }, [lastScrollY]);

    // Restore history
    useEffect(() => {
        if (location.state?.returnTab) {
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.pathname, location.state, navigate]);
    // ... rest of your code ...
    // New State for Wizard Steps
    // 3. Wizard Step State (Smart Initialization)
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
    const [maxStepReached, setMaxStepReached] = useState(() => {
        // Initialize max step same as current step logic
        const savedData = localStorage.getItem('propertyCalc_data');
        if (savedData) {
            const parsed = JSON.parse(savedData);
            if (parsed.purchasePrice && parsed.purchasePrice > 0) {
                return 4; // Everything unlocked
            }
        }
        return 1;
    });

    const [showDataEnteredAlert, setShowDataEnteredAlert] = useState(false);

    // 1. Input Data State (Load from Local Storage OR use Default)
    const [propertyData, setPropertyData] = useState(() => {
        try {
            const savedData = localStorage.getItem('propertyCalc_data');
            return savedData ? JSON.parse(savedData) : INITIAL_PROPERTY_DATA;
        } catch (e) {
            console.error("Failed to load property data", e);
            return INITIAL_PROPERTY_DATA;
        }
    });

    // 2. Analysis Selection State (Load from Local Storage OR use Default)
    const [userSelections, setUserSelections] = useState(() => {
        try {
            const savedSelections = localStorage.getItem('propertyCalc_selections');
            return savedSelections ? JSON.parse(savedSelections) : INITIAL_USER_SELECTIONS;
        } catch (e) {
            console.error("Failed to load selections", e);
            return INITIAL_USER_SELECTIONS;
        }
    });

    // ⬇️ NEW: Auto-populate Exit Price based on Holding Period logic
    useEffect(() => {
        if (currentStep === 4) {
            const purchasePrice = parseFloat(propertyData.purchasePrice) || 0;

            // Only run if we have a Purchase Price and the Exit Price is currently empty/zero
            if (purchasePrice > 0 && (!userSelections.selectedExitPrice || userSelections.selectedExitPrice === 0)) {

                // 1. Determine Duration in Years (Handle months/years unit)
                let years = parseFloat(propertyData.assumptions.investmentPeriod) || 0;
                if (propertyData.assumptions.holdingPeriodUnit === 'months') {
                    years = years / 12;
                }

                // 2. Apply Instructor's Logic Table
                let increment = 0;

                if (years < 1) {
                    increment = 500;
                } else if (years >= 1 && years < 2) {
                    increment = 1000; // For "1 year"
                } else if (years >= 2 && years < 3) {
                    increment = 2000; // For "2 year"
                } else if (years >= 3 && years < 4) {
                    increment = 2500; // For "3 year"
                } else if (years >= 4 && years < 5) {
                    increment = 3000; // For "4 year"
                } else {
                    increment = 3500; // For "=> 5 year"
                }

                // 3. Set the calculated price
                setUserSelections(prev => ({
                    ...prev,
                    selectedExitPrice: purchasePrice + increment
                }));
            }
        }
    }, [
        currentStep,
        propertyData.purchasePrice,
        propertyData.assumptions.investmentPeriod,
        propertyData.assumptions.holdingPeriodUnit,
        userSelections.selectedExitPrice
    ]);

    // --- EXPORT FUNCTIONALITY ---

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

    // --- PERSISTENCE EFFECTS ---

    // Save 'propertyData' whenever it changes
    useEffect(() => {
        localStorage.setItem('propertyCalc_data', JSON.stringify(propertyData));
    }, [propertyData]);

    // Save 'userSelections' whenever it changes
    useEffect(() => {
        localStorage.setItem('propertyCalc_selections', JSON.stringify(userSelections));
    }, [userSelections]);


    // ===================== LOGIC ENGINE (useMemo) =====================
    // This replaces all your useCallback and useEffect logic for calculations.
    // It automatically recalculates ONLY when propertyData or userSelections change.

    const handleResetData = () => {
        // 1. Updated confirmation message
        if (window.confirm("Reset Property Details? \n(Note: Your Loan Distribution & Payment Plan settings will be KEPT)")) {

            setPropertyData(prev => ({
                ...INITIAL_PROPERTY_DATA, // Clears Price, Size, Name

                // Restore your existing Financial Settings
                paymentPlan: prev.paymentPlan,
                assumptions: {
                    ...INITIAL_PROPERTY_DATA.assumptions,
                    // KEEP THE SHARES:
                    homeLoanShare: prev.assumptions.homeLoanShare,
                    personalLoan1Share: prev.assumptions.personalLoan1Share,
                    personalLoan2Share: prev.assumptions.personalLoan2Share,
                    downPaymentShare: prev.assumptions.downPaymentShare,

                    // Keep specific CLP settings:
                    clpDurationYears: prev.assumptions.clpDurationYears,
                    bankDisbursementInterval: prev.assumptions.bankDisbursementInterval,

                    // Reset possession as it varies per property
                    possessionMonths: ''
                },

                // Reset properties list to default
                properties: [
                    {
                        id: 1,
                        size: '', // Reset to default size or ''
                        name: '',
                        location: '',
                        rating: 0,
                        isHighlighted: true,
                        possessionMonths: ''
                    }
                ]
            }));
            setUserSelections(INITIAL_USER_SELECTIONS);

            setCurrentStep(1);
            setMaxStepReached(1);   // Lock future steps (Step 2, 3, 4 become disabled again)

            alert("Property details reset. Loan settings preserved.");
        }
    };
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
    // ===================== EVENT HANDLERS =====================

    const handleSelectionUpdate = (field, value) => {
        setUserSelections(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleInputChange = (field, value) => {
        setPropertyData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleAssumptionChange = (field, value) => {
        setPropertyData(prev => ({
            ...prev,
            assumptions: {
                ...prev.assumptions,
                // ✅ FIX: Allow 'homeLoanStartMode' to be stored as text, just like 'holdingPeriodUnit'
                [field]: (field === 'holdingPeriodUnit' || field === 'homeLoanStartMode')
                    ? value
                    : (value === '' ? '' : parseFloat(value))
            }
        }));
    };

    const handleAddProperty = () => {
        const newId = propertyData.properties.length + 1;
        const newProperty = {
            id: newId,
            size: 1000,
            name: `Property ${newId}`,
            location: 'New Location',
            rating: 4.0,
            isHighlighted: false,
            possessionMonths: 24
        };

        setPropertyData(prev => ({
            ...prev,
            properties: [...prev.properties, newProperty]
        }));
    };

    const handleRemoveProperty = (id) => {
        if (propertyData.properties.length <= 1) return;

        setPropertyData(prev => ({
            ...prev,
            properties: prev.properties.filter(prop => prop.id !== id)
        }));
    };

    const handleAddExitPriceScenario = () => {
        let baseline = 0;

        // 1. If scenarios exist, take the max of those
        if (userSelections.scenarioExitPrices.length > 0) {
            // Use map/parseFloat to ensure we handle any temporary empty strings safely
            const existingValues = userSelections.scenarioExitPrices.map(p => parseFloat(p) || 0);
            baseline = Math.max(...existingValues);
        }
        // 2. If no scenarios, take the "Selected Exit Price"
        else if (userSelections.selectedExitPrice) {
            baseline = parseFloat(userSelections.selectedExitPrice);
        }
        // 3. Fallback to Purchase Price
        else {
            baseline = parseFloat(propertyData.purchasePrice) || 0;
        }

        // Add 500 increment
        const newPrice = baseline + 500;

        setUserSelections(prev => ({
            ...prev,
            scenarioExitPrices: [...prev.scenarioExitPrices, newPrice]
        }));
    };

    const handleRemoveExitPriceScenario = (index) => {
        if (userSelections.scenarioExitPrices.length < 1) return;

        setUserSelections(prev => ({
            ...prev,
            scenarioExitPrices: prev.scenarioExitPrices.filter((_, i) => i !== index)
        }));
    };

    const handleUpdateExitPriceScenario = (index, value) => {
        const newPrices = [...userSelections.scenarioExitPrices];
        newPrices[index] = value === '' ? '' : parseFloat(value);
        setUserSelections(prev => ({
            ...prev,
            scenarioExitPrices: newPrices
        }));
    };
    // 1. Generic Handler: Updates any field for a specific property
    // 1. Generic Handler: Updates any field for a specific property
    const updatePropertyField = (index, field, value) => {
        const newProperties = [...propertyData.properties];

        // Parse the value correctly
        const newValue = field === 'name' || field === 'location' ? value : parseFloat(value) || '';

        // Update the list
        newProperties[index][field] = newValue;
        setPropertyData(prev => ({ ...prev, properties: newProperties }));

        // <<< THE FIX: Sync "Size" with the Calculation Engine immediately >>>
        // If the user is editing the currently selected property's size, update the selection state too.
        if (newProperties[index].id === userSelections.selectedPropertyId && field === 'size') {
            setUserSelections(prev => ({
                ...prev,
                selectedPropertySize: newValue,
                scenarioSize: newValue
            }));
        }
    };

    // 💡 Hint Text Dictionary (Add this right before renderPropertyInput)
    const placeholders = {
        // ... existing Step 1 fields ...
        name: "e.g. Supernova Tower A",
        location: "e.g. Sector 94, Noida",
        size: "e.g. 1250",
        purchasePrice: "e.g. 6500",
        otherCharges: "e.g. 500000",
        stampDuty: "e.g. 7",

        // --- STEP 2: Payment Plan ---
        investmentPeriod: "e.g. 5 (Years)",
        downPaymentShare: "e.g. 20",
        homeLoanShare: "e.g. 80",
        personalLoan1Share: "e.g. 10",
        personalLoan2Share: "e.g. 10",

        // --- STEP 3: Loan Config ---
        possessionMonths: "e.g. 36 (Months)",

        // Home Loan
        homeLoanRate: "e.g. 8.5",
        homeLoanTerm: "e.g. 20",
        homeLoanStartMonth: "e.g. 1",

        // Personal Loan 1
        personalLoan1Rate: "e.g. 12",
        personalLoan1Term: "e.g. 5",
        personalLoan1StartMonth: "e.g. 0",

        // Personal Loan 2
        personalLoan2Rate: "e.g. 14",
        personalLoan2Term: "e.g. 3",
        personalLoan2StartMonth: "e.g. 24",

        // CLP Specific
        clpDurationYears: "e.g. 4",
        bankDisbursementStartMonth: "e.g. 3",
        bankDisbursementInterval: "e.g. 3"
    };

    // 2. UI Builder: Generates the input HTML automatically (UPDATED)
    const renderPropertyInput = (index, property, label, field, type = "text", helpText = "") => (
        <div className="mb-3">
            <label className="form-label small">{label}</label>
            <input
                type={type}
                className="form-control form-control-sm"
                value={property[field]}
                // ⬇️ ADDED PLACEHOLDER LOGIC HERE
                placeholder={placeholders[field] || `Enter ${label}`}
                onChange={(e) => updatePropertyField(index, field, e.target.value)}
            />
            {helpText && <small className="text-muted">{helpText}</small>}
        </div>
    );

    const handleAnalyzeClick = () => {
        setActiveTab('overview');
        setShowDataEnteredAlert(true);
        setTimeout(() => {
            setShowDataEnteredAlert(false);
        }, 3000);
    };

    const handlePaymentPlanChange = (plan) => {
        setPropertyData(prev => {
            let newAssumptions = { ...prev.assumptions };

            // 1. Create a copy of properties to update the selected one
            let newProperties = [...prev.properties];
            const selectedIndex = newProperties.findIndex(p => p.id === userSelections.selectedPropertyId);

            if (plan === 'clp') {
                // Standard CLP: 80% HL, 10% Booking (PL1), 10% Possession (PL2)
                newAssumptions.personalLoan1Share = 10;
                newAssumptions.personalLoan2Share = 10;
                newAssumptions.downPaymentShare = 0;
                newAssumptions.homeLoanShare = 80;
                newAssumptions.personalLoan1Term = 7; // Force 7 Years
                newAssumptions.personalLoan2Term = 7;

                // ✅ FIX: Set default possession on the PROPERTY, not assumptions
                if (selectedIndex !== -1) {
                    // Only set default if currently empty
                    if (!newProperties[selectedIndex].possessionMonths) {
                        newProperties[selectedIndex].possessionMonths = 24;
                        newAssumptions.homeLoanStartMonth = 25;
                    }
                }
            }
            else if (plan === '80-20') {
                newAssumptions.personalLoan1Share = 20;
                newAssumptions.personalLoan2Share = 0;
                newAssumptions.downPaymentShare = 0;
                newAssumptions.homeLoanShare = 80;
            }
            else if (plan === '25-75') {
                newAssumptions.personalLoan1Share = 25;
                newAssumptions.personalLoan2Share = 0;
                newAssumptions.downPaymentShare = 0;
                newAssumptions.homeLoanShare = 75;
            }
            else if (plan === 'rtm') {
                // Ready to Move
                newAssumptions.personalLoan1Share = 20;
                newAssumptions.personalLoan2Share = 0;
                newAssumptions.downPaymentShare = 0;
                newAssumptions.homeLoanShare = 80;

                // ✅ FIX: Force Property possession to 0 for RTM
                if (selectedIndex !== -1) {
                    newProperties[selectedIndex].possessionMonths = 0;
                    newAssumptions.homeLoanStartMonth = 0;
                }
            }
            else if (plan === 'custom') {
                if (!newAssumptions.downPaymentShare) newAssumptions.downPaymentShare = 0;
            }

            return {
                ...prev,
                paymentPlan: plan,
                assumptions: newAssumptions,
                properties: newProperties // ✅ Return the updated properties list
            };
        });
    };

    // ===================== RENDER FUNCTIONS =====================

    const renderInputsTab = () => {
        // 1. USE getSafeValue HERE to prevent NaN errors
        const userDefinedTotal = getSafeValue(propertyData.assumptions.downPaymentShare) +
            getSafeValue(propertyData.assumptions.personalLoan1Share) +
            getSafeValue(propertyData.assumptions.personalLoan2Share);

        // Helper: Renders a collapsible accordion section
        const renderAccordionSection = (id, title, icon, content) => {
            const isOpen = activeAccordion === id;

            return (
                // CHANGE 1: Used 'glass-card' as the main wrapper. Removed standard 'card' borders.
                <div className="glass-card mb-3">

                    {/* Header (Clickable) */}
                    <div
                        className="card-header border-0 py-3 cursor-pointer d-flex justify-content-between align-items-center bg-transparent"
                        // ✅ FIX 1: Toggle Logic - If it's already open, set state to empty string '' (close it), otherwise open 'id'
                        onClick={() => setActiveAccordion(isOpen ? '' : id)}
                        style={{ cursor: 'pointer' }}
                    >
                        {/* Title (Left) */}
                        <h5 className={`mb-0 fw-bold ${isOpen ? 'text-white' : ''}`}>
                            <i className={`bi ${icon} me-2`}></i>{title}
                        </h5>

                        {/* Arrow Icon (Right) */}
                        <i className={`bi bi-chevron-${isOpen ? 'up' : 'down'} ${isOpen ? 'text-white' : 'text-muted'}`}></i>
                    </div>

                    {/* Content (Visible only if open) */}
                    {isOpen && (
                        // CHANGE 3: Removed 'bg-white'. Added a subtle top border for separation.
                        <div className="card-body p-4 border-top border-secondary border-opacity-10 animate-fade-in">
                            {content}
                        </div>
                    )}
                </div>
            );
        };

        const validateCurrentStep = () => {
            let isValid = true;
            let errorMsg = '';

            const isEmpty = (val) => val === '' || val === null || val === undefined || val === 0 || Number.isNaN(val);
            const currentProp = propertyData.properties.find(p => p.id === userSelections.selectedPropertyId);

            if (currentStep === 1) {
                if (!currentProp?.name) { isValid = false; errorMsg = 'Please enter a Property Name.'; }
                else if (!currentProp?.location) { isValid = false; errorMsg = 'Please enter a Location.'; }
                else if (isEmpty(currentProp?.size)) { isValid = false; errorMsg = 'Please enter Property Size.'; }
                else if (isEmpty(propertyData.purchasePrice)) { isValid = false; errorMsg = 'Please enter Purchase Price.'; }
            }
            else if (currentStep === 2) {
                if (isEmpty(propertyData.assumptions.investmentPeriod) || propertyData.assumptions.investmentPeriod <= 0) {
                    isValid = false; errorMsg = 'Please enter a valid Holding Period (Years).';
                }
                else if (propertyData.paymentPlan === 'custom') {
                    const total = getSafeValue(propertyData.assumptions.downPaymentShare) +
                        getSafeValue(propertyData.assumptions.personalLoan1Share) +
                        getSafeValue(propertyData.assumptions.personalLoan2Share) +
                        getSafeValue(propertyData.assumptions.homeLoanShare);
                    if (total !== 100) { isValid = false; errorMsg = `Total allocation is ${total}%. It must be exactly 100%.`; }
                }
                if (propertyData.paymentPlan === 'clp') {
                    if (isEmpty(propertyData.assumptions.clpDurationYears)) {
                        isValid = false; errorMsg = 'Please enter Construction Duration.';
                    }
                    else if (isEmpty(propertyData.assumptions.bankDisbursementInterval)) {
                        isValid = false; errorMsg = 'Please enter Disbursement Interval.';
                    }
                    else {
                        // ✅ FIX: Ensure we use 'propertyData.assumptions' here
                        const constructionMonths = parseFloat(propertyData.assumptions.clpDurationYears) * 12;
                        const possessionMonths = parseFloat(currentProp?.possessionMonths || 0);

                        if (constructionMonths > possessionMonths) {
                            isValid = false;
                            errorMsg = `Logical Error: Construction (${constructionMonths}m) cannot exceed Possession time (${possessionMonths}m).`;
                        }
                    }
                }
            }
            else if (currentStep === 3) {
                // ✅ FIX: Check CURRENT PROPERTY possession, NOT assumptions.possessionMonths
                if (isEmpty(currentProp?.possessionMonths) && propertyData.paymentPlan !== 'rtm') {
                    isValid = false; errorMsg = 'Please enter Estimated Possession Months (in Step 1).';
                }
                else if (isEmpty(propertyData.assumptions.homeLoanRate)) { isValid = false; errorMsg = 'Please enter Home Loan Rate.'; }
                else if (isEmpty(propertyData.assumptions.homeLoanTerm)) { isValid = false; errorMsg = 'Please enter Home Loan Term.'; }
            }
            else if (currentStep === 4) {
                const selectedPrice = userSelections.selectedExitPrice;
                const scenarioPrices = userSelections.scenarioExitPrices;
                if (isEmpty(selectedPrice)) { isValid = false; errorMsg = 'Please enter a Selected Exit Price.'; }
                else if (scenarioPrices.includes(selectedPrice)) { isValid = false; errorMsg = `Selected Price (${selectedPrice}) cannot be the same as a Scenario Price.`; }
                else if (new Set(scenarioPrices).size !== scenarioPrices.length) { isValid = false; errorMsg = 'Scenario Exit Prices must be unique.'; }
            }

            if (!isValid) {
                setValidationError(errorMsg);
                setTimeout(() => setValidationError(''), 4000);
            } else {
                setValidationError('');
            }
            return isValid;
        };

        // Include Home Loan in the total calculation safely
        const currentTotal = userDefinedTotal + getSafeValue(propertyData.assumptions.homeLoanShare);

        const isError = currentTotal !== 100; // Simpler check for exactly 100%
        // --- WIZARD CONFIGURATION ---
        const steps = [
            { id: 1, label: "Property Details", icon: "bi-building" },
            { id: 2, label: "Payment Plan", icon: "bi-credit-card" },
            { id: 3, label: "Loan Config", icon: "bi-bank" },
            { id: 4, label: "Exit Scenarios", icon: "bi-graph-up-arrow" }
        ];

        // --- MODIFIED NEXT STEP FUNCTION ---
        const handleNextStep = () => {
            if (validateCurrentStep()) {
                const nextStep = currentStep + 1;
                setCurrentStep(prev => Math.min(prev + 1, steps.length));

                // ✅ FIX: Unlock the next step permanently
                setMaxStepReached(prev => Math.max(prev, nextStep));
            }
        };

        const prevStep = () => {
            setValidationError(''); // Clear error when going back
            setCurrentStep(prev => Math.max(prev - 1, 1));
        };
        // --- STEPPER HEADER COMPONENT ---
        const renderStepper = () => {

            // 1. HANDLER: Controls navigation logic
            const handleStepperClick = (targetStep) => {
                // A. Moving Backward: Always allow
                if (targetStep <= maxStepReached) {
                    // ✅ FIX: Allow jumping to any previously visited step
                    // Optional: You might want to validate the current step before leaving it, 
                    // but usually going back/jumping around unlocked steps is fine.
                    setCurrentStep(targetStep);
                }
                else if (targetStep === currentStep + 1) {
                    // Standard "Next" behavior logic
                    if (validateCurrentStep()) {
                        setCurrentStep(targetStep);
                        setMaxStepReached(prev => Math.max(prev, targetStep));
                    }
                }
                // C. Jumping Ahead (e.g., Step 1 to Step 3): Block it
                // (Do nothing)
            };

            return (
                <div className="mb-3 position-relative">
                    {/* Connecting Line (Background) */}
                    <div className="position-absolute top-0 start-0 translate-middle-y"
                        style={{
                            height: '2px',
                            backgroundColor: '#e9ecef',
                            zIndex: 0
                        }}
                    ></div>

                    {/* Active Line (Progress) */}
                    <div
                        className="position-absolute top-50 start-0 translate-middle-y bg-primary transition-all"
                        style={{
                            height: '2px',
                            width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
                            zIndex: 0,
                            transition: 'width 0.4s ease'
                        }}
                    ></div>

                    {/* Steps */}
                    <div className="d-flex justify-content-between position-relative" style={{ zIndex: 1 }}>
                        {steps.map((step) => {
                            const isActive = step.id === currentStep;
                            const isCompleted = step.id < currentStep;

                            // 2. LOGIC: Determine if this specific bubble is interactable
                            // Allow clicking previous steps OR the immediate next step only
                            const isClickable = step.id <= maxStepReached || step.id === currentStep + 1;
                            return (
                                <div key={step.id} className="text-center" style={{ width: '100px' }}>
                                    <div
                                        className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 shadow-sm ${isActive ? 'bg-primary text-white scale-110' :
                                            isCompleted ? 'bg-success text-white' : 'bg-white text-muted border'
                                            }`}
                                        style={{
                                            width: '40px',
                                            height: '40px',
                                            transition: 'all 0.3s ease',
                                            boxShadow: isActive ? '0 0 0 4px rgba(13, 110, 253, 0.2)' : 'none',
                                            // 3. UI: Change cursor to indicate if clickable or blocked
                                            cursor: isClickable ? 'pointer' : 'not-allowed',
                                            opacity: isClickable ? 1 : 0.6
                                        }}
                                        // 4. ACTION: Use the smart handler instead of setting state directly
                                        onClick={() => handleStepperClick(step.id)}
                                    >
                                        {isCompleted ? <i className="bi bi-check-lg fw-bold"></i> : <span className="fw-bold">{step.id}</span>}
                                    </div>
                                    <small className={`d-block fw-bold ${isActive ? 'text-primary' : 'text-muted'}`} style={{ fontSize: '0.75rem' }}>
                                        {step.label}
                                    </small>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        };

        // --- NAVIGATION FOOTER ---
        const renderNavButtons = () => (
            <div className="mt-5 pt-3 border-top">

                {/* Error Message Display */}
                {validationError && (
                    <div className="alert alert-danger py-2 mb-3 text-center animate-fade-in" role="alert">
                        <i className="bi bi-exclamation-circle-fill me-2"></i>
                        {validationError}
                    </div>
                )}

                <div className="d-flex justify-content-between">
                    {/* PREVIOUS BUTTON */}
                    <button
                        className="btn btn-primary rounded-pill px-4"
                        onClick={prevStep}
                        disabled={currentStep === 1}
                    >
                        <i className="bi bi-arrow-left me-2"></i> Previous
                    </button>

                    {/* NEXT / ANALYZE BUTTON */}
                    {currentStep < steps.length ? (
                        // Logic for Steps 1, 2, 3 (Already correct)
                        <button className="btn btn-primary rounded-pill px-4" onClick={handleNextStep}>
                            Next Step <i className="bi bi-arrow-right ms-2"></i>
                        </button>
                    ) : (
                        // Logic for Step 4 (THE FIX IS HERE)
                        <button
                            className="btn btn-primary rounded-pill px-5 shadow-lg"
                            onClick={() => {
                                // 1. Run Validation First
                                if (validateCurrentStep()) {
                                    // 2. Only if valid, run the analyze function
                                    handleAnalyzeClick();
                                }
                            }}
                        >
                            Analyze Property <i className="bi bi-graph-up ms-2"></i>
                        </button>
                    )}
                </div>
            </div>
        );

        return (
            <div className="mb-5 ">
                <div className="glass-card mb-4 ps-4 mt-4 pt-4">
                    <div className="d-flex justify-content-between align-items-center pe-4">
                        <div>
                            <h2 className="fw-bold mb-2 gradient-text ps-4 pt-2">
                                <i className="bi bi-input-cursor me-3"></i>
                                Input Parameters
                            </h2>
                            <p className="text-muted mb-0 ps-4">
                                Define your property details, payment plans, and loan assumptions
                            </p>
                        </div>

                        <button
                            className="btn btn-success d-flex align-items-center shadow-sm"
                            onClick={handleResetData}
                            title="Reset all fields to default values"
                            style={{
                                borderRadius: '50px',
                                padding: '8px 20px',
                                borderWidth: '2px',
                                fontWeight: '600'
                            }}
                        >
                            <i className="bi bi-arrow-counterclockwise me-2"></i>
                            Reset All Inputs
                        </button>
                    </div>
                    {/* Stepper Header */}
                    <div className="px-lg-5 mt-5">
                        {renderStepper()}
                    </div>
                    <div className="card-body p-4">

                        {/* Property Management */}
                        {currentStep === 1 && (
                            <div className="animate-fade-in">
                                {/* 1. Property Management Section (Accordion) */}
                                {renderAccordionSection(
                                    'prop_mgmt',
                                    'Property Management',
                                    'bi-building',
                                    (
                                        <>
                                            {/* Header inside the accordion content */}
                                            <div className="d-flex justify-content-between align-items-center mb-3">
                                                <h6 className="mb-0 text-muted">Properties ({propertyData.properties.length})</h6>
                                                <button className="btn btn-success btn-sm" onClick={handleAddProperty}>
                                                    <i className="bi bi-plus-circle me-1"></i> Add Property
                                                </button>
                                            </div>

                                            {/* Property Cards Grid */}
                                            <div className="row g-3">
                                                {propertyData.properties.map((property, index) => (
                                                    <div key={property.id} className="col-12 col-md-6 col-lg-5 col-xl-4">
                                                        <div className="card h-100 shadow-sm border-2">
                                                            <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
                                                                <span className="badge bg-primary px-3 py-2">Property #{property.id}</span>
                                                                {propertyData.properties.length > 1 && (
                                                                    <button
                                                                        className="btn btn-outline-danger btn-sm rounded-circle"
                                                                        onClick={() => handleRemoveProperty(property.id)}
                                                                        style={{ width: '32px', height: '32px', padding: 0 }}
                                                                    >
                                                                        <i className="bi bi-trash"></i>
                                                                    </button>
                                                                )}
                                                            </div>
                                                            <div className="card-body p-3">
                                                                {renderPropertyInput(index, property, "Property Name", "name", "text")}
                                                                {renderPropertyInput(index, property, "Location", "location", "text")}
                                                                <div className="row">
                                                                    <div className="col-md-6">
                                                                        {renderPropertyInput(index, property, "Size (sq.ft)", "size", "number")}
                                                                    </div>
                                                                    <div className="col-md-6">
                                                                        {renderPropertyInput(index, property, "Possession (Months)", "possessionMonths", "number", "Months until possession")}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )
                                )}

                                {/* 2. Common Property Information Section (Accordion) */}
                                {renderAccordionSection(
                                    'common_info',
                                    'Common Property Information',
                                    'bi-info-circle',
                                    (
                                        <div className="row g-3">
                                            {/* Row 1: Basic Pricing */}
                                            <div className="col-md-6">
                                                <label className="form-label">Purchase Price (₹/sq.ft)</label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={propertyData.purchasePrice}
                                                    placeholder="e.g. 5000"
                                                    onChange={(e) => handleInputChange('purchasePrice', parseFloat(e.target.value))}
                                                />
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label">Other Charges (Lumpsum)</label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={propertyData.otherCharges}
                                                    placeholder="e.g. 500000"
                                                    onChange={(e) => handleInputChange('otherCharges', parseFloat(e.target.value))}
                                                />
                                                <small className="text-muted" style={{ fontSize: '0.75rem' }}>Parking, Club Membership, etc.</small>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label">Stamp Duty (%)</label>
                                                <div className="input-group">
                                                    <input
                                                        type="number"
                                                        className="form-control"
                                                        value={propertyData.stampDuty}
                                                        placeholder="e.g. 5"
                                                        min="0"
                                                        max="100"
                                                        onChange={(e) => handleInputChange('stampDuty', parseFloat(e.target.value))}
                                                    />
                                                    <span className="input-group-text">%</span>
                                                </div>
                                                <small className="text-muted" style={{ fontSize: '0.75rem' }}>Govt. registration charges (usually 5-8%)</small>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label">Select Property for Analysis</label>
                                                <select
                                                    className="form-select"
                                                    value={userSelections.selectedPropertyId}
                                                    onChange={(e) => {
                                                        const propId = parseInt(e.target.value);
                                                        handleSelectionUpdate('selectedPropertyId', propId);
                                                        const selectedProp = propertyData.properties.find(p => p.id === propId);
                                                        if (selectedProp) handleSelectionUpdate('selectedPropertySize', selectedProp.size);
                                                    }}
                                                >
                                                    {propertyData.properties.map(property => (
                                                        <option key={property.id} value={property.id}>{property.name} ({property.size} sq.ft)</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Divider Line */}
                                            <div className="col-12">
                                                <hr className="text-secondary opacity-25 my-2" />
                                            </div>

                                            {/* Row 2: GST Details */}
                                            <div className="col-md-6">
                                                <label className="form-label">GST Percentage</label>
                                                <div className="input-group">
                                                    <input
                                                        type="number"
                                                        className="form-control"
                                                        value={propertyData.gstPercentage}
                                                        placeholder="e.g. 5 or 12"
                                                        min="0"
                                                        max="28"
                                                        onChange={(e) => handleInputChange('gstPercentage', parseFloat(e.target.value))}
                                                    />
                                                    <span className="input-group-text">%</span>
                                                </div>
                                                <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                                                    Applied on <b>Total Cost</b> of the Property
                                                </small>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label">Calculated GST Amount</label>
                                                <div className="form-control bg-light text-secondary">
                                                    {/* Calculate display value on the fly based on inputs */}
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
                                        </div>
                                    )
                                )}
                            </div>
                        )}

                        {/* === STEP 2: PAYMENT PLAN === */}
                        {currentStep === 2 && (
                            <div className="animate-fade-in ps-4">
                                {/* 1. Payment Plan Section (Accordion) */}
                                {renderAccordionSection(
                                    'pay_plan',
                                    'Payment Plan',
                                    'bi-credit-card',
                                    (
                                        <>
                                            <div className="row g-3">
                                                <div className="col-md-6">
                                                    <label className="form-label">Payment Plan Type</label>
                                                    <div className="input-group">
                                                        <select
                                                            className="form-select"
                                                            style={{ backgroundImage: 'none' }}
                                                            value={propertyData.paymentPlan}
                                                            onChange={(e) => handlePaymentPlanChange(e.target.value)}
                                                        >
                                                            <option value="clp">CLP (Construction Linked Plan)</option>
                                                            <option value="80-20">80%-20% (80% HL, 20% Self)</option>
                                                            <option value="25-75">25%-75% (75% HL, 25% Self)</option>
                                                            <option value="rtm">Ready to move</option>
                                                            <option value="custom">Custom (User Defined)</option>
                                                        </select>
                                                        <span className="input-group-text bg-white text-secondary border-start-0">
                                                            <i className="bi bi-chevron-down"></i>
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Holding Period with Unit Selector */}
                                                <div className="col-md-6">
                                                    <label className="form-label">Holding Period</label>
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

                                            {/* Custom Payment Plan Options */}
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
                                                            <label className="form-label">Home Loan (%)</label>
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
                                        </>
                                    )
                                )}

                                {/* Header 2: CLP Construction Details (Accordion - Conditional) */}
                                {propertyData.paymentPlan === 'clp' && (
                                    renderAccordionSection(
                                        'clp_details',
                                        'CLP Construction Details',
                                        'bi-building',
                                        (
                                            <>
                                                {/* Row 1: Duration & Interval */}
                                                <div className="row g-3 mb-3">
                                                    <div className="col-md-6">
                                                        <label className="form-label">Construction Duration (Years)</label>
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            className="form-control"
                                                            value={propertyData.assumptions.clpDurationYears}
                                                            placeholder={placeholders.clpDurationYears}
                                                            onChange={(e) => handleAssumptionChange('clpDurationYears', e.target.value)}
                                                        />
                                                        <small className="text-muted">Total construction period</small>
                                                    </div>
                                                    <div className="col-md-6">
                                                        <label className="form-label">Disbursement Interval (Months)</label>
                                                        <input
                                                            type="number"
                                                            className="form-control"
                                                            value={propertyData.assumptions.bankDisbursementInterval}
                                                            placeholder={placeholders.bankDisbursementInterval}
                                                            onChange={(e) => handleAssumptionChange('bankDisbursementInterval', e.target.value)}
                                                        />
                                                        <small className="text-muted">Months between disbursements</small>
                                                    </div>
                                                </div>

                                                {/* Row 2: Funding Window (Start & End) */}
                                                <div className="p-3 bg-light rounded border border-light mb-3">
                                                    <h6 className="fw-bold mb-3 small text-uppercase text-muted">
                                                        <i className="bi bi-calendar-range me-2"></i>Bank Funding Window
                                                    </h6>
                                                    <div className="row g-3">
                                                        <div className="col-md-6">
                                                            <label className="form-label small">First Disbursement (Month)</label>
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
                                                            <label className="form-label small">Last Disbursement (Month)</label>
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

                                                <div className="alert alert-info mb-0 py-2">
                                                    <small>
                                                        <i className="bi bi-info-circle me-2"></i>
                                                        <strong>Note:</strong> IDC Interest continues to accumulate until possession, even after the last bank disbursement is made.
                                                    </small>
                                                </div>
                                            </>
                                        )
                                    )
                                )}
                            </div>
                        )}

                        {/* === STEP 3: LOAN CONFIGURATION === */}
                        {currentStep === 3 && (
                            <div className="animate-fade-in">

                                {/* Home Loan Details (Accordion) */}
                                {renderAccordionSection(
                                    'home_loan',
                                    'Home Loan Details',
                                    'bi-bank',
                                    (
                                        <div className="row g-3">
                                            {/* Column 1: Rate */}
                                            <div className="col-md-3">
                                                <label className="form-label small">Home Loan Rate</label>
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
                                                <label className="form-label">Loan Term (Years)</label>
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

                                {/* Personal Loan 1 Information */}
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
                                                <label className="form-label">Personal Loan Rate (%)</label>
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
                                                <label className="form-label">Personal Loan Rate (%)</label>
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
                        )}

                        {/* === STEP 4: EXIT SCENARIOS (Accordion) === */}
                        {currentStep === 4 && (
                            renderAccordionSection(
                                'exit_scenarios',
                                'Exit Scenarios',
                                'bi-graph-up-arrow',
                                (
                                    <>
                                        {/* Header Row inside Body: Title Left, Button Right */}
                                        <div className="d-flex justify-content-between align-items-center mb-3">
                                            <h6 className="mb-0 text-muted">
                                                Price Scenarios ({userSelections.scenarioExitPrices.length})
                                            </h6>
                                            <button
                                                className="btn btn-sm btn-outline-primary"
                                                onClick={handleAddExitPriceScenario}
                                            >
                                                <i className="bi bi-plus-lg me-1"></i> Add Scenario
                                            </button>
                                        </div>

                                        <div className="row g-3">
                                            {/* Left Column: Selected Price with INFO ICON */}
                                            <div className="col-md-6">
                                                <div className="d-flex justify-content-between align-items-center">
                                                    <label className="form-label">Selected Exit Price (₹/sq.ft)</label>

                                                    {/* ℹ️ INFO ICON BUTTON */}
                                                    <button
                                                        className="btn btn-link text-decoration-none p-0 mb-2"
                                                        onClick={() => setShowExitLogic(!showExitLogic)}
                                                        title="See calculation logic"
                                                    >
                                                        <small className="fw-bold text-white" style={{ fontSize: '0.75rem' }}>
                                                            <i className="bi bi-info-circle-fill text-white me-1"></i>
                                                            How is this calculated?
                                                        </small>
                                                    </button>
                                                </div>

                                                {/* 📉 LOGIC DROPDOWN CARD (Visible only when clicked) */}
                                                {showExitLogic && (
                                                    <div className="glass-card animate-fade-in">
                                                        <div className="card-body p-2">
                                                            <h6 className="card-title small fw-bold text-white mb-2 border-bottom pb-1">
                                                                Logic: Purchase Price + Increment
                                                            </h6>
                                                            <ul className="list-unstyled mb-0" style={{ fontSize: '0.75rem' }}>
                                                                <li className="d-flex justify-content-between mb-1">
                                                                    <span>&lt; 1 Year:</span> <strong>+₹500</strong>
                                                                </li>
                                                                <li className="d-flex justify-content-between mb-1">
                                                                    <span>1 Year (12-23m):</span> <strong>+₹1000</strong>
                                                                </li>
                                                                <li className="d-flex justify-content-between mb-1">
                                                                    <span>2 Years (24-35m):</span> <strong>+₹2000</strong>
                                                                </li>
                                                                <li className="d-flex justify-content-between mb-1">
                                                                    <span>3 Years (36-47m):</span> <strong>+₹2500</strong>
                                                                </li>
                                                                <li className="d-flex justify-content-between mb-1">
                                                                    <span>4 Years (48-59m):</span> <strong>+₹3000</strong>
                                                                </li>
                                                                <li className="d-flex justify-content-between">
                                                                    <span>5+ Years:</span> <strong>+₹3500</strong>
                                                                </li>
                                                            </ul>
                                                            <div className="mt-2 pt-2 border-top text-center">
                                                                <small className="text-muted fst-italic">
                                                                    Based on your Holding Period of {
                                                                        propertyData.assumptions.holdingPeriodUnit === 'months'
                                                                            ? `${propertyData.assumptions.investmentPeriod} Months`
                                                                            : `${propertyData.assumptions.investmentPeriod} Years`
                                                                    }
                                                                </small>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={userSelections.selectedExitPrice}
                                                    placeholder={`e.g. ${(parseFloat(propertyData.purchasePrice) || 5000) + 2500}`}
                                                    onChange={(e) => handleSelectionUpdate('selectedExitPrice', e.target.value === '' ? '' : parseFloat(e.target.value))}
                                                />
                                                <small className="text-muted">Auto-calculated based on holding period (Editable)</small>
                                            </div>

                                            {/* Right Column: Scenarios List */}
                                            <div className="col-md-6">
                                                <label className="form-label">Scenario Exit Prices</label>
                                                {userSelections.scenarioExitPrices.length === 0 ? (
                                                    <div className="text-center p-3 border rounded bg-light text-muted" style={{ borderStyle: 'dashed' }}>
                                                        <i className="d-block fs-2 mb-2 opacity-50"></i>
                                                        <small>
                                                            Press the <strong>"Add Scenario"</strong> button above<br />
                                                            to create your first exit price scenario.
                                                        </small>
                                                    </div>
                                                ) : (
                                                    <div className="row g-2">
                                                        {userSelections.scenarioExitPrices.map((price, index) => (
                                                            <div key={index} className="col-12">
                                                                <div className="input-group input-group-sm mb-2 ps-4 pe-4">
                                                                    <span className="input-group-text">Scenario {index + 1}</span>
                                                                    <input
                                                                        type="number"
                                                                        className="form-control"
                                                                        value={price}
                                                                        placeholder={`e.g. ${10000 + (index * 1000)}`}
                                                                        onChange={(e) => handleUpdateExitPriceScenario(index, e.target.value)}
                                                                    />
                                                                    <button
                                                                        className="btn btn-danger d-flex align-items-center justify-content-center"
                                                                        type="button"
                                                                        onClick={() => handleRemoveExitPriceScenario(index)}
                                                                        title="Remove Scenario"
                                                                        style={{ width: '40px' }}
                                                                    >
                                                                        <i className="bi bi-trash-fill text-white"></i>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )
                            )
                        )}
                        {renderNavButtons()}

                    </div>
                </div>

                {/* Stage Calculations Cards */}
                <div className="mt-1">
                    <div className="card-body">
                        <div className="row g-4">
                            <div className="col-md-6 col-lg-3">
                                <div className="card h-100 border-primary">
                                    <div className="card-header bg-primary text-white">
                                        <h6 className="mb-0">Stage 1: Basic Property Cost</h6>
                                    </div>
                                    <div className="card-body">
                                        {calculatedData.stageCalculations?.stage1 ? (
                                            <ul className="list-unstyled mb-0">
                                                {calculatedData.stageCalculations.stage1.items.map((item, index) => (
                                                    <li key={index} className="mb-2">
                                                        <small className="text-muted">{item.label}</small>
                                                        <div className="fw-bold">{item.value}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-center py-3">
                                                <small className="text-muted">Enter property details</small>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="col-md-6 col-lg-3">
                                <div className="card h-100 border-success">
                                    <div className="card-header bg-success text-white">
                                        <h6 className="mb-0">Stage 2: Payment Plan</h6>
                                    </div>
                                    <div className="card-body">
                                        {calculatedData.stageCalculations?.stage2 ? (
                                            <ul className="list-unstyled mb-0">
                                                {calculatedData.stageCalculations.stage2.items.map((item, index) => (
                                                    <li key={index} className="mb-2">
                                                        <small className="text-muted">{item.label}</small>
                                                        <div className="fw-bold">{item.value}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-center py-3">
                                                <small className="text-muted">Enter payment plan details</small>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="col-md-6 col-lg-3">
                                <div className="card h-100 border-warning">
                                    <div className="card-header bg-warning text-white">
                                        <h6 className="mb-0">Stage 3: EMI Calculations</h6>
                                    </div>
                                    <div className="card-body">
                                        {calculatedData.stageCalculations?.stage3 ? (
                                            <ul className="list-unstyled mb-0">
                                                {calculatedData.stageCalculations.stage3.items.map((item, index) => (
                                                    <li key={index} className="mb-2">
                                                        <small className="text-muted">{item.label}</small>
                                                        <div className="fw-bold">{item.value}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-center py-3">
                                                <small className="text-muted">Enter loan details</small>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="col-md-6 col-lg-3">
                                <div className="card h-100 border-info">
                                    <div className="card-header bg-info text-white">
                                        <h6 className="mb-0">Stage 4: Holding Period</h6>
                                    </div>
                                    <div className="card-body">
                                        {calculatedData.stageCalculations?.stage4 ? (
                                            <ul className="list-unstyled mb-0">
                                                {calculatedData.stageCalculations.stage4.items.map((item, index) => (
                                                    <li key={index} className="mb-2">
                                                        <small className="text-muted">{item.label}</small>
                                                        <div className="fw-bold">{item.value}</div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <div className="text-center py-3">
                                                <small className="text-muted">Enter holding period details</small>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
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
        <div className="col-md-6">
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
                <div className="glass-card mb-5">
                    <div className="card-body">
                        <div className="row align-items-center">

                            {/* Left Side: Title (Changed to col-md-8 to make room) */}
                            <div className="col-md-8">
                                <h2 className="fw-bold mb-2 gradient-text">
                                    <i className="bi bi-speedometer2 me-3"></i>
                                    Investment Analysis Overview
                                </h2>
                                <p className="text-muted mb-0">
                                    Quick summary and stage-wise breakdown of your investment
                                </p>
                            </div>

                            {/* Right Side: Action Buttons (Animated) */}
                            <div className="col-md-4 text-end no-print">
                                <div className="d-flex gap-2 justify-content-end">

                                    {/* 1. Excel Button */}
                                    <button
                                        className="btn btn-success d-flex align-items-center justify-content-center hover-expand-btn shadow-sm"
                                        onClick={handleExportExcel}
                                        title="Export to Excel"
                                    >
                                        {/* Icon is outside */}
                                        <i className="bi bi-file-earmark-spreadsheet fs-5"></i>

                                        {/* Text is inside expandable wrapper */}
                                        <div className="expandable-text">
                                            <span className="ms-2 fw-bold">Excel</span>
                                        </div>
                                    </button>

                                    {/* 2. Print/PDF Button */}
                                    <button
                                        className="btn btn-secondary d-flex align-items-center justify-content-center hover-expand-btn shadow-sm"
                                        onClick={handlePrintReport}
                                        title="Save as PDF"
                                    >
                                        <i className="bi bi-printer fs-5"></i>
                                        <div className="expandable-text">
                                            <span className="ms-2 fw-bold">Report</span>
                                        </div>
                                    </button>

                                    {/* 3. Edit Button */}
                                    <button
                                        className="btn btn-outline-primary d-flex align-items-center justify-content-center hover-expand-btn shadow-sm"
                                        onClick={() => setActiveTab('inputs')}
                                        title="Edit Inputs"
                                    >
                                        <i className="bi bi-pencil-square fs-5"></i>
                                        <div className="expandable-text">
                                            <span className="ms-2 fw-bold">Edit</span>
                                        </div>
                                    </button>

                                </div>
                            </div>

                        </div>
                    </div>
                </div>

                {/* 1. Quick Stats Row */}
                <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
                    <div className="row g-4 mb-5">
                        {renderMetricCard("Total Cost", formatLakhs(breakdown.totalCost), "bi-cash-stack", "primary")}

                        {/* SPECIAL ROI CARD */}
                        <div className="col-6 col-md-3">
                            <div className="metric-card glass-card text-center h-100 p-3 border border-success shadow">
                                <div className="rounded-circle bg-success text-white d-flex align-items-center justify-content-center mx-auto mb-3 shadow-sm" style={{ width: '60px', height: '60px' }}>
                                    <i className="bi bi-graph-up-arrow fs-3"></i>
                                </div>
                                <h4 className="fw-bold mb-1 text-success">{formatPercent(breakdown.roi)}</h4>
                                <p className="text-muted mb-0 small fw-bold">Estimated ROI</p>

                                {/* ✅ NEW: Show the Exit Price used */}
                                <small className="text-muted" style={{ fontSize: '0.8rem' }}>
                                    @ ₹{breakdown.exitPrice}/sq.ft
                                </small>
                            </div>
                        </div>

                        {renderMetricCard("Cash After Sale", formatLakhs(breakdown.leftoverCash), "bi-wallet2", "warning")}
                        {renderMetricCard("Holding Period", `${breakdown.years}yrs`, "bi-hourglass-split", "info")}
                    </div>
                </div>

                {/* 2. STAGE WISE BREAKDOWN (Moved Here) */}
                {calculatedData.stageCalculations && (
                    <div className="glass-card mb-5 p-4">
                        <h5 className="mb-4 fw-bold text-secondary">
                            <i className="bi bi-layers-half me-2"></i>
                            Stage-wise Calculation Breakdown
                        </h5>
                        <div className="row g-4">

                            {/* Stage 1: Cost */}
                            <div className="col-md-6">
                                <div className="card h-100 border-primary shadow-sm">
                                    <div className="card-header bg-primary text-white py-2">
                                        <h6 className="mb-0 small fw-bold"><i className="bi bi-tag-fill me-2"></i>Stage 1: Cost</h6>
                                    </div>
                                    <div className="card-body bg-light bg-opacity-10">
                                        <ul className="list-unstyled mb-0 small">
                                            {calculatedData.stageCalculations.stage1.items.map((item, idx) => (
                                                <li key={idx} className="d-flex justify-content-between mb-2 border-bottom pb-1 border-secondary border-opacity-10">
                                                    <span className="text-muted">{item.label}</span>
                                                    <span className="fw-bold">{item.value}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Stage 2: Payment Plan */}
                            <div className="col-md-6">
                                <div className="card h-100 border-success shadow-sm">
                                    <div className="card-header bg-success text-white py-2">
                                        <h6 className="mb-0 small fw-bold"><i className="bi bi-pie-chart-fill me-2"></i>Stage 2: Funding</h6>
                                    </div>
                                    <div className="card-body bg-light bg-opacity-10">
                                        <ul className="list-unstyled mb-0 small">
                                            {calculatedData.stageCalculations.stage2.items.map((item, idx) => (
                                                <li key={idx} className="d-flex justify-content-between mb-2 border-bottom pb-1 border-secondary border-opacity-10">
                                                    <span className="text-muted">{item.label}</span>
                                                    <span className="fw-bold">{item.value}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Stage 3: EMI */}
                            <div className="col-md-6">
                                <div className="card h-100 border-warning shadow-sm">
                                    <div className="card-header bg-warning text-white py-2">
                                        <h6 className="mb-0 small fw-bold"><i className="bi bi-calculator-fill me-2"></i>Stage 3: Monthly</h6>
                                    </div>
                                    <div className="card-body bg-light bg-opacity-10">
                                        <ul className="list-unstyled mb-0 small">
                                            {calculatedData.stageCalculations.stage3.items.map((item, idx) => (
                                                <li key={idx} className="d-flex justify-content-between mb-2 border-bottom pb-1 border-secondary border-opacity-10">
                                                    <span className="text-muted">{item.label}</span>
                                                    <span className="fw-bold">{item.value}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* Stage 4: Exit */}
                            <div className="col-md-6">
                                <div className="card h-100 border-info shadow-sm">
                                    <div className="card-header bg-info text-white py-2">
                                        <h6 className="mb-0 small fw-bold"><i className="bi bi-door-open-fill me-2"></i>Stage 4: Exit</h6>
                                    </div>
                                    <div className="card-body bg-light bg-opacity-10">
                                        <ul className="list-unstyled mb-0 small">
                                            {calculatedData.stageCalculations.stage4.items.map((item, idx) => (
                                                <li key={idx} className="d-flex justify-content-between mb-2 border-bottom pb-1 border-secondary border-opacity-10">
                                                    <span className="text-muted">{item.label}</span>
                                                    <span className="fw-bold">{item.value}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 3. Profit Chart */}
                {renderProfitChart(calculatedData.profits)}

                {/* Multiple Exit Price Scenarios */}
                <div style={{ maxWidth: '1350px', margin: '0 auto' }}>
                    <div className="row m-4 pt-5">
                        <div className="col-12">

                            {/* ✅ CHANGED: Replaced 'p-3 bg-light rounded' with 'glass-card' */}
                            <div className="glass-card mb-5 p-4">

                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <h6 className="mb-0 fw-bold">
                                        <i className="bi bi-bar-chart me-2"></i>
                                        Multiple Exit Price Scenarios
                                    </h6>
                                    <span className="badge bg-primary">
                                        {calculatedData.multipleScenarios?.length || 0} scenarios
                                    </span>
                                </div>

                                <div className="table-responsive">
                                    <table className="table table-bordered table-hover mb-0">
                                        <thead>
                                            <tr>
                                                <th>Scenario</th>
                                                <th>Exit Price (₹/sq.ft)</th>
                                                <th>Sale Value</th>
                                                <th>Leftover Cash</th>
                                                <th>Net Profit/Loss</th>
                                                <th>ROI</th>
                                            </tr>
                                        </thead>
                                        <tbody>
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

                {/* 7. Action Buttons */}
                <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
                    <div className="row g-3 mb-5">
                        {renderActionBtn("Detailed Breakdown", "View all financial calculations", "bi-calculator", "breakdown", "btn-primary")}
                        {renderActionBtn("Edit Parameters", "Modify inputs", "bi-pencil-square", "inputs", "btn-outline-primary")}
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
                        className="btn btn-outline-primary mt-3"
                        onClick={() => setActiveTab('overview')}
                    >
                        <i className="bi bi-arrow-left me-2"></i>
                        Back to Overview
                    </button>
                </div>
            );
        }

        // ✅ FIX: Wrapped in 'central-container' to limit width and center it
        return (
            <div className="mb-5 central-container">
                <div className="glass-card mb-4">

                    {/* Header */}
                    <div className="card-body border-bottom">
                        <div className="row align-items-center">
                            <div className="col-md-8">
                                <h2 className="fw-bold mb-2 gradient-text">
                                    <i className="bi bi-calculator me-3"></i>
                                    Detailed Financial Breakdown
                                </h2>
                                <p className="text-muted mb-0 pb-4">
                                    Complete calculation details and amortization schedules
                                </p>
                            </div>
                            <div className="col-md-4 text-end">
                                <button
                                    className="btn btn-outline-primary rounded-pill px-4"
                                    onClick={() => setActiveTab('overview')}
                                >
                                    <i className="bi bi-arrow-left me-2"></i>
                                    Back to Overview
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="card-body p-4"> {/* Standard Padding */}

                        {/* 1. Monthly EMI Timeline Visualization */}
                        <div className="section-spacer">
                            <h5 className="mb-3">
                                <i className="bi bi-calendar-month text-info me-2"></i>
                                Monthly EMI Timeline
                            </h5>
                            <div className="row g-4">

                                {/* Timeline 1: Pre-Possession */}
                                {renderTimelineCard(
                                    "Timeline 1: Pre-Possession",
                                    "bi-calendar-week",
                                    "primary",
                                    formatCurrency(breakdown.prePossessionTotal),
                                    `Month 0 to Month ${breakdown.prePossessionMonths}`,
                                    `${breakdown.prePossessionMonths} months`,
                                    <>

                                        <div className="col-md-6 mt-1">
                                            <div
                                                className="p-2 rounded border text-dark property-card-hover h-100"
                                                style={{ borderStyle: 'dashed', cursor: 'pointer', transition: 'all 0.2s' }}
                                                onClick={() => navigate('/monthly-breakdown', {
                                                    state: {
                                                        idcSchedule: breakdown.idcSchedule,
                                                        pl1EMI: breakdown.personalLoan1EMI,
                                                        possessionMonths: breakdown.possessionMonths,
                                                        totalHoldingMonths: breakdown.totalHoldingMonths,
                                                        homeLoanAmount: breakdown.homeLoanAmount,
                                                        interestRate: propertyData.assumptions.homeLoanRate,
                                                        propertyName: propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.name,
                                                        homeLoanTerm: propertyData.assumptions.homeLoanTerm, // e.g., 20 years
                                                        lastBankDisbursementMonth: getSafeValue(propertyData.assumptions.lastBankDisbursementMonth) || null,
                                                        homeLoanStartMode: propertyData.assumptions.homeLoanStartMode,
                                                        manualStartMonth: getSafeValue(propertyData.assumptions.homeLoanStartMonth)
                                                    }
                                                })}
                                            >
                                                {/* Header Section */}
                                                <div className="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom border-secondary border-opacity-10">
                                                    <small className="fw-bold text-muted" style={{ fontSize: '0.75rem' }}>
                                                        PL1 EMI
                                                    </small>
                                                    <span className="badge text-dark bg-warning" style={{ fontSize: '0.6rem' }}>
                                                        <i className="bi bi-table me-1"></i>Monthly Schedule
                                                    </span>
                                                </div>

                                                {/* ✅ ADDED: Value Section */}
                                                <div className="text-center py-1">
                                                    <div className="fw-bold text-success" style={{ fontSize: '1.1rem' }}>
                                                        {formatCurrency(breakdown.personalLoan1EMI)}
                                                    </div>
                                                    <small className="text-muted d-block" style={{ fontSize: '0.65rem', marginTop: '-2px' }}>
                                                        Per Month (Fixed)
                                                    </small>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 2. IDC Breakdown (Min / Avg / Max in one container) */}
                                        {breakdown.hasIDC && (
                                            <div className="col-md-6 mt-1">
                                                <div
                                                    className="p-2 rounded border text-dark property-card-hover h-100"
                                                    style={{ borderStyle: 'dashed', cursor: 'pointer', transition: 'all 0.2s' }}
                                                    onClick={() => navigate('/schedule', {
                                                        state: {
                                                            idcSchedule: breakdown.idcSchedule,
                                                            pl1EMI: breakdown.personalLoan1EMI,
                                                            totalIDC: breakdown.totalIDC,
                                                            totalHoldingMonths: breakdown.totalHoldingMonths,
                                                            propertyName: propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.name,
                                                            possessionMonths: breakdown.possessionMonths,
                                                            totalPaid: breakdown.prePossessionTotal,
                                                            homeLoanAmount: breakdown.homeLoanAmount,
                                                            lastBankDisbursementMonth: propertyData.assumptions.lastBankDisbursementMonth,
                                                            interestRate: propertyData.assumptions.homeLoanRate
                                                        }
                                                    })}
                                                >
                                                    {/* Header Row with Title and Button */}
                                                    <div className="d-flex justify-content-between align-items-center mb-2 pb-1">
                                                        <small className="fw-bold text-muted" style={{ fontSize: '0.75rem' }}>
                                                            IDC
                                                        </small>
                                                        <span className="badge text-dark bg-warning" style={{ fontSize: '0.6rem' }}>
                                                            <i className="bi bi-table me-1"></i>Open Schedule
                                                        </span>
                                                    </div>

                                                    {/* ✅ THE 3-VALUE LAYOUT (Min | Avg | Max) */}
                                                    <div className="row g-0 text-center align-items-center">

                                                        {/* 1. MIN (Start) */}
                                                        <div className="col-4 border-end">
                                                            <small className="d-block text-muted mb-1" style={{ fontSize: '0.75rem', lineHeight: '1' }}>Min (Start)</small>
                                                            <div className="fw-bold text-success" style={{ fontSize: '0.85rem' }}>
                                                                {formatCurrency(breakdown.minIDCEMI)}
                                                            </div>
                                                        </div>

                                                        {/* 2. AVERAGE (Middle) */}
                                                        <div className="col-4 border-end">
                                                            <small className="d-block text-muted mb-1" style={{ fontSize: '0.75rem', lineHeight: '1' }}>Average</small>
                                                            <div className="fw-bold text-primary" style={{ fontSize: '0.9rem' }}>
                                                                {formatCurrency(breakdown.monthlyIDCEMI)}
                                                            </div>
                                                        </div>

                                                        {/* 3. MAX (Peak) */}
                                                        <div className="col-4 px-1">
                                                            <small className="d-block text-muted mb-1" style={{ fontSize: '0.75rem', lineHeight: '1' }}>Max (Peak)</small>
                                                            <div className="fw-bold text-danger" style={{ fontSize: '0.85rem' }}>
                                                                {formatCurrency(breakdown.maxIDCEMI)}
                                                            </div>
                                                        </div>

                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>,
                                    formatCurrency(breakdown.prePossessionTotal),
                                    `Includes ~${formatCurrency(breakdown.totalIDC)} in construction interest`,
                                    "Total amount paid during construction",
                                    null,
                                    breakdown.hasIDC && <small className="opacity-75 mt-2 d-block">Click 'View Schedule' to see monthly breakdown</small>
                                )}

                                {/* Timeline 2: Post-Possession - ONLY SHOW IF APPLICABLE */}
                                {breakdown.postPossessionMonths > 0 ? (
                                    // CASE A: Normal Scenario (Show Card)
                                    renderTimelineCard(
                                        "Timeline 2: Post-Possession",
                                        "bi-calendar-check",
                                        "success",
                                        `${formatCurrency(breakdown.postPossessionEMI)}/month`,
                                        `Month ${breakdown.possessionMonths + 1} to Month ${breakdown.totalHoldingMonths}`,
                                        `${breakdown.postPossessionMonths} months`,
                                        <>
                                            {renderComponentBox("HL EMI", formatCurrency(breakdown.homeLoanEMI), 4)}
                                            {renderComponentBox("PL1 EMI", formatCurrency(breakdown.personalLoan1EMI), 4)}
                                            {breakdown.hasPersonalLoan2 &&
                                                renderComponentBox("PL2 EMI", formatCurrency(breakdown.personalLoan2EMI), 4)
                                            }
                                        </>,
                                        formatCurrency(breakdown.postPossessionTotal),
                                        `(${breakdown.postPossessionMonths} months * ${formatCurrency(breakdown.postPossessionEMI)})`
                                    )
                                ) : (
                                    // CASE B: Early Exit (Show "Not Applicable" Message)
                                    <div className="col-md-6">
                                        <div className="card h-100 border-secondary border-opacity-25 bg-light">
                                            <div className="card-header bg-secondary bg-opacity-10 text-muted">
                                                <h6 className="mb-0"><i className="bi bi-slash-circle me-2"></i>Timeline 2: Post-Possession</h6>
                                            </div>
                                            <div className="card-body d-flex flex-column align-items-center justify-content-center text-center p-5 opacity-50">
                                                <div className="display-4 text-muted mb-3"><i className="bi bi-hourglass-bottom"></i></div>
                                                <h5 className="fw-bold text-muted">Not Applicable</h5>
                                                <p className="mb-0 small">
                                                    Your holding period ({breakdown.years} years) ends before or exactly at possession.
                                                    <br />
                                                    You will exit this investment before starting post-possession EMIs.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Summary Card - Removed 'm-4', replaced with standard spacing */}
                            <div className="mt-4">
                                <div className="p-4 bg-info text-white rounded shadow-sm">
                                    <div className="d-flex justify-content-between align-items-center">
                                        <div>
                                            <h6 className="mb-1 fw-bold">Total EMI Commitment</h6>
                                            <small>Combined across both timelines</small>
                                            {breakdown.hasIDC && (
                                                <div className="mt-2 small">
                                                    <i className="bi bi-info-circle me-1"></i>
                                                    Includes Monthly IDC ({formatCurrency(breakdown.monthlyIDCEMI)})
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-end">
                                            <div className="fw-bold fs-3">{formatCurrency(breakdown.totalEMIPaid)}</div>
                                            <small>Pre: {formatCurrency(breakdown.prePossessionTotal)} + Post: {formatCurrency(breakdown.postPossessionTotal)}</small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Interest During Construction (IDC) Details */}
                        {breakdown.hasIDC && (
                            <div className="section-spacer">
                                <h5 className="mb-3">
                                    <i className="bi bi-calculator text-warning me-2"></i>
                                    Interest During Construction (IDC)
                                </h5>
                                <div className="row g-3">
                                    {renderStatCard("Monthly IDC EMI", formatCurrency(breakdown.monthlyIDCEMI), "Interest during construction", "warning", 4)}
                                    {renderStatCard("Total IDC Amount", formatCurrency(breakdown.totalIDC), `Accumulated over ${breakdown.constructionMonths} months`, "danger", 4)}
                                    {renderStatCard("Home Loan with IDC", formatCurrency(breakdown.totalHomeLoanAtCompletion), "Principal + Total IDC", "info", 4)}
                                </div>
                            </div>
                        )}

                        {/* 3. Home Loan Detailed Analysis */}
                        <div className="section-spacer">
                            <h5 className="mb-3">
                                <i className="bi bi-bank text-primary me-2"></i>
                                Home Loan Analysis
                                {breakdown.hasIDC && (
                                    <span className="badge bg-warning ms-2">Includes IDC</span>
                                )}
                            </h5>
                            <div className="row g-3">
                                <div className="col-md-3">
                                    <div className="p-3 bg-primary text-white rounded text-center h-100">
                                        <small className="text-white">Total EMI per Month</small>
                                        <div className="fw-bold fs-4">{formatCurrency(breakdown.homeLoanEMI)}</div>
                                        <small className="text-white">Monthly payment</small>
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <div className="p-3 bg-success text-white rounded text-center h-100">
                                        <small className="text-white">Total EMI Paid</small>
                                        <div className="fw-bold fs-4">{formatCurrency(breakdown.homeLoanEMIPaid)}</div>
                                        <small className="text-white">{breakdown.homeLoanPaymentsMade} payments made</small>
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <div className="p-3 bg-warning text-white rounded text-center h-100">
                                        <small className="text-white">Total Interest Paid</small>
                                        <div className="fw-bold fs-4">{formatCurrency(breakdown.homeLoanInterestPaid)}</div>
                                        <small className="text-white">Over {breakdown.homeLoanPaymentsMade} months</small>
                                    </div>
                                </div>
                                <div className="col-md-3">
                                    <div className="p-3 bg-danger text-white rounded text-center h-100">
                                        <small className="text-white">Total EMI Due</small>
                                        <div className="fw-bold fs-4">{formatCurrency(breakdown.homeLoanOutstanding)}</div>
                                        <small className="text-white">Outstanding balance</small>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 4. Personal Loan 1 Analysis */}
                        {breakdown.hasPersonalLoan1 && (
                            <div className="section-spacer">
                                {renderLoanSection("Personal Loan 1 Analysis", "bi-cash-coin", "success",
                                    formatCurrency(breakdown.personalLoan1EMI),
                                    formatCurrency(breakdown.personalLoan1EMIPaid),
                                    formatCurrency(breakdown.personalLoan1InterestPaid),
                                    formatCurrency(breakdown.personalLoan1Outstanding),
                                    breakdown.pl1PaymentsMade
                                )}
                            </div>
                        )}

                        {/* 5. Personal Loan 2 Analysis */}
                        {breakdown.hasPersonalLoan2 && (
                            <div className="section-spacer">
                                {renderLoanSection("Personal Loan 2 Analysis", "bi-cash-coin", "warning",
                                    formatCurrency(breakdown.personalLoan2EMI),
                                    formatCurrency(breakdown.personalLoan2EMIPaid),
                                    formatCurrency(breakdown.personalLoan2InterestPaid),
                                    formatCurrency(breakdown.personalLoan2Outstanding),
                                    breakdown.pl2PaymentsMade
                                )}
                            </div>
                        )}

                        {/* 6. Total Loan Summary */}
                        <div className="section-spacer">
                            <h5 className="mb-3"><i className="bi bi-calculator text-info me-2"></i>Total Loan Summary</h5>
                            <div className="row g-3">
                                {renderStatCard("Total Monthly EMI", formatCurrency(breakdown.homeLoanEMI + breakdown.personalLoan1EMI + breakdown.personalLoan2EMI), "Combined monthly payment", "info", 4)}
                                {renderStatCard("Total EMI Paid", formatCurrency(breakdown.totalEMIPaid), `Over ${breakdown.years} years`, "success", 4)}
                                {renderStatCard("Total Outstanding", formatCurrency(breakdown.totalLoanOutstanding), "Total balance due", "danger", 4)}
                            </div>
                        </div>

                        {/* 7. Interest Summary */}
                        <div className="section-spacer">
                            <h5 className="mb-3">
                                <i className="bi bi-percent text-warning me-2"></i>
                                Total Interest Summary
                            </h5>
                            <div className="p-3 bg-warning text-white rounded">
                                <div className="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h3 className="fw-bold mb-1">
                                            {formatLakhs(breakdown.totalInterestPaid)}
                                        </h3>
                                        <small>Total Interest Paid ({breakdown.years} years)</small>
                                        {breakdown.hasIDC && (
                                            <div className="mt-2">
                                                <small className="text-white opacity-15">
                                                    <i className="bi bi-calculator me-1"></i>
                                                    Includes {formatLakhs(breakdown.totalIDC)} IDC
                                                </small>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-end">
                                        {breakdown.hasIDC && (
                                            <div className="badge bg-warning shadow-sm" style={{ color: '#333' }}>
                                                IDC: {formatLakhs(breakdown.totalIDC)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 8. Sale Analysis */}
                        <div className="section-spacer">
                            <h5 className="mb-3">
                                <i className="bi bi-graph-up text-success me-2"></i>
                                Sale Analysis at ₹{breakdown.exitPrice}/sq.ft
                            </h5>
                            <div className="p-3 bg-success text-white rounded">
                                <div className="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h4 className="fw-bold mb-1">
                                            Leftover Cash after {breakdown.years} years
                                        </h4>
                                        <small>After repaying all debt</small>
                                    </div>
                                    <div className="fs-2 fw-bold">
                                        {formatLakhs(breakdown.leftoverCash)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 9. Net Position Banner */}
                        <div className="section-spacer">
                            {renderBanner(
                                "Net Position Analysis",
                                formatLakhs(Math.abs(breakdown.netGainLoss)),
                                `Net ${breakdown.netGainLoss >= 0 ? 'Profit' : 'Loss'} (Cash - EMIs Paid)`,
                                breakdown.netGainLoss >= 0 ? 'success' : 'danger',
                                "bi-cash-stack",
                                <div className="fs-6 text-end">{breakdown.netGainLoss >= 0 ? 'PROFIT' : 'LOSS'}</div>
                            )}
                        </div>

                    </div> {/* End Card Body */}
                </div>
            </div>
        );
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'inputs':
                return renderInputsTab();
            case 'overview':
                return renderOverviewTab();
            case 'breakdown':
                return renderBreakdownTab();
            default:
                return renderInputsTab();
        }
    };

    return (
        <div className="property-comparison">

            {/* Background Blobs */}
            <div className="position-fixed top-0 left-0 w-100 h-100" style={{ zIndex: -1 }}>
                <div className="position-absolute top-0 start-0 w-100 h-100" style={{ background: 'radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.15) 0%, transparent 50%)' }}></div>
                <div className="position-absolute top-0 end-0 w-100 h-100" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(118, 75, 162, 0.15) 0%, transparent 50%)' }}></div>
            </div>

            <div className="container-fluid py-4">
                <div className="row justify-content-center">
                    <div className="col-12 col-xxl-10">

                        {/* Main Header Text */}
                        <div className="text-center mb-4 pt-3">
                            {/* ✅ CHANGED: Replaced 'text-light' with 'text-secondary' */}
                            <p
                                className="lead opacity-90 mb-4"
                                style={{
                                    letterSpacing: '0.5px',
                                    color: 'var(--text-primary)' // Automatically switches: Black in Light Mode, White in Dark Mode
                                }}
                            >
                                Model your payment plan, optimize loans, and forecast returns.
                            </p>
                        </div>

                        {/* ✅ FIXED: Intelligent Navigation Bar */}
                        {/* Wrapper Div (Min-Height prevents layout jump when tabs become fixed) */}
                        <div
                            ref={navRef}
                            style={{ minHeight: '60px', marginBottom: '20px', display: 'flex', justifyContent: 'center' }}
                        >
                            <div
                                className="glass-card p-1 rounded-pill d-inline-flex border border-secondary border-opacity-25"
                                style={{
                                    // Dynamic Styles
                                    position: isSticky ? 'fixed' : 'relative',
                                    top: isSticky ? '20px' : 'auto',
                                    zIndex: 1000,
                                    transition: 'transform 0.3s ease-in-out, opacity 0.3s ease-in-out',

                                    // Smart Hide/Show Logic
                                    transform: isSticky && !showNav ? 'translateY(-150%)' : 'translateY(0)',
                                    opacity: isSticky && !showNav ? 0 : 1,

                                    // Visual Polish
                                    backdropFilter: 'blur(12px)',
                                    boxShadow: isSticky ? '0 10px 30px rgba(0,0,0,0.2)' : 'none'
                                }}
                            >
                                {[
                                    { id: 'inputs', icon: 'bi-input-cursor', label: 'Input Parameters' },
                                    { id: 'overview', icon: 'bi-speedometer2', label: 'Analysis Overview' },
                                    { id: 'breakdown', icon: 'bi-calculator', label: 'Detailed Breakdown' }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => {
                                            setActiveTab(tab.id);
                                            if (isSticky) window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        className={`btn rounded-pill px-4 py-2 d-flex align-items-center border-0 ${activeTab === tab.id
                                            ? 'btn-primary shadow-sm fw-bold'
                                            : 'text-secondary hover-text-primary'
                                            }`}
                                        style={{ transition: 'all 0.3s ease' }}
                                    >
                                        <i className={`bi ${tab.icon} me-2`}></i>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tab Content */}
                        {renderTabContent()}

                        {/* Footer */}
                        <div className="text-center mt-5 pt-4">
                            <div className="glass-card p-3">
                                <p className="text-muted mb-0">
                                    <i className="bi bi-calculator text-primary me-2"></i>
                                    Professional real estate investment analysis tool • Real-time calculations • Data-driven insights
                                </p>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default PropertyComparison; 