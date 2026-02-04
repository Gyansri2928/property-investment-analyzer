import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate, useLocation } from 'react-router-dom'; // Add this import
import './PropertyComparison.css';
// Add these imports at the top of PropertyComparisonDesktop.js
import { auth, db, loginWithGoogle, logoutUser } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, where, getDocs, deleteDoc, doc, orderBy } from 'firebase/firestore';

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
        personalLoan1Rate: '', personalLoan1Term: '', personalLoan1StartMonth: 0, personalLoan1Share: 10,
        personalLoan2Rate: '', personalLoan2Term: '', personalLoan2StartMonth: 0, personalLoan2Share: 10,
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
const formatLakhs = (value) => {
    if (!value && value !== 0) return '₹0 L';

    const valAbs = Math.abs(value);

    // If it's 1 Crore (100 Lakhs) or more, show Cr
    if (valAbs >= 10000000) {
        return `₹${(value / 10000000).toFixed(2)} Cr`;
    }

    // Otherwise show Lakhs
    return `₹${(value / 100000).toFixed(2)} L`;
};
const formatCurrency = (value) => (!value && value !== 0) ? '₹0' : `₹${Math.round(value).toLocaleString('en-IN')}`;
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
                className={`rounded-circle bg-${color} bg-opacity-10 p-3 d-flex align-items-center justify-content-center mx-auto mb-3`}
                style={{ width: '60px', height: '60px' }}
            >
                <i className={`bi ${icon} fs-3`}></i>
            </div>
            <h4 className="fw-bold text-muted mb-1">{value}</h4>
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
    if (value === undefined || value === null || value === '') return 0;
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
};
const renderTimelineCard = (title, icon, color, mainEMI, period, duration, componentsJSX, totalAmount, calcText, footerSubtitle, extraHeader = null, extraFooter = null) => (
    <div className="col-md-6">
        <div className={`card h-100 border-${color}`}>
            <div className={`card-header bg-${color} text-white`}>
                <h6 className="mb-0"><i className={`bi ${icon} me-2`}></i>{title}</h6>
                {extraHeader}
            </div>

            {/* ✅ CHANGE 1: Make body a flex column */}
            <div className="card-body d-flex flex-column">

                {/* ✅ CHANGE 2: Wrapper for Top Content (Grows to fill space) */}
                <div className="flex-grow-1">
                    <div className="text-center mb-3 ps-2 pe-2">
                        <h3 className={`text-${color} fw-bold`}>{mainEMI}</h3>
                        <small className="text-muted">{footerSubtitle}</small>
                    </div>

                    <div className="row g-2">
                        <div className="col-6">
                            <div className="p-2 bg-light rounded h-100"> {/* Added h-100 for alignment */}
                                <small className="text-muted">Period</small>
                                <div className="fw-bold">{period}</div>
                            </div>
                        </div>
                        <div className="col-6">
                            <div className="p-2 bg-light rounded h-100"> {/* Added h-100 for alignment */}
                                <small className="text-muted">Duration</small>
                                <div className="fw-bold">{duration}</div>
                            </div>
                        </div>
                        <div className="col-12">
                            <div className="p-2 bg-light rounded">
                                <small className="text-muted">EMI Components</small>
                                <div className="row g-1">{componentsJSX}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ✅ CHANGE 3: Footer Pushed to Bottom */}
                <div className="mt-3">
                    <div className={`p-3 bg-${color} text-white rounded text-center`}>
                        <small className="text-white">Total {title.split(':')[0]} EMI</small>
                        <div className="fw-bold fs-4">{totalAmount}</div>
                        <small className="text-white">{calcText}</small>
                        {extraFooter}
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
                            <div className="text-white small py-1 d-none d-md-block" style={{ fontSize: '0.7rem' }}>
                                {formatPercent(item.roi)}
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

