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

  // 2. Filter Schedule
  const filteredSchedule = possessionMonths
    ? idcSchedule.filter(row => row.releaseMonth <= possessionMonths)
    : idcSchedule;

  // 3. Totals Logic (The Corrected Version)
  
  // ✅ FIX 1: Total Interest is simply the sum of all "Lifetime Costs"
  const totalLifetimeCost = filteredSchedule.reduce((acc, row) => acc + (row.interestCost || 0), 0);
  const calculatedTotalInterest = totalLifetimeCost;

  // ✅ FIX 2: Total Amount Paid = Total Interest + (PL1 EMI * Total Months)
  // We use the actual filtered length or possessionMonths to ensure accuracy
  const totalMonthsCount = filteredSchedule[filteredSchedule.length - 1]?.releaseMonth || 0;
  const tableTotal = calculatedTotalInterest + (pl1EMI * totalMonthsCount);
  const displayTotal = tableTotal;


  // 4. Min & Max EMI
  const monthlyOutflows = filteredSchedule.map(row =>
    (row.currentTotalMonthlyEMI || row.currentMonthlyIDC) + pl1EMI
  );

  const minEMI = monthlyOutflows.length > 0 ? Math.min(...monthlyOutflows) : 0;
  const maxEMI = monthlyOutflows.length > 0 ? Math.max(...monthlyOutflows) : 0;

  // 5. Calculate Slab Principal Amount
  const totalSlabs = idcSchedule.length; 
  const slabPrincipalAmount = totalSlabs > 0 ? homeLoanAmount / totalSlabs : 0;
  
  let runningPrincipal = 0;

  // --- STYLES ---
  const styles = {
    tableContainer: {
      background: '#1e1e24',
      borderRadius: '12px',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      overflow: 'hidden',
      boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
    },
    headerTitle: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '15px 20px',
      color: 'white',
      fontWeight: '600',
      fontSize: '1rem',
      display: 'flex',
      alignItems: 'center'
    },
    table: {
      width: '100%',
      fontSize: '0.9rem',
      color: '#ddd',
      borderCollapse: 'collapse',
    },
    th: {
      background: '#2b2b35',
      padding: '12px 15px',
      fontSize: '0.8rem',
      color: '#aaa',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      textAlign: 'left'
    },
    td: {
      padding: '12px 15px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      verticalAlign: 'middle'
    },
    tfoot: {
      background: '#2b2b35',
      borderTop: '2px solid rgba(255,255,255,0.1)'
    },
    footerCell: {
      padding: '15px',
      color: 'white',
      fontWeight: 'bold',
      fontSize: '1rem',
      textAlign: 'right'
    }
  };

  return (
    <div className="property-comparison" style={{ minHeight: '100vh', position: 'relative' }}>

      {/* Background Blobs */}
      <div className="position-fixed top-0 left-0 w-100 h-100" style={{ zIndex: 0, pointerEvents: 'none' }}>
        <div className="position-absolute top-0 start-0 w-100 h-100" style={{ background: 'radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.15) 0%, transparent 50%)' }}></div>
        <div className="position-absolute top-0 end-0 w-100 h-100" style={{ background: 'radial-gradient(circle at 80% 20%, rgba(118, 75, 162, 0.15) 0%, transparent 50%)' }}></div>
      </div>

      <div className="container py-5" style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div className="d-flex justify-content-between align-items-center mb-5">
          <div>
            <h2 className="fw-bold mb-1 text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
              <i className="bi bi-calendar-week me-3"></i>Construction Schedule
            </h2>
            <p className="text-white-50 mb-0">
              Breakdown up to Possession (Month {possessionMonths})
            </p>
          </div>
          <button className="btn btn-outline-light rounded-pill px-4" onClick={() => navigate(-1)}>
            <i className="bi bi-arrow-left me-2"></i> Back to Dashboard
          </button>
        </div>

        {/* --- CARDS LAYOUT --- */}
        <div className="glass-card row g-4 mb-5">
          {/* ... (Cards remain unchanged) ... */}
          <div className="col-md-6">
            <div className="glass-card p-4 h-100 border-start border-2 border-warning">
              <div className="d-flex align-items-center">
                <div className="rounded-circle bg-warning bg-opacity-25 p-3 me-3 text-warning">
                  <i className="bi bi-cash-stack fs-3"></i>
                </div>
                <div>
                  <small className="text-uppercase fw-bold opacity-75">Total Interest Cost</small>
                  <h3 className="fw-bold mt-1 mb-0">{formatCurrency(calculatedTotalInterest)}</h3>
                </div>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="glass-card p-4 h-100 border-start border-2 border-success">
              <div className="d-flex align-items-center">
                <div className="rounded-circle bg-success bg-opacity-25 p-3 me-md-3 mb-2 mb-md-0 d-inline-block text-success">
                  <i className="bi bi-arrow-down-circle fs-3"></i>
                </div>
                <div>
                  <small className="text-uppercase fw-bold opacity-75 d-block" >Min Monthly EMI To pay</small>
                  <h3 className="fw-bold mt-1 mb-0">{formatCurrency(minEMI)}</h3>
                </div>
              </div>
            </div>
          </div>

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
          <div className="col-md-6">
            <div className="glass-card p-4 h-100 border-start border-2 border-danger">
              <div className="d-flex align-items-center">
                <div className="rounded-circle bg-danger bg-opacity-25 p-3 me-3 text-danger">
                  <i className="bi bi-arrow-up-circle fs-3"></i>
                </div>
                <div>
                  <small className="text-uppercase fw-bold opacity-75 ">Max Monthly EMI To Pay</small>
                  <h3 className="fw-bold mt-1 mb-0">{formatCurrency(maxEMI)}</h3>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* TABLE */}
        <div style={styles.tableContainer}>
          <div style={styles.headerTitle}>
            <i className="bi bi-table me-2"></i> Payment Schedule
          </div>

          <div className="table-responsive">
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: '5%' }}>Slab</th>
                  <th style={{ ...styles.th, width: '20%' }}>Release Month</th>
                  <th style={{ ...styles.th, width: '20%', color: '#0dcaf0' }}>Cumulative Disbursement</th>
                  <th style={{ ...styles.th, width: '15%', textAlign: 'right' }}>IDC Interest</th>
                  <th style={{ ...styles.th, width: '25%', textAlign: 'right', color: '#fff' }}>Total Monthly Outflow</th>
                  <th style={{ ...styles.th, width: '15%', textAlign: 'right', color: '#adb5bd' }}>Lifetime Cost</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedule.map((row, idx) => {
                  
                  const monthlyOutflow = (row.currentTotalMonthlyEMI || row.currentMonthlyIDC) + pl1EMI;
                  runningPrincipal += slabPrincipalAmount;

                  // ✅ NEW: Check if this is the last row to show the badge
                  const isLastRow = idx === filteredSchedule.length - 1;

                  return (
                    <tr key={idx}>
                      <td style={{ ...styles.td, color: '#6c757d', fontWeight: 'bold' }}>#{row.slabNo}</td>
                      
                      <td style={styles.td}>
                        <span className="badge bg-secondary bg-opacity-25 text-light border border-secondary border-opacity-25 px-2 py-1">Month {row.releaseMonth}</span>
                        {/* Only show time remaining if it's NOT the last row (possession) */}
                        {!isLastRow && row.timeRemaining > 0 && <small className="ms-2 text-white-50">({row.timeRemaining} m left)</small>}
                      </td>
                      
                      <td style={{ ...styles.td, color: '#0dcaf0', fontWeight: '500' }}>
                         {formatCurrency(runningPrincipal)}
                         <div style={{ fontSize: '0.7em', color: '#666' }}>Bank to Builder</div>
                      </td>

                      <td style={{ ...styles.td, textAlign: 'right', color: '#aaa' }}>
                        {formatCurrency(row.currentTotalMonthlyEMI || row.currentMonthlyIDC)}
                      </td>

                      {/* ✅ BADGE IMPLEMENTATION HERE */}
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#667eea', background: 'rgba(102, 126, 234, 0.05)' }}>
                        <div className="d-flex align-items-center justify-content-end gap-2">
                            {formatCurrency(monthlyOutflow)}
                            {isLastRow && (
                                <span className="badge bg-success bg-opacity-75 text-white" style={{ fontSize: '0.65rem' }}>
                                    Possession
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '0.7em', color: '#666', fontWeight: 'normal' }}>IDC + PL1</div>
                      </td>

                      <td style={{ ...styles.td, textAlign: 'right', color: '#adb5bd', fontStyle: 'italic' }}>
                        {formatCurrency(row.interestCost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* --- FOOTER (TOTALS) --- */}
              <tfoot style={styles.tfoot}>
                <tr>
                  <td colSpan="3" style={styles.footerCell}>
                    <span className="text-white-50 small text-uppercase" style={{ letterSpacing: '1px' }}>Grand Totals</span>
                  </td>

                  <td style={{ ...styles.footerCell, color: '#ffc107' }}>
                     {formatCurrency(calculatedTotalInterest)}
                     <div style={{ fontSize: '0.6em', color: '#aaa', fontWeight: 'normal' }}>TOTAL INTEREST</div>
                  </td>

                  <td style={{ ...styles.footerCell, color: '#667eea', borderTop: '2px solid rgba(102, 126, 234, 0.3)' }}>
                    {formatCurrency(displayTotal)}
                    <div style={{ fontSize: '0.6em', color: '#aaa', fontWeight: 'normal' }}>TOTAL AMOUNT PAID</div>
                  </td>
                  
                  <td style={{ ...styles.footerCell, color: '#adb5bd' }}>
                     {formatCurrency(totalLifetimeCost)}
                  </td>

                </tr>
              </tfoot>

            </table>
          </div>
          
        </div>
        <div className="mt-4 p-3 rounded d-flex align-items-start" style={{ background: 'rgba(13, 202, 240, 0.1)', borderLeft: '4px solid #0dcaf0' }}>
          <i className="bi bi-info-circle-fill text-info me-3 mt-1 fs-5"></i>
          <div>
            <h6 className="text-white mb-1 fw-bold">Important Note</h6>
            <p className="text-white mb-0 small">
              The payment shown for the <strong>Possession Month</strong> is a one-time charge for that specific month. 
              After this payment is made, the pre-EMI/Construction phase concludes, and your regular <strong>Home Loan EMI</strong> (Principal + Interest) will begin from the following month.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default IdcSchedulePage;