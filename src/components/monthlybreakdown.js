import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './PropertyComparison.css';

const MonthlyBreakdownPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    idcSchedule,
    pl1EMI,
    possessionMonths,
    homeLoanAmount,
    propertyName,
    interestRate = 9.0,
    lastBankDisbursementMonth,
    homeLoanTerm = 20,
    homeLoanStartMode,
    manualStartMonth
  } = location.state || {};

  const formatCurrency = (val) => val ? `₹${Math.round(val).toLocaleString()}` : '₹0';

  if (!idcSchedule) return <div className="p-5 text-center text-white">No Data Found</div>;

  // ==========================================
  // 1. CALCULATE FULL EMI
  // ==========================================
  const calculateFullEMI = () => {
    const principal = homeLoanAmount;
    const monthlyRate = interestRate / 12 / 100;
    const months = homeLoanTerm * 12;
    if (monthlyRate === 0) return principal / months;
    return (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
      (Math.pow(1 + monthlyRate, months) - 1);
  };

  const fullHomeLoanEMI = calculateFullEMI();

  // ==========================================
  // 2. SETUP TIMELINES
  // ==========================================
  const derivedLastMonth = idcSchedule.length > 0
    ? Math.max(...idcSchedule.map(s => s.releaseMonth))
    : possessionMonths;

  const fundingEndMonth = lastBankDisbursementMonth
    ? parseInt(lastBankDisbursementMonth)
    : derivedLastMonth;

  let actualHLStartMonth;
  if (homeLoanStartMode === 'manual') {
    actualHLStartMonth = (manualStartMonth !== undefined && manualStartMonth !== null)
      ? parseInt(manualStartMonth)
      : 0;
  } else {
    actualHLStartMonth = fundingEndMonth + 1;
  }

  const tableEndMonth = parseInt(possessionMonths);

  // ==========================================
  // 3. GENERATE DATA
  // ==========================================
  const monthlyData = [];
  const slabAmount = homeLoanAmount / idcSchedule.length;

  let cumulativeDisbursement = 0;
  let outstandingBalance = 0;
  let activeSlabs = 0;

  for (let m = 0; m <= tableEndMonth; m++) {

    let currentDisbursement = 0;
    let interestForThisMonth = 0;
    let principalRepaidThisMonth = 0;

    // A. DISBURSEMENT
    if (m <= fundingEndMonth) {
      const isScheduleMonth = idcSchedule.some(s => s.releaseMonth === m);
      if (isScheduleMonth && cumulativeDisbursement < homeLoanAmount) {
        currentDisbursement = slabAmount;
        cumulativeDisbursement += slabAmount;

        // In Standard mode, Outstanding = Cumulative (until repayment starts)
        // In Manual mode, Outstanding tracks actual debt
        if (homeLoanStartMode === 'manual') {
          outstandingBalance += slabAmount;
        } else {
          outstandingBalance = cumulativeDisbursement;
        }

        activeSlabs++;
      }
    }

    // B. INTEREST
    if (outstandingBalance > 0) {
      interestForThisMonth = (outstandingBalance * (interestRate / 100)) / 12;
    }

    // C. PAYMENT
    let hlPayment = 0;
    let isFullEMI = false;

    if (m >= actualHLStartMonth) {
      // FULL EMI PHASE
      hlPayment = fullHomeLoanEMI;
      isFullEMI = true;

      if (outstandingBalance > 0) {
        principalRepaidThisMonth = Math.max(0, hlPayment - interestForThisMonth);
        outstandingBalance -= principalRepaidThisMonth;
      }
    } else {
      // PRE-EMI PHASE
      if (homeLoanStartMode === 'manual') {
        hlPayment = 0;
        // In manual, unpaid interest might capitalize, but here we keep it simple
      } else {
        // Standard: Pay exactly the interest
        hlPayment = interestForThisMonth;
        principalRepaidThisMonth = 0;
      }
    }

    const currentPL1 = m === 0 ? 0 : pl1EMI;

    monthlyData.push({
      month: m,
      disbursement: currentDisbursement,
      activeSlabs: m > fundingEndMonth ? 'Max' : activeSlabs,
      cumulativeDisbursement: cumulativeDisbursement, // Needed for Standard Table
      outstandingBalance: Math.max(0, outstandingBalance),
      hlComponent: hlPayment,
      interestPart: interestForThisMonth,
      principalPart: principalRepaidThisMonth,
      isFullEMI: isFullEMI,
      pl1: currentPL1,
      totalOutflow: hlPayment + currentPL1
    });
  }

  // ==========================================
  // 4. SUMMARY CALCULATIONS
  // ==========================================
  const grandTotalOutflow = monthlyData.reduce((acc, row) => acc + row.totalOutflow, 0);
  const outflowValues = monthlyData.map(d => d.totalOutflow).filter(val => val > 0);
  const minTotalOutflow = outflowValues.length > 0 ? Math.min(...outflowValues) : 0;
  const maxTotalOutflow = outflowValues.length > 0 ? Math.max(...outflowValues) : 0;
  const finalBalance = monthlyData[monthlyData.length - 1]?.outstandingBalance || 0;
  const totalPrincipalRepaid = homeLoanAmount - finalBalance;

  // Helper to render summary cards
  const renderSummaryCard = (title, value, subtext, color, icon) => (
    <div className="col-md-6 col-lg-3">
      <div className={`glass-card p-3 h-100 border-start border-2 border-${color}`}>
        <div className="d-flex align-items-center">
          <div className={`rounded-circle bg-${color} bg-opacity-10 p-3 me-3 text-${color} d-flex align-items-center justify-content-center`} style={{ width: '50px', height: '50px' }}>
            <i className={`bi ${icon} fs-4`}></i>
          </div>
          <div>
            <small className="text-uppercase fw-bold text-white-50 d-block mb-1" style={{ fontSize: '0.65rem' }}>{title}</small>
            <h4 className={`fw-bold mb-0 text-${color}`}>{value}</h4>
            <small className="text-white-50" style={{ fontSize: '0.7rem' }}>{subtext}</small>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="property-comparison" style={{ minHeight: '100vh', position: 'relative' }}>
      <div className="page-background-handler"></div>

      <div className="container py-5 central-container" style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div className="glass-card p-4 mb-4">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h4 className="fw-bold gradient-text mb-1">Monthly Cashflow Ledger</h4>
              <p className="text-muted mb-0 small">
                Combined PL1 + HL Breakdown for <span className="fw-bold text-primary">{propertyName}</span>
                <span className="ms-2 badge bg-light text-secondary border">Month 0 - {tableEndMonth} (Possession)</span>
              </p>

              <div className="mt-2 d-flex gap-2 align-items-center">
                <span className={`badge border shadow-sm ${homeLoanStartMode === 'manual' ? 'bg-primary text-white' : 'bg-warning text-dark'}`}>
                  <i className="bi bi-gear-wide-connected me-1"></i>
                  {homeLoanStartMode === 'manual' ? 'Manual Strategy' : 'Standard CLP'}
                </span>
                <small className="text-muted ms-1">
                  Sanctioned Loan: <strong>{formatCurrency(homeLoanAmount)}</strong>
                </small>
              </div>
            </div>
            <button
              className="btn btn-outline-primary rounded-pill px-4 btn-sm"
              onClick={() => navigate('/', { state: { returnTab: 'breakdown' } })}
            >
              <i className="bi bi-arrow-left me-2"></i>Back
            </button>
          </div>
        </div>

        {/* 📊 SUMMARY CARDS */}
        <div className="glass-card mb-5 p-4">
          <div className="row g-4">

            <div className="col-md-6">
              <div className="glass-card p-4 h-100 border-start border-2 border-warning">
                <div className="d-flex align-items-center">
                  <div className="rounded-circle bg-warning bg-opacity-10 p-3 me-3 text-warning">
                    <i className="bi bi-cash-stack fs-3"></i>
                  </div>
                  <div>
                    <small className="text-uppercase fw-bold text-muted opacity-75">Total Outflow (IDC + PL1)</small>
                    <h3 className="fw-bold mt-1 mb-0">{formatCurrency(grandTotalOutflow)}</h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Min Total Outflow */}
            <div className="col-md-6">
              <div className="glass-card p-4 h-100 border-start border-2 border-success">
                <div className="d-flex align-items-center">
                  <div className="rounded-circle bg-success bg-opacity-10 p-3 me-3 text-success">
                    <i className="bi bi-arrow-down-circle fs-3"></i>
                  </div>
                  <div>
                    <small className="text-uppercase fw-bold text-muted opacity-75 d-block">Min Monthly Outflow</small>
                    <h3 className="fw-bold mt-1 mb-0">{formatCurrency(minTotalOutflow)}</h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Fixed PL1 */}
            <div className="col-md-6">
              <div className="glass-card p-4 h-100 border-start border-2 border-info">
                <div className="d-flex align-items-center">
                  <div className="rounded-circle bg-info bg-opacity-10 p-3 me-3 text-info">
                    <i className="bi bi-wallet2 fs-3"></i>
                  </div>
                  <div>
                    <small className="text-uppercase fw-bold text-muted opacity-75">Fixed PL1 EMI Component</small>
                    <h3 className="fw-bold mt-1 mb-0">{formatCurrency(pl1EMI)}</h3>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 4: Max Total Outflow */}
            <div className="col-md-6">
              <div className="glass-card p-4 h-100 border-start border-2 border-danger">
                <div className="d-flex align-items-center">
                  <div className="rounded-circle bg-danger bg-opacity-10 p-3 me-3 text-danger">
                    <i className="bi bi-arrow-up-circle fs-3"></i>
                  </div>
                  <div>
                    <small className="text-uppercase fw-bold text-muted opacity-75">Max Monthly Outflow</small>
                    <h3 className="fw-bold mt-1 mb-0">{formatCurrency(maxTotalOutflow)}</h3>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* The Table - Conditionally Rendered based on Mode */}
        <div className="schedule-container">
          <div className="table-responsive">

            {homeLoanStartMode === 'manual' ? (
              // ==========================
              // MANUAL MODE TABLE
              // ==========================
              <table className="schedule-table table-hover" style={{ fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr className="text-center align-middle">
                    <th className="py-3" style={{ width: '5%' }}>Month</th>
                    <th className="py-3" style={{ width: '15%' }}>Disbursement<br />(Bank Releases)</th>
                    <th className="py-3" style={{ width: '15%', color: '#0dcaf0' }}>Net Loan<br />Balance (₹)</th>
                    <th className="py-3" style={{ width: '10%', color: '#ffc107' }}>Interest<br />Portion</th>
                    <th className="py-3" style={{ width: '15%' }}>HL Payment<br /><small className="text-muted fw-normal">(Total EMI)</small></th>
                    <th className="py-3" style={{ width: '10%' }}>PL-1<br />EMI</th>
                    <th className="py-3 text-white" style={{ width: '15%', background: 'var(--brand-color)' }}>TOTAL<br />OUTFLOW</th>
                  </tr>
                </thead>
                <tbody className="text-center align-middle">
                  {monthlyData.map((row) => (
                    <tr key={row.month} style={row.disbursement > 0 ? { background: 'rgba(13, 202, 240, 0.05)' } : {}}>
                      <td className="fw-bold text-muted">{row.month}</td>
                      <td className="text-muted">
                        {row.disbursement > 0 ? (
                          <div><span className="text-info fw-bold">{formatCurrency(row.disbursement)}</span></div>
                        ) : '-'}
                      </td>
                      <td style={{ color: '#0dcaf0', fontWeight: '600' }}>{formatCurrency(row.outstandingBalance)}</td>
                      <td style={{ color: '#e0a800', fontWeight: '500' }}>{row.interestPart > 0 ? formatCurrency(row.interestPart) : '-'}</td>
                      <td className="fw-bold" style={{ color: row.isFullEMI ? '#198754' : '#aaa' }}>
                        {formatCurrency(row.hlComponent)}
                        {row.isFullEMI && row.principalPart > 0 && (
                          <div style={{ fontSize: '0.65rem', color: '#198754', opacity: 0.8 }}>(Principal: {formatCurrency(row.principalPart)})</div>
                        )}
                      </td>
                      <td className="text-muted">{formatCurrency(row.pl1)}</td>
                      <td className="fw-bold text-white" style={{ background: 'var(--brand-color)' }}>{formatCurrency(row.totalOutflow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              // ==========================
              // STANDARD (DEFAULT) MODE TABLE
              // ==========================
              <table className="schedule-table table-hover" style={{ fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr className="text-center align-middle">
                    <th className="py-3" style={{ width: '5%' }}>Month</th>
                    <th className="py-3" style={{ width: '15%' }}>Disbursement<br />Amount (₹)</th>
                    <th className="py-3" style={{ width: '10%' }}>Active<br />Slabs</th>
                    <th className="py-3" style={{ width: '15%', color: '#0dcaf0' }}>Cumulative<br />Loan (₹)</th>
                    <th className="py-3" style={{ width: '10%' }}>Rate<br />(p.a.)</th>
                    <th className="py-3" style={{ width: '15%' }}>Hl EMI/<br />IDC (₹)</th>
                    <th className="py-3" style={{ width: '15%' }}>PL-1<br />EMI (₹)</th>
                    <th className="py-3 text-white" style={{ width: '15%', background: 'var(--brand-color)' }}>TOTAL<br />OUTFLOW (₹)</th>
                  </tr>
                </thead>
                <tbody className="text-center">
                  {monthlyData.map((row) => (
                    <tr key={row.month} style={row.disbursement > 0 ? { background: 'rgba(13, 202, 240, 0.05)' } : {}}>
                      <td className="fw-bold">{row.month}</td>
                      <td className="text-muted">
                        {row.disbursement > 0 ? <span className="text-muted fw-bold">{formatCurrency(row.disbursement)}</span> : '-'}
                      </td>
                      <td className="text-muted">{row.activeSlabs}</td>
                      <td style={{ color: '#0dcaf0', fontWeight: '500' }}>{formatCurrency(row.cumulativeDisbursement)}</td>
                      <td className="text-muted small">{interestRate}%</td>
                      <td className="fw-bold" style={{ color: row.isFullEMI ? '#198754' : '#aaa' }}>
                        {formatCurrency(row.hlComponent)}
                        {/* ✅ Badge to the RIGHT */}
                        {row.isFullEMI && <span className="badge bg-success bg-opacity-10 text-success ms-2" style={{ fontSize: '0.6rem' }}>Full EMI</span>}
                      </td>
                      <td className="text-muted">{formatCurrency(row.pl1)}</td>
                      <td className="fw-bold text-white" style={{ background: 'var(--brand-color)' }}>
                        {formatCurrency(row.totalOutflow)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyBreakdownPage;