import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './PropertyComparison.css';

const IdcSchedulePage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // ✅ RECEIVE DATA DIRECTLY FROM BACKEND
  const {
    idcReport, // <--- The pre-calculated report
    pl1EMI,
    interestRate
  } = location.state || {};

  const formatCurrency = (val) =>
    (!val && val !== 0) ? '₹0' : `₹${Math.round(val).toLocaleString('en-IN')}`;

  if (!idcReport || !idcReport.schedule) {
    return (
      <div className="container py-5 text-center">
        <h3>No Data Found</h3>
        <button className="btn btn-primary mt-3" onClick={() => navigate('/')}>
          Go Back Home
        </button>
      </div>
    );
  }

  // Destructure for ease
  const { schedule, grandTotalInterest, minMonthlyInterest, maxMonthlyInterest, cutoffMonth } = idcReport;

  // Filter if needed (Backend should already filter, but safety check)
  const filteredSchedule = schedule.filter(row => row.releaseMonth <= cutoffMonth);

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
                  <th className="py-3 text-center bg-light">Interest Duration (Mos)</th>
                  <th className="py-3 text-end bg-light text-warning">Monthly<br />Interest (₹)</th>
                  <th className="py-3 text-end text-white" style={{ background: 'var(--brand-color)' }}>Total IDC (₹)</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedule.length > 0 ? (
                  filteredSchedule.map((row, idx) => {
                    return (
                      <tr key={idx}>
                        <td className="text-center fw-bold text-muted">{row.slabNo}</td>
                        <td className="text-center fw-bold">{row.releaseMonth}</td>
                        <td className="text-end fw-bold text-info">{formatCurrency(row.amount)}</td>
                        <td className="text-center small text-muted">{Number(interestRate).toFixed(2)}%</td>
                        <td className="text-center fw-bold text-secondary">{row.duration}</td>
                        <td className="text-end fw-bold text-warning" style={{ background: 'rgba(255, 193, 7, 0.05)' }}>
                          {formatCurrency(row.cumulativeMonthlyInterest)}
                        </td>
                        <td className="text-end fw-bold text-white" style={{ background: 'var(--brand-color)' }}>
                          {formatCurrency(row.totalCostForSlab)}
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