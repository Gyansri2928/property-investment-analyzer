import React, { useState, useEffect, useCallback } from 'react';
import './PropertyComparison.css';

const PropertyComparison = () => {
  // ===================== STATE =====================
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [propertyData, setPropertyData] = useState({
    purchasePrice: 4400,
    exitPrices: [6000, 7000, 8000],
    properties: [
      {
        id: 1,
        size: 1428,
        name: 'Premium Penthouse',
        location: 'Waterfront',
        rating: 4.8,
        isHighlighted: true,
        possessionMonths: 24
      }
    ],
    paymentPlan: 'clp',
    assumptions: {
      homeLoanRate: 8,
      homeLoanTerm: 20,
      homeLoanStartMonth: 25,
      
      personalLoan1Rate: 11,
      personalLoan1Term: 7,
      personalLoan1StartMonth: 0,
      personalLoan1Share: 10,
      
      personalLoan2Rate: 11,
      personalLoan2Term: 7,
      personalLoan2StartMonth: 30,
      personalLoan2Share: 10,
      
      downPaymentShare: 0,
      
      investmentPeriod: 3,
      clpDurationYears: 2.5,
      bankDisbursementStartMonth: 3,
      bankDisbursementInterval: 3,
      
      possessionMonths: 24
    }
  });

  const [userSelections, setUserSelections] = useState({
    selectedPropertyId: 1,
    selectedExitPrice: 6000,
    selectedYears: 3,
    selectedPropertySize: 1428,
    scenarioSize: 1428,
    scenarioExitPrice: 6000,
    scenarioExitPrices: [6000, 7000, 8000]
  });

  const [calculatedData, setCalculatedData] = useState({
    profits: [],
    detailedBreakdown: null,
    scenarioBreakdown: null,
    multipleScenarios: [],
    stageCalculations: {}
  });

  const [activeTab, setActiveTab] = useState('inputs');
  const [showDataEnteredAlert, setShowDataEnteredAlert] = useState(false);

  // ===================== THEME MANAGEMENT =====================
  useEffect(() => {
    if (isDarkTheme) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, [isDarkTheme]);

  // ===================== CALCULATION FUNCTIONS =====================
  
  const calculateEMI = useCallback((principal, annualRate, years) => {
    if (!principal || principal === 0) return 0;
    if (!annualRate || annualRate === 0) return principal / (years * 12);
    
    const monthlyRate = annualRate / (12 * 100);
    const months = years * 12;
    
    const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / 
                (Math.pow(1 + monthlyRate, months) - 1);
    return emi;
  }, []);

  const calculateOutstandingAfterPayments = useCallback((principal, annualRate, years, paymentsMade) => {
    if (!principal || principal === 0) return 0;
    if (paymentsMade <= 0) return principal;
    
    const monthlyRate = annualRate / (12 * 100);
    const totalMonths = years * 12;
    
    if (paymentsMade >= totalMonths) return 0;
    
    const outstanding = principal * 
                       (Math.pow(1 + monthlyRate, totalMonths) - Math.pow(1 + monthlyRate, paymentsMade)) / 
                       (Math.pow(1 + monthlyRate, totalMonths) - 1);
    
    return Math.max(0, outstanding);
  }, []);

  const calculateTotalInterestPaid = useCallback((principal, annualRate, years, paymentsMade) => {
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
  }, [calculateEMI]);

  const calculateMonthlyIDCEMI = useCallback((homeLoanAmount, annualRate, constructionMonths) => {
    if (!homeLoanAmount || homeLoanAmount === 0 || constructionMonths <= 0) return 0;
    
    const monthlyRate = annualRate / (12 * 100);
    const monthlyIDC = homeLoanAmount * monthlyRate;
    
    return monthlyIDC;
  }, []);

  const calculateFinancials = useCallback((propertySize, exitPrice, years, isScenario = false) => {
    const { purchasePrice, assumptions, paymentPlan } = propertyData;
    
    const totalCost = propertySize * purchasePrice;
    
    let homeLoanShare, personalLoan1Share, personalLoan2Share, downPaymentShare;
    
    if (paymentPlan === 'clp') {
      homeLoanShare = 80;
      personalLoan1Share = Math.max(0, Math.min(assumptions.personalLoan1Share || 10, 100));
      personalLoan2Share = Math.max(0, Math.min(assumptions.personalLoan2Share || 10, 100));
      downPaymentShare = 0;
    } else if (paymentPlan === '20-80') {
      homeLoanShare = 80;
      personalLoan1Share = 20;
      personalLoan2Share = 0;
      downPaymentShare = 0;
    } else if (paymentPlan === '40-60') {
      homeLoanShare = 60;
      personalLoan1Share = 40;
      personalLoan2Share = 0;
      downPaymentShare = 0;
    } else if (paymentPlan === 'custom') {
      personalLoan1Share = Math.max(0, Math.min(assumptions.personalLoan1Share || 0, 100));
      personalLoan2Share = Math.max(0, Math.min(assumptions.personalLoan2Share || 0, 100));
      downPaymentShare = Math.max(0, Math.min(assumptions.downPaymentShare || 0, 100));
      homeLoanShare = Math.max(0, Math.min(100 - personalLoan1Share - personalLoan2Share - downPaymentShare, 100));
    }
    
    const homeLoanAmount = totalCost * (homeLoanShare / 100);
    const personalLoan1Amount = totalCost * (personalLoan1Share / 100);
    const personalLoan2Amount = totalCost * (personalLoan2Share / 100);
    const downPaymentAmount = totalCost * (downPaymentShare / 100);
    
    const totalCashInvested = downPaymentAmount + personalLoan1Amount + personalLoan2Amount;
    
    let totalIDC = 0;
    let monthlyIDCEMI = 0;
    
    if (paymentPlan === 'clp' && homeLoanAmount > 0) {
      const constructionEndMonth = assumptions.clpDurationYears * 12;
      const slabAmount = totalCost * 0.10;
      const bankDisbursements = [];
      
      for (let i = 0; i < 8; i++) {
        const month = assumptions.bankDisbursementStartMonth + (i * assumptions.bankDisbursementInterval);
        if (month <= constructionEndMonth) {
          bankDisbursements.push({ amount: slabAmount, month });
        }
      }
      
      bankDisbursements.forEach(disbursement => {
        const { amount, month } = disbursement;
        const monthsTillEnd = constructionEndMonth - month;
        if (monthsTillEnd > 0) {
          const interest = amount * (assumptions.homeLoanRate / 100) * (monthsTillEnd / 12);
          totalIDC += interest;
        }
      });
      
      monthlyIDCEMI = calculateMonthlyIDCEMI(homeLoanAmount, assumptions.homeLoanRate, constructionEndMonth);
    }
    
    const totalHomeLoanAtCompletion = homeLoanAmount + totalIDC;
    
    const homeLoanEMI = homeLoanAmount > 0 ? 
      calculateEMI(totalHomeLoanAtCompletion, assumptions.homeLoanRate, assumptions.homeLoanTerm) : 0;
    
    const personalLoan1EMI = personalLoan1Amount > 0 ? 
      calculateEMI(personalLoan1Amount, assumptions.personalLoan1Rate, assumptions.personalLoan1Term) : 0;
    
    const personalLoan2EMI = personalLoan2Amount > 0 ? 
      calculateEMI(personalLoan2Amount, assumptions.personalLoan2Rate, assumptions.personalLoan2Term) : 0;
    
    const totalHoldingMonths = years * 12;
    
    const homeLoanActualStartMonth = Math.max(assumptions.homeLoanStartMonth, assumptions.possessionMonths);
    const homeLoanPaymentsMade = Math.max(0, totalHoldingMonths - homeLoanActualStartMonth);
    
    const pl1ActualStartMonth = assumptions.personalLoan1StartMonth;
    const pl1PaymentsMade = Math.max(0, totalHoldingMonths - pl1ActualStartMonth);
    
    const pl2ActualStartMonth = assumptions.possessionMonths;
    const pl2PaymentsMade = Math.max(0, totalHoldingMonths - pl2ActualStartMonth);
    
    const homeLoanOutstanding = homeLoanAmount > 0 ? 
      calculateOutstandingAfterPayments(
        totalHomeLoanAtCompletion,
        assumptions.homeLoanRate,
        assumptions.homeLoanTerm,
        homeLoanPaymentsMade
      ) : 0;
    
    const personalLoan1Outstanding = personalLoan1Amount > 0 ? 
      calculateOutstandingAfterPayments(
        personalLoan1Amount,
        assumptions.personalLoan1Rate,
        assumptions.personalLoan1Term,
        pl1PaymentsMade
      ) : 0;
    
    const personalLoan2Outstanding = personalLoan2Amount > 0 ? 
      calculateOutstandingAfterPayments(
        personalLoan2Amount,
        assumptions.personalLoan2Rate,
        assumptions.personalLoan2Term,
        pl2PaymentsMade
      ) : 0;
    
    const homeLoanInterestPaid = homeLoanAmount > 0 ? 
      calculateTotalInterestPaid(
        totalHomeLoanAtCompletion,
        assumptions.homeLoanRate,
        assumptions.homeLoanTerm,
        homeLoanPaymentsMade
      ) : 0;
    
    const personalLoan1InterestPaid = personalLoan1Amount > 0 ? 
      calculateTotalInterestPaid(
        personalLoan1Amount,
        assumptions.personalLoan1Rate,
        assumptions.personalLoan1Term,
        pl1PaymentsMade
      ) : 0;
    
    const personalLoan2InterestPaid = personalLoan2Amount > 0 ? 
      calculateTotalInterestPaid(
        personalLoan2Amount,
        assumptions.personalLoan2Rate,
        assumptions.personalLoan2Term,
        pl2PaymentsMade
      ) : 0;
    
    const homeLoanEMIPaid = homeLoanEMI * homeLoanPaymentsMade;
    const personalLoan1EMIPaid = personalLoan1EMI * pl1PaymentsMade;
    const personalLoan2EMIPaid = personalLoan2EMI * pl2PaymentsMade;
    
    const totalLoanOutstanding = homeLoanOutstanding + personalLoan1Outstanding + personalLoan2Outstanding;
    const totalInterestPaid = homeLoanInterestPaid + personalLoan1InterestPaid + personalLoan2InterestPaid + totalIDC;
    const totalEMIPaid = homeLoanEMIPaid + personalLoan1EMIPaid + personalLoan2EMIPaid;
    
    const saleValue = propertySize * exitPrice;
    const leftoverCash = saleValue - totalLoanOutstanding;
    
    const netGainLoss = leftoverCash - totalEMIPaid;
    
    const roi = totalCashInvested > 0 ? (netGainLoss / totalCashInvested) * 100 : 0;
    
    const prePossessionMonths = assumptions.possessionMonths;
    const postPossessionMonths = totalHoldingMonths - assumptions.possessionMonths;
    
    const prePossessionEMI = personalLoan1EMI + monthlyIDCEMI;
    const prePossessionTotal = prePossessionEMI * prePossessionMonths;
    
    const postPossessionEMI = homeLoanEMI + personalLoan1EMI + personalLoan2EMI;
    const postPossessionTotal = postPossessionEMI * postPossessionMonths;
    
    return {
      propertySize,
      totalCost,
      totalCashInvested,
      totalLoanOutstanding,
      
      homeLoanEMI,
      personalLoan1EMI,
      personalLoan2EMI,
      
      homeLoanAmount,
      personalLoan1Amount,
      personalLoan2Amount,
      downPaymentAmount,
      totalHomeLoanAtCompletion,
      
      homeLoanOutstanding,
      personalLoan1Outstanding,
      personalLoan2Outstanding,
      
      totalInterestPaid,
      totalIDC,
      monthlyIDCEMI,
      homeLoanInterestPaid,
      personalLoan1InterestPaid,
      personalLoan2InterestPaid,
      
      homeLoanEMIPaid,
      personalLoan1EMIPaid,
      personalLoan2EMIPaid,
      totalEMIPaid,
      
      homeLoanPaymentsMade,
      pl1PaymentsMade,
      pl2PaymentsMade,
      
      saleValue,
      leftoverCash,
      netGainLoss,
      roi,
      
      years,
      exitPrice,
      
      homeLoanShare,
      personalLoan1Share,
      personalLoan2Share,
      downPaymentShare,
      
      hasHomeLoan: homeLoanAmount > 0,
      hasPersonalLoan1: personalLoan1Amount > 0,
      hasPersonalLoan2: personalLoan2Amount > 0,
      hasDownPayment: downPaymentAmount > 0,
      
      homeLoanStartMonth: homeLoanActualStartMonth,
      pl1StartMonth: pl1ActualStartMonth,
      pl2StartMonth: pl2ActualStartMonth,
      
      homeLoanSelectedMonths: assumptions.homeLoanStartMonth,
      pl1SelectedMonths: assumptions.personalLoan1StartMonth,
      pl2SelectedMonths: assumptions.personalLoan2StartMonth,
      possessionMonths: assumptions.possessionMonths,
      
      totalHoldingMonths,
      
      prePossessionMonths,
      postPossessionMonths,
      prePossessionEMI,
      postPossessionEMI,
      prePossessionTotal,
      postPossessionTotal,
      
      prePossessionComponents: {
        pl1EMI: personalLoan1EMI,
        monthlyIDCEMI: monthlyIDCEMI,
        total: prePossessionEMI
      },
      
      constructionMonths: paymentPlan === 'clp' ? assumptions.clpDurationYears * 12 : 0,
      hasIDC: totalIDC > 0
    };
  }, [propertyData, calculateEMI, calculateOutstandingAfterPayments, calculateTotalInterestPaid, calculateMonthlyIDCEMI]);

  const calculateStageWise = useCallback(() => {
    const propertySize = userSelections.selectedPropertySize;
    const totalCost = propertySize * propertyData.purchasePrice;
    const breakdown = calculatedData.detailedBreakdown || calculateFinancials(
      propertySize, 
      userSelections.selectedExitPrice, 
      userSelections.selectedYears
    );
    
    const stage1 = {
      title: "Stage 1: Basic Property Cost",
      items: [
        { label: "Property Size", value: `${propertySize} sq.ft` },
        { label: "Purchase Price", value: `₹${propertyData.purchasePrice}/sq.ft` },
        { label: "Total Property Cost", value: formatCurrency(totalCost) }
      ]
    };
    
    const stage2 = {
      title: "Stage 2: Payment Plan Breakdown",
      items: [
        { label: "Down Payment", value: `${breakdown.downPaymentShare}% (${formatCurrency(breakdown.downPaymentAmount)})` },
        { label: "Home Loan", value: `${breakdown.homeLoanShare}% (${formatCurrency(breakdown.homeLoanAmount)})` },
        { label: "Personal Loan 1", value: `${breakdown.personalLoan1Share}% (${formatCurrency(breakdown.personalLoan1Amount)})` },
        { label: "Personal Loan 2", value: `${breakdown.personalLoan2Share}% (${formatCurrency(breakdown.personalLoan2Amount)})` },
        { label: "Total Cash Invested", value: formatCurrency(breakdown.totalCashInvested) }
      ]
    };
    
    const stage3 = {
      title: "Stage 3: EMI Calculations",
      items: [
        { label: "Home Loan EMI", value: `${formatCurrency(breakdown.homeLoanEMI)}/month` },
        { label: "Personal Loan 1 EMI", value: `${formatCurrency(breakdown.personalLoan1EMI)}/month` },
        { label: "Personal Loan 2 EMI", value: `${formatCurrency(breakdown.personalLoan2EMI)}/month` },
        { label: "Total Monthly EMI", value: `${formatCurrency(breakdown.homeLoanEMI + breakdown.personalLoan1EMI + breakdown.personalLoan2EMI)}/month` }
      ]
    };
    
    const stage4 = {
      title: "Stage 4: Holding Period Analysis",
      items: [
        { label: "Holding Period", value: `${userSelections.selectedYears} years (${breakdown.totalHoldingMonths} months)` },
        { label: "Estimated Possession", value: `After ${propertyData.assumptions.possessionMonths} months` },
        { label: "Exit Price", value: `₹${userSelections.selectedExitPrice}/sq.ft` },
        { label: "Expected Sale Value", value: formatCurrency(breakdown.saleValue) }
      ]
    };
    
    return { stage1, stage2, stage3, stage4 };
  }, [propertyData, userSelections, calculatedData.detailedBreakdown, calculateFinancials]);

  // Initialize calculations
  useEffect(() => {
    const propertySize = userSelections.selectedPropertySize;
    const exitPrice = userSelections.selectedExitPrice;
    const years = userSelections.selectedYears;
    
    const detailedBreakdown = calculateFinancials(propertySize, exitPrice, years);
    
    const scenarioBreakdown = calculateFinancials(
      userSelections.scenarioSize, 
      userSelections.scenarioExitPrice, 
      years
    );
    
    const profits = propertyData.exitPrices.map(price => {
      const breakdown = calculateFinancials(propertySize, price, years);
      const roi = breakdown.totalCashInvested > 0 ? (breakdown.netGainLoss / breakdown.totalCashInvested) * 100 : 0;
      const appreciation = ((price - propertyData.purchasePrice) / propertyData.purchasePrice) * 100;
      
      return {
        exitPrice: price,
        saleValue: breakdown.saleValue,
        netProfit: breakdown.netGainLoss,
        roi: roi,
        appreciation: appreciation,
        cashInvested: breakdown.totalCashInvested,
        loanOutstanding: breakdown.totalLoanOutstanding
      };
    });

    const multipleScenarios = userSelections.scenarioExitPrices.map(price => {
      const breakdown = calculateFinancials(propertySize, price, years);
      const roi = breakdown.totalCashInvested > 0 ? (breakdown.netGainLoss / breakdown.totalCashInvested) * 100 : 0;
      const appreciation = ((price - propertyData.purchasePrice) / propertyData.purchasePrice) * 100;
      
      return {
        exitPrice: price,
        saleValue: breakdown.saleValue,
        netProfit: breakdown.netGainLoss,
        roi: roi,
        appreciation: appreciation,
        cashInvested: breakdown.totalCashInvested,
        loanOutstanding: breakdown.totalLoanOutstanding,
        leftoverCash: breakdown.leftoverCash,
        totalEMIPaid: breakdown.totalEMIPaid
      };
    });

    const stageCalculations = calculateStageWise();

    setCalculatedData({
      profits,
      detailedBreakdown,
      scenarioBreakdown,
      multipleScenarios,
      stageCalculations
    });
  }, [propertyData, userSelections, calculateFinancials, calculateStageWise]);

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

  const handlePropertyChange = (field, value) => {
    setPropertyData(prev => ({
      ...prev,
      properties: [{
        ...prev.properties[0],
        [field]: value
      }]
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
        newAssumptions.personalLoan1Share = 10;
        newAssumptions.personalLoan2Share = 10;
        newAssumptions.downPaymentShare = 0;
      } else if (plan === '20-80') {
        newAssumptions.personalLoan1Share = 20;
        newAssumptions.personalLoan2Share = 0;
        newAssumptions.downPaymentShare = 0;
      } else if (plan === '40-60') {
        newAssumptions.personalLoan1Share = 40;
        newAssumptions.personalLoan2Share = 0;
        newAssumptions.downPaymentShare = 0;
      } else if (plan === 'custom') {
        if (!newAssumptions.downPaymentShare) newAssumptions.downPaymentShare = 0;
      }
      
      return {
        ...prev,
        paymentPlan: plan,
        assumptions: newAssumptions
      };
    });
  };

  // ===================== UTILITY FUNCTIONS =====================
  
  const formatLakhs = (value) => {
    if (!value && value !== 0) return '₹0L';
    return `₹${(value / 100000).toFixed(2)}L`;
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return '₹0';
    return `₹${Math.round(value).toLocaleString()}`;
  };

  const formatPercent = (value) => {
    if (!value && value !== 0) return '0%';
    return `${value.toFixed(1)}%`;
  };

  // ===================== RENDER FUNCTIONS =====================
  
  const renderInputsTab = () => {
    return (
      <div className="mb-5">
        <div className="glass-card mb-4">
          <div className="card-header bg-gradient-primary">
            <h4 className="mb-0">
              <i className="bi bi-input-cursor me-2"></i>
              Step 1: Input Your Investment Parameters
            </h4>
          </div>
          <div className="card-body">
            <div className="alert alert-info glass-card mb-4">
              <div className="d-flex align-items-center">
                <i className="bi bi-info-circle-fill fs-4 text-primary me-3"></i>
                <div>
                  <h6 className="mb-1">How to use this tool:</h6>
                  <p className="mb-0 small">Enter property details and assumptions below. Calculations update in real-time.</p>
                </div>
              </div>
            </div>
            
            {/* Property Management */}
            <div className="mb-4">
              <h5 className="fw-bold mb-3">
                <i className="bi bi-building me-2"></i>
                Property Management
              </h5>
              
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h6 className="mb-0">Properties ({propertyData.properties.length})</h6>
                <button 
                  className="btn btn-success btn-sm"
                  onClick={handleAddProperty}
                >
                  <i className="bi bi-plus-circle me-1"></i>
                  Add Property
                </button>
              </div>
              
              <div className="row g-3">
                {propertyData.properties.map((property, index) => (
                  <div key={property.id} className="col-md-6 col-lg-4">
                    <div className="card h-100">
                      <div className="card-header d-flex justify-content-between align-items-center">
                        <span className="badge bg-primary">Property #{property.id}</span>
                        {propertyData.properties.length > 1 && (
                          <button 
                            className="btn btn-danger btn-sm"
                            onClick={() => handleRemoveProperty(property.id)}
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        )}
                      </div>
                      <div className="card-body">
                        <div className="mb-3">
                          <label className="form-label small">Property Name</label>
                          <input 
                            type="text" 
                            className="form-control form-control-sm"
                            value={property.name}
                            onChange={(e) => {
                              const newProperties = [...propertyData.properties];
                              newProperties[index].name = e.target.value;
                              setPropertyData(prev => ({ ...prev, properties: newProperties }));
                            }}
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label small">Property Size (sq.ft)</label>
                          <input 
                            type="number" 
                            className="form-control form-control-sm"
                            value={property.size}
                            onChange={(e) => {
                              const newProperties = [...propertyData.properties];
                              newProperties[index].size = parseFloat(e.target.value);
                              setPropertyData(prev => ({ ...prev, properties: newProperties }));
                            }}
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label small">Location</label>
                          <input 
                            type="text" 
                            className="form-control form-control-sm"
                            value={property.location}
                            onChange={(e) => {
                              const newProperties = [...propertyData.properties];
                              newProperties[index].location = e.target.value;
                              setPropertyData(prev => ({ ...prev, properties: newProperties }));
                            }}
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label small">Estimated Possession (Months)</label>
                          <input 
                            type="number" 
                            className="form-control form-control-sm"
                            value={property.possessionMonths}
                            onChange={(e) => {
                              const newProperties = [...propertyData.properties];
                              newProperties[index].possessionMonths = parseFloat(e.target.value);
                              setPropertyData(prev => ({ ...prev, properties: newProperties }));
                            }}
                          />
                          <small className="text-muted">Months until property possession</small>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Property Basic Information */}
            <div className="mb-4">
              <h5 className="fw-bold mb-3">
                <i className="bi bi-info-circle me-2"></i>
                Common Property Information
              </h5>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">Purchase Price (₹/sq.ft)</label>
                  <input 
                    type="number" 
                    className="form-control"
                    value={propertyData.purchasePrice}
                    onChange={(e) => handleInputChange('purchasePrice', parseFloat(e.target.value))}
                  />
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
                      if (selectedProp) {
                        handleSelectionUpdate('selectedPropertySize', selectedProp.size);
                      }
                    }}
                  >
                    {propertyData.properties.map(property => (
                      <option key={property.id} value={property.id}>
                        {property.name} ({property.size} sq.ft)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Payment Plan Selection */}
            <div className="mb-4">
              <h5 className="fw-bold mb-3">
                <i className="bi bi-credit-card me-2"></i>
                Payment Plan
              </h5>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label">Payment Plan Type</label>
                  <select 
                    className="form-select"
                    value={propertyData.paymentPlan}
                    onChange={(e) => handlePaymentPlanChange(e.target.value)}
                  >
                    <option value="clp">CLP (80% HL, 10% PL1, 10% PL2)</option>
                    <option value="20-80">20% Down, 80% Loan (20% PL1, 80% HL)</option>
                    <option value="40-60">40% Down, 60% Loan (40% PL1, 60% HL)</option>
                    <option value="custom">Custom (User Defined)</option>
                  </select>
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
                      <div className="form-control bg-light">
                        {100 - propertyData.assumptions.downPaymentShare - propertyData.assumptions.personalLoan1Share - propertyData.assumptions.personalLoan2Share}%
                      </div>
                      <small className="text-muted">Auto-calculated</small>
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
                  <div className="mt-3 alert alert-warning">
                    <small>
                      <i className="bi bi-exclamation-triangle me-2"></i>
                      Total must be 100%. Current total: {propertyData.assumptions.downPaymentShare + 
                      propertyData.assumptions.personalLoan1Share + 
                      propertyData.assumptions.personalLoan2Share + 
                      (100 - propertyData.assumptions.downPaymentShare - propertyData.assumptions.personalLoan1Share - propertyData.assumptions.personalLoan2Share)}%
                    </small>
                  </div>
                </div>
              )}
            </div>

            {/* Estimated Possession */}
            <div className="mb-4">
              <h5 className="fw-bold mb-3">
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
            <div className="mb-4">
              <h5 className="fw-bold mb-3">
                <i className="bi bi-bank me-2"></i>
                Home Loan Details
              </h5>
              <div className="row g-3">
                <div className="col-md-3">
                  <label className="form-label">Home Loan Rate (%)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    className="form-control"
                    value={propertyData.assumptions.homeLoanRate}
                    onChange={(e) => handleAssumptionChange('homeLoanRate', e.target.value)}
                  />
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
                      Month {Math.max(propertyData.assumptions.homeLoanStartMonth, propertyData.assumptions.possessionMonths)}
                    </div>
                    <small className="text-muted">After possession delay</small>
                  </div>
                </div>
              </div>
            </div>

            {/* Personal Loan 1 Information */}
            <div className="mb-4">
              <h5 className="fw-bold mb-3">
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
            <div className="mb-4">
              <h5 className="fw-bold mb-3">
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
                      Month {propertyData.assumptions.possessionMonths}
                    </div>
                    <small className="text-muted">Starts from possession date</small>
                  </div>
                </div>
              </div>
            </div>

            {/* CLP Specific Details */}
            {propertyData.paymentPlan === 'clp' && (
              <div className="mb-4">
                <h5 className="fw-bold mb-3">
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

            {/* Exit Price Scenarios */}
            <div className="mb-4">
              <h5 className="fw-bold mb-3">
                <i className="bi bi-graph-up me-2"></i>
                Exit Price Scenarios
              </h5>
              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <label className="form-label">Selected Exit Price (₹/sq.ft)</label>
                  <input 
                    type="number" 
                    className="form-control"
                    value={userSelections.selectedExitPrice}
                    onChange={(e) => handleSelectionUpdate('selectedExitPrice', parseFloat(e.target.value))}
                  />
                </div>
                <div className="col-md-6">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <label className="form-label mb-0">Scenario Exit Prices</label>
                    <button 
                      className="btn btn-success btn-sm"
                      onClick={handleAddExitPriceScenario}
                    >
                      <i className="bi bi-plus-circle me-1"></i>
                      Add Scenario
                    </button>
                  </div>
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
                              className="btn btn-outline-danger"
                              type="button"
                              onClick={() => handleRemoveExitPriceScenario(index)}
                            >
                              <i className="bi bi-trash"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="text-center mt-5 pt-3">
              <button 
                className="btn btn-primary btn-lg shadow-lg px-5 py-3"
                onClick={handleAnalyzeClick}
              >
                <i className="bi bi-graph-up-arrow me-2"></i>
                Analyze Property & View Results
              </button>
              <p className="text-muted mt-3 small">
                Click to generate detailed analysis and financial breakdown
              </p>
            </div>
          </div>
        </div>

        {/* Stage Calculations Cards */}
        <div className="glass-card mt-4">
          <div className="card-header bg-gradient-info">
            <h5 className="mb-0">
              <i className="bi bi-calculator me-2"></i>
              Stage-wise Calculations
            </h5>
          </div>
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

  const renderOverviewTab = () => {
    const breakdown = calculatedData.detailedBreakdown;
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

    return (
      <div className="mb-5">
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

        <div className="glass-card mb-5">
          <div className="card-body p-4">
            <div className="row align-items-center">
              <div className="col-md-9">
                <h2 className="fw-bold mb-2 gradient-text">
                  <i className="bi bi-speedometer2 me-3"></i>
                  Investment Analysis Overview
                </h2>
                <p className="text-muted mb-0">
                  Quick summary and comparison of different scenarios
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

        {/* Quick Stats */}
        <div className="row g-4 mb-5">
          <div className="col-md-3">
            <div className="metric-card glass-card text-center">
              <div className="p-3 rounded-circle bg-primary bg-opacity-20 d-inline-block mb-3">
                <i className="bi bi-cash-stack text-primary fs-3"></i>
              </div>
              <h4 className="fw-bold mb-1">{formatLakhs(breakdown.totalCost)}</h4>
              <p className="text-muted mb-0 small">Total Property Cost</p>
            </div>
          </div>
          <div className="col-md-3">
            <div className="metric-card glass-card text-center">
              <div className="p-3 rounded-circle bg-success bg-opacity-20 d-inline-block mb-3">
                <i className="bi bi-percent text-success fs-3"></i>
              </div>
              <h4 className="fw-bold mb-1">{formatPercent(breakdown.roi)}</h4>
              <p className="text-muted mb-0 small">Estimated ROI</p>
            </div>
          </div>
          <div className="col-md-3">
            <div className="metric-card glass-card text-center">
              <div className="p-3 rounded-circle bg-warning bg-opacity-20 d-inline-block mb-3">
                <i className="bi bi-graph-up-arrow text-warning fs-3"></i>
              </div>
              <h4 className="fw-bold mb-1">{formatLakhs(breakdown.leftoverCash)}</h4>
              <p className="text-muted mb-0 small">Cash After Sale</p>
            </div>
          </div>
          <div className="col-md-3">
            <div className="metric-card glass-card text-center">
              <div className="p-3 rounded-circle bg-info bg-opacity-20 d-inline-block mb-3">
                <i className="bi bi-calendar-check text-info fs-3"></i>
              </div>
              <h4 className="fw-bold mb-1">{breakdown.years}yrs</h4>
              <p className="text-muted mb-0 small">Holding Period</p>
            </div>
          </div>
        </div>

        {/* Comparison Table */}
        <div className="glass-card mb-5">
          <div className="card-header bg-gradient-primary">
            <h5 className="mb-0">
              <i className="bi bi-table me-2"></i>
              Exit Price Comparison
            </h5>
            <small className="opacity-75">Dynamically updates based on exit prices input</small>
          </div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>Exit Price (₹/sq.ft)</th>
                    <th>Sale Value</th>
                    <th>Net Profit/Loss</th>
                    <th>ROI</th>
                    <th>Appreciation</th>
                  </tr>
                </thead>
                <tbody>
                  {calculatedData.profits.map((profit, index) => (
                    <tr key={index} className={profit.exitPrice === userSelections.selectedExitPrice ? 'table-primary' : ''}>
                      <td>
                        <strong>₹{profit.exitPrice}</strong>
                        {profit.exitPrice === userSelections.selectedExitPrice && (
                          <span className="badge bg-primary ms-2">Selected</span>
                        )}
                      </td>
                      <td>{formatLakhs(profit.saleValue)}</td>
                      <td className={profit.netProfit >= 0 ? 'text-success' : 'text-danger'}>
                        {formatLakhs(profit.netProfit)}
                      </td>
                      <td className={profit.roi >= 0 ? 'text-success' : 'text-danger'}>
                        {formatPercent(profit.roi)}
                      </td>
                      <td className="text-warning">
                        {formatPercent(profit.appreciation)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Payment Plan Summary */}
        <div className="glass-card mb-5">
          <div className="card-header bg-gradient-info">
            <h5 className="mb-0">
              <i className="bi bi-pie-chart me-2"></i>
              Payment Plan Breakdown
            </h5>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6">
                <div className="p-3">
                  <h6>Funding Distribution</h6>
                  <div className="d-flex align-items-center mb-2">
                    <div className="bg-primary me-2" style={{ width: '15px', height: '15px', borderRadius: '3px' }}></div>
                    <div className="flex-grow-1">
                      <div className="d-flex justify-content-between mb-1">
                        <span className="small">Home Loan</span>
                        <span className="small">{formatPercent(breakdown.homeLoanShare)}</span>
                      </div>
                      <div className="progress" style={{ height: '6px' }}>
                        <div className="progress-bar bg-primary" style={{ width: `${breakdown.homeLoanShare}%` }}></div>
                      </div>
                    </div>
                  </div>
                  
                  {breakdown.hasDownPayment && (
                    <div className="d-flex align-items-center mb-2">
                      <div className="bg-info me-2" style={{ width: '15px', height: '15px', borderRadius: '3px' }}></div>
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between mb-1">
                          <span className="small">Down Payment</span>
                          <span className="small">{formatPercent(breakdown.downPaymentShare)}</span>
                        </div>
                        <div className="progress" style={{ height: '6px' }}>
                          <div className="progress-bar bg-info" style={{ width: `${breakdown.downPaymentShare}%` }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {breakdown.hasPersonalLoan1 && (
                    <div className="d-flex align-items-center mb-2">
                      <div className="bg-success me-2" style={{ width: '15px', height: '15px', borderRadius: '3px' }}></div>
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between mb-1">
                          <span className="small">Personal Loan 1</span>
                          <span className="small">{formatPercent(breakdown.personalLoan1Share)}</span>
                        </div>
                        <div className="progress" style={{ height: '6px' }}>
                          <div className="progress-bar bg-success" style={{ width: `${breakdown.personalLoan1Share}%` }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {breakdown.hasPersonalLoan2 && (
                    <div className="d-flex align-items-center">
                      <div className="bg-warning me-2" style={{ width: '15px', height: '15px', borderRadius: '3px' }}></div>
                      <div className="flex-grow-1">
                        <div className="d-flex justify-content-between mb-1">
                          <span className="small">Personal Loan 2</span>
                          <span className="small">{formatPercent(breakdown.personalLoan2Share)}</span>
                        </div>
                        <div className="progress" style={{ height: '6px' }}>
                          <div className="progress-bar bg-warning" style={{ width: `${breakdown.personalLoan2Share}%` }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="col-md-6">
                <div className="p-3">
                  <h6>Key Metrics</h6>
                  <div className="row g-2">
                    <div className="col-6">
                      <div className="p-2 bg-light rounded">
                        <small className="text-muted">Monthly EMI</small>
                        <div className="fw-bold">
                          {formatCurrency(breakdown.homeLoanEMI + breakdown.personalLoan1EMI + breakdown.personalLoan2EMI)}
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-2 bg-light rounded">
                        <small className="text-muted">Cash Invested</small>
                        <div className="fw-bold">{formatLakhs(breakdown.totalCashInvested)}</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-2 bg-light rounded">
                        <small className="text-muted">Interest Paid</small>
                        <div className="fw-bold">{formatLakhs(breakdown.totalInterestPaid)}</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-2 bg-light rounded">
                        <small className="text-muted">Net Position</small>
                        <div className={`fw-bold ${breakdown.netGainLoss >= 0 ? 'text-success' : 'text-danger'}`}>
                          {formatLakhs(breakdown.netGainLoss)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="row g-3 mb-5">
          <div className="col-md-6">
            <button 
              className="btn btn-primary w-100 py-3 d-flex align-items-center justify-content-center"
              onClick={() => setActiveTab('breakdown')}
            >
              <i className="bi bi-calculator me-3 fs-5"></i>
              <div className="text-start">
                <div className="fw-bold">Detailed Breakdown</div>
                <small className="opacity-75">View all financial calculations</small>
              </div>
            </button>
          </div>
          <div className="col-md-6">
            <button 
              className="btn btn-outline-primary w-100 py-3 d-flex align-items-center justify-content-center"
              onClick={() => setActiveTab('inputs')}
            >
              <i className="bi bi-pencil-square me-3 fs-5"></i>
              <div className="text-start">
                <div className="fw-bold">Edit Parameters</div>
                <small className="opacity-75">Modify inputs</small>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderBreakdownTab = () => {
    const breakdown = calculatedData.detailedBreakdown;
    const scenario = calculatedData.scenarioBreakdown;
    
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
          <div className="card-header bg-gradient-info d-flex justify-content-between align-items-center">
            <div>
              <h4 className="mb-0">
                <i className="bi bi-calculator me-2"></i>
                Detailed Financial Breakdown
              </h4>
              <small className="opacity-75">Complete calculation details</small>
            </div>
            <button 
              className="btn btn-light btn-sm"
              onClick={() => setActiveTab('overview')}
            >
              <i className="bi bi-arrow-left me-1"></i>
              Back to Overview
            </button>
          </div>
          <div className="card-body">
            
            {/* Monthly EMI Timeline Visualization */}
            <div className="row mb-4">
              <div className="col-12">
                <h5 className="mb-3">
                  <i className="bi bi-calendar-month text-info me-2"></i>
                  Monthly EMI Timeline
                </h5>
                <div className="row g-3">
                  {/* Timeline 1: Pre-Possession */}
                  <div className="col-md-6">
                    <div className="card h-100 border-primary">
                      <div className="card-header bg-primary text-white">
                        <h6 className="mb-0">
                          <i className="bi bi-calendar-week me-2"></i>
                          Timeline 1: Pre-Possession
                        </h6>
                        {breakdown.hasIDC && (
                          <small className="opacity-75">Includes Monthly IDC EMI during construction</small>
                        )}
                      </div>
                      <div className="card-body">
                        <div className="text-center mb-3">
                          <h3 className="text-primary fw-bold">{formatCurrency(breakdown.prePossessionEMI)}/month</h3>
                          <small className="text-muted">Monthly EMI during construction period</small>
                        </div>
                        <div className="row g-2">
                          <div className="col-6">
                            <div className="p-2 bg-light rounded">
                              <small className="text-muted">Period</small>
                              <div className="fw-bold">Month 0 to Month {breakdown.possessionMonths}</div>
                            </div>
                          </div>
                          <div className="col-6">
                            <div className="p-2 bg-light rounded">
                              <small className="text-muted">Duration</small>
                              <div className="fw-bold">{breakdown.prePossessionMonths} months</div>
                            </div>
                          </div>
                          <div className="col-12">
                            <div className="p-2 bg-light rounded">
                              <small className="text-muted">EMI Components</small>
                              <div className="row g-1">
                                <div className="col-6">
                                  <div className="p-2 border rounded bg-white">
                                    <small className="text-muted d-block">PL1 EMI</small>
                                    <div className="fw-bold">{formatCurrency(breakdown.personalLoan1EMI)}</div>
                                  </div>
                                </div>
                                {breakdown.hasIDC && breakdown.monthlyIDCEMI > 0 && (
                                  <div className="col-6">
                                    <div className="p-2 border rounded bg-warning bg-opacity-10">
                                      <small className="text-muted d-block">Monthly IDC EMI</small>
                                      <div className="fw-bold text-warning">{formatCurrency(breakdown.monthlyIDCEMI)}</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="col-12">
                            <div className="p-3 bg-primary text-white rounded text-center mt-2">
                              <small className="text-white">Total Pre-Possession EMI</small>
                              <div className="fw-bold fs-4">{formatCurrency(breakdown.prePossessionTotal)}</div>
                              <small className="text-white">
                                ({breakdown.prePossessionMonths} months × {formatCurrency(breakdown.prePossessionEMI)})
                              </small>
                              {breakdown.hasIDC && (
                                <div className="mt-2">
                                  <small className="text-white opacity-75">
                                    Includes {formatCurrency(breakdown.totalIDC)} total IDC over {breakdown.constructionMonths} months
                                  </small>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Timeline 2: Post-Possession */}
                  <div className="col-md-6">
                    <div className="card h-100 border-success">
                      <div className="card-header bg-success text-white">
                        <h6 className="mb-0">
                          <i className="bi bi-calendar-check me-2"></i>
                          Timeline 2: Post-Possession
                        </h6>
                      </div>
                      <div className="card-body">
                        <div className="text-center mb-3">
                          <h3 className="text-success fw-bold">{formatCurrency(breakdown.postPossessionEMI)}/month</h3>
                          <small className="text-muted">Monthly EMI after possession</small>
                        </div>
                        <div className="row g-2">
                          <div className="col-6">
                            <div className="p-2 bg-light rounded">
                              <small className="text-muted">Period</small>
                              <div className="fw-bold">
                                Month {breakdown.possessionMonths} to Month {breakdown.totalHoldingMonths}
                              </div>
                            </div>
                          </div>
                          <div className="col-6">
                            <div className="p-2 bg-light rounded">
                              <small className="text-muted">Duration</small>
                              <div className="fw-bold">{breakdown.postPossessionMonths} months</div>
                            </div>
                          </div>
                          <div className="col-12">
                            <div className="p-2 bg-light rounded">
                              <small className="text-muted">EMI Components</small>
                              <div className="row g-1">
                                <div className="col-4">
                                  <div className="p-2 border rounded bg-white">
                                    <small className="text-muted d-block">HL EMI</small>
                                    <div className="fw-bold">{formatCurrency(breakdown.homeLoanEMI)}</div>
                                  </div>
                                </div>
                                <div className="col-4">
                                  <div className="p-2 border rounded bg-white">
                                    <small className="text-muted d-block">PL1 EMI</small>
                                    <div className="fw-bold">{formatCurrency(breakdown.personalLoan1EMI)}</div>
                                  </div>
                                </div>
                                {breakdown.hasPersonalLoan2 && (
                                  <div className="col-4">
                                    <div className="p-2 border rounded bg-white">
                                      <small className="text-muted d-block">PL2 EMI</small>
                                      <div className="fw-bold">{formatCurrency(breakdown.personalLoan2EMI)}</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="col-12">
                            <div className="p-3 bg-success text-white rounded text-center mt-2">
                              <small className="text-white">Total Post-Possession EMI</small>
                              <div className="fw-bold fs-4">{formatCurrency(breakdown.postPossessionTotal)}</div>
                              <small className="text-white">
                                ({breakdown.postPossessionMonths} months × {formatCurrency(breakdown.postPossessionEMI)})
                              </small>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Summary Card */}
                <div className="row mt-3">
                  <div className="col-12">
                    <div className="p-3 bg-info text-white rounded">
                      <div className="d-flex justify-content-between align-items-center">
                        <div>
                          <h6 className="mb-1">Total EMI Commitment</h6>
                          <small>Combined across both timelines</small>
                          {breakdown.hasIDC && (
                            <div className="mt-2">
                              <small className="text-white opacity-75">
                                <i className="bi bi-info-circle me-1"></i>
                                Note: Monthly IDC EMI ({formatCurrency(breakdown.monthlyIDCEMI)}) is included in pre-possession calculation
                              </small>
                            </div>
                          )}
                        </div>
                        <div className="text-end">
                          <div className="fw-bold fs-4">
                            {formatCurrency(breakdown.totalEMIPaid)}
                          </div>
                          <small>
                            Pre: {formatCurrency(breakdown.prePossessionTotal)} + 
                            Post: {formatCurrency(breakdown.postPossessionTotal)}
                          </small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Interest During Construction (IDC) Details */}
            {breakdown.hasIDC && (
              <div className="row mb-4">
                <div className="col-12">
                  <h5 className="mb-3">
                    <i className="bi bi-calculator text-warning me-2"></i>
                    Interest During Construction (IDC) Details
                  </h5>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <div className="p-3 bg-warning text-white rounded text-center">
                        <small className="text-white">Monthly IDC EMI</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.monthlyIDCEMI)}</div>
                        <small className="text-white">Monthly interest payment during construction</small>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="p-3 bg-danger text-white rounded text-center">
                        <small className="text-white">Total IDC Amount</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.totalIDC)}</div>
                        <small className="text-white">Accumulated over {breakdown.constructionMonths} months</small>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="p-3 bg-info text-white rounded text-center">
                        <small className="text-white">Home Loan with IDC</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.totalHomeLoanAtCompletion)}</div>
                        <small className="text-white">
                          Principal: {formatCurrency(breakdown.homeLoanAmount)} + IDC: {formatCurrency(breakdown.totalIDC)}
                        </small>
                      </div>
                    </div>
                  </div>
                  <div className="alert alert-info mt-3">
                    <small>
                      <i className="bi bi-info-circle me-2"></i>
                      Monthly IDC EMI is calculated as: Home Loan Amount × (Home Loan Rate / 12). This interest accrues 
                      monthly during the construction period and is added to the home loan principal.
                    </small>
                  </div>
                </div>
              </div>
            )}

            {/* Home Loan Detailed Analysis */}
            <div className="row mb-4">
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
            {breakdown.hasPersonalLoan1 && (
              <div className="row mb-4">
                <div className="col-12">
                  <h5 className="mb-3">
                    <i className="bi bi-cash-coin text-success me-2"></i>
                    Personal Loan 1 Analysis
                  </h5>
                  <div className="row g-3">
                    <div className="col-md-3">
                      <div className="p-3 bg-primary text-white rounded text-center">
                        <small className="text-white">Total EMI per Month</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.personalLoan1EMI)}</div>
                        <small className="text-white">Monthly payment</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="p-3 bg-success text-white rounded text-center">
                        <small className="text-white">Total EMI Paid</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.personalLoan1EMIPaid)}</div>
                        <small className="text-white">{breakdown.pl1PaymentsMade} payments made</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="p-3 bg-warning text-white rounded text-center">
                        <small className="text-white">Total Interest Paid</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.personalLoan1InterestPaid)}</div>
                        <small className="text-white">Over {breakdown.pl1PaymentsMade} months</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="p-3 bg-danger text-white rounded text-center">
                        <small className="text-white">Total EMI Due</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.personalLoan1Outstanding)}</div>
                        <small className="text-white">Outstanding balance</small>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Personal Loan 2 Detailed Analysis */}
            {breakdown.hasPersonalLoan2 && (
              <div className="row mb-4">
                <div className="col-12">
                  <h5 className="mb-3">
                    <i className="bi bi-cash-coin text-warning me-2"></i>
                    Personal Loan 2 Analysis
                  </h5>
                  <div className="row g-3">
                    <div className="col-md-3">
                      <div className="p-3 bg-primary text-white rounded text-center">
                        <small className="text-white">Total EMI per Month</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.personalLoan2EMI)}</div>
                        <small className="text-white">Monthly payment</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="p-3 bg-success text-white rounded text-center">
                        <small className="text-white">Total EMI Paid</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.personalLoan2EMIPaid)}</div>
                        <small className="text-white">{breakdown.pl2PaymentsMade} payments made</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="p-3 bg-warning text-white rounded text-center">
                        <small className="text-white">Total Interest Paid</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.personalLoan2InterestPaid)}</div>
                        <small className="text-white">Over {breakdown.pl2PaymentsMade} months</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="p-3 bg-danger text-white rounded text-center">
                        <small className="text-white">Total EMI Due</small>
                        <div className="fw-bold fs-4">{formatCurrency(breakdown.personalLoan2Outstanding)}</div>
                        <small className="text-white">Outstanding balance</small>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Multiple Exit Price Scenarios */}
            <div className="row mb-4">
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
            <div className="row mb-4">
              <div className="col-12">
                <h5 className="mb-3">
                  <i className="bi bi-calculator text-info me-2"></i>
                  Total Loan Summary
                </h5>
                <div className="row g-3">
                  <div className="col-md-4">
                    <div className="p-3 bg-info text-white rounded text-center">
                      <small className="text-white">Total Monthly EMI</small>
                      <div className="fw-bold fs-4">
                        {formatCurrency(breakdown.homeLoanEMI + breakdown.personalLoan1EMI + breakdown.personalLoan2EMI)}
                      </div>
                      <small className="text-white">Combined monthly payment</small>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="p-3 bg-success text-white rounded text-center">
                      <small className="text-white">Total EMI Paid</small>
                      <div className="fw-bold fs-4">{formatCurrency(breakdown.totalEMIPaid)}</div>
                      <small className="text-white">Over {breakdown.years} years</small>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="p-3 bg-danger text-white rounded text-center">
                      <small className="text-white">Total Outstanding</small>
                      <div className="fw-bold fs-4">{formatCurrency(breakdown.totalLoanOutstanding)}</div>
                      <small className="text-white">Total loan balance due</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Interest Summary */}
            <div className="row mb-4">
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
                          <small className="text-white opacity-75">
                            <i className="bi bi-calculator me-1"></i>
                            Includes {formatLakhs(breakdown.totalIDC)} IDC
                          </small>
                        </div>
                      )}
                    </div>
                    <div className="text-end">
                      {breakdown.hasIDC && (
                        <div className="badge bg-white text-dark">IDC: {formatLakhs(breakdown.totalIDC)}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sale Analysis */}
            <div className="row mb-4">
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
            <div className="row">
              <div className="col-12">
                <h5 className="mb-3">
                  <i className="bi bi-cash-stack text-primary me-2"></i>
                  Net Position Analysis
                </h5>
                <div className={`p-4 rounded ${breakdown.netGainLoss >= 0 ? 'bg-success' : 'bg-danger'} text-white`}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <h4 className="fw-bold mb-1">
                        Net {breakdown.netGainLoss >= 0 ? 'Gain' : 'Loss'}
                      </h4>
                      <small>Cash after sale minus EMIs paid from income</small>
                    </div>
                    <div className="fs-1 fw-bold">
                      {formatLakhs(Math.abs(breakdown.netGainLoss))}
                      <div className="fs-6">{breakdown.netGainLoss >= 0 ? 'Profit' : 'Loss'}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Scenario Comparison */}
            {calculatedData.scenarioBreakdown && (
              <div className="row mt-4">
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
                            <td>{(userSelections.scenarioSize - userSelections.selectedPropertySize)} sq.ft</td>
                          </tr>
                          <tr>
                            <td>Exit Price</td>
                            <td>₹{userSelections.selectedExitPrice}/sq.ft</td>
                            <td>₹{userSelections.scenarioExitPrice}/sq.ft</td>
                            <td>₹{(userSelections.scenarioExitPrice - userSelections.selectedExitPrice)}/sq.ft</td>
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

  const renderThemeToggle = () => (
    <button
      className="btn btn-outline-secondary btn-sm"
      onClick={() => setIsDarkTheme(!isDarkTheme)}
    >
      <i className={`bi ${isDarkTheme ? 'bi-sun' : 'bi-moon'}`}></i>
      {isDarkTheme ? ' Light Theme' : ' Dark Theme'}
    </button>
  );

  const renderTabContent = () => {
    switch(activeTab) {
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
        <div className="position-absolute top-0 start-0 w-100 h-100" 
             style={{ background: 'radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.08) 0%, transparent 50%)' }}></div>
        <div className="position-absolute top-0 end-0 w-100 h-100" 
             style={{ background: 'radial-gradient(circle at 80% 20%, rgba(118, 75, 162, 0.08) 0%, transparent 50%)' }}></div>
      </div>

      <div className="container-fluid py-4">
        <div className="row justify-content-center">
          <div className="col-12 col-xxl-10">
            
            {/* Main Header */}
            <div className="text-center mb-4 pt-3">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div></div>
                <h1 className="display-5 fw-bold text-white mb-0">
                  <i className="bi bi-graph-up-arrow me-3"></i>
                  Property Investment Analyzer
                </h1>
                <div>{renderThemeToggle()}</div>
              </div>
              <p className="lead text-light opacity-90 mb-4">
                Comprehensive tool for real estate investment analysis
              </p>
              
              {/* Navigation Tabs */}
              <div className="glass-card mb-4">
                <div className="card-body p-2">
                  <div className="d-flex flex-wrap gap-2 justify-content-center">
                    <button 
                      className={`btn ${activeTab === 'inputs' ? 'btn-primary' : 'btn-outline-primary'} rounded-pill px-4`}
                      onClick={() => setActiveTab('inputs')}
                    >
                      <i className="bi bi-input-cursor me-2"></i>
                      Input Parameters
                    </button>
                    <button 
                      className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-outline-primary'} rounded-pill px-4`}
                      onClick={() => setActiveTab('overview')}
                    >
                      <i className="bi bi-speedometer2 me-2"></i>
                      Analysis Overview
                    </button>
                    <button 
                      className={`btn ${activeTab === 'breakdown' ? 'btn-primary' : 'btn-outline-primary'} rounded-pill px-4`}
                      onClick={() => setActiveTab('breakdown')}
                    >
                      <i className="bi bi-calculator me-2"></i>
                      Detailed Breakdown
                    </button>
                  </div>
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