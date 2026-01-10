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

  const getOrdinal = (n) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

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
  // ⚙️ LOGIC: CONVERT SLABS TO PERIODS
  // ==========================================
  
  const processedRows = [];
  const slabPrincipalAmount = idcSchedule.length > 0 ? homeLoanAmount / idcSchedule.length : 0;
  let runningPrincipal = 0;

  // 1. Handle "No Disbursement" Gap
  if (idcSchedule.length > 0 && idcSchedule[0].releaseMonth > 1) {
    const endGap = idcSchedule[0].releaseMonth - 1;
    
    // For gap months, you only pay PL1 (no IDC yet)
    const monthlyPay = pl1EMI; 

    processedRows.push({
      isGap: true, 
      period: endGap === 1 ? "Month 1" : `Months 1 - ${endGap}`,
      activity: "No Disbursement",
      loanReleased: 0,
      monthlyInterest: 0,
      monthlyOutflow: monthlyPay, 
      duration: endGap,
      totalInterestCost: 0,
      // ✅ FIX: Row shows Monthly amount (PL1 + 0), NOT multiplied by duration
      displayOutflow: monthlyPay 
    });
  }

  // 2. Process Actual Slabs
  idcSchedule.forEach((slab, index) => {
    const startMonth = slab.releaseMonth;
    const isLastSlab = index === idcSchedule.length - 1;
    
    const nextStartMonth = isLastSlab 
        ? possessionMonths + 1 
        : idcSchedule[index + 1].releaseMonth;
        
    const endMonth = nextStartMonth - 1;
    const duration = Math.max(1, (endMonth - startMonth) + 1);

    runningPrincipal += slabPrincipalAmount;

    // Financials
    const monthlyInterest = slab.currentTotalMonthlyEMI || slab.currentMonthlyIDC;
    
    // ✅ FIX: The monthly check you write = IDC + PL1
    const monthlyPay = monthlyInterest + pl1EMI; 

    processedRows.push({
      isGap: false,
      period: startMonth === endMonth ? `Month ${startMonth}` : `Months ${startMonth} - ${endMonth}`,
      activity: isLastSlab ? "Final Disbursement" : `${getOrdinal(index + 1)} Disbursement`,
      loanReleased: runningPrincipal,
      monthlyInterest: monthlyInterest,
      monthlyOutflow: monthlyPay,
      duration: duration,
      totalInterestCost: monthlyInterest * duration, // For footer calc only
      displayOutflow: monthlyPay // ✅ FIX: Just the monthly amount
    });
  });

  // 3. Grand Totals (Calculated accurately using Duration)
  const grandTotalInterest = processedRows.reduce((acc, row) => acc + (row.monthlyInterest * row.duration), 0);
  const grandTotalPaid = processedRows.reduce((acc, row) => acc + (row.monthlyOutflow * row.duration), 0);

  // 4. Min/Max for cards
  const monthlyOutflows = processedRows.map(r => r.monthlyOutflow);
  const minEMI = Math.min(...monthlyOutflows);
  const maxEMI = Math.max(...monthlyOutflows);


  return (
    <div className="property-comparison" style={{ minHeight: '100vh', position: 'relative' }}>

      {/* Background Handler */}
      <div className="page-background-handler"></div>

      <div className="container py-5 central-container" style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div className="d-flex justify-content-between align-items-center mb-5">
          <div>
            <h2 className="fw-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              <i className="bi bi-calendar-week me-3"></i>Construction Schedule
            </h2>
            <p className="mb-0" style={{ color: 'var(--text-secondary)' }}>
              Breakdown up to Possession (Month {possessionMonths})
            </p>
          </div>
          <button className="btn btn-outline-primary rounded-pill px-4 shadow-sm" onClick={() => navigate(-1)}>
            <i className="bi bi-arrow-left me-2"></i> Back to Dashboard
          </button>
        </div>

        {/* --- CARDS LAYOUT --- */}
        <div className="glass-card row g-4 mb-5">
          <div className="col-md-6">
            <div className="glass-card p-4 h-100 border-start border-2 border-warning">
              <div className="d-flex align-items-center">
                <div className="rounded-circle bg-warning bg-opacity-25 p-3 me-3 text-warning">
                  <i className="bi bi-cash-stack fs-3"></i>
                </div>
                <div>
                  <small className="text-uppercase fw-bold opacity-75">Total Interest Cost</small>
                  <h3 className="fw-bold mt-1 mb-0">{formatCurrency(grandTotalInterest)}</h3>
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

        {/* ✅ THEMED TABLE */}
        <div className="schedule-container">
          <div className="schedule-header">
            <i className="bi bi-table me-2"></i> Period-wise Payment Breakdown
          </div>

          <div className="table-responsive">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Period</th>
                  <th style={{ width: '20%' }}>Activity</th>
                  <th style={{ width: '15%', color: '#0dcaf0' }}>Loan Released</th>
                  <th style={{ width: '15%', textAlign: 'right' }}>Monthly Interest</th>
                  <th style={{ width: '10%', textAlign: 'center' }}>Duration</th>
                  <th style={{ width: '15%', textAlign: 'right', color: 'var(--text-secondary)' }}>Total Interest</th>
                  
                  {/* ✅ Renamed Header to be clear it is Monthly */}
                  <th style={{ width: '15%', textAlign: 'right', color: 'var(--brand-color)' }}>Monthly Outflow</th>
                </tr>
              </thead>
              <tbody>
                {processedRows.map((row, idx) => (
                  <tr key={idx}>
                    {/* Period */}
                    <td>
                        <span className={`badge ${row.isGap ? 'bg-secondary' : 'bg-secondary'} bg-opacity-10 border px-3 py-2 rounded-pill`} 
                              style={{color: row.isGap ? 'var(--text-secondary)' : 'var(--brand-color)', fontSize: '0.85rem'}}>
                            {row.period}
                        </span>
                    </td>

                    <td style={{ fontWeight: '500', color: 'var(--text-secondary)' }}>
                        {row.activity}
                    </td>
                    
                    <td style={{ color: '#0dcaf0', fontWeight: '500' }}>
                       {formatCurrency(row.loanReleased)}
                    </td>

                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {formatCurrency(row.monthlyInterest)}
                    </td>

                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                      {row.duration} <small className="text-muted fw-normal">mo</small>
                    </td>

                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {formatCurrency(row.totalInterestCost)}
                    </td>

                    {/* ✅ FIX: Shows Monthly Amount (PL1 + Interest) */}
                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--brand-color)', background: 'rgba(102, 126, 234, 0.05)' }}>
                      {formatCurrency(row.displayOutflow)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot className="schedule-tfoot">
                <tr>
                  <td colSpan="5" className="schedule-footer-cell" style={{ textAlign: 'right' }}>
                    <span className="small text-uppercase opacity-75" style={{ letterSpacing: '1px' }}>Grand Totals</span>
                  </td>

                  <td className="schedule-footer-cell" style={{ color: '#08b69fff' }}>
                     {formatCurrency(grandTotalInterest)}
                     <div style={{ fontSize: '0.5em', opacity: 0.7, fontWeight: 'normal' }}>TOTAL INTEREST</div>
                  </td>

                  {/* Grand Total Paid still sums up everything (Monthly * Duration) */}
                  <td className="schedule-footer-cell" style={{ color: 'var(--brand-color)', fontSize: '1.1rem' }}>
                     {formatCurrency(grandTotalPaid)}
                     <div style={{ fontSize: '0.5em', opacity: 0.7, fontWeight: 'normal' }}>LIFETIME PAID</div>
                  </td>
                </tr>
              </tfoot>

            </table>
          </div>
        </div>

        {/* Important Note */}
        <div className="mt-4 p-3 rounded d-flex align-items-start" style={{ background: 'rgba(13, 202, 240, 0.1)', borderLeft: '4px solid #0dcaf0' }}>
          <i className="bi bi-info-circle-fill text-info me-3 mt-1 fs-5"></i>
          <div>
            <h6 className="mb-1 fw-bold" style={{ color: 'var(--text-primary)' }}>Understanding this Table</h6>
            <p className="mb-0 small" style={{ color: 'var(--text-secondary)' }}>
              <strong>Monthly Outflow</strong> shows the actual amount you pay <i>per month</i> during that specific period (PL1 EMI + Current Interest).
              <br/>
              The "Grand Total" at the bottom sums up all payments made over the entire {possessionMonths} months construction period.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default IdcSchedulePage;