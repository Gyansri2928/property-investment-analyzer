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
    // totalIDC, // We will recalculate this based on the filtered view
    possessionMonths,
    homeLoanAmount = 0,
    // ✅ NEW: Receive the user's holding period
    totalHoldingMonths
  } = location.state || {};

  const formatCurrency = (value) =>
    (!value && value !== 0) ? '₹0' : `₹${Math.round(value).toLocaleString()}`;

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
  // ⚙️ LOGIC: FILTER & RECALCULATE
  // ==========================================

  // 1. Determine Cutoff: Stop at the earlier of Possession OR Exit Month
  const holdingLimit = totalHoldingMonths ? parseInt(totalHoldingMonths) : possessionMonths;
  const cutoffMonth = Math.min(possessionMonths, holdingLimit);

  // 2. Filter the Schedule: Only show slabs released BEFORE or ON the cutoff month
  const filteredSchedule = idcSchedule.filter(row => row.releaseMonth <= cutoffMonth);

  // 3. Recalculate Summaries based on FILTERED data
  const disbursementPerSlab = idcSchedule.length > 0 ? homeLoanAmount / idcSchedule.length : 0;
  
  // Note: We sum up the interest cost of only the slabs that were actually released
  const grandTotalInterest = filteredSchedule.reduce((acc, row) => acc + row.interestCost, 0);

  // Base Interest for ONE single slab
  const baseSlabInterest = disbursementPerSlab * (9.0 / 100) / 12;

  // 4. Calculate Pure Interest Min/Max based on ACTIVE slabs count
  const minMonthlyInterest = filteredSchedule.length > 0 ? baseSlabInterest : 0; // First month (1 slab)
  const maxMonthlyInterest = baseSlabInterest * filteredSchedule.length; // Last active month

  return (
    <div className="property-comparison" style={{ minHeight: '100vh', position: 'relative' }}>

      <div className="page-background-handler"></div>

      <div className="container py-5 central-container" style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
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
        <div className="glass-card row g-4 mb-5">

          {/* Card 1: Total Interest (Filtered) */}
          <div className="col-md-6">
            <div className="glass-card p-4 h-100 border-start border-2 border-warning">
              <div className="d-flex align-items-center">
                <div className="rounded-circle bg-warning bg-opacity-25 p-3 me-3 text-warning">
                  <i className="bi bi-cash-stack fs-3"></i>
                </div>
                <div>
                  <small className="text-uppercase fw-bold opacity-75">Total Interest Cost</small>
                  <h3 className="fw-bold mt-1 mb-0">{formatCurrency(grandTotalInterest)}</h3>
                  <small className="text-muted" style={{fontSize: '0.7rem'}}>(For displayed period)</small>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Min Monthly IDC */}
          <div className="col-md-6">
            <div className="glass-card p-4 h-100 border-start border-2 border-success">
              <div className="d-flex align-items-center">
                <div className="rounded-circle bg-success bg-opacity-25 p-3 me-md-3 mb-2 mb-md-0 d-inline-block text-success">
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
                <div className="rounded-circle bg-info bg-opacity-25 p-3 me-3 text-info">
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
                <div className="rounded-circle bg-danger bg-opacity-25 p-3 me-3 text-danger">
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

        {/* --- TABLE (Using filteredSchedule) --- */}
        <div className="schedule-container">
          <div className="schedule-header">
            <i className="bi bi-table me-2"></i> Disbursement & IDC Breakdown
          </div>

          <div className="table-responsive">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th style={{ width: '10%', textAlign: 'center', textTransform: 'uppercase' }}>Payment #</th>
                  <th style={{ width: '15%', textAlign: 'center', textTransform: 'uppercase' }}>Month <br /><span className="fw-normal text-muted" style={{ fontSize: '0.7em' }}>(from booking)</span></th>
                  <th style={{ width: '15%', textAlign: 'right', color: '#0dcaf0', textTransform: 'uppercase' }}>Disbursement Amount (₹)</th>
                  <th style={{ width: '10%', textAlign: 'center', textTransform: 'uppercase' }}>Interest Rate (p.a.)</th>
                  <th style={{ width: '15%', textAlign: 'center', textTransform: 'uppercase' }}>Months to Possession</th>
                  <th style={{ width: '20%', textAlign: 'right', color: '#ffc107', textTransform: 'uppercase' }}>Monthly Interest (₹)</th>
                  <th style={{ width: '20%', textAlign: 'right', color: 'var(--brand-color)', textTransform: 'uppercase' }}>Total IDC (₹)</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedule.length > 0 ? (
                  filteredSchedule.map((row, idx) => {
                    const monthsToPossession = Math.max(0, possessionMonths - row.releaseMonth);
                    const cumulativeMonthlyInterest = baseSlabInterest * (idx + 1);

                    return (
                      <tr key={idx}>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{row.slabNo}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>{row.releaseMonth}</td>
                        <td style={{ textAlign: 'right', color: '#0dcaf0', fontWeight: '500' }}>{formatCurrency(disbursementPerSlab)}</td>
                        <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>9.00%</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--text-primary)' }}>{monthsToPossession}</td>
                        <td style={{ textAlign: 'right', color: '#ffc107', fontWeight: '500' }}>
                          {formatCurrency(cumulativeMonthlyInterest)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--brand-color)', background: 'rgba(102, 126, 234, 0.05)' }}>
                          {formatCurrency(row.interestCost)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="7" className="text-center py-4 text-muted">
                      No disbursements scheduled within this holding period.
                    </td>
                  </tr>
                )}
              </tbody>

              <tfoot className="schedule-tfoot">
                <tr>
                  <td colSpan="6" className="schedule-footer-cell" style={{ textAlign: 'right' }}>
                    <span className="small text-uppercase opacity-75" style={{ letterSpacing: '1px' }}>Total IDC Interest</span>
                  </td>
                  <td className="schedule-footer-cell" style={{ color: 'var(--brand-color)', fontSize: '1.2rem', textAlign: 'right' }}>
                    {formatCurrency(grandTotalInterest)}
                  </td>
                </tr>
              </tfoot>

            </table>
          </div>
        </div>

        {/* Note */}
        <div className="mt-4 p-3 rounded d-flex align-items-start" style={{ background: 'rgba(13, 202, 240, 0.1)', borderLeft: '4px solid #0dcaf0' }}>
          <i className="bi bi-info-circle-fill text-info me-3 mt-1 fs-5"></i>
          <div>
            <h6 className="mb-1 fw-bold" style={{ color: 'var(--text-primary)' }}>Note on Interest</h6>
            <p className="mb-0 small" style={{ color: 'var(--text-secondary)' }}>
              <strong>Monthly Interest</strong> represents the <em>variable</em> portion of your payment. You must add the fixed <strong>PL1 EMI ({formatCurrency(pl1EMI)})</strong> to this amount to know your total monthly outflow.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default IdcSchedulePage;