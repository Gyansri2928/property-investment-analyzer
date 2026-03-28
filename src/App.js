import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { PropertyComparison } from './components';
import Auth from './components/Auth';
import IdcSchedulePage from './components/idcschedule'; // Import the new page
import MonthlyBreakdownPage from './components/monthlybreakdown';
import PrivacyPolicy from './pages/privacypolicy';
import TermsOfService from './pages/termsncond';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './App.css';
import config from './config';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import EmailVerification from './pages/EmailVerification';
import MiniWeather from './components/MiniWeather';
import SimpleTemperature from './components/SimpleTemperature';
import ThemeToggle from './components/ThemeToggle';

const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant' // Instant jump is better for new pages than 'smooth'
    });
  }, [pathname]);

  return null;
};
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [theme, setTheme] = useState('light'); // Add theme state
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null); // 1. Create a Ref

  // 2. Add Click Outside Listener
  useEffect(() => {
    const handleClickOutside = (event) => {
      // If menu is open AND click is NOT inside the menu wrapper
      if (showUserMenu && userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  // Theme effect - apply theme to document
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Also add class to body for backward compatibility
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, []);

  // Function to toggle theme
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);

    // Update body class
    if (newTheme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }

    // Save to localStorage
    localStorage.setItem('theme', newTheme);
  };

  // 🔍 TEMPORARY DEBUG LOGS
  useEffect(() => {
    console.log('=== ENVIRONMENT DEBUG LOGS ===');
    console.log('Node Environment:', process.env.NODE_ENV);
    console.log('Firebase API Key Present:', !!process.env.REACT_APP_FIREBASE_API_KEY);
    console.log('Firebase Project ID Present:', !!process.env.REACT_APP_FIREBASE_PROJECT_ID);
    console.log('All Environment Variables:', {
      REACT_APP_FIREBASE_API_KEY: process.env.REACT_APP_FIREBASE_API_KEY
        ? '✓ Loaded (first 10 chars): ' + process.env.REACT_APP_FIREBASE_API_KEY.substring(0, 10) + '...'
        : '✗ Missing',
      REACT_APP_FIREBASE_AUTH_DOMAIN: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || '✗ Missing',
      REACT_APP_FIREBASE_PROJECT_ID: process.env.REACT_APP_FIREBASE_PROJECT_ID || '✗ Missing',
    });
    console.log('============================');
  }, []);

  // Check auth state on mount
  useEffect(() => {
    config.logConfig();

    console.log('Firebase Auth Object:', auth ? '✓ Loaded' : '✗ Missing');
    console.log('Firebase App Name:', auth?.app?.name || 'Unknown');

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log('Auth State Changed:', currentUser ? `User: ${currentUser.email}` : 'No user');

      setUser(currentUser);

      if (currentUser) {
        setEmailVerified(currentUser.emailVerified);

        console.log('User Details:', {
          email: currentUser.email,
          emailVerified: currentUser.emailVerified,
          uid: currentUser.uid.substring(0, 8) + '...',
          provider: currentUser.providerData[0]?.providerId
        });

        if (!currentUser.emailVerified) {
          console.log('⚠️ User email is not verified');
        } else {
          console.log('✅ User email is verified');
        }
      } else {
        setEmailVerified(false);
        console.log('👤 No user logged in');
      }

      setLoading(false);
    }, (error) => {
      console.error('🔥 Firebase Auth Error:', error);
      console.error('Error Code:', error.code);
      console.error('Error Message:', error.message);
      setLoading(false);
    });

    return () => {
      console.log('🔄 Cleaning up auth listener');
      unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
      setEmailVerified(false);
      setShowUserMenu(false); // Close menu on sign out
      console.log('👋 User signed out successfully');
    } catch (error) {
      console.error('❌ Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3">Loading Property Investment Analyzer...</p>
          <small className="text-muted d-block mt-2">
            Environment: {process.env.NODE_ENV} |
            Firebase: {auth ? 'Initialized' : 'Loading...'} |
            Theme: {theme}
          </small>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <ScrollToTop />
      <div className="App">

        {/* 1. Header*/}
        <header className="app-header" style={{ position: 'relative' }}>
          <div className="container">
            <div className="header-content">
              <div className="logo-title">
                <Link to="/" style={{ textDecoration: 'none', display: 'block' }}>
                  <img
                    src="/logo_124.png"
                    alt="Property Investment Analyzer Logo"
                    className="app-logo"
                    style={{
                      height: '75px',
                      width: 'auto',
                      filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))',
                      marginRight: '15px',
                      cursor: 'pointer' // Makes it obvious it's clickable
                    }}
                  />
                </Link>
                <div className="title-section">
                  <h1 className="app-title">
                    Property Investment Analyzer
                  </h1>
                  <p className="app-subtitle">
                    Strategic Investment Insights • By <strong>Agenthum AI Solutions</strong>
                  </p>
                </div>
              </div>

              {/* RIGHT SIDE: Theme Toggle + Mini Weather + User Info */}
              <div className="d-flex align-items-center gap-3">
                {/* Theme Toggle */}
                <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

                {/* Mini Weather Widget */}
                <MiniWeather />

                {/* User Info - Avatar Dropdown */}
                {user && (
                  <div className="position-relative" ref={userMenuRef}> {/* <--- Attach Ref Here */}

                    <button
                      className="btn p-0 border-0 bg-transparent"
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      style={{ transition: 'transform 0.2s', outline: 'none' }}
                      title="User Profile"
                    >
                      <div
                        className="d-flex align-items-center justify-content-center rounded-circle"
                        style={{
                          width: '45px',
                          height: '45px',
                          border: '2px solid rgba(255,255,255,0.7)',
                          padding: '3px',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
                        }}
                      >
                        <div
                          className="rounded-circle overflow-hidden bg-light d-flex align-items-center justify-content-center"
                          style={{ width: '100%', height: '100%' }}
                        >
                          <i className="bi bi-person-fill text-secondary" style={{ fontSize: '1.5rem' }}></i>
                        </div>
                      </div>
                    </button>

                    {/* Dropdown Menu */}
                    {showUserMenu && (
                      <>
                        {/* ❌ REMOVED THE BACKDROP DIV FROM HERE */}

                        {/* Dropdown Content */}
                        <div
                          className={`dropdown-menu show position-absolute end-0 mt-2 shadow rounded-3 p-3`}
                          style={{
                            width: '280px',
                            zIndex: 999,
                            backgroundColor: theme === 'dark' ? '#212529' : '#ffffff',
                            color: theme === 'dark' ? '#ffffff' : '#212529',
                            border: theme === 'dark' ? '1px solid #495057' : '1px solid rgba(0,0,0,0.15)'
                          }}
                        >
                          {/* ... (Keep your existing dropdown content exactly as it is) ... */}
                          <div className="d-flex align-items-center mb-3">
                            <div
                              className="rounded-circle p-3 me-3 d-flex align-items-center justify-content-center"
                              style={{
                                width: '50px',
                                height: '50px',
                                backgroundColor: theme === 'dark' ? 'rgba(13, 110, 253, 0.2)' : 'rgba(13, 110, 253, 0.1)'
                              }}
                            >
                              <i className="bi bi-person-fill text-primary" style={{ fontSize: '1.5rem' }}></i>
                            </div>
                            <div className="overflow-hidden">
                              <div className="fw-bold text-truncate">
                                {user.email?.split('@')[0]}
                              </div>
                              <div className={`small text-truncate ${theme === 'dark' ? 'text-secondary' : 'text-muted'}`}>
                                {user.email}
                              </div>
                            </div>
                          </div>

                          <div className="mb-3">
                            {emailVerified ? (
                              <div className="d-flex align-items-center text-success small">
                                <i className="bi bi-check-circle-fill me-2"></i>
                                <span>Email Verified</span>
                              </div>
                            ) : (
                              <div className="d-flex align-items-center text-warning small">
                                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                                <span>Email Not Verified</span>
                              </div>
                            )}
                          </div>

                          <hr className={`dropdown-divider my-2 ${theme === 'dark' ? 'border-secondary' : ''}`} />

                          <button
                            onClick={handleSignOut}
                            className={`btn w-100 btn-sm d-flex align-items-center justify-content-center ${theme === 'dark' ? 'btn-outline-light' : 'btn-outline-danger'}`}
                          >
                            <i className="bi bi-box-arrow-right me-2"></i>
                            Sign Out
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* 2. Verification Banner (Global) */}
        {user && !emailVerified && (
          <div className="verification-banner bg-warning text-dark py-2">
            <div className="container d-flex justify-content-between align-items-center">
              <div><i className="fas fa-exclamation-triangle me-2"></i>Please verify your email address.</div>
              <button className="btn btn-sm btn-outline-dark" onClick={() => alert('Resend functionality here')}>Resend Email</button>
            </div>
          </div>
        )}

        {/* 3. MAIN CONTENT AREA WITH ROUTES */}
        <main className="app-main">
          <div className="container-fluid">
            <Routes>
              {/* --- ROUTE 1: HOME PAGE (Logic moved here) --- */}
              <Route path="/" element={
                user ? (
                  emailVerified ? (
                    // Logged in & Verified -> Show Tool
                    <div className="row"><div className="col-12"><PropertyComparison /></div></div>
                  ) : (
                    // Logged in but NOT Verified -> Show Warning
                    <div className="alert alert-warning mt-4">
                      <h4><i className="fas fa-envelope me-2"></i>Email Verification Required</h4>
                      <p>Please verify your email address to access the tool.</p>
                      <button className="btn btn-outline-secondary mt-3" onClick={handleSignOut}>Sign Out</button>
                    </div>
                  )
                ) : (
                  // Not Logged in -> Show Login
                  <div className="row justify-content-center mt-3 mt-md-5">
                    <div className="col-12 col-md-8 col-lg-5 col-xl-4">
                      <Auth />
                      <div className="text-center mt-3 text-muted small"><p>By signing in, you agree to our Terms.</p></div>
                    </div>
                  </div>
                )
              } />

              {/* --- ROUTE 2: VERIFICATION --- */}
              <Route path="/verify-email" element={<EmailVerification />} />

              {/* --- ROUTE 3: SCHEDULE --- */}
              <Route path="/schedule" element={<IdcSchedulePage />} />

              {/* --- ROUTE 4: MONTHLY BREAKDOWN --- */}
              <Route path="/monthly-breakdown" element={<MonthlyBreakdownPage />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
            </Routes>
          </div>
        </main>

        {/* 4.<footer>*/}
        <footer
          className={`app-footer`}
          style={{ position: 'relative' }}
        >
          <div className="container text-center py-3">

            {/* 1. Links (Top & Prominent) */}
            <div className="mb-3">
              {/* Privacy Policy */}
              <Link
                to="/privacy-policy"
                className="text-reset text-decoration-none mx-3 fw-bold hover-opacity-75"
              >
                Privacy Policy
              </Link>

              <span className="opacity-25">|</span>

              {/* Terms of Service */}
              <Link
                to="/terms-of-service"
                className="text-reset text-decoration-none mx-3 fw-bold hover-opacity-75"
              >
                Terms of Service
              </Link>

              <span className="opacity-25">|</span>

              {/* Contact Us (Updated Link) */}
              <a
                href="https://agenthumsolutions.com/contact/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-reset text-decoration-none mx-3 fw-bold hover-opacity-75"
              >
                Contact Us
              </a>
            </div>

            {/* 2. Copyright & Company Name */}
            <div className="mb-2 opacity-90">
              <small className="fw-bold" style={{ letterSpacing: '0.5px' }}>
                © {new Date().getFullYear()} Agenthum AI Solutions Pvt. Ltd. • All Rights Reserved
              </small>
            </div>

            {/* 3. Tech Details & Phone Number */}
            <div className="opacity-50" style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
              <span className="me-3"><i className="bi bi-telephone-fill me-1"></i>+91 955 582 1832</span>
              <span>
                v{config.version}
              </span>
            </div>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;