const PropertyComparisonDesktop = () => {
    // --- STATE ---
    // Inside PropertyComparison component, with other states
    const [validationError, setValidationError] = useState('');
    const [showPreview, setShowPreview] = useState(false);
    const location = useLocation();
    // Add this with your other state variables
    const [showExitLogic, setShowExitLogic] = useState(false);
    const [showLanding, setShowLanding] = useState(true);
    // ... existing state definitions ...
    const [activeTab, setActiveTab] = useState(location.state?.returnTab || 'inputs');
    const navigate = useNavigate();
    // --- SCROLL & NAV LOGIC ---
    const [showNav, setShowNav] = useState(true); // Is the floating nav visible?
    const [isSticky, setIsSticky] = useState(false); // Are we past the threshold?
    const [lastScrollY, setLastScrollY] = useState(0);
    const navRef = useRef(null);
    // --- LOADING OVERLAY STATE ---
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Analyzing...');

    // --- DELAYED NAVIGATION HANDLER ---
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
            // ✅ FIX: Safe access to purchase price
            const purchasePrice = getSafeValue(propertyData.purchasePrice);

            // Only run if we have a Purchase Price and the Exit Price is currently empty/zero
            if (purchasePrice > 0 && (!userSelections.selectedExitPrice || userSelections.selectedExitPrice === 0)) {

                // ✅ FIX: Safe access to investment period
                let years = getSafeValue(propertyData.assumptions.investmentPeriod);
                if (propertyData.assumptions.holdingPeriodUnit === 'months') {
                    years = years / 12;
                }

                // 2. Apply Instructor's Logic Table
                let increment = 0;

                if (years < 1) {
                    increment = 500;
                } else if (years >= 1 && years < 2) {
                    increment = 1000;
                } else if (years >= 2 && years < 3) {
                    increment = 2000;
                } else if (years >= 3 && years < 4) {
                    increment = 2500;
                } else if (years >= 4 && years < 5) {
                    increment = 3000;
                } else {
                    increment = 3500;
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
    ]);
    // 1. Auto-scroll to top when switching Tabs (Inputs vs Overview vs Breakdown)
    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [activeTab]);

    // ===================== FIREBASE INTEGRATION START =====================

    // 1. Auth & Data State
    const [user, setUser] = useState(null); // Tracks if user is logged in
    const [showSavedDrawer, setShowSavedDrawer] = useState(false);
    const [savedScenarios, setSavedScenarios] = useState([]); // Stores the list from Cloud
    const [isLoadingData, setIsLoadingData] = useState(false);

    // 2. Listen for Login/Logout (Auto-Run)
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                // User logged in? Fetch their data immediately.
                fetchUserScenarios(currentUser.uid);
            } else {
                // User logged out? Clear the screen.
                setSavedScenarios([]);
            }
        });
        return () => unsubscribe();
    }, []);

    // 3. Helper: Fetch Data from Firestore
    const fetchUserScenarios = async (uid) => {
        setIsLoadingData(true);
        try {
            // Query: Give me scenarios where userId == my ID
            const q = query(
                collection(db, "scenarios"),
                where("userId", "==", uid),
                orderBy("timestamp", "desc") // Sort by newest
            );

            const querySnapshot = await getDocs(q);
            const loadedData = querySnapshot.docs.map(doc => ({
                id: doc.id, // We need this ID to delete it later
                ...doc.data()
            }));
            setSavedScenarios(loadedData);
        } catch (error) {
            console.error("Error loading data:", error);
            // Fallback if 'orderBy' index isn't ready yet
            if (error.code === 'failed-precondition') {
                const qSimple = query(collection(db, "scenarios"), where("userId", "==", uid));
                const snap = await getDocs(qSimple);
                setSavedScenarios(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            }
        }
        setIsLoadingData(false);
    };

    // 4. Action: Save to Cloud
    const handleSaveScenario = async () => {
        if (!user) {
            const confirmLogin = window.confirm("You need to be signed in to save to the cloud. Sign in with Google now?");
            if (confirmLogin) loginWithGoogle();
            return;
        }

        // Prepare the data packet
        const currentProp = propertyData.properties.find(p => p.id === userSelections.selectedPropertyId) || propertyData.properties[0];

        const newScenario = {
            userId: user.uid, // Security Link
            timestamp: new Date().toISOString(),
            name: currentProp.name || "Untitled Property",
            location: currentProp.location || "Unknown Location",
            // Save Key Metrics for the preview card
            metrics: {
                totalCost: calculatedData.detailedBreakdown.totalCost,
                roi: calculatedData.detailedBreakdown.roi,
                netProfit: calculatedData.detailedBreakdown.netGainLoss,
                years: calculatedData.detailedBreakdown.years
            },
            // Save Full Inputs so we can reload them
            data: propertyData,
            selections: userSelections
        };

        try {
            // Push to Firebase
            const docRef = await addDoc(collection(db, "scenarios"), newScenario);

            // Update local list instantly (so we don't have to wait for a refresh)
            setSavedScenarios(prev => [{ id: docRef.id, ...newScenario }, ...prev]);
            alert("✅ Saved to your Saved Properties!");
        } catch (e) {
            console.error("Error adding document: ", e);
            alert("Error saving data. Check console.");
        }
    };

    // 5. Action: Delete from Cloud
    const handleDeleteScenario = async (id) => {
        if (!window.confirm("Delete this property from your Saved Properties?")) return;

        try {
            await deleteDoc(doc(db, "scenarios", id));
            setSavedScenarios(prev => prev.filter(item => item.id !== id));
        } catch (e) {
            console.error("Error deleting: ", e);
            alert("Failed to delete.");
        }
    };

    // 6. Action: Load Data (Same as before)
    const handleLoadScenario = (scenario) => {
        if (window.confirm(`Load "${scenario.name}"? Unsaved changes will be lost.`)) {
            setPropertyData(scenario.data);
            setUserSelections(scenario.selections);
            setShowSavedDrawer(false);
            handleAnalyzeClick();
        }
    };

    // ===================== FIREBASE INTEGRATION END =====================

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
            const safeSize = getSafeValue(sizeInput);
            const safeExitPrice = getSafeValue(exitPriceInput);
            const safeYearsInput = getSafeValue(yearsInput);
            const { purchasePrice, otherCharges, stampDuty, gstPercentage, assumptions, paymentPlan } = propertyData;

            const selectedProperty = propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)
                || propertyData.properties[0] || {};

            const periodUnit = propertyData.assumptions.holdingPeriodUnit || 'years';
            let totalHoldingMonths;
            if (periodUnit === 'months') {
                totalHoldingMonths = safeYearsInput;
            } else {
                totalHoldingMonths = safeYearsInput * 12;
            }

            const valYears = totalHoldingMonths / 12;
            const displayYears = Math.round(valYears * 100) / 100;
            const possessionMonths = getSafeValue(selectedProperty?.possessionMonths) || 0;
            const baseCost = safeSize * getSafeValue(purchasePrice);
            const extraCharges = getSafeValue(otherCharges);
            const agreementValue = baseCost;
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
            const pl1StartMonth = getSafeValue(assumptions.personalLoan1StartMonth);
            const pl2DelayMonths = getSafeValue(assumptions.personalLoan2StartMonth);
            // Note: PL2 slider is "Delay after possession", so absolute start is:
            const pl2AbsoluteStartMonth = possessionMonths + pl2DelayMonths + 1;
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
                // 1. GENERATE BASE SCHEDULE (Structure Only)
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

                // Create initial slabs (Interest calculated later)
                for (let i = 0; i < numberOfSlabs; i++) {
                    const month = startMonth + (i * interval);
                    if (month <= fundingEndMonth) {
                        idcSchedule.push({
                            slabNo: i + 1,
                            releaseMonth: month,
                            amount: slabAmount,
                            interestCost: 0 // Placeholder, we calculate this accurately below
                        });
                    }
                }

                // ============================================================
                // 2. EXECUTE STRATEGY (Calculate Exact Costs)
                // ============================================================

                // Determine the EXACT month interest stops (The month before EMI starts)
                const idcCutoffMonth = realHomeLoanStartMonth - 1;

                if (isManualMode) {
                    // MANUAL STRATEGY (Smart Saver)
                    const manualStart = getSafeValue(assumptions.homeLoanStartMonth);
                    const mStart = (manualStart !== undefined && manualStart !== null) ? parseInt(manualStart) : 0;

                    const manualResult = calculateManualStrategy({
                        homeLoanAmount,
                        manualStartMonth: mStart,
                        possessionMonths,
                        totalHoldingMonths,
                        hlRate,
                        hlTerm: getSafeValue(assumptions.homeLoanTerm),
                        personalLoan1Amount,
                        personalLoan1EMI,
                        assumptions,
                        idcSchedule // Pass the schedule structure
                    });

                    totalIDC = manualResult.totalIDC;
                    minIDCEMI = manualResult.minIDCEMI;
                    maxIDCEMI = manualResult.maxIDCEMI;
                    monthlyIDCEMI = manualResult.monthlyIDCEMI;
                    truePrePossessionTotal = manualResult.truePrePossessionTotal;

                    // CRITICAL FIX: Ensure the return object uses this value
                    totalLifetimeInterest = totalIDC;

                } else {
                    // DEFAULT STRATEGY (Standard CLP)

                    let cumulativeDisbursement = 0;
                    let runningTotalIDC = 0;
                    let runningTotalOutflow = 0;
                    let isFirstIDCPayment = false;

                    if (startMonth === 0) cumulativeDisbursement += slabAmount;

                    const hlTerm = getSafeValue(assumptions.homeLoanTerm);
                    let fullHL_EMI = 0;
                    if (homeLoanAmount > 0 && hlTerm > 0) {
                        const r = hlRate / 12 / 100;
                        const n = hlTerm * 12;
                        fullHL_EMI = (homeLoanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
                    }

                    const loopEnd = Math.min(totalHoldingMonths || possessionMonths, possessionMonths);

                    for (let m = 1; m <= loopEnd; m++) {
                        // LOGIC UPDATE: IDC Active only until Cutoff Month (e.g. Month 18)
                        const isPhase1_IDC = m <= fundingEndMonth && m <= idcCutoffMonth;

                        let monthlyHLComponent = 0;

                        if (isPhase1_IDC) {
                            const isScheduleMonth = (m >= startMonth) && ((m - startMonth) % interval === 0) && (m !== startMonth);
                            const isStartMonthTrigger = (startMonth !== 0 && m === startMonth);

                            if ((isScheduleMonth || isStartMonthTrigger) && cumulativeDisbursement < (homeLoanAmount - 10)) {
                                cumulativeDisbursement += slabAmount;
                                if (cumulativeDisbursement > homeLoanAmount) cumulativeDisbursement = homeLoanAmount;
                            }

                            // Interest on disbursed amount
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
                            // Phase 2: EMI Starts (or Gap period)
                            if (m >= realHomeLoanStartMonth) {
                                monthlyHLComponent = fullHL_EMI;
                            } else {
                                // Gap between IDC end and EMI start (rare)
                                monthlyHLComponent = (cumulativeDisbursement * (hlRate / 100)) / 12;
                                runningTotalIDC += monthlyHLComponent;
                            }
                        }

                        const monthlyPL1 = (personalLoan1Amount > 0 && m >= pl1StartMonth)
                            ? calculateEMI(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term)
                            : 0;
                        runningTotalOutflow += (monthlyHLComponent + monthlyPL1);
                    }

                    totalIDC = runningTotalIDC;
                    truePrePossessionTotal = runningTotalOutflow;

                    // Calculate Average
                    const activeIDCMonths = Math.min(idcCutoffMonth, fundingEndMonth) - startMonth + 1;
                    monthlyIDCEMI = activeIDCMonths > 0 ? (totalIDC / activeIDCMonths) : 0;

                    // 3. UPDATE SCHEDULE TABLE WITH CORRECT VALUES
                    idcSchedule = idcSchedule.map(slab => {
                        // If slab released AFTER interest cutoff, it costs 0 IDC (straight to EMI)
                        if (slab.releaseMonth > idcCutoffMonth) return { ...slab, interestCost: 0 };

                        // Interest Duration = Cutoff - Release + 1 (e.g. 18 - 3 + 1 = 16 months)
                        const monthsOfInterest = Math.max(0, idcCutoffMonth - slab.releaseMonth + 1);

                        return {
                            ...slab,
                            interestCost: (slab.amount * (hlRate / 100) / 12) * monthsOfInterest
                        };
                    });

                    // CRITICAL FIX: Overwrite the top-level variable so the return statement is correct
                    totalLifetimeInterest = totalIDC;
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
            const saleValue = safeSize * safeExitPrice;
            const leftoverCash = saleValue - totalLoanOutstanding;
            const trueNetProfit = leftoverCash - totalEMIPaid - downPaymentAmount;
            const totalActualInvestment = downPaymentAmount + totalEMIPaid;
            const roi = totalActualInvestment > 0 ? (trueNetProfit / totalActualInvestment) * 100 : 0;
            const netGainLoss = trueNetProfit;

            const prePossessionMonths = Math.min(totalHoldingMonths, possessionMonths);
            const postPossessionMonths = Math.max(0, totalHoldingMonths - possessionMonths);
            const prePossessionEMI = personalLoan1EMI + monthlyIDCEMI;
            const postPossessionEMI = homeLoanEMI + personalLoan1EMI + personalLoan2EMI;
            // ✅ FIX: Use the precise 'totalIDC' calculated from the schedule loop
            const totalInterestPaid = homeLoanInterestPaid + personalLoan1InterestPaid + personalLoan2InterestPaid + totalIDC;
            let phase1TotalCalc = 0;
            if (paymentPlan === 'clp' && truePrePossessionTotal > 0) {
                phase1TotalCalc = truePrePossessionTotal;
            } else {
                // For Non-CLP or Fallback:
                // Only count PL1 months where the Start Month has passed
                const pl1ActiveMonthsPhase1 = Math.max(0, prePossessionMonths - Math.max(0, pl1StartMonth - 1));
                phase1TotalCalc = (monthlyIDCEMI * prePossessionMonths) + (personalLoan1EMI * pl1ActiveMonthsPhase1);
            }

            // 2. Calculate Actual Phase 2 Total (Respecting PL1/PL2 Delays)
            const hlPostTotal = homeLoanEMI * postPossessionMonths;

            // PL1 in Phase 2:
            // If PL1 starts very late (e.g. Month 40), it might not even be active at the start of Phase 2 (Month 25).
            const pl1DelayInPhase2 = Math.max(0, pl1StartMonth - (possessionMonths + 1));
            const pl1PostMonths = Math.max(0, postPossessionMonths - pl1DelayInPhase2);
            const pl1PostTotal = personalLoan1EMI * pl1PostMonths;

            // PL2 in Phase 2:
            // PL2 starts only after "Possession + Delay".
            const pl2PostMonths = Math.max(0, postPossessionMonths - pl2DelayMonths);
            const pl2PostTotal = personalLoan2EMI * pl2PostMonths;

            const phase2TotalCalc = hlPostTotal + pl1PostTotal + pl2PostTotal;

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
                prePossessionTotal: phase1TotalCalc,
                postPossessionTotal: phase2TotalCalc,
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

                // ✅ FIX: Use the calculated ROI from the breakdown object
                roi: breakdown.roi,

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
                    { label: "Other Charges", value: `₹${propertyData.otherCharges}/sq.ft` },
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
        // 1. Find max ID
        const maxId = propertyData.properties.reduce((max, prop) => (prop.id > max ? prop.id : max), 0);
        const newId = maxId + 1;

        // 2. Create the new property (Empty fields)
        const newProperty = {
            id: newId,
            name: `Property ${newId}`,
            location: '',
            size: '',
            possessionMonths: '',
            rating: 0,
            isHighlighted: false,
        };

        // 3. Update Property List
        setPropertyData(prev => ({
            ...prev,
            properties: [...prev.properties, newProperty]
        }));

        // ✅ THE FIX: Automatically Select the New Property for Analysis
        // This ensures the "Next" button validates THIS card, not the previous one.
        setUserSelections(prev => ({
            ...prev,
            selectedPropertyId: newId,
            selectedPropertySize: '', // Reset size logic for the new entry
            scenarioSize: ''
        }));
    };

    const handleRemoveProperty = (id) => {
        if (propertyData.properties.length <= 1) return;

        setPropertyData(prev => {
            const updatedList = prev.properties.filter(prop => prop.id !== id);

            // ✅ THE FIX: If we deleted the ACTIVE property, select the first available one
            if (id === userSelections.selectedPropertyId) {
                const fallbackProp = updatedList[0];
                setUserSelections(sel => ({
                    ...sel,
                    selectedPropertyId: fallbackProp.id,
                    selectedPropertySize: fallbackProp.size,
                    scenarioSize: fallbackProp.size
                }));
            }

            return {
                ...prev,
                properties: updatedList
            };
        });
    };

    const handleAddExitPriceScenario = () => {
        let baseline = 0;

        // 1. If scenarios exist, take the max of those
        if (userSelections.scenarioExitPrices.length > 0) {
            const existingValues = userSelections.scenarioExitPrices.map(p => getSafeValue(p)); // ✅ FIX: Use getSafeValue
            baseline = Math.max(...existingValues);
        }
        // 2. If no scenarios, take the "Selected Exit Price"
        else if (userSelections.selectedExitPrice) {
            baseline = getSafeValue(userSelections.selectedExitPrice); // ✅ FIX
        }
        // 3. Fallback to Purchase Price
        else {
            baseline = getSafeValue(propertyData.purchasePrice); // ✅ FIX
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
    const renderPropertyInput = (index, property, label, field, type = "text", helpText = "", required = false) => (
        <div className="mb-3">
            <label className="form-label small">
                {label}
                {/* ✅ ADDED: Red Star if required */}
                {required && <span className="text-danger fw-bold ms-1">*</span>}
            </label>
            <input
                type={type}
                className="form-control form-control-sm"
                value={property[field]}
                placeholder={placeholders[field] || `Enter ${label}`}
                onChange={(e) => updatePropertyField(index, field, e.target.value)}
            />
            {helpText && <small className="text-muted">{helpText}</small>}
        </div>
    );

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
                <div className="glass-card mb-3 border-1 border-secondary">

                    {/* Header (Clickable) */}
                    <div
                        className="card-header border-0 py-3 cursor-pointer d-flex justify-content-between align-items-center bg-transparent"
                        // ✅ FIX 1: Toggle Logic - If it's already open, set state to empty string '' (close it), otherwise open 'id'
                        onClick={() => setActiveAccordion(isOpen ? '' : id)}
                        style={{ cursor: 'pointer' }}
                    >
                        {/* Title (Left) */}
                        <h5 className={`mb-0 fw-bold`}>
                            <i className={`bi ${icon} me-2`}></i>{title}
                        </h5>

                        {/* Arrow Icon (Right) */}
                        <i className={`bi bi-chevron-${isOpen ? 'up' : 'down'} ${isOpen ? '' : 'text-muted'}`}></i>
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
                // Inside validateCurrentStep -> else if (currentStep === 3)

                // Check PL1 Rate if Share > 0
                if (getSafeValue(propertyData.assumptions.personalLoan1Share) > 0 && isEmpty(propertyData.assumptions.personalLoan1Rate)) {
                    isValid = false;
                    errorMsg = 'Please enter Personal Loan 1 Rate.';
                }
                // Check PL1 Term
                if (getSafeValue(propertyData.assumptions.personalLoan1Share) > 0) {
                    if (isEmpty(propertyData.assumptions.personalLoan1Rate)) {
                        isValid = false; errorMsg = 'Please enter Personal Loan 1 Rate.';
                    } else if (isEmpty(propertyData.assumptions.personalLoan1Term)) {
                        isValid = false; errorMsg = 'Please enter Personal Loan 1 Tenure.';
                    }
                }
                // Check PL2 Term
                if (getSafeValue(propertyData.assumptions.personalLoan2Share) > 0) {
                    if (isEmpty(propertyData.assumptions.personalLoan2Rate)) {
                        isValid = false; errorMsg = 'Please enter Personal Loan 2 Rate.';
                    } else if (isEmpty(propertyData.assumptions.personalLoan2Term)) {
                        isValid = false; errorMsg = 'Please enter Personal Loan 2 Tenure.';
                    }
                }

                // Check PL2 Rate if Share > 0
                if (getSafeValue(propertyData.assumptions.personalLoan2Share) > 0 && isEmpty(propertyData.assumptions.personalLoan2Rate)) {
                    isValid = false;
                    errorMsg = 'Please enter Personal Loan 2 Rate.';
                }
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
                    <div className="position-absolute start-0 translate-middle-y"
                        style={{
                            top: '20px',
                            height: '2px',
                            backgroundColor: '#e9ecef',
                        }}
                    ></div>

                    {/* Active Line (Progress) */}
                    <div
                        className="position-absolute start-0 translate-middle-y bg-primary transition-all"
                        style={{
                            top: '20px',
                            height: '2px',
                            width: `${((currentStep - 1) / (steps.length - 1)) * 100}%`,
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
                                        className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 shadow-sm ${isActive ? 'badge bg-primary text-white scale-110' :
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
                        // Standard Next Button (Steps 1, 2, 3)
                        <button className="btn btn-primary rounded-pill px-4" onClick={handleNextStep}>
                            Next Step <i className="bi bi-arrow-right ms-2"></i>
                        </button>
                    ) : (
                        // Final Step: Show BOTH Preview & Analyze Buttons
                        <div className="d-flex gap-3">

                            {/* ✅ NEW: Preview Button */}
                            <button
                                className="btn btn-primary rounded-pill px-5 shadow-lg"
                                onClick={() => setShowPreview(true)}
                            >
                                <i className="bi bi-eye me-2"></i>Review Inputs
                            </button>

                            {/* Existing Analyze Button */}
                            <button
                                className="btn btn-primary rounded-pill px-5 shadow-lg"
                                onClick={() => {
                                    if (validateCurrentStep()) {
                                        handleAnalyzeClick();
                                    }
                                }}
                            >
                                Analyze Property <i className="bi bi-graph-up ms-2"></i>
                            </button>
                        </div>
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

                        {/* REPLACEMENT CODE START */}
                        <div className="d-flex gap-2">
                            {/* 1. SAVE BUTTON */}
                            <button
                                className="btn btn-outline-primary d-flex align-items-center shadow-sm rounded-pill px-3"
                                onClick={handleSaveScenario}
                                title="Save this scenario"
                            >
                                <i className="bi bi-save me-2"></i> Save
                            </button>

                            {/* 2. DRAWER TRIGGER (The Missing Button!) */}
                            <button
                                className="btn btn-primary d-flex align-items-center shadow-sm rounded-pill px-3 position-relative"
                                onClick={() => setShowSavedDrawer(true)}
                            >
                                <i className="bi bi-folder2-open me-2"></i> My Properties
                                {savedScenarios.length > 0 && (
                                    <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-light">
                                        {savedScenarios.length}
                                    </span>
                                )}
                            </button>

                            {/* 3. RESET BUTTON (Keep this) */}
                            <button
                                className="btn btn-success d-flex align-items-center shadow-sm rounded-pill px-3"
                                onClick={handleResetData}
                            >
                                <i className="bi bi-arrow-counterclockwise me-2"></i> Reset All Inputs
                            </button>
                        </div>
                        {/* REPLACEMENT CODE END */}
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
                                                        <div className="card h-100 shadow-sm border-2 me-4">
                                                            <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
                                                                <span className="badge bg-primary px-3 py-2">Property #{property.id || 1}</span>
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
                                                                {renderPropertyInput(index, property, "Property Name", "name", "text", "", true)}
                                                                {renderPropertyInput(index, property, "Location", "location", "text", "", true)}
                                                                <div className="row">
                                                                    <div className="col-md-6">
                                                                        {renderPropertyInput(index, property, "Size (sq.ft)", "size", "number", "", true)}
                                                                    </div>
                                                                    <div className="col-md-6">
                                                                        {renderPropertyInput(index, property, "Possession", "possessionMonths", "number", "Months until possession", true)}
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
                                                <label className="form-label">
                                                    Purchase Price (₹/sq.ft) <span className="text-danger fw-bold">*</span>
                                                </label>
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
                                                <label className="form-label">
                                                    GST Percentage <span className="text-danger fw-bold">*</span>
                                                </label>
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
                                                    Applied on <b>Base Cost</b> of the Property
                                                </small>
                                            </div>
                                            <div className="col-md-6">
                                                <label className="form-label">Calculated GST Amount</label>
                                                <div className="form-control bg-light text-secondary">
                                                    {/* Calculate display value on the fly based on inputs */}
                                                    {(() => {
                                                        const size = getSafeValue(userSelections.selectedPropertySize);
                                                        const price = getSafeValue(propertyData.purchasePrice);
                                                        const others = getSafeValue(propertyData.otherCharges);
                                                        const gst = getSafeValue(propertyData.gstPercentage);
                                                        const totalVal = (size * price);
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
                                                    <label className="form-label">
                                                        Payment Plan Type <span className="text-danger fw-bold">*</span>
                                                    </label>
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
                                                    <label className="form-label">
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
                                                        <label className="form-label">
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
                                                        <small className="text-muted">Total construction period</small>
                                                    </div>
                                                    <div className="col-md-6">
                                                        <label className="form-label">
                                                            Disbursement Interval (Months) <span className="text-danger fw-bold">*</span></label>
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
                                        <div className="row g-4">
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

                                            <div className="col-md-3">
                                                <label className="form-label">
                                                    Tenure (Years) <span className="text-danger fw-bold">*</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={propertyData.assumptions.personalLoan1Term}
                                                    placeholder="e.g. 5"
                                                    onChange={(e) => handleAssumptionChange('personalLoan1Term', e.target.value)}
                                                    disabled={propertyData.paymentPlan !== 'custom' && propertyData.assumptions.personalLoan1Share === 0}
                                                />
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

                                            {/* Column 5: Start Month Slider */}
                                            <div className="col-md-6">
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
                                            {/* Column 2: Tenure (WAS Amount) */}
                                            <div className="col-md-3">
                                                <label className="form-label">
                                                    Tenure (Years) <span className="text-danger fw-bold">*</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={propertyData.assumptions.personalLoan2Term}
                                                    placeholder="e.g. 5"
                                                    onChange={(e) => handleAssumptionChange('personalLoan2Term', e.target.value)}
                                                    disabled={propertyData.assumptions.personalLoan2Share === 0}
                                                />
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

                                            {/* 4. Start Month Slider with Ticks & Labels */}
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
                                                    <label className="form-label">
                                                        Selected Exit Price (₹/sq.ft) <span className="text-danger fw-bold">*</span>
                                                    </label>

                                                    {/* ℹ️ INFO ICON BUTTON */}
                                                    <button
                                                        className="btn btn-link text-decoration-none p-0 mb-2"
                                                        onClick={() => setShowExitLogic(!showExitLogic)}
                                                        title="See calculation logic"
                                                    >
                                                        <small className="fw-bold text-muted" style={{ fontSize: '0.75rem' }}>
                                                            <i className="bi bi-info-circle-fill text-muted me-1"></i>
                                                            How is this calculated?
                                                        </small>
                                                    </button>
                                                </div>

                                                {/* 📉 LOGIC DROPDOWN CARD (Visible only when clicked) */}
                                                {showExitLogic && (
                                                    <div className="glass-card animate-fade-in">
                                                        <div className="card-body p-2">
                                                            <h6 className="card-title small fw-bold mb-2 border-bottom pb-1">
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

        // --- REUSABLE UI CARD COMPONENT (DARK MODE READY) ---
        const PlanCard = ({ title, price, subtitle, features, isRecommended, balance, balanceLabel }) => (
            <div
                className={`card h-100 glass-card ${isRecommended ? 'border-primary border-2 shadow-lg scale-105' : 'border-secondary border-opacity-25 shadow-sm'}`}
                style={{
                    borderRadius: '16px',
                    // No hardcoded background color here; glass-card handles it
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    boxShadow: isRecommended
                        ? '0 15px 40px -5px rgba(13, 110, 253, 0.25)' // Blue Glow for Recommended
                        : '0 8px 24px -4px rgba(0, 0, 0, 0.1)'
                }}
            >

                {isRecommended && (
                    <div className="position-absolute top-0 end-0 bg-primary text-white fw-bold px-3 py-1 small"
                        style={{ borderBottomLeftRadius: '12px' }}>
                        Smart Choice
                    </div>
                )}

                <div className="card-body p-4 text-center d-flex flex-column">
                    <h5 className="text-muted text-uppercase small fw-bold mb-3">{title}</h5>

                    <div className="mb-1">
                        <span className={`h2 fw-bold ${isRecommended ? 'text-primary' : ''}`}>{price}</span>
                    </div>
                    <small className="text-muted mb-4">{subtitle}</small>

                    {/* Inner Box: Uses opacity for theme adaptability */}
                    <div className={`my-3 py-3 border-top border-bottom rounded ${isRecommended ? 'bg-primary bg-opacity-10 border-primary border-opacity-10' : 'bg-secondary bg-opacity-10 border-secondary border-opacity-10'}`}>
                        <small className="d-block text-muted mb-1">Loan Balance at Possession</small>
                        <div className={`fw-bold fs-5 ${isRecommended ? 'text-success' : 'text-danger'}`}>
                            {balance}
                        </div>
                        <small className={isRecommended ? 'text-success' : 'text-danger'}>
                            {balanceLabel}
                        </small>
                    </div>

                    <div className="text-start mt-3 flex-grow-1">
                        {features.map((feat, idx) => (
                            <div key={idx} className="d-flex align-items-start mb-2 small">
                                <i className={`bi ${feat.icon} me-2 fs-6 mt-1`}></i>
                                {/* text-reset ensures it uses the theme's text color (white in dark, black in light) */}
                                <span className="text-reset opacity-75">{feat.text}</span>
                            </div>
                        ))}
                    </div>

                    {isRecommended && (
                        <div className="mt-3">
                            <div className="badge bg-success w-100 py-2 shadow-sm">
                                <i className="bi bi-piggy-bank me-2"></i>
                                Save {formatLakhs(profit)} Principal
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );

        return (
            <div className="mb-5">
                <div className="text-center mb-4">
                    <h4 className="fw-bold gradient-text">Standard CLP VS Full EMI</h4>
                </div>

                <div className="row g-4 align-items-center justify-content-center">
                    {/* STANDARD PLAN */}
                    <div className="col-md-5">
                        <PlanCard
                            title="Standard CLP"
                            price={formatCurrency(standardTotalPaid)}
                            subtitle="Total Paid till Possession"
                            balance={formatLakhs(standardBalance)}
                            balanceLabel="100% Principal Remaining"
                            isRecommended={false}
                            features={[
                                { icon: "bi-check-circle-fill text-success", text: "Lower monthly burden initially" },
                                { icon: "bi-check-circle-fill text-success", text: "Cash flow friendly" },
                                { icon: "bi-x-circle-fill text-danger", text: "Zero principal reduction" },
                                { icon: "bi-x-circle-fill text-danger", text: "Higher interest cost long-term" },
                            ]}
                        />
                    </div>

                    {/* SMART SAVER PLAN */}
                    <div className="col-md-5">
                        <PlanCard
                            title="Smart Saver (Full EMI)"
                            price={formatCurrency(manualTotalPaid)}
                            subtitle={`Pay +${formatCurrency(manualTotalPaid - standardTotalPaid)} more upfront`}
                            balance={formatLakhs(hlAmount - profit)}
                            balanceLabel={`Prinipal reduced by ${formatLakhs(profit)}`}
                            isRecommended={true}
                            features={[
                                { icon: "bi-exclamation-triangle-fill text-danger", text: "High initial monthly commitment" },
                                { icon: "bi-check-circle-fill text-success", text: "Massive Principal Reduction" },
                                { icon: "bi-check-circle-fill text-success", text: "Lower Loan Balance = Higher Profit" },
                                { icon: "bi-check-circle-fill text-success", text: "Paid off significant debt early" },
                            ]}
                        />
                    </div>
                </div>
            </div>
        );
    };
    // Helper: Empty State UI (Standardized)
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
                        <div className="col-6 col-md-3">
                            <div className="metric-card glass-card text-center h-100 p-3 border border-primary shadow">
                                <div className="rounded-circle bg-primary bg-opacity-20 d-flex align-items-center justify-content-center mx-auto mb-3 shadow-sm" style={{ width: '60px', height: '60px' }}>
                                    <i className="bi bi-cash-stack fs-3"></i>
                                </div>
                                <h4 className="fw-bold mb-1">{formatLakhs(breakdown.totalCost)}</h4>
                                <p className="text-muted mb-0 small fw-bold">Total Cost</p>
                            </div>
                        </div>
                        {/* SPECIAL ROI CARD */}
                        <div className="col-6 col-md-3">
                            <div className="metric-card glass-card text-center h-100 p-3 border border-success shadow">
                                <div className="rounded-circle bg-success bg-opacity-20 d-flex align-items-center justify-content-center mx-auto mb-3 shadow-sm" style={{ width: '60px', height: '60px' }}>
                                    <i className="bi bi-graph-up-arrow fs-3"></i>
                                </div>
                                <h4 className="fw-bold mb-1 ">{formatPercent(breakdown.roi)}</h4>
                                <p className="text-muted mb-0 small fw-bold">Estimated ROI</p>

                                {/* ✅ NEW: Show the Exit Price used */}
                                <small className="text-muted" style={{ fontSize: '0.8rem' }}>
                                    @ ₹{breakdown.exitPrice}/sq.ft
                                </small>
                            </div>
                        </div>
                        <div className="col-6 col-md-3">
                            <div className="metric-card glass-card text-center h-100 p-3 border border-warning shadow">
                                <div className="rounded-circle bg-warning bg-opacity-20 d-flex align-items-center justify-content-center mx-auto mb-3 shadow-sm" style={{ width: '60px', height: '60px' }}>
                                    <i className="bi bi-wallet2 fs-3"></i>
                                </div>
                                <h4 className="fw-bold mb-1 ">{formatLakhs(breakdown.leftoverCash)}</h4>
                                <p className="text-muted mb-0 small fw-bold">Cash After Sale</p>
                            </div>
                        </div>
                        <div className="col-6 col-md-3">
                            <div className="metric-card glass-card text-center h-100 p-3 border border-info shadow-sm">
                                <div className="rounded-circle bg-info bg-opacity-20 d-flex align-items-center justify-content-center mx-auto mb-3 shadow-sm" style={{ width: '60px', height: '60px' }}>
                                    <i className="bi bi-hourglass-split fs-3"></i>
                                </div>
                                <h4 className="fw-bold mb-1">{breakdown.years} Yrs</h4>
                                <p className="text-muted mb-0 small fw-bold">Holding Period</p>
                            </div>
                        </div>
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

                <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
                    {renderStrategyComparison()}
                </div>

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

    // Reusable Component for Horizontal Strips
    const renderInfoStrip = ({ title, subtitle, icon, color, badge, badgeTextColor, columns }) => (
        <div className={`glass-card mb-4 p-0 border-0 border-start border-4 border-${color} shadow-sm bg-white overflow-hidden`}>
            <div className="row g-0 h-100">

                {/* Left Section */}
                <div className="col-md-3 col-12 d-flex align-items-center p-3 border-end border-light">
                    <div className="d-flex align-items-center w-100">
                        <div className="me-3 flex-shrink-0 ps-4">
                            <div className={`rounded-circle bg-${color} bg-opacity-10 d-flex align-items-center justify-content-center`} style={{ width: '48px', height: '48px' }}>
                                <i className={`bi ${icon} fs-4 text-${color}`}></i>
                            </div>
                        </div>
                        <div className="flex-grow-1" style={{ minWidth: 0 }}>
                            <div className="fw-bold mb-0 text-truncate" style={{ lineHeight: '1.2', fontSize: '0.95rem' }}>{title}</div>
                            <small className="text-muted d-block text-truncate" style={{ fontSize: '0.7rem' }}>{subtitle}</small>
                            {badge && (
                                // UPDATED LINE: Uses badgeTextColor if provided, otherwise falls back to the main color
                                <span className={`badge bg-${color} bg-opacity-10 text-${badgeTextColor || color} border border-${color} border-opacity-25 shadow-sm mt-1`} style={{ fontSize: '0.6rem', fontWeight: '600' }}>
                                    {badge}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Section (Unchanged) */}
                <div className="col-md-9 col-12">
                    <div className="d-flex align-items-center h-100 w-100 py-2">
                        {columns.map((col, index) => (
                            <div key={index} className={`flex-fill text-center px-2 ${index !== columns.length - 1 ? 'border-end border-secondary border-opacity-10' : ''}`}>
                                <div className="d-flex flex-column justify-content-center h-100">
                                    <small className="text-muted text-uppercase fw-bold d-block mb-1" style={{ fontSize: '0.65rem', letterSpacing: '0.5px' }}>
                                        {col.label}
                                    </small>
                                    <div className={`fw-bold ${col.color ? `text-${col.color}` : 'text-dark'}`} style={{ fontSize: '1.1rem' }}>
                                        {col.value}
                                    </div>
                                    {col.subtext && (
                                        <small className="text-muted d-block mt-1" style={{ fontSize: '0.6rem' }}>
                                            {col.subtext}
                                        </small>
                                    )}
                                </div>
                            </div>
                        ))}
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
        if (breakdown.totalCost === 0) {
            return (
                <RenderEmptyState
                    title="No Calculation Generated Yet"
                    message="It looks like you haven't entered any property details. Head over to the Input Parameters tab to configure your investment model."
                />
            );
        }

        // ✅ FIX: Wrapped in 'central-container' to limit width and center it
        return (
            <div className="mb-5 central-container">
                <div className="glass-card mb-4">

                    {/* Header */}
                    <div className="card-body border-bottom">
                        <div className="row align-items-center ">
                            <div className="col-md-8">
                                <h2 className="fw-bold mb-2 gradient-text">
                                    <i className="bi bi-calculator me-3"></i>
                                    Detailed Financial Breakdown
                                </h2>
                                <p className="text-muted mb-0 pb-4">
                                    Complete calculation details and amortization schedules
                                </p>
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
                                                onClick={() => handleDelayedNavigation('/monthly-breakdown', {
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
                                                    manualStartMonth: getSafeValue(propertyData.assumptions.homeLoanStartMonth),
                                                    pl1StartMonth: breakdown.pl1StartMonth
                                                }, "Calculating Monthly Breakdown...")}
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
                                                    onClick={() => handleDelayedNavigation('/schedule', {
                                                        idcSchedule: breakdown.idcSchedule,
                                                        pl1EMI: breakdown.personalLoan1EMI,
                                                        totalIDC: breakdown.totalIDC,
                                                        totalHoldingMonths: breakdown.totalHoldingMonths,
                                                        propertyName: propertyData.properties.find(p => p.id === userSelections.selectedPropertyId)?.name,
                                                        possessionMonths: breakdown.possessionMonths,
                                                        totalPaid: breakdown.prePossessionTotal,
                                                        homeLoanAmount: breakdown.homeLoanAmount,
                                                        lastBankDisbursementMonth: propertyData.assumptions.lastBankDisbursementMonth,
                                                        interestRate: propertyData.assumptions.homeLoanRate,
                                                        homeLoanStartMode: propertyData.assumptions.homeLoanStartMode,
                                                        manualStartMonth: getSafeValue(propertyData.assumptions.homeLoanStartMonth)
                                                    }, "Calculating IDC Slabs...")}
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
                                    // CASE A: Normal Scenario
                                    renderTimelineCard(
                                        "Timeline 2: Post-Possession",
                                        "bi-calendar-check",
                                        "success",
                                        `${formatCurrency(breakdown.postPossessionEMI)}/month`,
                                        `Month ${breakdown.possessionMonths + 1} to Month ${breakdown.totalHoldingMonths}`,
                                        `${breakdown.postPossessionMonths} months`,

                                        // --- UPDATED COMPONENTS SECTION ---
                                        <>
                                            {renderComponentBox("HL EMI", formatCurrency(breakdown.homeLoanEMI), 4)}
                                            {renderComponentBox("PL1 EMI", formatCurrency(breakdown.personalLoan1EMI), 4)}
                                            {breakdown.hasPersonalLoan2 &&
                                                renderComponentBox("PL2 EMI", formatCurrency(breakdown.personalLoan2EMI), 4)
                                            }

                                            {/* Card 1: Total Home Loan Cost */}
                                            <div className="col-4">
                                                <div className="p-2 border rounded  bg-opacity-10 border-opacity-25 h-100">
                                                    <small className="text-opacity-75 d-block" style={{ fontSize: '0.65rem' }}></small>
                                                    <div style={{ fontSize: '0.85rem' }}>
                                                        {breakdown.postPossessionMonths} months × {formatCurrency(breakdown.homeLoanEMI)}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card 2: Total PL1 Cost */}
                                            <div className="col-4">
                                                <div className="p-2 border rounded bg-opacity-10 border-opacity-25 h-100">
                                                    <small className="text-opacity-75 d-block" style={{ fontSize: '0.65rem' }}></small>
                                                    <div style={{ fontSize: '0.85rem' }}>
                                                        {breakdown.postPossessionMonths} months × {formatCurrency(breakdown.personalLoan1EMI)}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card 3: Total PL2 Cost (Conditional) */}
                                            {breakdown.hasPersonalLoan2 && (
                                                <div className="col-4">
                                                    <div className="p-2 border rounded bg-opacity-10 border-opacity-25 h-100">
                                                        <small className="text-opacity-75 d-block" style={{ fontSize: '0.65rem' }}></small>
                                                        <div style={{ fontSize: '0.85rem' }}>
                                                            {Math.max(0, breakdown.postPossessionMonths - (breakdown.pl2SelectedMonths || 0))}

                                                            {' '}months × {formatCurrency(breakdown.personalLoan2EMI)}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </>,

                                        // Total Amount Footer
                                        formatCurrency(breakdown.postPossessionTotal),
                                        "Includes Home Loan + Active Personal Loans",

                                        null,
                                        null,

                                        // Extra Footer Note
                                        <small className="opacity-75 mt-2 d-block">
                                            <i className="bi bi-piggy-bank me-1"></i> Covers Principal Repayment + Interest
                                        </small>
                                    )
                                ) : (
                                    // CASE B: Early Exit
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
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Summary Card - Removed 'm-4', replaced with standard spacing */}
                            {/* Total Commitment Visual Split */}
                            <div className="glass-card mt-4 mb-4 pt-0 pb-2 border-0 border-start border-4 border-info shadow-sm bg-white">
                                <div className="row align-items-center">

                                    {/* Left Side: The Grand Total (Hero Metric) */}
                                    <div className="col-md-3 border-light">
                                        <small className="text-uppercase text-muted fw-bold" style={{ fontSize: '0.7rem', letterSpacing: '0.5px' }}>
                                            Lifetime Commitment
                                        </small>
                                        <div className="fw-bold text-info my-1" style={{ fontSize: '2rem' }}>
                                            {formatCurrency(breakdown.totalEMIPaid)}
                                        </div>
                                        {breakdown.hasIDC && (
                                            <div className="d-flex align-items-center text-muted">
                                                <i className="bi bi-info-circle-fill me-2 text-info opacity-50"></i>
                                                <small style={{ fontSize: '0.7rem' }}>Includes Avg IDC ({formatCurrency(breakdown.monthlyIDCEMI)})</small>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right Side: The Visual Timeline Split */}
                                    <div className="col-md-9 mt-3">
                                        {/* Labels */}
                                        <div className="d-flex justify-content-between mb-2">
                                            <span className="fw-bold small text-primary">
                                                <i className="bi bi-hammer me-1"></i>Pre-Possession
                                            </span>
                                            <span className="fw-bold small text-success">
                                                <i className="bi bi-house-check me-1"></i>Post-Possession
                                            </span>
                                        </div>

                                        {/* The Visual Bar */}
                                        <div className="progress rounded-pill mb-3" style={{ height: '12px', backgroundColor: '#e9ecef' }}>
                                            <div
                                                className="progress-bar bg-primary"
                                                role="progressbar"
                                                style={{ width: `${(breakdown.prePossessionTotal / breakdown.totalEMIPaid) * 100}%` }}
                                                aria-label="Pre-Possession"
                                            ></div>
                                            <div
                                                className="progress-bar bg-success"
                                                role="progressbar"
                                                style={{ width: `${(breakdown.postPossessionTotal / breakdown.totalEMIPaid) * 100}%` }}
                                                aria-label="Post-Possession"
                                            ></div>
                                        </div>

                                        {/* The Values Grid */}
                                        <div className="d-flex justify-content-between">
                                            <div>
                                                <div className="fw-bold fs-5">{formatCurrency(breakdown.prePossessionTotal)}</div>
                                                <small className="text-muted text-uppercase" style={{ fontSize: '0.65rem' }}>Construction Phase</small>
                                            </div>
                                            <div className="text-end">
                                                <div className="fw-bold fs-5">{formatCurrency(breakdown.postPossessionTotal)}</div>
                                                <small className="text-muted text-uppercase" style={{ fontSize: '0.65rem' }}>Repayment Phase</small>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ======================================================= */}
                        {/* 📊 NEW: CLEAN LOAN AMORTIZATION TABLE (Matching Target Image) */}
                        {/* ======================================================= */}
                        <div className="schedule-container border shadow-sm rounded-4 overflow-hidden mb-5">
                            <div className="table-responsive">
                                <table className="schedule-table align-middle mb-0">
                                    <thead>
                                        <tr>
                                            <th className="py-3 ps-4 text-start" style={{ width: '30%' }}>Component</th>
                                            <th className="py-3 text-end" style={{ width: '17.5%' }}>Monthly Impact</th>
                                            <th className="py-3 text-end" style={{ width: '17.5%' }}>Total Paid</th>
                                            <th className="py-3 text-end" style={{ width: '17.5%' }}>Interest Cost</th>
                                            <th className="py-3 text-end pe-4" style={{ width: '17.5%' }}>Balance / Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>

                                        {/* 1. IDC ROW */}
                                        {breakdown.hasIDC && (
                                            <tr>
                                                <td className="ps-4 py-4">
                                                    <div className="d-flex align-items-center">
                                                        <i className="bi bi-calculator-fill fs-2 text-warning me-3"></i>
                                                        <div>
                                                            <div className="fw-bold">IDC Component</div>
                                                            <div className="small text-muted">(Interest During Construction)</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="text-end">
                                                    <div className="small text-muted mb-1">Avg Monthly</div>
                                                    <div className="fs-5 text-muted">{formatCurrency(breakdown.monthlyIDCEMI)}</div>
                                                </td>
                                                <td className="text-end">
                                                    <div className="small text-muted mb-1">Total</div>
                                                    <div className="fs-5 text-muted">{formatLakhs(breakdown.totalIDC)}</div>
                                                </td>
                                                <td className="text-end">
                                                    <div className="small text-muted mb-1">100%</div>
                                                    <div className="fs-5 text-muted">Interest</div>
                                                </td>
                                                <td className="text-end pe-4">
                                                    <div className="small text-muted mb-1">Final Loan Bal</div>
                                                    <div className="fs-5">{formatLakhs(breakdown.totalHomeLoanAtCompletion + breakdown.totalIDC)}</div>
                                                </td>
                                            </tr>
                                        )}

                                        {/* 2. HOME LOAN ROW */}
                                        <tr>
                                            <td className="ps-4 py-4">
                                                <div className="d-flex align-items-center">
                                                    <i className="bi bi-bank fs-2 text-primary me-3"></i>
                                                    <div>
                                                        <div className="fw-bold">Home Loan</div>
                                                        <div className="small text-muted">(Principal + Interest)</div>
                                                        {breakdown.hasIDC && (
                                                            <span className="badge rounded-pill bg-light text-dark border mt-1 fw-normal" style={{ fontSize: '0.7rem' }}>
                                                                Includes IDC
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="text-end">
                                                <div className="small text-muted mb-1">EMI</div>
                                                <div className="fs-5 text-muted">{formatCurrency(breakdown.homeLoanEMI)}</div>
                                            </td>
                                            <td className="text-end">
                                                <div className="small text-muted mb-1">Total Paid</div>
                                                <div className="fs-5 text-muted">{formatLakhs(breakdown.homeLoanEMIPaid)}</div>
                                            </td>
                                            <td className="text-end">
                                                <div className="small text-muted mb-1">Interest</div>
                                                <div className="fs-5 text-muted">{formatLakhs(breakdown.homeLoanInterestPaid)}</div>
                                            </td>
                                            <td className="text-end pe-4">
                                                <div className="small text-muted mb-1">Outstanding</div>
                                                <div className="fs-5">{formatLakhs(breakdown.homeLoanOutstanding)}</div>
                                            </td>
                                        </tr>

                                        {/* 3. PL1 ROW */}
                                        {breakdown.hasPersonalLoan1 && (
                                            <tr>
                                                <td className="ps-4 py-4">
                                                    <div className="d-flex align-items-center">
                                                        <i className="bi bi-cash-stack fs-2 text-success me-3"></i>
                                                        <div>
                                                            <div className="fw-bold">Personal Loan 1</div>
                                                            <div className="small text-muted">(Secondary Funding)</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="text-end">
                                                    <div className="small text-muted mb-1">EMI</div>
                                                    <div className="fs-5 text-muted">{formatCurrency(breakdown.personalLoan1EMI)}</div>
                                                </td>
                                                <td className="text-end">
                                                    <div className="small text-muted mb-1">Total Paid</div>
                                                    <div className="fs-5 text-muted">{formatLakhs(breakdown.personalLoan1EMIPaid)}</div>
                                                </td>
                                                <td className="text-end">
                                                    <div className="small text-muted mb-1">Interest</div>
                                                    <div className="fs-5 text-muted">{formatCurrency(breakdown.personalLoan1InterestPaid)}</div>
                                                </td>
                                                <td className="text-end pe-4">
                                                    <div className="small text-muted mb-1">Outstanding</div>
                                                    <div className="fs-5">{formatCurrency(breakdown.personalLoan1Outstanding)}</div>
                                                </td>
                                            </tr>
                                        )}

                                        {/* 4. PL2 ROW */}
                                        {breakdown.hasPersonalLoan2 && (
                                            <tr>
                                                <td className="ps-4 py-4">
                                                    <div className="d-flex align-items-center">
                                                        <i className="bi bi-wallet2 fs-2 text-warning me-3"></i>
                                                        <div>
                                                            <div className="fw-bold">Personal Loan 2</div>
                                                            <div className="small text-muted">(Additional Funding)</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="text-end">
                                                    <div className="small text-muted mb-1">EMI</div>
                                                    <div className="fs-5 text-muted">{formatCurrency(breakdown.personalLoan2EMI)}</div>
                                                </td>
                                                <td className="text-end">
                                                    <div className="small text-muted mb-1">Total Paid</div>
                                                    <div className="fs-5 text-muted">{formatLakhs(breakdown.personalLoan2EMIPaid)}</div>
                                                </td>
                                                <td className="text-end">
                                                    <div className="small text-muted mb-1">Interest</div>
                                                    <div className="fs-5 text-muted">{formatCurrency(breakdown.personalLoan2InterestPaid)}</div>
                                                </td>
                                                <td className="text-end pe-4">
                                                    <div className="small text-muted mb-1">Outstanding</div>
                                                    <div className="fs-5">{formatCurrency(breakdown.personalLoan2Outstanding)}</div>
                                                </td>
                                            </tr>
                                        )}

                                        {/* 5. TOTAL SUMMARY ROW */}
                                        <tr>
                                            <td className="ps-4 py-4">
                                                <div className="d-flex align-items-center">
                                                    <i className="bi bi-calculator fs-2 me-3"></i>
                                                    <div>
                                                        <div className="fw-bold">Total Summary</div>
                                                        <div className="small text-muted">(All Active Loans)</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="text-end">
                                                <div className="small text-muted mb-1">Total Monthly EMI</div>
                                                <div className="fs-4 text-muted">{formatCurrency(breakdown.homeLoanEMI + breakdown.personalLoan1EMI + breakdown.personalLoan2EMI)}</div>
                                            </td>
                                            <td className="text-end">
                                                <div className="small text-muted mb-1">Total Paid</div>
                                                <div className="fs-4 text-muted">{formatLakhs(breakdown.totalEMIPaid)}</div>
                                            </td>
                                            <td className="text-end">
                                                <div className="small text-muted mb-1">Total Interest</div>
                                                <div className="fs-4 text-muted">{formatLakhs(breakdown.totalInterestPaid)}</div>
                                            </td>
                                            <td className="text-end pe-4">
                                                <div className="small text-muted mb-1">Outstanding</div>
                                                <div className="fs-4">{formatLakhs(breakdown.totalLoanOutstanding)}</div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
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

    // Helper: Full Screen Loading Overlay (Calculation Themed)
    const renderLoadingOverlay = () => {
        if (!isProcessing) return null;

        return (
            <div
                className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column justify-content-center align-items-center"
                style={{
                    zIndex: 9999,
                    backgroundColor: 'rgba(15, 23, 42, 0.9)', // Darker background for contrast
                    backdropFilter: 'blur(8px)'
                }}
            >
                {/* Custom CSS Animation */}
                <div className="loader-container mb-4">
                    <div className="loader-ring"></div>
                    <i className="bi bi-calculator-fill loader-icon"></i>
                </div>

                {/* Text */}
                <h4 className="text-white fw-light animate-fade-in mb-1">{loadingMessage}</h4>
                <div className="d-flex align-items-center text-white-50 small mt-2">
                    <span className="spinner-grow spinner-grow-sm me-2" style={{ width: '0.5rem', height: '0.5rem' }} role="status"></span>
                    Crunching the numbers...
                </div>
            </div>
        );
    };
    // Helper: Renders the Preview Modal
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
                    style={{ zIndex: 1040, opacity: 0.7, backdropFilter: 'blur(4px)' }}
                    onClick={() => setShowPreview(false)}
                ></div>

                {/* Modal Content */}
                <div
                    className="position-fixed top-50 start-50 translate-middle w-100"
                    style={{ maxWidth: '900px', zIndex: 1050, maxHeight: '95vh', overflowY: 'auto' }}
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
    // --- 🖨️ PRINT REPORT GENERATOR (UPDATED) ---
    const renderPrintView = () => {
        const bd = calculatedData.detailedBreakdown;
        if (!bd) return null;

        const prop = propertyData.properties.find(p => p.id === userSelections.selectedPropertyId) || {};

        // --- HELPER: Re-calculate Strategy Comparison for Print ---
        // (We calculate this locally here since it wasn't stored in global state)
        let strategyData = null;
        if (propertyData.paymentPlan === 'clp' && bd.homeLoanAmount > 0) {
            const hlAmount = bd.homeLoanAmount;
            const rate = propertyData.assumptions.homeLoanRate;
            const tenure = propertyData.assumptions.homeLoanTerm;
            const possession = bd.possessionMonths;
            const fullEMI = calculateEMI(hlAmount, rate, tenure);

            // Sim A: Standard
            let stdTotal = 0;
            let cumDisb = 0;
            const slabs = bd.idcSchedule?.length || 1;
            const slabAmt = hlAmount / slabs;
            const interval = propertyData.assumptions.bankDisbursementInterval || 3;

            for (let m = 1; m <= possession; m++) {
                if (m % interval === 0 && cumDisb < hlAmount) {
                    cumDisb += slabAmt;
                    if (cumDisb > hlAmount) cumDisb = hlAmount;
                }
                stdTotal += (cumDisb * (rate / 100)) / 12;
            }

            // Sim B: Smart Saver
            let manTotal = 0;
            let manBal = 0;
            let manPrin = 0;
            cumDisb = 0;
            for (let m = 1; m <= possession; m++) {
                if (m % interval === 0 && cumDisb < hlAmount) {
                    cumDisb += slabAmt;
                    manBal += slabAmt;
                    if (cumDisb > hlAmount) cumDisb = hlAmount;
                }
                const interest = (manBal * (rate / 100)) / 12;
                const prin = fullEMI - interest;
                manBal -= prin;
                manPrin += prin;
                manTotal += fullEMI;
            }

            strategyData = {
                stdTotal,
                stdBal: hlAmount,
                manTotal,
                manBal: hlAmount - manPrin,
                savings: manPrin
            };
        }

        return (
            <div className="print-only-container p-5" style={{ fontFamily: 'Arial, sans-serif' }}>
                {/* 1. REPORT HEADER */}
                <div className="text-center mb-5 border-bottom pb-4">
                    <h1 className="fw-bold mb-2">Property Investment Analysis</h1>
                    <h4 className="text-secondary">{prop.name}</h4>
                    <p className="text-muted small mt-2">Generated on {new Date().toLocaleDateString()} • By Agenthum AI Solutions</p>
                </div>

                {/* 2. EXECUTIVE SUMMARY GRID */}
                <div className="row mb-5">
                    <div className="col-12 mb-3"><h5 className="fw-bold border-bottom pb-2">1. Executive Summary</h5></div>

                    {/* Property Card */}
                    <div className="col-6 mb-3">
                        <div className="p-3 border rounded h-100">
                            <h6 className="fw-bold text-primary mb-3">Property Details</h6>
                            <div className="row g-2 small">
                                <div className="col-6 text-muted">Location:</div><div className="col-6 fw-bold">{prop.location || '-'}</div>
                                <div className="col-6 text-muted">Size:</div><div className="col-6 fw-bold">{bd.propertySize} sq.ft</div>
                                <div className="col-6 text-muted">Rate:</div><div className="col-6 fw-bold">{formatCurrency(propertyData.purchasePrice)}/sq.ft</div>
                                <div className="col-6 text-muted">Possession:</div><div className="col-6 fw-bold">{bd.possessionMonths} Months</div>
                            </div>
                        </div>
                    </div>

                    {/* Financial Card */}
                    <div className="col-6 mb-3">
                        <div className="p-3 border rounded h-100">
                            <h6 className="fw-bold text-success mb-3">Financial Overview</h6>
                            <div className="row g-2 small">
                                <div className="col-6 text-muted">Total Cost:</div><div className="col-6 fw-bold">{formatCurrency(bd.totalCost)}</div>
                                <div className="col-6 text-muted">Total Investment:</div><div className="col-6 fw-bold">{formatCurrency(bd.totalCashInvested)}</div>
                                <div className="col-6 text-muted">Net Profit:</div><div className={`col-6 fw-bold ${bd.netGainLoss >= 0 ? 'text-success' : 'text-danger'}`}>{formatLakhs(bd.netGainLoss)}</div>
                                <div className="col-6 text-muted">ROI:</div><div className="col-6 fw-bold">{formatPercent(bd.roi)}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. TIMELINE & BREAKDOWN */}
                <div className="mb-5">
                    <h5 className="fw-bold border-bottom pb-2 mb-4">2. Timeline & Cash Flow Breakdown</h5>

                    {/* Timeline 1: Pre-Possession */}
                    <div className="mb-4">
                        <div className="d-flex justify-content-between align-items-center mb-2 bg-light p-2 rounded border">
                            <strong>Timeline 1: Pre-Possession (0 - {bd.possessionMonths} Months)</strong>
                            <span className="badge bg-white text-dark border">Total Paid: {formatCurrency(bd.prePossessionTotal)}</span>
                        </div>
                        <table className="table table-sm table-bordered text-center small mb-0">
                            <thead>
                                <tr>
                                    <th>Component</th>
                                    <th>Monthly Amount</th>
                                    <th>Duration</th>
                                    <th>Total Impact</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="text-start">Personal Loan 1 EMI</td>
                                    <td>{formatCurrency(bd.personalLoan1EMI)}</td>
                                    <td>{bd.prePossessionMonths} Mo</td>
                                    <td>{formatCurrency(bd.personalLoan1EMI * bd.prePossessionMonths)}</td>
                                </tr>
                                {bd.hasIDC && (
                                    <tr>
                                        <td className="text-start">Avg. IDC (Interest)</td>
                                        <td>{formatCurrency(bd.monthlyIDCEMI)}</td>
                                        <td>{bd.constructionMonths} Mo</td>
                                        <td>{formatCurrency(bd.totalIDC)}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Timeline 2: Post-Possession */}
                    <div className="mb-2">
                        <div className="d-flex justify-content-between align-items-center mb-2 bg-light p-2 rounded border">
                            <strong>Timeline 2: Post-Possession ({bd.postPossessionMonths} Months)</strong>
                            <span className="badge bg-white text-dark border">Total Paid: {formatCurrency(bd.postPossessionTotal)}</span>
                        </div>
                        <table className="table table-sm table-bordered text-center small">
                            <thead>
                                <tr>
                                    <th>Loan Type</th>
                                    <th>Monthly EMI</th>
                                    <th>Start Month</th>
                                    <th>Total Paid</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="text-start fw-bold">Home Loan</td>
                                    <td>{formatCurrency(bd.homeLoanEMI)}</td>
                                    <td>Month {bd.homeLoanStartMonth}</td>
                                    <td>{formatCurrency(bd.homeLoanEMIPaid)}</td>
                                </tr>
                                {bd.hasPersonalLoan1 && (
                                    <tr>
                                        <td className="text-start">Personal Loan 1</td>
                                        <td>{formatCurrency(bd.personalLoan1EMI)}</td>
                                        <td>Month {bd.pl1StartMonth}</td>
                                        <td>{formatCurrency(bd.personalLoan1EMIPaid)}</td>
                                    </tr>
                                )}
                                {bd.hasPersonalLoan2 && (
                                    <tr>
                                        <td className="text-start">Personal Loan 2</td>
                                        <td>{formatCurrency(bd.personalLoan2EMI)}</td>
                                        <td>Month {bd.pl2StartMonth}</td>
                                        <td>{formatCurrency(bd.personalLoan2EMIPaid)}</td>
                                    </tr>
                                )}
                                <tr className="table-active">
                                    <td className="text-start fw-bold">COMBINED TOTAL</td>
                                    <td className="fw-bold">{formatCurrency(bd.postPossessionEMI)}</td>
                                    <td>-</td>
                                    <td className="fw-bold">{formatCurrency(bd.postPossessionTotal)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="mb-5 break-inside-avoid">
                    <h5 className="fw-bold border-bottom pb-2 mb-3">3. Comprehensive Financial Metrics</h5>

                    {/* Row 1: Loan & Payment Summary */}
                    <div className="row g-3 mb-3">
                        <div className="col-4">
                            <div className="p-2 border rounded bg-light text-center h-100">
                                <div className="text-muted small">Combined Monthly EMI</div>
                                <div className="fw-bold fs-5">{formatCurrency(bd.homeLoanEMI + bd.personalLoan1EMI + bd.personalLoan2EMI)}</div>
                                <div className="small text-muted">Peak Commitment</div>
                            </div>
                        </div>
                        <div className="col-4">
                            <div className="p-2 border rounded bg-light text-center h-100">
                                <div className="text-muted small">Total EMI Paid</div>
                                <div className="fw-bold fs-5">{formatCurrency(bd.totalEMIPaid)}</div>
                                <div className="small text-muted">Over {bd.years} Years</div>
                            </div>
                        </div>
                        <div className="col-4">
                            <div className="p-2 border rounded bg-light text-center h-100">
                                <div className="text-muted small">Total Outstanding</div>
                                <div className="fw-bold fs-5 text-danger">{formatCurrency(bd.totalLoanOutstanding)}</div>
                                <div className="small text-muted">To Clear at Exit</div>
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Interest, Cash, Net Position */}
                    <div className="row g-3">
                        <div className="col-4">
                            <div className="p-3 border rounded bg-warning bg-opacity-10 h-100 text-center">
                                <div className="d-flex justify-content-center align-items-center gap-2 mb-1">
                                    <span className="small fw-bold">Total Interest</span>
                                    {bd.hasIDC && <span className="badge bg-warning text-dark border" style={{ fontSize: '0.6rem' }}>Inc. IDC</span>}
                                </div>
                                <div className="fw-bold fs-4 text-dark">{formatLakhs(bd.totalInterestPaid)}</div>
                                <div className="small text-muted">Cost of Borrowing</div>
                            </div>
                        </div>
                        <div className="col-4">
                            <div className="p-3 border rounded bg-success bg-opacity-10 h-100 text-center">
                                <div className="small fw-bold mb-1">Leftover Cash</div>
                                <div className="fw-bold fs-4 text-success">{formatLakhs(bd.leftoverCash)}</div>
                                <div className="small text-muted">Cash in Hand after Sale</div>
                            </div>
                        </div>
                        <div className="col-4">
                            <div className={`p-3 border rounded h-100 text-center ${bd.netGainLoss >= 0 ? 'bg-primary bg-opacity-10' : 'bg-danger bg-opacity-10'}`}>
                                <div className="small fw-bold mb-1">Net Position</div>
                                <div className={`fw-bold fs-4 ${bd.netGainLoss >= 0 ? 'text-primary' : 'text-danger'}`}>
                                    {formatLakhs(bd.netGainLoss)}
                                </div>
                                <div className="small text-muted">Actual Profit/Loss</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. IDC BREAKDOWN (Conditional) */}
                {bd.hasIDC && (
                    <div className="mb-5 break-inside-avoid">
                        <h5 className="fw-bold border-bottom pb-2 mb-3">3. IDC (Interest During Construction) Analysis</h5>
                        <div className="row g-3">
                            <div className="col-8">
                                <table className="table table-sm table-striped small border">
                                    <thead className="table-secondary">
                                        <tr>
                                            <th>Slab #</th>
                                            <th>Month</th>
                                            <th>Disbursement Amount</th>
                                            <th className="text-end">Interest Cost</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bd.idcSchedule.map((slab, i) => (
                                            <tr key={i}>
                                                <td>{slab.slabNo}</td>
                                                <td>Month {slab.releaseMonth}</td>
                                                <td>{formatCurrency(slab.amount)}</td>
                                                <td className="text-end text-danger">{formatCurrency(slab.interestCost)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="col-4">
                                <div className="card bg-warning bg-opacity-10 border-warning">
                                    <div className="card-body">
                                        <h6 className="fw-bold text-dark">IDC Summary</h6>
                                        <hr />
                                        <div className="d-flex justify-content-between mb-2">
                                            <span>Min EMI:</span><strong>{formatCurrency(bd.minIDCEMI)}</strong>
                                        </div>
                                        <div className="d-flex justify-content-between mb-2">
                                            <span>Max EMI:</span><strong>{formatCurrency(bd.maxIDCEMI)}</strong>
                                        </div>
                                        <div className="d-flex justify-content-between border-top pt-2">
                                            <span>Total IDC:</span><strong className="text-danger">{formatLakhs(bd.totalIDC)}</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 5. STRATEGY COMPARISON (CLP vs Smart Saver) */}
                {strategyData && (
                    <div className="mb-5 break-inside-avoid">
                        <h5 className="fw-bold border-bottom pb-2 mb-3">4. Smart Saver Strategy Comparison</h5>
                        <table className="table table-bordered text-center">
                            <thead className="bg-light">
                                <tr>
                                    <th>Metric</th>
                                    <th>Standard CLP Plan</th>
                                    <th className="bg-primary text-white">Smart Saver (Rec.)</th>
                                    <th>Benefit</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="text-start">Total Paid till Possession</td>
                                    <td>{formatCurrency(strategyData.stdTotal)}</td>
                                    <td>{formatCurrency(strategyData.manTotal)}</td>
                                    <td className="text-danger">Pay Extra: {formatCurrency(strategyData.manTotal - strategyData.stdTotal)}</td>
                                </tr>
                                <tr>
                                    <td className="text-start fw-bold">Loan Balance at Possession</td>
                                    <td className="text-danger fw-bold">{formatLakhs(strategyData.stdBal)}</td>
                                    <td className="text-success fw-bold">{formatLakhs(strategyData.manBal)}</td>
                                    <td className="fw-bold text-success">Saved: {formatLakhs(strategyData.savings)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}

                {/* 6. EXIT SCENARIOS */}
                {calculatedData.multipleScenarios?.length > 0 && (
                    <div className="mb-5 break-inside-avoid">
                        <h5 className="fw-bold border-bottom pb-2 mb-3">5. Exit Price Scenarios</h5>
                        <table className="table table-sm table-hover table-bordered text-center">
                            <thead className="table-dark">
                                <tr>
                                    <th>Scenario</th>
                                    <th>Exit Price</th>
                                    <th>Sale Value</th>
                                    <th>Profit/Loss</th>
                                    <th>ROI</th>
                                </tr>
                            </thead>
                            <tbody>
                                {calculatedData.multipleScenarios.map((sc, idx) => (
                                    <tr key={idx} className={sc.isSelected ? "fw-bold bg-light" : ""}>
                                        <td>Scenario {idx + 1} {sc.isSelected && "(Selected)"}</td>
                                        <td>₹{sc.exitPrice}</td>
                                        <td>{formatLakhs(sc.saleValue)}</td>
                                        <td className={sc.netProfit >= 0 ? "text-success" : "text-danger"}>
                                            {formatLakhs(sc.netProfit)}
                                        </td>
                                        <td>{formatPercent(sc.roi)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* FOOTER */}
                <div className="mt-auto border-top pt-3 text-center text-muted small">
                    <p>
                        <strong>Disclaimer:</strong> This report is for estimation purposes only.
                        Actual values may vary based on bank rates, taxes, and market conditions.
                        Generated by <strong>Agenthum AI Solutions</strong>.
                    </p>
                </div>
            </div>
        );
    };
    // --- SCROLL HANDLER ---
    const scrollToTabs = () => {
        if (navRef.current) {
            // Scroll smoothly to the navigation bar
            navRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };
    const renderSavedPropertiesDrawer = () => {
        if (!showSavedDrawer) return null;

        return (
            <>
                <div
                    className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50"
                    style={{ zIndex: 1045 }}
                    onClick={() => setShowSavedDrawer(false)}
                ></div>

                <div
                    className="position-fixed top-0 end-0 h-100 bg-white shadow-lg d-flex flex-column"
                    style={{ zIndex: 1050, width: '400px', maxWidth: '85vw' }}
                >
                    {/* === HEADER === */}
                    <div className="p-4 border-bottom bg-light">
                        <div className="d-flex justify-content-between align-items-center mb-0">
                            <div>
                                <h5 className="mb-1 fw-bold">
                                    <i className="bi bi-buildings me-2"></i>
                                    Saved Properties
                                </h5>
                                {user && (
                                    <small className="text-success d-flex align-items-center" style={{ fontSize: '0.75rem' }}>
                                        <i className="bi bi-cloud-check-fill me-1"></i>
                                        Synced as {user.displayName || user.email?.split('@')[0]}
                                    </small>
                                )}
                            </div>
                            <button className="btn-close" onClick={() => setShowSavedDrawer(false)}></button>
                        </div>

                        {!user && (
                            <div className="mt-3 text-center p-3 bg-white rounded border border-warning">
                                <p className="small mb-2 text-muted">Sign in to view your saved properties</p>
                                <button onClick={loginWithGoogle} className="btn btn-primary w-100 btn-sm shadow-sm">
                                    <i className="bi bi-google me-2"></i> Sign In with Google
                                </button>
                            </div>
                        )}
                    </div>

                    {/* === LIST BODY === */}
                    <div className="flex-grow-1 overflow-auto p-3" style={{ background: '#f8f9fa' }}>
                        {isLoadingData ? (
                            <div className="text-center mt-5">
                                <div className="spinner-border text-primary" role="status"></div>
                                <p className="small text-muted mt-2">Syncing...</p>
                            </div>
                        ) : !user ? (
                            <div className="text-center text-muted mt-5 opacity-50">
                                <i className="bi bi-lock-fill fs-1"></i>
                                <p className="mt-2 small">Your portfolio is safe in the cloud.<br />Sign in to access it.</p>
                            </div>
                        ) : savedScenarios.length === 0 ? (
                            <div className="text-center text-muted mt-5 opacity-50">
                                <i className="bi bi-inbox fs-1"></i>
                                <p className="mt-2">No saved properties yet.<br />Analyze a property and click "Save".</p>
                            </div>
                        ) : (
                            <div className="d-flex flex-column gap-3">
                                {savedScenarios.map((item) => {
                                    // 1. EXTRACT PROPERTY DATA TO GET SIZE
                                    const savedProp = item.data?.properties?.find(p => p.id === item.selections.selectedPropertyId)
                                        || item.data?.properties?.[0]
                                        || {};

                                    // 2. DO THE MATH (Rate * Size)
                                    const size = parseFloat(savedProp.size) || 0;
                                    const exitRate = parseFloat(item.selections.selectedExitPrice) || 0;
                                    const totalSellValue = size > 0 ? (exitRate * size) : exitRate;
                                    // (Fallback: if size is 0/undefined, just show the rate)

                                    return (
                                        <div key={item.id} className="card border-0 shadow-sm hover-shadow transition-all">
                                            <div className="card-body">

                                                {/* Header */}
                                                <div className="d-flex justify-content-between align-items-start mb-1">
                                                    <div>
                                                        <h6 className="fw-bold mb-0 text-primary text-truncate" style={{ maxWidth: '200px' }} title={item.name}>{item.name}</h6>
                                                        <small className="text-muted d-block text-truncate" style={{ maxWidth: '220px', fontSize: '0.75rem' }}>
                                                            <i className="bi bi-geo-alt me-1"></i>{item.location}
                                                            {size > 0 && <span className="ms-1 border-start ps-1">{size} sq.ft</span>}
                                                        </small>
                                                    </div>
                                                    <small className="text-muted text-nowrap" style={{ fontSize: '0.65rem' }}>
                                                        {new Date(item.timestamp).toLocaleDateString()}
                                                    </small>
                                                </div>

                                                {/* Price Context Row */}
                                                <div className="d-flex align-items-center justify-content-between bg-light rounded px-2 py-1 mb-2 mt-2 border border-light" style={{ fontSize: '0.7rem' }}>
                                                    <div className="text-muted d-flex align-items-center">
                                                        <span className="opacity-50 me-1">Buy:</span>
                                                        <span className="fw-bold text-dark">{formatLakhs(item.metrics.totalCost)}</span>
                                                    </div>
                                                    <div className="text-muted d-flex align-items-center">
                                                        <span className="opacity-25 mx-1">|</span>
                                                    </div>
                                                    <div className="text-muted d-flex align-items-center">
                                                        <span className="opacity-50 me-1">Sell:</span>
                                                        {/* ✅ DISPLAY CALCULATED TOTAL */}
                                                        <span className="fw-bold text-dark">{formatLakhs(totalSellValue)}</span>
                                                    </div>
                                                </div>

                                                {/* Metrics */}
                                                <div className="row g-2 mb-3">
                                                    <div className="col-6">
                                                        <div className="p-2 bg-white rounded border shadow-sm">
                                                            <small className="d-block text-muted" style={{ fontSize: '0.6rem' }}>ROI</small>
                                                            <span className="fw-bold text-success">{formatPercent(item.metrics.roi)}</span>
                                                        </div>
                                                    </div>
                                                    <div className="col-6">
                                                        <div className="p-2 bg-white rounded border shadow-sm">
                                                            <small className="d-block text-muted" style={{ fontSize: '0.6rem' }}>Net Profit</small>
                                                            <span className={`fw-bold ${item.metrics.netProfit >= 0 ? 'text-success' : 'text-danger'}`} style={{ fontSize: '0.8rem' }}>
                                                                {formatLakhs(item.metrics.netProfit)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="d-flex gap-2">
                                                    <button className="btn btn-sm btn-outline-primary flex-grow-1" onClick={() => handleLoadScenario(item)}>
                                                        Load
                                                    </button>
                                                    <button className="btn btn-sm btn-outline-danger px-3" onClick={() => handleDeleteScenario(item.id)}>
                                                        <i className="bi bi-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    };

    return (
        <div className="property-comparison">

            {/* Background Blobs */}
            <div className="position-fixed top-0 left-0 w-100 h-100" style={{ zIndex: 0 }}>
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

                    </div>
                </div>
            </div>
            {renderLoadingOverlay()}
            {renderSavedPropertiesDrawer()}
            {renderPreviewModal()}
            {renderPrintView()}
        </div>
    );
};

export default PropertyComparisonDesktop; 
