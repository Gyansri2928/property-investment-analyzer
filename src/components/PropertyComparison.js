import React, { useState, useMemo, useEffect } from 'react';
import './PropertyComparison.css';

// ===================== CONSTANTS =====================
// ... existing DEFAULT_PROPERTY constant ...

const DEFAULT_PROPERTY = {
  id: 1,
  size: 1428,
  exitPrice: 6000
};

// 1. CONSTANT: Initial State for Property Data
const INITIAL_PROPERTY_DATA = {
  purchasePrice: '',
  otherCharges: '',
  stampDuty: '',
  exitPrices: [6000],
  properties: [
    {
      id: DEFAULT_PROPERTY.id,
      size: DEFAULT_PROPERTY.size,
      name: '',
      location: '',
      rating: 0,
      isHighlighted: true,
      possessionMonths: ''
    }
  ],
  paymentPlan: 'clp',
  assumptions: {
    homeLoanRate: 8, homeLoanTerm: 20, homeLoanStartMonth: 25, homeLoanShare: '',
    personalLoan1Rate: 11, personalLoan1Term: 7, personalLoan1StartMonth: 0, personalLoan1Share: 10,
    personalLoan2Rate: 11, personalLoan2Term: 7, personalLoan2StartMonth: 30, personalLoan2Share: 10,
    downPaymentShare: 0,
    investmentPeriod: 3, clpDurationYears: 2.5, bankDisbursementStartMonth: 3, bankDisbursementInterval: 3,
    possessionMonths: 24
  }
};

// 2. CONSTANT: Initial State for User Selections
const INITIAL_USER_SELECTIONS = {
  selectedPropertyId: DEFAULT_PROPERTY.id,
  selectedExitPrice: DEFAULT_PROPERTY.exitPrice,
  selectedYears: 3,
  selectedPropertySize: DEFAULT_PROPERTY.size,
  scenarioSize: DEFAULT_PROPERTY.size,
  scenarioExitPrice: DEFAULT_PROPERTY.exitPrice,
  scenarioExitPrices: [6000, 7000, 8000]
};

// ===================== 1. PURE UTILITIES (Moved Outside for Speed) =====================

// Formatting Helpers

const formatLakhs = (value) => (!value && value !== 0) ? '₹0L' : `₹${(value / 100000).toFixed(2)}L`;
const formatCurrency = (value) => (!value && value !== 0) ? '₹0' : `₹${Math.round(value).toLocaleString()}`;
const formatPercent = (value) => (!value && value !== 0) ? '0%' : `${value.toFixed(1)}%`;

