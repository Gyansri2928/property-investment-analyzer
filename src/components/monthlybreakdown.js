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
    interestRate = 9.0
  } = location.state || {};

  const formatCurrency = (val) => val ? `₹${Math.round(val).toLocaleString()}` : '₹0';

  if (!idcSchedule) return <div className="p-5 text-center">No Data Found</div>;

  // ==========================================
  // ⚙️ LOGIC: GENERATE MONTH-WISE DATA
  // ==========================================
  const monthlyData = [];
  const slabAmount = homeLoanAmount / idcSchedule.length;
  let cumulativeDisbursement = 0;
  let activeSlabs = 0;

  for (let m = 0; m <= possessionMonths; m++) {
    const isDisbursementMonth = idcSchedule.some(s => s.releaseMonth === m);

    if (isDisbursementMonth) {
      cumulativeDisbursement += slabAmount;
      activeSlabs++;
    }

    // Monthly IDC (Pure Interest)
    const monthlyIDC = (cumulativeDisbursement * (interestRate / 100)) / 12;

    // PL1 EMI starts usually from Month 1
    const currentPL1 = m === 0 ? 0 : pl1EMI;

    monthlyData.push({
      month: m,
      disbursement: isDisbursementMonth ? slabAmount : 0,
      activeSlabs,
      cumulativeDisbursement,
      monthlyIDC,
      pl1: currentPL1,
      totalOutflow: monthlyIDC + currentPL1
    });
  }

  // ==========================================
  // 📊 LOGIC: SUMMARY CARD CALCULATIONS (UPDATED)
  // ==========================================

  // 1. Grand Total Outflow (Sum of all Monthly Outflows)
  const grandTotalOutflow = monthlyData.reduce((acc, row) => acc + row.totalOutflow, 0);

  // 2. Outflow Values (Filter out 0s to find true min/max)
  const outflowValues = monthlyData.map(d => d.totalOutflow).filter(val => val > 0);

  const minTotalOutflow = outflowValues.length > 0 ? Math.min(...outflowValues) : 0;
  const maxTotalOutflow = outflowValues.length > 0 ? Math.max(...outflowValues) : 0;

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
                Combined PL1 + IDC Breakdown for <span className="fw-bold text-primary">{propertyName}</span>
              </p>
            </div>
            <button
              className="btn btn-outline-primary rounded-pill px-4 btn-sm"
              // ✅ Use this explicit navigation with state
              onClick={() => navigate('/', { state: { returnTab: 'breakdown' } })}
            >
              <i className="bi bi-arrow-left me-2"></i>Back
            </button>
          </div>
        </div>

        {/* 📊 NEW SUMMARY CARDS SECTION */}
        <div className="glass-card mb-5 p-4">
          <div className="row g-4">

            {/* Card 1: Grand Total Outflow */}
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

            {/* Card 3: Fixed PL1 (Kept for reference) */}
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

        {/* The Excel-like Table */}
        <div className="schedule-container">
          <div className="table-responsive">
            <table className="schedule-table table-hover" style={{ fontSize: '0.85rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr className="text-center align-middle">
                  <th className="py-3" style={{ width: '5%', background: '#e9ecef' }}>Month</th>
                  <th className="py-3" style={{ width: '15%' }}>Disbursement<br />Amount (₹)</th>
                  <th className="py-3" style={{ width: '10%' }}>Active<br />Slabs</th>
                  <th className="py-3" style={{ width: '15%', color: '#0dcaf0' }}>Cumulative<br />Loan (₹)</th>
                  <th className="py-3" style={{ width: '10%' }}>Rate<br />(p.a.)</th>
                  <th className="py-3" style={{ width: '15%', background: '#fff3cd' }}>Monthly<br />IDC (₹)</th>
                  <th className="py-3" style={{ width: '15%' }}>PL-1<br />EMI (₹)</th>
                  <th className="py-3 text-white" style={{ width: '15%', background: 'var(--brand-color)' }}>TOTAL<br />OUTFLOW (₹)</th>
                </tr>
              </thead>
              <tbody className="text-center">
                {monthlyData.map((row) => (
                  <tr key={row.month} style={row.disbursement > 0 ? { background: 'rgba(13, 202, 240, 0.05)' } : {}}>
                    {/* Month */}
                    <td className="fw-bold">{row.month}</td>
                    {/* Disbursement */}
                    <td className="text-secondary">
                      {row.disbursement > 0 ? <span className="text-dark fw-bold">{formatCurrency(row.disbursement)}</span> : '-'}
                    </td>
                    {/* Active Slabs */}
                    <td className="text-muted">{row.activeSlabs}</td>
                    {/* Cumulative */}
                    <td style={{ color: '#0dcaf0', fontWeight: '500' }}>{formatCurrency(row.cumulativeDisbursement)}</td>
                    {/* Rate */}
                    <td className="text-muted small">{interestRate}%</td>
                    {/* Monthly IDC */}
                    <td className="fw-bold" style={{ color: '#b08d00', background: 'rgba(255, 193, 7, 0.05)' }}>
                      {formatCurrency(row.monthlyIDC)}
                    </td>
                    {/* PL1 */}
                    <td className="text-muted">{formatCurrency(row.pl1)}</td>
                    {/* Total Outflow */}
                    <td className="fw-bold text-white" style={{ background: 'var(--brand-color)' }}>
                      {formatCurrency(row.totalOutflow)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyBreakdownPage;