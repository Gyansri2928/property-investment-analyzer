import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './PropertyComparison.css';

const IdcSchedulePage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // 1. Retrieve Data (Now includes 'possessionMonths' and 'totalPaid')
  const { 
    idcSchedule, 
    pl1EMI, 
    totalIDC, 
    propertyName, 
    possessionMonths, 
    totalPaid 
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

  // 2. FILTER: Only show slabs released BEFORE or ON the possession month
  //    (e.g., if Possession is Month 24, don't show Month 27 slab)
  const filteredSchedule = possessionMonths 
    ? idcSchedule.filter(row => row.releaseMonth <= possessionMonths)
    : idcSchedule;

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
    // New Footer Style
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
        
        <div className="d-flex justify-content-between align-items-center mb-5">
          <div>
            <h2 className="fw-bold mb-1 text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
              <i className="bi bi-calendar-week me-3"></i>Construction Schedule
            </h2>
            <p className="text-white-50 mb-0">
              Breakdown up to Possession (Month {possessionMonths})
            </p>
          </div>
          <button 
            className="btn btn-outline-light rounded-pill px-4" 
            onClick={() => navigate('/', { state: { returnTab: 'breakdown' } })}
          >
            <i className="bi bi-arrow-left me-2"></i> Back to Dashboard
          </button>
        </div>

        {/* Summary Cards */}
        <div className="row g-4 mb-5">
          <div className="col-md-6">
            <div className="glass-card p-4 h-100 border-start border-4 border-warning">
              <div className="d-flex align-items-center">
                <div className="rounded-circle bg-warning bg-opacity-25 p-3 me-3 text-warning">
                  <i className="bi bi-cash-stack fs-3"></i>
                </div>
                <div>
                  <small className="text-uppercase fw-bold opacity-75">Total Interest Cost</small>
                  <h3 className="fw-bold mt-1 mb-0">{formatCurrency(totalIDC)}</h3>
                </div>
              </div>
            </div>
          </div>
          <div className="col-md-6">
             <div className="glass-card p-4 h-100 border-start border-4 border-info">
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
                  <th style={{...styles.th, width: '10%'}}>Slab #</th>
                  <th style={{...styles.th, width: '25%'}}>Release Month</th>
                  <th style={{...styles.th, width: '20%', textAlign: 'right'}}>IDC Interest</th>
                  <th style={{...styles.th, width: '25%', textAlign: 'right', color: '#fff'}}>Total Monthly Outflow</th>
                  <th style={{...styles.th, width: '20%', textAlign: 'right'}}>Lifetime Cost</th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedule.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{...styles.td, color: '#6c757d', fontWeight: 'bold'}}>
                      #{row.slabNo}
                    </td>
                    <td style={styles.td}>
                       <span className="badge bg-secondary bg-opacity-25 text-light border border-secondary border-opacity-25 px-2 py-1">
                          Month {row.releaseMonth}
                       </span>
                       {/* Only show 'Time Remaining' if it's positive */}
                       {row.timeRemaining > 0 && 
                         <small className="ms-2 text-white-50">({row.timeRemaining} months left)</small>
                       }
                    </td>
                    <td style={{...styles.td, textAlign: 'right', color: '#aaa'}}>
                      {formatCurrency(row.currentTotalMonthlyEMI || row.currentMonthlyIDC)}
                    </td>
                    <td style={{...styles.td, textAlign: 'right', fontWeight: 'bold', color: '#667eea', background: 'rgba(102, 126, 234, 0.05)'}}>
                      {formatCurrency((row.currentTotalMonthlyEMI || row.currentMonthlyIDC) + pl1EMI)}
                      <div style={{fontSize: '0.7em', color: '#666', fontWeight: 'normal'}}>IDC + PL1</div>
                    </td>
                    <td style={{...styles.td, textAlign: 'right', color: '#ddd'}}>
                      {formatCurrency(row.interestCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
              
              {/* --- NEW FOOTER ROW --- */}
              <tfoot style={styles.tfoot}>
                <tr>
                  <td colSpan="2" style={styles.footerCell}>
                    <span className="text-white-50 small text-uppercase">Totals</span>
                  </td>
                  <td style={styles.footerCell}>
                    {/* IDC Interest Column Total (Optional/Blank) */}
                    -
                  </td>
                  <td style={{...styles.footerCell, color: '#667eea'}}>
                    {/* Total Monthly Outflow Column -> Shows TOTAL PAID */}
                    {formatCurrency(totalPaid)}
                    <div style={{fontSize: '0.6em', color: '#aaa', fontWeight: 'normal'}}>TOTAL AMOUNT PAID</div>
                  </td>
                  <td style={{...styles.footerCell, color: '#fff'}}>
                    {/* Lifetime Cost Column -> Shows TOTAL IDC */}
                    {formatCurrency(totalIDC)}
                    <div style={{fontSize: '0.6em', color: '#aaa', fontWeight: 'normal'}}>TOTAL INTEREST</div>
                  </td>
                </tr>
              </tfoot>

            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default IdcSchedulePage;