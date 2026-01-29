import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './PropertyComparison.css';

const IdcSchedulePage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // 1. Retrieve Data
  const {
    idcSchedule,
    pl1EMI,
    possessionMonths,
    homeLoanAmount = 0,
    totalHoldingMonths,
    lastBankDisbursementMonth,
    interestRate = 9.0,
    homeLoanStartMode,
    manualStartMonth
  } = location.state || {};

  const formatCurrency = (value) =>
    (!value && value !== 0) ? '₹0' : `₹${Math.round(value).toLocaleString()}`;

  // --- NEW LOGIC: Define Interest End Point ---
  // Default is Possession. 
  // If Last Disbursement Month is set (Smart Saver), interest stops there.
  let interestEndMonth = possessionMonths;

  if (lastBankDisbursementMonth) {
    interestEndMonth = parseInt(lastBankDisbursementMonth);
  }
  // Also check Manual Start (overrides if present)
  if (location.state?.homeLoanStartMode === 'manual' && location.state?.manualStartMonth) {
    interestEndMonth = parseInt(location.state.manualStartMonth) - 1;
  }

  if (!idcSchedule) {
    return (
      <div className="container py-5 text-center">
        <h3>No Data Found</h3>
        <button className="btn btn-primary mt-3" onClick={() => navigate('/')}>
          Go Back Home
        </button>
      </div>
    );
  }

  // ==========================================
  // ⚙️ LOGIC: ALIGNED WITH MONTHLY BREAKDOWN
  // ==========================================

  // 1. ✅ CRITICAL FIX: Calculate Slab Amount Robustly
  // We strictly divide the Total Loan by the Number of Slabs in the schedule.
  // This ensures that if the schedule is compressed to 6 slabs (18 months), 
  // the slab amount correctly increases (e.g., 16L / 6 = ₹2.66L).
  const disbursementPerSlab = idcSchedule.length > 0 ? homeLoanAmount / idcSchedule.length : 0;

  // 2. Determine Cutoff Limits
  const holdingLimit = totalHoldingMonths ? parseInt(totalHoldingMonths) : possessionMonths;

  const derivedLastMonth = idcSchedule.length > 0
    ? Math.max(...idcSchedule.map(s => s.releaseMonth))
    : possessionMonths;

  const fundingEndMonth = lastBankDisbursementMonth
    ? parseInt(lastBankDisbursementMonth)
    : derivedLastMonth;

  // --- NEW LOGIC: DETERMINE INTEREST CUTOFF ---
  // If Manual Mode (Smart Saver), interest stops BEFORE the Home Loan EMI starts.
  // Otherwise, it stops at Possession.
  let interestCutoffMonth = possessionMonths;
  if (homeLoanStartMode === 'manual' && manualStartMonth) {
    // OLD: interestCutoffMonth = parseInt(manualStartMonth) - 1; (Stops at 18)

    // NEW: Allow interest for the 18th month itself.
    // If EMI starts M19, IDC runs M1 to M18.
    interestCutoffMonth = parseInt(manualStartMonth);
  }

  // 3. Filter Schedule (Visual Cutoff only)
  const cutoffMonth = Math.min(fundingEndMonth, holdingLimit);
  const filteredSchedule = idcSchedule.filter(row => row.releaseMonth <= cutoffMonth);

  // 4. Calculate Interest Variables
  // Base Interest = (Slab Amount * Rate) / 12
  const baseSlabInterest = disbursementPerSlab * (interestRate / 100) / 12;

  // 5. Calculate Grand Total (Summing row-by-row for precision)
  const grandTotalInterest = filteredSchedule.reduce((acc, row) => {

    // STOPPER: If slab is released AFTER the cutoff, 0 Interest.
    if (row.releaseMonth > interestEndMonth) return acc;

    // FIX: Calculate duration up to 'interestEndMonth', NOT 'possessionMonths'
    const duration = Math.max(0, interestEndMonth - row.releaseMonth + 1);

    return acc + (baseSlabInterest * duration);
  }, 0);

  // 6. Summary Stats
  const minMonthlyInterest = filteredSchedule.length > 0 ? baseSlabInterest : 0;
  const maxMonthlyInterest = baseSlabInterest * filteredSchedule.length;

  return (
    <div className="property-comparison" style={{ minHeight: '100vh', position: 'relative' }}>

      <div className="page-background-handler"></div>

      <div className="container py-5 central-container" style={{ position: 'relative', zIndex: 1 }}>

        <div className="d-flex justify-content-between align-items-center mb-5">
          <div>
            <h2 className="fw-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              <i className="bi bi-calendar-week me-3"></i>Construction Schedule
            </h2>
            <p className="mb-0" style={{ color: 'var(--text-secondary)' }}>
              Breakdown up to Month {cutoffMonth} <span className="text-muted small">(Exit/Possession)</span>
            </p>
          </div>
          <button
            className="btn btn-outline-primary rounded-pill px-4 btn-sm"
            onClick={() => navigate('/', { state: { returnTab: 'breakdown' } })}
          >
            <i className="bi bi-arrow-left me-2"></i>Back to Dashboard
          </button>
        </div>

        {/* --- SUMMARY CARDS --- */}
        <div className="glass-card row g-4 mb-5 p-4">

          {/* Card 1: Total Interest */}
          <div className="col-md-6">
            <div className="glass-card p-4 h-100 border-start border-2 border-warning">
              <div className="d-flex align-items-center">
                <div className="rounded-circle bg-warning bg-opacity-10 p-3 me-3 text-warning">
                  <i className="bi bi-cash-stack fs-3"></i>
                </div>
                <div>
                  <small className="text-uppercase fw-bold opacity-75">Total Interest Cost</small>
                  <h3 className="fw-bold mt-1 mb-0">{formatCurrency(grandTotalInterest)}</h3>
                  <small className="text-muted" style={{ fontSize: '0.7rem' }}>(Until Possession)</small>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Min Monthly IDC */}
          <div className="col-md-6">
            <div className="glass-card p-4 h-100 border-start border-2 border-success">
              <div className="d-flex align-items-center">
                <div className="rounded-circle bg-success bg-opacity-10 p-3 me-md-3 mb-2 mb-md-0 d-inline-block text-success">
                  <i className="bi bi-arrow-down-circle fs-3"></i>
                </div>
                <div>
                  <small className="text-uppercase fw-bold opacity-75 d-block">Min Monthly IDC</small>
                  <h3 className="fw-bold mt-1 mb-0">{formatCurrency(minMonthlyInterest)}</h3>
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
                  <small className="text-uppercase fw-bold opacity-75">Fixed PL1 EMI</small>
                  <h3 className="fw-bold mt-1 mb-0">{formatCurrency(pl1EMI)}</h3>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Max Monthly IDC */}
          <div className="col-md-6">
            <div className="glass-card p-4 h-100 border-start border-2 border-danger">
              <div className="d-flex align-items-center">
                <div className="rounded-circle bg-danger bg-opacity-10 p-3 me-3 text-danger">
                  <i className="bi bi-arrow-up-circle fs-3"></i>
                </div>
                <div>
                  <small className="text-uppercase fw-bold opacity-75">Max Monthly IDC</small>
                  <h3 className="fw-bold mt-1 mb-0">{formatCurrency(maxMonthlyInterest)}</h3>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- TABLE --- */}
        <div className="schedule-container">
          <div className="table-responsive">
            <table className="schedule-table table-hover">
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th className="py-3 text-center bg-light">Payment #</th>
                  <th className="py-3 text-center bg-light">Month<br /><small className="text-muted fw-normal">(from booking)</small></th>
                  <th className="py-3 text-end bg-light text-info">Disbursement (₹)</th>
                  <th className="py-3 text-center bg-light">Rate</th>
                  <th className="py-3 text-center bg-light">
                    {interestEndMonth < possessionMonths ? (
                      <>Interest<br />Duration (Mos)</>
                    ) : (
                      <>Months to<br />Possession</>
                    )}
                  </th>
                  <th className="py-3 text-end bg-light text-warning">Monthly<br />Interest (₹)</th>
                  <th className="py-3 text-end text-white" style={{ background: 'var(--brand-color)' }}>Total IDC (₹)</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedule.length > 0 ? (
                  filteredSchedule.map((row, idx) => {

                    // FIX: Use 'interestEndMonth' instead of 'possessionMonths'
                    // Also check if release is valid
                    let interestDuration = 0;
                    if (row.releaseMonth <= interestEndMonth) {
                      interestDuration = Math.max(0, interestEndMonth - row.releaseMonth + 1);
                    }

                    // Cumulative Monthly Interest = Base Interest * Active Slabs (idx + 1)
                    const cumulativeMonthlyInterest = baseSlabInterest * (idx + 1);

                    // Total Cost for this specific slab
                    const totalCostForSlab = baseSlabInterest * interestDuration;
                    return (
                      <tr key={idx}>
                        <td className="text-center fw-bold text-muted">{row.slabNo}</td>
                        <td className="text-center fw-bold">{row.releaseMonth}</td>
                        <td className="text-end fw-bold text-info">{formatCurrency(disbursementPerSlab)}</td>
                        <td className="text-center small text-muted">{Number(interestRate).toFixed(2)}%</td>
                        <td className="text-center fw-bold text-secondary">{interestDuration}</td>
                        <td className="text-end fw-bold text-warning" style={{ background: 'rgba(255, 193, 7, 0.05)' }}>
                          {formatCurrency(cumulativeMonthlyInterest)}
                        </td>
                        <td className="text-end fw-bold text-white" style={{ background: 'var(--brand-color)' }}>
                          {formatCurrency(totalCostForSlab)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" className="text-center py-5 text-muted">
                      No disbursements scheduled within this period.
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredSchedule.length > 0 && (
                <tfoot style={{ borderTop: '2px solid #dee2e6' }}>
                  <tr>
                    <td colSpan="6" className="text-end py-3">
                      <span className="text-uppercase small fw-bold text-muted me-3">Total IDC Interest Accumulated</span>
                    </td>
                    <td className="text-end py-3 fw-bold fs-5" style={{ color: 'var(--brand-color)' }}>
                      {formatCurrency(grandTotalInterest)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Note */}
        <div className="mt-4 alert alert-info d-flex align-items-start border-0 shadow-sm" style={{ background: 'rgba(13, 202, 240, 0.1)' }}>
          <i className="bi bi-info-circle-fill text-info me-3 mt-1 fs-5"></i>
          <div>
            <h6 className="mb-1 fw-bold">Understanding Monthly Outflow</h6>
            <p className="mb-0 small text-secondary">
              The <strong>Monthly Interest</strong> shown above is variable. To calculate your actual monthly check, add the fixed <strong>PL1 EMI ({formatCurrency(pl1EMI)})</strong> to the monthly interest column.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default IdcSchedulePage;