// Math Helpers (Standard Formulas)
const calculateEMI = (principal, annualRate, years) => {
  if (!principal || principal === 0) return 0;
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

const calculateMonthlyIDCEMI = (homeLoanAmount, annualRate, constructionMonths) => {
  if (!homeLoanAmount || homeLoanAmount === 0 || constructionMonths <= 0) return 0;
  const monthlyRate = annualRate / (12 * 100);
  return homeLoanAmount * monthlyRate;
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
const renderTimelineCard = (title, icon, color, mainEMI, period, duration, componentsJSX, totalAmount, calcText, extraHeader = null, extraFooter = null) => (
  <div className="col-md-6">
    <div className={`card h-100 border-${color}`}>
      <div className={`card-header bg-${color} text-white`}>
        <h6 className="mb-0"><i className={`bi ${icon} me-2`}></i>{title}</h6>
        {extraHeader}
      </div>
      <div className="card-body">
        <div className="text-center mb-3 ps-2 pe-2">
          <h3 className={`text-${color} fw-bold`}>{mainEMI}/month</h3>
          <small className="text-muted">Monthly EMI {title.includes("Pre") ? "during construction" : "after possession"}</small>
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

  const [activeTab, setActiveTab] = useState('inputs');
  // New State for Wizard Steps
  const [currentStep, setCurrentStep] = useState(1);
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
    if (window.confirm("Are you sure you want to reset all data to default values?")) {
      setPropertyData(INITIAL_PROPERTY_DATA);
      setUserSelections(INITIAL_USER_SELECTIONS);
      localStorage.removeItem('propertyCalc_data');
      localStorage.removeItem('propertyCalc_selections');
      alert("Data reset successfully.");
    }
  };
  const calculatedData = useMemo(() => {

    // 1. Internal Helper: Performs the core financial math
    const calculateFinancials = (propertySize, exitPrice, years) => {
      // 1. Get inputs including the new stampDuty
      const { purchasePrice, otherCharges, stampDuty, assumptions, paymentPlan } = propertyData;

      // 2. Calculate Costs
      const baseCost = propertySize * getSafeValue(purchasePrice);
      const extraCharges = getSafeValue(otherCharges); // Lumpsum
      const stampDutyCost = baseCost * (getSafeValue(stampDuty) / 100); // Percentage Calculation

      // 3. Sum it up
      const totalCost = baseCost + extraCharges + stampDutyCost;

      // ... inside calculateFinancials ...

      // Plan Logic
      let homeLoanShare, personalLoan1Share, personalLoan2Share, downPaymentShare;

      if (paymentPlan === 'clp') {
        homeLoanShare = 80; personalLoan1Share = 10; personalLoan2Share = 10; downPaymentShare = 0;
      } else if (paymentPlan === '20-80') {
        homeLoanShare = 80; personalLoan1Share = 20; personalLoan2Share = 0; downPaymentShare = 0;
      } else if (paymentPlan === '40-60') {
        homeLoanShare = 60; personalLoan1Share = 40; personalLoan2Share = 0; downPaymentShare = 0;
      } else {
        // --- CUSTOM PLAN (UPDATED) ---
        // Now we read Home Loan directly from state instead of calculating it
        personalLoan1Share = getSafeValue(assumptions.personalLoan1Share);
        personalLoan2Share = getSafeValue(assumptions.personalLoan2Share);
        downPaymentShare = getSafeValue(assumptions.downPaymentShare);

        // UNFREEZING HOME LOAN: Read it from user input, default to 0 if empty
        homeLoanShare = getSafeValue(assumptions.homeLoanShare);
      }

      const homeLoanAmount = totalCost * (homeLoanShare / 100);
      const personalLoan1Amount = totalCost * (personalLoan1Share / 100);
      const personalLoan2Amount = totalCost * (personalLoan2Share / 100);
      const downPaymentAmount = totalCost * (downPaymentShare / 100);
      const totalCashInvested = downPaymentAmount + personalLoan1Amount + personalLoan2Amount;

      // IDC Logic
      let totalIDC = 0;
      let monthlyIDCEMI = 0;
      if (paymentPlan === 'clp' && homeLoanAmount > 0) {
        const constructionEndMonth = assumptions.clpDurationYears * 12;
        const slabAmount = totalCost * 0.10;
        for (let i = 0; i < 8; i++) {
          const month = assumptions.bankDisbursementStartMonth + (i * assumptions.bankDisbursementInterval);
          if (month <= constructionEndMonth) {
            const monthsTillEnd = constructionEndMonth - month;
            if (monthsTillEnd > 0) totalIDC += slabAmount * (assumptions.homeLoanRate / 100) * (monthsTillEnd / 12);
          }
        }
        monthlyIDCEMI = calculateMonthlyIDCEMI(homeLoanAmount, assumptions.homeLoanRate, constructionEndMonth);
      }

      const totalHomeLoanAtCompletion = homeLoanAmount + totalIDC;

      // EMI & Outstanding Logic (Using external math helpers)
      const homeLoanEMI = homeLoanAmount > 0 ? calculateEMI(totalHomeLoanAtCompletion, assumptions.homeLoanRate, assumptions.homeLoanTerm) : 0;
      const personalLoan1EMI = personalLoan1Amount > 0 ? calculateEMI(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term) : 0;
      const personalLoan2EMI = personalLoan2Amount > 0 ? calculateEMI(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term) : 0;

      const totalHoldingMonths = years * 12;
      // FIX: Add the delay to the possession month (Possession + Delay)
      const homeLoanPaymentsMade = Math.max(0, totalHoldingMonths - (assumptions.possessionMonths + assumptions.homeLoanStartMonth));
      const pl1PaymentsMade = Math.max(0, totalHoldingMonths - assumptions.personalLoan1StartMonth);
      const pl2PaymentsMade = Math.max(0, totalHoldingMonths - assumptions.possessionMonths);

      const homeLoanOutstanding = homeLoanAmount > 0 ? calculateOutstandingAfterPayments(totalHomeLoanAtCompletion, assumptions.homeLoanRate, assumptions.homeLoanTerm, homeLoanPaymentsMade) : 0;
      const personalLoan1Outstanding = personalLoan1Amount > 0 ? calculateOutstandingAfterPayments(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term, pl1PaymentsMade) : 0;
      const personalLoan2Outstanding = personalLoan2Amount > 0 ? calculateOutstandingAfterPayments(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term, pl2PaymentsMade) : 0;

      const homeLoanInterestPaid = homeLoanAmount > 0 ? calculateTotalInterestPaid(totalHomeLoanAtCompletion, assumptions.homeLoanRate, assumptions.homeLoanTerm, homeLoanPaymentsMade) : 0;
      const personalLoan1InterestPaid = personalLoan1Amount > 0 ? calculateTotalInterestPaid(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term, pl1PaymentsMade) : 0;
      const personalLoan2InterestPaid = personalLoan2Amount > 0 ? calculateTotalInterestPaid(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term, pl2PaymentsMade) : 0;

      const totalLoanOutstanding = homeLoanOutstanding + personalLoan1Outstanding + personalLoan2Outstanding;
      const totalInterestPaid = homeLoanInterestPaid + personalLoan1InterestPaid + personalLoan2InterestPaid + totalIDC;
      const totalEMIPaid = (homeLoanEMI * homeLoanPaymentsMade) + (personalLoan1EMI * pl1PaymentsMade) + (personalLoan2EMI * pl2PaymentsMade);

      const saleValue = propertySize * exitPrice;
      const leftoverCash = saleValue - totalLoanOutstanding;
      // --- FIX STARTS HERE ---

      // 1. Calculate TRUE Profit:
      // (Cash In Hand) - (All EMIs Paid) - (Initial Cash Down Payment)
      // Note: We don't subtract Personal Loan amounts here because their repayment is already counted in 'totalEMIPaid'
      const trueNetProfit = leftoverCash - totalEMIPaid - downPaymentAmount;

      // 2. Calculate Total Cash Out of Pocket:
      // (Initial Cash Down Payment) + (All Monthly EMIs Paid)
      const totalActualInvestment = downPaymentAmount + totalEMIPaid;

      // 3. Calculate Correct ROI:
      const roi = totalActualInvestment > 0 ? (trueNetProfit / totalActualInvestment) * 100 : 0;

      // Update the return object to use 'trueNetProfit' instead of the old 'netGainLoss'
      const netGainLoss = trueNetProfit;

      // --- FIX ENDS HERE ---
      //const roi = totalCashInvested > 0 ? (netGainLoss / totalCashInvested) * 100 : 0;

      const prePossessionMonths = assumptions.possessionMonths;
      const postPossessionMonths = totalHoldingMonths - assumptions.possessionMonths;
      const prePossessionEMI = personalLoan1EMI + monthlyIDCEMI;
      const postPossessionEMI = homeLoanEMI + personalLoan1EMI + personalLoan2EMI;

      return {
        propertySize, totalCost, totalCashInvested, totalLoanOutstanding,
        homeLoanEMI, personalLoan1EMI, personalLoan2EMI,
        homeLoanAmount, personalLoan1Amount, personalLoan2Amount, downPaymentAmount,
        totalHomeLoanAtCompletion, homeLoanOutstanding, personalLoan1Outstanding, personalLoan2Outstanding,
        totalInterestPaid, totalIDC, monthlyIDCEMI, homeLoanInterestPaid, personalLoan1InterestPaid, personalLoan2InterestPaid,
        homeLoanEMIPaid: homeLoanEMI * homeLoanPaymentsMade,
        personalLoan1EMIPaid: personalLoan1EMI * pl1PaymentsMade,
        personalLoan2EMIPaid: personalLoan2EMI * pl2PaymentsMade,
        totalEMIPaid, homeLoanPaymentsMade, pl1PaymentsMade, pl2PaymentsMade,
        saleValue, leftoverCash, netGainLoss, roi, years, exitPrice,
        homeLoanShare, personalLoan1Share, personalLoan2Share, downPaymentShare,
        hasHomeLoan: homeLoanAmount > 0, hasPersonalLoan1: personalLoan1Amount > 0, hasPersonalLoan2: personalLoan2Amount > 0, hasDownPayment: downPaymentAmount > 0,
        // Inside the return object of calculateFinancials
        homeLoanStartMonth: assumptions.possessionMonths + assumptions.homeLoanStartMonth, // <--- UPDATE THIS TOO
        pl1StartMonth: assumptions.personalLoan1StartMonth, pl2StartMonth: assumptions.possessionMonths,
        homeLoanSelectedMonths: assumptions.homeLoanStartMonth, pl1SelectedMonths: assumptions.personalLoan1StartMonth, pl2SelectedMonths: assumptions.personalLoan2StartMonth,
        possessionMonths: assumptions.possessionMonths, totalHoldingMonths,
        prePossessionMonths, postPossessionMonths, prePossessionEMI, postPossessionEMI,
        prePossessionTotal: prePossessionEMI * prePossessionMonths, postPossessionTotal: postPossessionEMI * postPossessionMonths,
        prePossessionComponents: { pl1EMI: personalLoan1EMI, monthlyIDCEMI, total: prePossessionEMI },
        constructionMonths: paymentPlan === 'clp' ? assumptions.clpDurationYears * 12 : 0,
        hasIDC: totalIDC > 0
      };
    };

    // 2. Perform All Calculations
    const propertySize = userSelections.selectedPropertySize;
    const detailedBreakdown = calculateFinancials(propertySize, userSelections.selectedExitPrice, userSelections.selectedYears);
    const comparisonTargetPrice = userSelections.scenarioExitPrices?.[0] || 0;
    const scenarioBreakdown = calculateFinancials(propertySize, comparisonTargetPrice, userSelections.selectedYears);
    const profits = propertyData.exitPrices.map(price => {
      const breakdown = calculateFinancials(propertySize, price, userSelections.selectedYears);
      return {
        exitPrice: price, saleValue: breakdown.saleValue, netProfit: breakdown.netGainLoss,
        roi: breakdown.totalCashInvested > 0 ? (breakdown.netGainLoss / breakdown.totalCashInvested) * 100 : 0,
        appreciation: ((price - propertyData.purchasePrice) / propertyData.purchasePrice) * 100,
        cashInvested: breakdown.totalCashInvested, loanOutstanding: breakdown.totalLoanOutstanding
      };
    });

    const multipleScenarios = userSelections.scenarioExitPrices.map(price => {
      const breakdown = calculateFinancials(propertySize, price, userSelections.selectedYears);
      return {
        exitPrice: price, saleValue: breakdown.saleValue, netProfit: breakdown.netGainLoss,
        roi: breakdown.totalCashInvested > 0 ? (breakdown.netGainLoss / breakdown.totalCashInvested) * 100 : 0,
        appreciation: ((price - propertyData.purchasePrice) / propertyData.purchasePrice) * 100,
        cashInvested: breakdown.totalCashInvested, loanOutstanding: breakdown.totalLoanOutstanding,
        leftoverCash: breakdown.leftoverCash, totalEMIPaid: breakdown.totalEMIPaid
      };
    });

    // 3. Stage Wise Data Preparation
    const stageCalculations = {
      stage1: {
        title: "Stage 1: Basic Property Cost",
        items: [
          { label: "Property Size", value: `${propertySize} sq.ft` },
          { label: "Purchase Price", value: `₹${propertyData.purchasePrice}/sq.ft` },
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
          { label: "Total Cash Invested", value: formatCurrency(detailedBreakdown.totalCashInvested) }
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
          { label: "Duration", value: `${userSelections.selectedYears} years (${detailedBreakdown.totalHoldingMonths} months)` },
          { label: "Possession", value: `After ${propertyData.assumptions.possessionMonths} months` },
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
        [field]: parseFloat(value)
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
    const newPrice = Math.max(...userSelections.scenarioExitPrices) + 1000;
    setUserSelections(prev => ({
      ...prev,
      scenarioExitPrices: [...prev.scenarioExitPrices, newPrice]
    }));
  };

  const handleRemoveExitPriceScenario = (index) => {
    if (userSelections.scenarioExitPrices.length <= 1) return;

    setUserSelections(prev => ({
      ...prev,
      scenarioExitPrices: prev.scenarioExitPrices.filter((_, i) => i !== index)
    }));
  };

  const handleUpdateExitPriceScenario = (index, value) => {
    const newPrices = [...userSelections.scenarioExitPrices];
    newPrices[index] = parseFloat(value) || 0;
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
    name: "e.g. Supernova Tower A",
    location: "e.g. Sector 94, Noida",
    size: "e.g. 1250",
    possessionMonths: "e.g. 24",
    purchasePrice: "e.g. 6500",
    investmentPeriod: "e.g. 3"
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

      if (plan === 'clp') {
        // Standard CLP: 80% HL, 10% Booking (PL1), 10% Possession (PL2)
        newAssumptions.personalLoan1Share = 10;
        newAssumptions.personalLoan2Share = 10;
        newAssumptions.downPaymentShare = 0;
        newAssumptions.homeLoanShare = 80;
        if (newAssumptions.possessionMonths === 0) {
          newAssumptions.possessionMonths = 24;
          newAssumptions.homeLoanStartMonth = 25;
        }
      }
      else if (plan === '80-20') {
        // 80% Home Loan, 20% Self Funding (PL1)
        newAssumptions.personalLoan1Share = 20;
        newAssumptions.personalLoan2Share = 0;
        newAssumptions.downPaymentShare = 0;
        newAssumptions.homeLoanShare = 80;
      }
      else if (plan === '25-75') {
        // 75% Home Loan, 25% Self Funding (PL1)
        newAssumptions.personalLoan1Share = 25;
        newAssumptions.personalLoan2Share = 0;
        newAssumptions.downPaymentShare = 0;
        newAssumptions.homeLoanShare = 75;
      }
      else if (plan === 'rtm') {
        // Ready to Move: Immediate Possession, Standard 80-20 Split
        newAssumptions.personalLoan1Share = 20;
        newAssumptions.personalLoan2Share = 0;
        newAssumptions.downPaymentShare = 0;
        newAssumptions.homeLoanShare = 80;
        // Crucial: RTM means possession is NOW
        newAssumptions.possessionMonths = 0;
        newAssumptions.homeLoanStartMonth = 0;
      }
      else if (plan === 'custom') {
        if (!newAssumptions.downPaymentShare) newAssumptions.downPaymentShare = 0;
      }

      return {
        ...prev,
        paymentPlan: plan,
        assumptions: newAssumptions
      };
    });
  };

  // ===================== RENDER FUNCTIONS =====================

  const renderInputsTab = () => {
    // 1. USE getSafeValue HERE to prevent NaN errors
    const userDefinedTotal = getSafeValue(propertyData.assumptions.downPaymentShare) +
      getSafeValue(propertyData.assumptions.personalLoan1Share) +
      getSafeValue(propertyData.assumptions.personalLoan2Share);

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

    const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, steps.length));
    const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    // --- STEPPER HEADER COMPONENT ---
    const renderStepper = () => (
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

            return (
              <div key={step.id} className="text-center" style={{ width: '100px' }}>
                <div
                  className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-2 shadow-sm ${isActive ? 'bg-primary text-white scale-110' :
                    isCompleted ? 'bg-success text-white' : 'bg-white text-muted border'
                    }`}
                  style={{
                    width: '${((currentStep - 1) / (steps.length - 1)) * 100}%',
                    height: '40px',
                    transition: 'all 0.3s ease',
                    boxShadow: isActive ? '0 0 0 4px rgba(13, 110, 253, 0.2)' : 'none'
                  }}
                  onClick={() => setCurrentStep(step.id)}
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

    // --- NAVIGATION FOOTER ---
    const renderNavButtons = () => (
      <div className="d-flex justify-content-between mt-5 pt-3 border-top">
        {/* PREVIOUS BUTTON */}
        {/* Disabled if on Step 1 */}
        <button
          className="btn btn-outline-secondary rounded-pill px-4"
          onClick={prevStep}
          disabled={currentStep === 1}
        >
          <i className="bi bi-arrow-left me-2"></i> Previous
        </button>

        {/* NEXT / ANALYZE BUTTON */}
        {/* If not last step, show "Next". If last step, show "Analyze". */}
        {currentStep < steps.length ? (
          <button className="btn btn-primary rounded-pill px-4" onClick={nextStep}>
            Next Step <i className="bi bi-arrow-right ms-2"></i>
          </button>
        ) : (
          <button className="btn btn-primary rounded-pill px-5 shadow-lg" onClick={handleAnalyzeClick}>
            Analyze Property <i className="bi bi-graph-up ms-2"></i>
          </button>
        )}
      </div>
    );

    return (
      <div className="mb-5 ">
        <div className="glass-card mb-4 ps-4 mt-4 pt-4">
          <div>
            <h2 className="fw-bold mb-2 gradient-text ps-4 pt-2">
              <i className="bi bi-input-cursor me-3"></i>
              Input Parameters
            </h2>
            <p className="text-muted mb-0 ps-4">
              Define your property details, payment plans, and loan assumptions
            </p>
          </div>
          {/* Stepper Header */}
          <div className="px-lg-5 mt-5">
            {renderStepper()}
          </div>
          <div className="card-body pt-4 pe-4">

            {/* Property Management */}
            {currentStep === 1 && (
              <div className="animate-fade-in">
                {/* 1. Property Management Section */}
                <div className="mb-4 ps-4">
                  <h5 className="fw-bold mb-4 pb-2 border-bottom border-secondary border-opacity-25">
                    <i className="bi bi-building me-2"></i>Property Management
                  </h5>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="mb-0">Properties ({propertyData.properties.length})</h6>
                    <button className="btn btn-success btn-sm" onClick={handleAddProperty}>
                      <i className="bi bi-plus-circle me-1"></i> Add Property
                    </button>
                  </div>
                  <div className="row g-3">
                    {propertyData.properties.map((property, index) => (
                      <div key={property.id} className="col-md-6 col-lg-4">
                        <div className="card h-100 shadow-sm border-0">
                          <div className="card-header bg-white d-flex justify-content-between align-items-center py-3">
                            <span className="badge bg-primary px-3 py-2">Property #{property.id}</span>
                            {propertyData.properties.length > 1 && (
                              <button className="btn btn-outline-danger btn-sm rounded-circle" onClick={() => handleRemoveProperty(property.id)} style={{ width: '32px', height: '32px', padding: 0 }}>
                                <i className="bi bi-trash"></i>
                              </button>
                            )}
                          </div>
                          <div className="card-body p-4">
                            {renderPropertyInput(index, property, "Property Name", "name", "text")}
                            {renderPropertyInput(index, property, "Location", "location", "text")}
                            <div className="row">
                              <div className="col-md-6">{renderPropertyInput(index, property, "Size (sq.ft)", "size", "number")}</div>
                              <div className="col-md-6">{renderPropertyInput(index, property, "Possession (Months)", "possessionMonths", "number", "Months until possession")}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Common Property Information Section */}
                <div className="mb-4 ps-4 pe-4">
                  <h5 className="fw-bold mb-4 pb-2 border-bottom border-secondary border-opacity-25">
                    <i className="bi bi-info-circle me-2"></i>Common Property Information
                  </h5>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Purchase Price (₹/sq.ft)</label>
                      <input type="number" className="form-control" value={propertyData.purchasePrice} placeholder="e.g. 5000" onChange={(e) => handleInputChange('purchasePrice', parseFloat(e.target.value))} />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Other Charges (Lumpsum)</label>
                      <input type="number" className="form-control" value={propertyData.otherCharges} placeholder="e.g. 500000" onChange={(e) => handleInputChange('otherCharges', parseFloat(e.target.value))} />
                      <small className="text-muted" style={{ fontSize: '0.75rem' }}>GST, Parking, Club Membership, etc.</small>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Stamp Duty (%)</label>
                      <div className="input-group">
                        <input type="number" className="form-control" value={propertyData.stampDuty} placeholder="e.g. 5" min="0" max="100" onChange={(e) => handleInputChange('stampDuty', parseFloat(e.target.value))} />
                        <span className="input-group-text">%</span>
                      </div>
                      <small className="text-muted" style={{ fontSize: '0.75rem' }}>Govt. registration charges (usually 5-8%)</small>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Select Property for Analysis</label>
                      <select className="form-select" value={userSelections.selectedPropertyId} onChange={(e) => {
                        const propId = parseInt(e.target.value);
                        handleSelectionUpdate('selectedPropertyId', propId);
                        const selectedProp = propertyData.properties.find(p => p.id === propId);
                        if (selectedProp) handleSelectionUpdate('selectedPropertySize', selectedProp.size);
                      }}>
                        {propertyData.properties.map(property => (
                          <option key={property.id} value={property.id}>{property.name} ({property.size} sq.ft)</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="text-center mt-4 pt-2">
                  <button
                    className="btn btn-sm btn-outline-danger border-10 opacity-15"
                    onClick={handleResetData}
                  >
                    <i className="bi bi-arrow-counterclockwise me-2"></i>Reset All Inputs
                  </button>
                  <div className="text-muted extra-small mt-1" style={{ fontSize: '0.7rem' }}>
                    Restores default values
                  </div>
                </div>
              </div>
            )}

            {/* === STEP 2: PAYMENT PLAN === */}
            {currentStep === 2 && (
              <div className="animate-fade-in ps-4">
                <h5 className="fw-bold mb-4 pb-2 border-bottom border-secondary border-opacity-25">
                  <i className="bi bi-credit-card me-2"></i>Payment Plan
                </h5>

                <div className="mb-4 ps-4 pe-4">
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
                    <div className="col-md-6">
                      <label className="form-label">Holding Period (Years)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={propertyData.assumptions.investmentPeriod}
                        onChange={(e) => handleAssumptionChange('investmentPeriod', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Custom Payment Plan Options */}
                  {propertyData.paymentPlan === 'custom' && (
                    <div className="mt-4 p-3 bg-light rounded">
                      <h6 className="fw-bold mb-3">
                        <i className="bi bi-sliders me-2"></i>
                        Custom Payment Plan Configuration
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
                            onChange={(e) => handleAssumptionChange('personalLoan2Share', e.target.value)}
                          />
                        </div>
                      </div>

                      {isError && (
                        <div className="mt-3 alert alert-danger">
                          <small>
                            <i className="bi bi-exclamation-triangle-fill me-2"></i>
                            <strong>Error:</strong> Your inputs total {userDefinedTotal}%. They cannot exceed 100%.
                          </small>
                        </div>
                      )}

                      {!isError && (
                        <div className="mt-3 alert alert-info">
                          <div className="d-flex justify-content-between">
                            <small><i className="bi bi-check-circle me-2"></i>Total Allocation</small>
                            <small className="fw-bold">{currentTotal}%</small>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* === STEP 3: LOAN CONFIGURATION === */}
            {currentStep === 3 && (
              <div className="animate-fade-in">

                {/* Estimated Possession Timeline */}
                <div className="mb-4 ps-4 pe-4">
                  <h5 className="fw-bold mb-3 pb-2 border-bottom border-secondary border-opacity-25">
                    <i className="bi bi-calendar-date me-2"></i>
                    Estimated Possession Timeline
                  </h5>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Estimated Possession After (Months)</label>
                      <div className="input-group">
                        <input
                          type="number"
                          className="form-control"
                          value={propertyData.assumptions.possessionMonths}
                          onChange={(e) => handleAssumptionChange('possessionMonths', e.target.value)}
                        />
                        <span className="input-group-text">months</span>
                      </div>
                      <small className="text-muted">Time until you get possession of the property</small>
                    </div>
                    <div className="col-md-6">
                      <div className="p-3 bg-light rounded">
                        <small className="text-muted">Impact on Loans</small>
                        <div className="fw-bold">
                          Home Loan EMI: Starts after {propertyData.assumptions.possessionMonths} months
                        </div>
                        <small className="text-muted">PL1: Independent • PL2: Starts from possession</small>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Home Loan Information */}
                <div className="mb-4 ps-4 pe-4">
                  <h5 className="fw-bold mb-3 pb-2 border-bottom border-secondary border-opacity-25">
                    <i className="bi bi-bank me-2"></i>
                    Home Loan Details
                  </h5>
                  <div className="row g-3">
                    <div className="col-md-3">
                      <label className="form-label small">Home Loan Rate</label>
                      <div className="input-group input-group-sm">
                        <input
                          type="number"
                          step="0.1"
                          className="form-control"
                          value={propertyData.assumptions.homeLoanRate}
                          onChange={(e) => handleAssumptionChange('homeLoanRate', e.target.value)}
                        />
                        <span className="input-group-text bg-white text-muted">%</span>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">
                        Start After Possession (Current: {propertyData.assumptions.homeLoanStartMonth} months)
                        <br />
                        <small className="text-muted">Selected: {propertyData.assumptions.homeLoanStartMonth} months</small>
                      </label>
                      <input
                        type="range"
                        className="form-range"
                        min="0"
                        max="240"
                        value={propertyData.assumptions.homeLoanStartMonth}
                        onChange={(e) => handleAssumptionChange('homeLoanStartMonth', e.target.value)}
                      />
                      <div className="d-flex justify-content-between">
                        <small>Month 0</small>
                        <small>240 months</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Loan Term (Years)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={propertyData.assumptions.homeLoanTerm}
                        onChange={(e) => handleAssumptionChange('homeLoanTerm', e.target.value)}
                      />
                    </div>
                    <div className="col-md-3">
                      <div className="p-3 bg-light rounded h-100">
                        <small className="text-muted">Actual EMI Start</small>
                        <div className="fw-bold">
                          Month {parseInt(propertyData.assumptions.possessionMonths || 0) + parseInt(propertyData.assumptions.homeLoanStartMonth || 0) + 1}
                        </div>
                        <small className="text-muted">After possession delay</small>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Personal Loan 1 Information */}
                <div className="mb-4 ps-4 pe-4">
                  <h5 className="fw-bold mb-3 pb-2 border-bottom border-secondary border-opacity-25">
                    <i className="bi bi-cash-coin me-2"></i>
                    Personal Loan 1 Details
                  </h5>
                  <div className="row g-3">
                    <div className="col-md-3">
                      <label className="form-label">Share of Total Cost (%)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={propertyData.assumptions.personalLoan1Share}
                        onChange={(e) => handleAssumptionChange('personalLoan1Share', e.target.value)}
                        disabled={propertyData.paymentPlan !== 'custom'}
                      />
                      {propertyData.paymentPlan !== 'custom' && (
                        <small className="text-muted">Set by payment plan</small>
                      )}
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Amount</label>
                      <div className="form-control bg-light">
                        {formatCurrency(propertyData.properties[0]?.size * propertyData.purchasePrice * (propertyData.assumptions.personalLoan1Share / 100))}
                      </div>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Personal Loan Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-control"
                        value={propertyData.assumptions.personalLoan1Rate}
                        onChange={(e) => handleAssumptionChange('personalLoan1Rate', e.target.value)}
                      />
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">
                        Start Month (Current: {propertyData.assumptions.personalLoan1StartMonth})
                        <br />
                        <small className="text-muted">Independent of possession</small>
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
                        <small>Month 0</small>
                        <small>84 months</small>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Personal Loan 2 Information */}
                <div className="mb-4 ps-4 pe-4">
                  <h5 className="fw-bold mb-3 pb-2 border-bottom border-secondary border-opacity-25">
                    <i className="bi bi-cash-coin me-2"></i>
                    Personal Loan 2 Details
                  </h5>
                  <div className="row g-3">
                    <div className="col-md-3">
                      <label className="form-label">Share of Total Cost (%)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={propertyData.assumptions.personalLoan2Share}
                        onChange={(e) => handleAssumptionChange('personalLoan2Share', e.target.value)}
                        disabled={propertyData.paymentPlan !== 'custom'}
                      />
                      {propertyData.paymentPlan !== 'custom' && (
                        <small className="text-muted">Set by payment plan</small>
                      )}
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Amount</label>
                      <div className="form-control bg-light">
                        {formatCurrency(propertyData.properties[0]?.size * propertyData.purchasePrice * (propertyData.assumptions.personalLoan2Share / 100))}
                      </div>
                    </div>
                    <div className="col-md-3">
                      <label className="form-label">Personal Loan Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        className="form-control"
                        value={propertyData.assumptions.personalLoan2Rate}
                        onChange={(e) => handleAssumptionChange('personalLoan2Rate', e.target.value)}
                        disabled={propertyData.assumptions.personalLoan2Share === 0}
                      />
                      {propertyData.assumptions.personalLoan2Share === 0 && (
                        <small className="text-muted">Not applicable (0% share)</small>
                      )}
                    </div>
                    <div className="col-md-3">
                      <div className="p-3 bg-light rounded h-100">
                        <small className="text-muted">PL2 Start Month</small>
                        <div className="fw-bold">
                          Month {parseInt(propertyData.assumptions.possessionMonths || 0) + 1}
                        </div>
                        <small className="text-muted">Starts from possession date</small>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CLP Specific Details */}
                {propertyData.paymentPlan === 'clp' && (
                  <div className="mb-4 ps-4 pe-4">
                    <h5 className="fw-bold mb-3 pb-2 border-bottom border-secondary border-opacity-25">
                      <i className="bi bi-building me-2"></i>
                      CLP Construction Details
                    </h5>
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label">Construction Duration (Years)</label>
                        <input
                          type="number"
                          step="0.5"
                          className="form-control"
                          value={propertyData.assumptions.clpDurationYears}
                          onChange={(e) => handleAssumptionChange('clpDurationYears', e.target.value)}
                        />
                        <small className="text-muted">Total construction period</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">First Bank Disbursement (Month)</label>
                        <input
                          type="number"
                          className="form-control"
                          value={propertyData.assumptions.bankDisbursementStartMonth}
                          onChange={(e) => handleAssumptionChange('bankDisbursementStartMonth', e.target.value)}
                        />
                        <small className="text-muted">Month when first disbursement occurs</small>
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">Disbursement Interval (Months)</label>
                        <input
                          type="number"
                          className="form-control"
                          value={propertyData.assumptions.bankDisbursementInterval}
                          onChange={(e) => handleAssumptionChange('bankDisbursementInterval', e.target.value)}
                        />
                        <small className="text-muted">Months between disbursements</small>
                      </div>
                    </div>
                    <div className="alert alert-info mt-3">
                      <small>
                        <i className="bi bi-info-circle me-2"></i>
                        In CLP plans, Interest During Construction (IDC) is calculated monthly and added to the Home Loan EMI calculation.
                      </small>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* === STEP 4: EXIT SCENARIOS === */}
            {currentStep === 4 && (
              <div className="animate-fade-in">
                {/* NEW HEADER: Title on left, Button on right */}
                <div className="d-flex justify-content-between align-items-center mb-4 pb-2 ms-4 border-bottom border-secondary border-opacity-25">
                  <h5 className="fw-bold text-secndary mb-0">
                    <i className="bi bi-graph-up-arrow me-2"></i>Exit Scenarios
                  </h5>
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={handleAddExitPriceScenario}
                  >
                    <i className="bi bi-plus-lg me-1"></i> Add Scenario
                  </button>
                </div>

                <div className="mb-4 ps-4 pe-4">
                  <div className="row g-3 mb-3">
                    {/* Left Column: Selected Price */}
                    <div className="col-md-6">
                      <label className="form-label">Selected Exit Price (₹/sq.ft)</label>
                      <input
                        type="number"
                        className="form-control"
                        value={userSelections.selectedExitPrice}
                        onChange={(e) => handleSelectionUpdate('selectedExitPrice', parseFloat(e.target.value))}
                      />
                    </div>

                    {/* Right Column: Scenarios List (Button removed from here) */}
                    <div className="col-md-6">
                      <label className="form-label">Scenario Exit Prices</label>

                      <div className="row g-2">
                        {userSelections.scenarioExitPrices.map((price, index) => (
                          <div key={index} className="col-12">
                            <div className="input-group input-group-sm mb-2">
                              <span className="input-group-text">Scenario {index + 1}</span>
                              <input
                                type="number"
                                className="form-control"
                                value={price}
                                onChange={(e) => handleUpdateExitPriceScenario(index, e.target.value)}
                              />
                              {userSelections.scenarioExitPrices.length > 1 && (
                                <button
                                  className="btn btn-danger d-flex align-items-center justify-content-center"
                                  type="button"
                                  onClick={() => handleRemoveExitPriceScenario(index)}
                                  title="Remove Scenario"
                                  style={{ width: '40px' }}
                                >
                                  <i className="bi bi-trash-fill text-white"></i>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
              <div className="col-md-9">
                <h2 className="fw-bold mb-2 gradient-text">
                  <i className="bi bi-speedometer2 me-3"></i>
                  Investment Analysis Overview
                </h2>
                <p className="text-muted mb-0">
                  Quick summary and stage-wise breakdown of your investment
                </p>
              </div>
              <div className="col-md-3 text-end">
                <button
                  className="btn btn-outline-primary rounded-pill px-4"
                  onClick={() => setActiveTab('inputs')}
                >
                  <i className="bi bi-pencil-square me-2"></i>
                  Edit Inputs
                </button>
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
                <div className="rounded-circle bg-success text-white d-flex align-items-center justify-content-center mx-auto mb-3 shadow-sm" style={{ width: '60px', height: '60px' }}><i className="bi bi-graph-up-arrow fs-3"></i></div>
                <h4 className="fw-bold mb-1 text-success">{formatPercent(breakdown.roi)}</h4>
                <p className="text-muted mb-0 small fw-bold">Estimated ROI</p>
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

        {/* 4. Comparison Table (Corrected with Array Index) */}
        <div className="glass-card mb-5 p-4">
          <div className="card-header">
            <h5 className="mb-0 pb-2 border-bottom border-secondary border-opacity-25">
              <i className="bi bi-table me-2"></i>
              Exit Price Comparison
            </h5>
            <small className="opacity-45">Comparing Current Plan vs Scenario 1</small>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="ps-3">Metric</th>
                    <th>Current Scenario</th>
                    <th className="text-primary">Scenario 1</th>
                    <th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Property Size - Always 0 Diff */}
                  <tr>
                    <td className="ps-3 fw-bold text-muted">Property Size</td>
                    <td>{userSelections.selectedPropertySize} sq.ft</td>
                    <td>{userSelections.selectedPropertySize} sq.ft</td>
                    <td className="text-muted">0 sq.ft</td>
                  </tr>

                  {/* Exit Price - Reads from Array[0] */}
                  <tr>
                    <td className="ps-3 fw-bold text-muted">Exit Price</td>
                    <td>₹{userSelections.selectedExitPrice}/sq.ft</td>
                    <td>₹{userSelections.scenarioExitPrices?.[0] || 0}/sq.ft</td>
                    <td className={(userSelections.scenarioExitPrices?.[0] || 0) >= userSelections.selectedExitPrice ? 'text-success' : 'text-danger'}>
                      {(userSelections.scenarioExitPrices?.[0] || 0) > userSelections.selectedExitPrice ? '+' : ''}
                      ₹{(userSelections.scenarioExitPrices?.[0] || 0) - userSelections.selectedExitPrice}/sq.ft
                    </td>
                  </tr>

                  {/* Net Gain - Reads from Multiple Scenarios Array[0] */}
                  <tr>
                    <td className="ps-3 fw-bold text-muted">Net Gain/Loss</td>
                    <td className={breakdown.netGainLoss >= 0 ? 'text-success' : 'text-danger'}>
                      {formatLakhs(breakdown.netGainLoss)}
                    </td>
                    <td className={calculatedData.multipleScenarios?.[0]?.netProfit >= 0 ? 'text-success' : 'text-danger'}>
                      {formatLakhs(calculatedData.multipleScenarios?.[0]?.netProfit)}
                    </td>
                    <td className={(calculatedData.multipleScenarios?.[0]?.netProfit || 0) > breakdown.netGainLoss ? 'text-success fw-bold' : 'text-danger fw-bold'}>
                      {(calculatedData.multipleScenarios?.[0]?.netProfit || 0) > breakdown.netGainLoss ? '+' : ''}
                      {formatLakhs((calculatedData.multipleScenarios?.[0]?.netProfit || 0) - breakdown.netGainLoss)}
                    </td>
                  </tr>

                  {/* ROI - Reads from Multiple Scenarios Array[0] */}
                  <tr>
                    <td className="ps-3 fw-bold text-muted">ROI</td>
                    <td className={breakdown.roi >= 0 ? 'text-success' : 'text-danger'}>
                      {formatPercent(breakdown.roi)}
                    </td>
                    <td className={calculatedData.multipleScenarios?.[0]?.roi >= 0 ? 'text-success' : 'text-danger'}>
                      {formatPercent(calculatedData.multipleScenarios?.[0]?.roi)}
                    </td>
                    <td className={(calculatedData.multipleScenarios?.[0]?.roi || 0) > breakdown.roi ? 'text-success fw-bold' : 'text-danger fw-bold'}>
                      {(calculatedData.multipleScenarios?.[0]?.roi || 0) > breakdown.roi ? '+' : ''}
                      {formatPercent((calculatedData.multipleScenarios?.[0]?.roi || 0) - breakdown.roi)}
                    </td>
                  </tr>

                </tbody>
              </table>
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
            <div className="col-md-6 mb-4 mb-md-0">
              <div className="p-2">
                <h6 className="mb-3 opacity-75">Funding Distribution</h6>
                {renderFundingBar("Home Loan", breakdown.homeLoanShare, "primary")}
                {breakdown.hasDownPayment && renderFundingBar("Down Payment", breakdown.downPaymentShare, "info")}
                {breakdown.hasPersonalLoan1 && renderFundingBar("Personal Loan 1", breakdown.personalLoan1Share, "success")}
                {breakdown.hasPersonalLoan2 && renderFundingBar("Personal Loan 2", breakdown.personalLoan2Share, "warning")}
              </div>
            </div>
            <div className="col-md-6">
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
            {renderActionBtn("Edit Parameters", "Modify inputs", "bi-pencil-square", "inputs", "btn-outline-light")}
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
    //const scenario = calculatedData.scenarioBreakdown;

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

    return (
      <div className="mb-5">
        <div className="glass-card mb-4">
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
          <div className="card-body">

            {/* Monthly EMI Timeline Visualization */}
            <div className="row mb-4 pt-4 ps-2 pe-2">
              <div className="col-12">
                <h5 className="mb-3 ps-4">
                  <i className="bi bi-calendar-month text-info me-2"></i>
                  Monthly EMI Timeline
                </h5>
                <div className="row g-4 pt-2 ms-2 me-2">

                  {/* Timeline 1: Pre-Possession */}
                  {renderTimelineCard(
                    "Timeline 1: Pre-Possession",
                    "bi-calendar-week",
                    "primary", // Color Theme
                    formatCurrency(breakdown.prePossessionEMI),
                    `Month 0 to Month ${breakdown.possessionMonths}`,
                    `${breakdown.prePossessionMonths} months`,
                    // Component Inner JSX
                    <>
                      {renderComponentBox("PL1 EMI", formatCurrency(breakdown.personalLoan1EMI), 6)}
                      {breakdown.hasIDC && breakdown.monthlyIDCEMI > 0 &&
                        renderComponentBox("Monthly IDC EMI", formatCurrency(breakdown.monthlyIDCEMI), 6, "bg-warning bg-opacity-10", "text-warning")
                      }
                    </>,
                    formatCurrency(breakdown.prePossessionTotal),
                    `(${breakdown.prePossessionMonths} months × ${formatCurrency(breakdown.prePossessionEMI)})`,
                    // Extra Header Content
                    breakdown.hasIDC && <small className="opacity-75">Includes Monthly IDC EMI during construction</small>,
                    // Extra Footer Content
                    breakdown.hasIDC && (
                      <div className="mt-2">
                        <small className="text-white opacity-75">
                          Includes {formatCurrency(breakdown.totalIDC)} total IDC over {breakdown.constructionMonths} months
                        </small>
                      </div>
                    )
                  )}

                  {/* Timeline 2: Post-Possession */}
                  {renderTimelineCard(
                    "Timeline 2: Post-Possession",
                    "bi-calendar-check",
                    "success", // Color Theme
                    formatCurrency(breakdown.postPossessionEMI),
                    `Month ${breakdown.possessionMonths + 1} to Month ${breakdown.totalHoldingMonths}`,
                    `${breakdown.postPossessionMonths} months`,
                    // Component Inner JSX
                    <>
                      {renderComponentBox("HL EMI", formatCurrency(breakdown.homeLoanEMI), 4)}
                      {renderComponentBox("PL1 EMI", formatCurrency(breakdown.personalLoan1EMI), 4)}
                      {breakdown.hasPersonalLoan2 &&
                        renderComponentBox("PL2 EMI", formatCurrency(breakdown.personalLoan2EMI), 4)
                      }
                    </>,
                    formatCurrency(breakdown.postPossessionTotal),
                    `(${breakdown.postPossessionMonths} months × ${formatCurrency(breakdown.postPossessionEMI)})`
                  )}

                </div>

                {/* Summary Card */}
                <div className="row m-4">
                  <div className="col-12">
                    <div className="p-4 bg-info text-white rounded shadow-sm">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <h6 className="mb-1 fw-bold">Total EMI Commitment</h6>
                          <small>Combined across both timelines</small>
                          {breakdown.hasIDC && (
                            <div className="mt-2 text-white-50 small">
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
              </div>
            </div>

            {/* Interest During Construction (IDC) Details */}
            {breakdown.hasIDC && (
              <div className="row mb-4 ps-3 pe-3">
                <div className="col-12">
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
              </div>
            )}

            {/* Home Loan Detailed Analysis */}
            <div className="row m-4">
              <div className="col-12">
                <h5 className="mb-3">
                  <i className="bi bi-bank text-primary me-2"></i>
                  Home Loan Analysis
                  {breakdown.hasIDC && (
                    <span className="badge bg-warning ms-2">Includes IDC</span>
                  )}
                </h5>
                <div className="row g-3">
                  <div className="col-md-3">
                    <div className="p-3 bg-primary text-white rounded text-center">
                      <small className="text-white">Total EMI per Month</small>
                      <div className="fw-bold fs-4">{formatCurrency(breakdown.homeLoanEMI)}</div>
                      <small className="text-white">Monthly payment</small>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="p-3 bg-success text-white rounded text-center">
                      <small className="text-white">Total EMI Paid</small>
                      <div className="fw-bold fs-4">{formatCurrency(breakdown.homeLoanEMIPaid)}</div>
                      <small className="text-white">{breakdown.homeLoanPaymentsMade} payments made</small>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="p-3 bg-warning text-white rounded text-center">
                      <small className="text-white">Total Interest Paid</small>
                      <div className="fw-bold fs-4">{formatCurrency(breakdown.homeLoanInterestPaid)}</div>
                      <small className="text-white">Over {breakdown.homeLoanPaymentsMade} months</small>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="p-3 bg-danger text-white rounded text-center">
                      <small className="text-white">Total EMI Due</small>
                      <div className="fw-bold fs-4">{formatCurrency(breakdown.homeLoanOutstanding)}</div>
                      <small className="text-white">Outstanding balance</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Personal Loan 1 Detailed Analysis */}
            {breakdown.hasPersonalLoan1 && renderLoanSection("Personal Loan 1 Analysis", "bi-cash-coin", "success",
              formatCurrency(breakdown.personalLoan1EMI),
              formatCurrency(breakdown.personalLoan1EMIPaid),
              formatCurrency(breakdown.personalLoan1InterestPaid),
              formatCurrency(breakdown.personalLoan1Outstanding),
              breakdown.pl1PaymentsMade
            )}

            {/* Personal Loan 2 Detailed Analysis */}
            {breakdown.hasPersonalLoan2 && renderLoanSection("Personal Loan 2 Analysis", "bi-cash-coin", "warning",
              formatCurrency(breakdown.personalLoan2EMI),
              formatCurrency(breakdown.personalLoan2EMIPaid),
              formatCurrency(breakdown.personalLoan2InterestPaid),
              formatCurrency(breakdown.personalLoan2Outstanding),
              breakdown.pl2PaymentsMade
            )}

            {/* Multiple Exit Price Scenarios */}
            <div className="row m-4">
              <div className="col-12">
                <div className="p-3 bg-light rounded">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="mb-0">
                      <i className="bi bi-bar-chart me-2"></i>
                      Multiple Exit Price Scenarios
                    </h6>
                    <span className="badge bg-primary">
                      {calculatedData.multipleScenarios?.length || 0} scenarios
                    </span>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-bordered table-hover">
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

            {/* Total Loan Summary */}
            <div className="row m-4">
              <div className="col-12">
                <h5 className="mb-3"><i className="bi bi-calculator text-info me-2"></i>Total Loan Summary</h5>
                <div className="row g-3">
                  {renderStatCard("Total Monthly EMI", formatCurrency(breakdown.homeLoanEMI + breakdown.personalLoan1EMI + breakdown.personalLoan2EMI), "Combined monthly payment", "info", 4)}
                  {renderStatCard("Total EMI Paid", formatCurrency(breakdown.totalEMIPaid), `Over ${breakdown.years} years`, "success", 4)}
                  {renderStatCard("Total Outstanding", formatCurrency(breakdown.totalLoanOutstanding), "Total balance due", "danger", 4)}
                </div>
              </div>
            </div>

            {/* Interest Summary */}
            <div className="row m-4">
              <div className="col-12">
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
            </div>

            {/* Sale Analysis */}
            <div className="row m-4">
              <div className="col-12">
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
            </div>

            {/* Net Position */}
            <div className="m-4"> {/* ⬅️ Added wrapper for margin */}
              {renderBanner(
                "Net Position Analysis",
                formatLakhs(Math.abs(breakdown.netGainLoss)),
                `Net ${breakdown.netGainLoss >= 0 ? 'Profit' : 'Loss'} (Cash - EMIs Paid)`,
                breakdown.netGainLoss >= 0 ? 'success' : 'danger',
                "bi-cash-stack",
                <div className="fs-6 text-end">{breakdown.netGainLoss >= 0 ? 'PROFIT' : 'LOSS'}</div>
              )}
            </div>

            {/* Scenario Comparison */}
            {calculatedData.scenarioBreakdown && (
              <div className="row m-4">
                <div className="col-12">
                  <div className="p-3 bg-light rounded">
                    <h6 className="mb-3">
                      <i className="bi bi-arrow-left-right me-2"></i>
                      Scenario Comparison
                    </h6>
                    <div className="table-responsive">
                      <table className="table table-bordered">
                        <thead>
                          <tr>
                            <th>Metric</th>
                            <th>Current Scenario</th>
                            <th>Comparison Scenario</th>
                            <th>Difference</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Property Size</td>
                            <td>{userSelections.selectedPropertySize} sq.ft</td>
                            <td>{userSelections.scenarioSize} sq.ft</td>
                            <td>
                              {(userSelections.scenarioSize - userSelections.selectedPropertySize) > 0 ? '+' : ''}
                              {userSelections.scenarioSize - userSelections.selectedPropertySize} sq.ft
                            </td>
                          </tr>
                          <tr>
                            <td>Exit Price</td>
                            <td>₹{userSelections.selectedExitPrice}/sq.ft</td>
                            <td>₹{userSelections.scenarioExitPrices[0]}/sq.ft</td>
                            <td className={(userSelections.scenarioExitPrices?.[0] || 0) >= userSelections.selectedExitPrice ? 'text-success' : 'text-danger'}>
                              {(userSelections.scenarioExitPrices?.[0] || 0) > userSelections.selectedExitPrice ? '+' : ''}
                              ₹{(userSelections.scenarioExitPrices?.[0] || 0) - userSelections.selectedExitPrice}/sq.ft
                            </td>
                          </tr>
                          <tr>
                            <td>Leftover Cash</td>
                            <td>{formatLakhs(breakdown.leftoverCash)}</td>
                            <td>{formatLakhs(calculatedData.scenarioBreakdown.leftoverCash)}</td>
                            <td className={calculatedData.scenarioBreakdown.leftoverCash > breakdown.leftoverCash ? 'text-success' : 'text-danger'}>
                              {formatLakhs(calculatedData.scenarioBreakdown.leftoverCash - breakdown.leftoverCash)}
                            </td>
                          </tr>
                          <tr>
                            <td>Net Gain/Loss</td>
                            <td className={breakdown.netGainLoss >= 0 ? 'text-success' : 'text-danger'}>
                              {formatLakhs(breakdown.netGainLoss)}
                            </td>
                            <td className={calculatedData.scenarioBreakdown.netGainLoss >= 0 ? 'text-success' : 'text-danger'}>
                              {formatLakhs(calculatedData.scenarioBreakdown.netGainLoss)}
                            </td>
                            <td className={calculatedData.scenarioBreakdown.netGainLoss > breakdown.netGainLoss ? 'text-success' : 'text-danger'}>
                              {formatLakhs(calculatedData.scenarioBreakdown.netGainLoss - breakdown.netGainLoss)}
                            </td>
                          </tr>
                          <tr>
                            <td>ROI</td>
                            <td className={breakdown.roi >= 0 ? 'text-success' : 'text-danger'}>
                              {formatPercent(breakdown.roi)}
                            </td>
                            <td className={calculatedData.scenarioBreakdown.roi >= 0 ? 'text-success' : 'text-danger'}>
                              {formatPercent(calculatedData.scenarioBreakdown.roi)}
                            </td>
                            <td className={calculatedData.scenarioBreakdown.roi > breakdown.roi ? 'text-success' : 'text-danger'}>
                              {formatPercent(calculatedData.scenarioBreakdown.roi - breakdown.roi)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
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
      <div className="position-fixed top-0 left-0 w-100 h-100" style={{ zIndex: -1 }}>
        {/* Left Blob - Increased opacity to 0.15 */}
        <div className="position-absolute top-0 start-0 w-100 h-100"
          style={{ background: 'radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.15) 0%, transparent 50%)' }}></div>

        {/* Right Blob - Increased opacity to 0.15 */}
        <div className="position-absolute top-0 end-0 w-100 h-100"
          style={{ background: 'radial-gradient(circle at 80% 20%, rgba(118, 75, 162, 0.15) 0%, transparent 50%)' }}></div>
      </div>

      <div className="container-fluid py-4">
        <div className="row justify-content-center">
          <div className="col-12 col-xxl-10">

            {/* Main Header */}
            <div className="text-center mb-4 pt-3">

              <p className="lead text-light opacity-90 mb-4" style={{ letterSpacing: '0.5px' }}>
                Model your payment plan, optimize loans, and forecast returns.
              </p>

              {/* Navigation Tabs - Modern Segmented Style */}
              <div className="d-flex justify-content-center mb-2">
                <div className="glass-card p-1 rounded-pill d-inline-flex border border-secondary border-opacity-25">
                  {[
                    { id: 'inputs', icon: 'bi-input-cursor', label: 'Input Parameters' },
                    { id: 'overview', icon: 'bi-speedometer2', label: 'Analysis Overview' },
                    { id: 'breakdown', icon: 'bi-calculator', label: 'Detailed Breakdown' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`btn rounded-pill px-4 py-2 d-flex align-items-center border-0 ${activeTab === tab.id
                        ? 'btn-primary shadow-sm fw-bold' // Active Style
                        : 'text-secondary hover-text-primary' // Inactive Style (Clean text)
                        }`}
                      style={{ transition: 'all 0.3s ease' }}
                    >
                      <i className={`bi ${tab.icon} me-2`}></i>
                      {tab.label}
                    </button>
                  ))}
                </div>
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