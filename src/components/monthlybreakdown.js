import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './PropertyComparison.css';

const MonthlyBreakdownPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // ✅ RECEIVE PRE-CALCULATED DATA
  // We now expect 'monthlyLedger' in the state, passed from the main page
  const {
    monthlyLedger, // <--- This comes from Backend now!
    propertyName,
    homeLoanAmount,
    homeLoanStartMode,
    possessionMonths
  } = location.state || {};

  const formatCurrency = (val) => {
    if (val === undefined || val === null) return '₹0';
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  };

  if (!monthlyLedger || monthlyLedger.length === 0) {
    return (
      <div className="p-5 text-center">
        <h4 className="text-muted">No Data Found</h4>
        <button className="btn btn-primary mt-3" onClick={() => navigate('/')}>Back</button>
      </div>
    );
  }

  // Calculate Summaries for the Cards (from the data we received)
  const grandTotalOutflow = monthlyLedger.reduce((acc, row) => acc + row.totalOutflow, 0);
  const outflowValues = monthlyLedger.filter(d => d.totalOutflow > 0).map(d => d.totalOutflow);
  const minTotalOutflow = outflowValues.length > 0 ? Math.min(...outflowValues) : 0;
  const maxTotalOutflow = outflowValues.length > 0 ? Math.max(...outflowValues) : 0;
  
  // Find the constant PL1 amount (usually from the first active month)
  const pl1Sample = monthlyLedger.find(r => r.pl1 > 0)?.pl1 || 0;

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
                <span className="ms-2 badge bg-light text-secondary border">Month 0 - {possessionMonths}</span>
              </p>
            </div>
            <button className="btn btn-outline-primary rounded-pill px-4 btn-sm" onClick={() => navigate('/', { state: { returnTab: 'breakdown' } })}>
              <i className="bi bi-arrow-left me-2"></i>Back
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="glass-card mb-5 p-4">
          <div className="row g-4">
            <div className="col-md-6">
              <div className="glass-card p-4 h-100 border-start border-2 border-warning">
                <small className="text-uppercase fw-bold text-muted opacity-75">Total Outflow</small>
                <h3 className="fw-bold mt-1 mb-0">{formatCurrency(grandTotalOutflow)}</h3>
              </div>
            </div>
            <div className="col-md-6">
               <div className="glass-card p-4 h-100 border-start border-2 border-success">
                <small className="text-uppercase fw-bold text-muted opacity-75">Min Monthly</small>
                <h3 className="fw-bold mt-1 mb-0">{formatCurrency(minTotalOutflow)}</h3>
              </div>
            </div>
             <div className="col-md-6">
               <div className="glass-card p-4 h-100 border-start border-2 border-info">
                <small className="text-uppercase fw-bold text-muted opacity-75">Fixed PL1 EMI</small>
                <h3 className="fw-bold mt-1 mb-0">{formatCurrency(pl1Sample)}</h3>
              </div>
            </div>
            <div className="col-md-6">
               <div className="glass-card p-4 h-100 border-start border-2 border-danger">
                <small className="text-uppercase fw-bold text-muted opacity-75">Max Monthly</small>
                <h3 className="fw-bold mt-1 mb-0">{formatCurrency(maxTotalOutflow)}</h3>
              </div>
            </div>
          </div>
        </div>

        {/* The Table */}
        <div className="schedule-container">
          <div className="table-responsive">
            <table className="schedule-table table-hover" style={{ fontSize: '0.85rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr className="text-center align-middle">
                  <th className="py-3">Month</th>
                  <th className="py-3">Disbursement</th>
                  {homeLoanStartMode !== 'manual' && <th className="py-3">Active Slabs</th>}
                  <th className="py-3" style={{color:'#0dcaf0'}}>Loan Balance</th>
                  <th className="py-3" style={{color:'#ffc107'}}>Interest</th>
                  <th className="py-3">HL Payment</th>
                  <th className="py-3">PL-1 EMI</th>
                  <th className="py-3 text-white" style={{ background: 'var(--brand-color)' }}>TOTAL OUTFLOW</th>
                </tr>
              </thead>
              <tbody className="text-center align-middle">
                {monthlyLedger.map((row) => (
                  <tr key={row.month} style={row.disbursement > 0 ? { background: 'rgba(13, 202, 240, 0.05)' } : {}}>
                    <td className="fw-bold text-muted">{row.month}</td>
                    <td className="text-muted">
                      {row.disbursement > 0 ? <span className="text-info fw-bold">{formatCurrency(row.disbursement)}</span> : '-'}
                    </td>
                    {homeLoanStartMode !== 'manual' && <td className="text-muted">{row.activeSlabs}</td>}
                    <td style={{ color: '#0dcaf0', fontWeight: '600' }}>{formatCurrency(row.outstandingBalance)}</td>
                    <td style={{ color: '#e0a800', fontWeight: '500' }}>{row.interestPart > 0 ? formatCurrency(row.interestPart) : '-'}</td>
                    <td className="fw-bold" style={{ color: row.isFullEMI ? '#198754' : '#aaa' }}>
                        {row.isFullEMI ? formatCurrency(row.hlComponent) : '₹0'}
                    </td>
                    <td className="text-muted">{formatCurrency(row.pl1)}</td>
                    <td className="fw-bold text-white" style={{ background: 'var(--brand-color)' }}>{formatCurrency(row.totalOutflow)}</td>
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