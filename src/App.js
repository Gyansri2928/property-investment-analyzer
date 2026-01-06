import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PropertyComparison } from './components';
import Auth from './components/Auth';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './App.css';
import config from './config';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import EmailVerification from './pages/EmailVerification';
import MiniWeather from './components/MiniWeather';
import ThemeToggle from './components/ThemeToggle';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [theme, setTheme] = useState('light'); // Add theme state
  const [showUserMenu, setShowUserMenu] = useState(false); // State for user dropdown menu

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

  // Main App Content Component
  const MainAppContent = () => (
    <div className="App">
      {/* 🔍 TEMPORARY: Debug banner */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-banner bg-dark text-white py-1 small">
          <div className="container">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <i className="fas fa-bug me-1"></i>
                DEBUG: {process.env.NODE_ENV} |
                Firebase: {auth?.app?.name || 'Not loaded'} |
                Env Vars: {process.env.REACT_APP_FIREBASE_API_KEY ? 'Loaded' : 'Missing'} |
                Theme: {theme}
              </div>
              <button
                className="btn btn-sm btn-outline-light"
                onClick={() => {
                  console.log('📊 Current State:', { user, emailVerified, loading, theme });
                  console.log('🔧 Firebase Auth:', auth);
                }}
              >
                <i className="fas fa-code me-1"></i> Log State
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="app-header" style={{ position: 'relative' }}>
        <div className="container">
          <div className="header-content">
            <div className="logo-title">
              <img
                src="/logo_124.png"
                alt="Property Investment Analyzer Logo"
                className="app-logo"
                style={{
                  height: '75px', // Increased size
                  width: 'auto',
                  filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.2))', // Added elevation/shadow
                  marginRight: '15px'
                }}
              />
              <div className="title-section">
                <h1 className="app-title">
                  Property Investment Analyzer
                </h1>
                <p className="app-subtitle">
                  Compare and analyze property investments with detailed financial breakdowns
                </p>
                <div className="environment-badge">
                  {config.isProduction() && <span className="badge bg-success ms-2">Production</span>}
                  {config.isDevelopment() && <span className="badge bg-warning ms-2">Development</span>}
                </div>
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
                <div className="position-relative">
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
                        border: '2px solid rgba(255,255,255,0.7)', // Outer ring
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
                      {/* Transparent backdrop to close menu on outside click */}
                      <div 
                        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }}
                        onClick={() => setShowUserMenu(false)}
                      />
                      
                      {/* Dropdown Content */}
                      <div 
                        className={`dropdown-menu show position-absolute end-0 mt-2 shadow rounded-3 p-3 ${theme === 'dark' ? 'bg-dark border-secondary' : 'bg-white'}`}
                        style={{ width: '280px', zIndex: 999 }}
                      >
                        <div className="d-flex align-items-center mb-3">
                          <div className="rounded-circle bg-primary bg-opacity-10 p-3 me-3 d-flex align-items-center justify-content-center" style={{ width: '50px', height: '50px' }}>
                             <i className="bi bi-person-fill text-primary" style={{ fontSize: '1.5rem' }}></i>
                          </div>
                          <div className="overflow-hidden">
                            <div className={`fw-bold text-truncate ${theme === 'dark' ? 'text-light' : 'text-dark'}`}>
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
                        
                        <div className={`p-2 rounded mb-3 small ${theme === 'dark' ? 'bg-secondary bg-opacity-25' : 'bg-light'}`}>
                          <div className={`d-flex justify-content-between ${theme === 'dark' ? 'text-light' : 'text-secondary'}`}>
                            <span>User ID:</span>
                            <span className="font-monospace">{user.uid.substring(0, 8)}...</span>
                          </div>
                        </div>

                        <hr className={`dropdown-divider my-2 ${theme === 'dark' ? 'border-secondary' : ''}`} />
                        
                        <button
                          onClick={handleSignOut}
                          className="btn btn-outline-danger w-100 btn-sm d-flex align-items-center justify-content-center"
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

      {user && !emailVerified && (
        <div className="verification-banner bg-warning text-dark py-2">
          <div className="container">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <i className="fas fa-exclamation-triangle me-2"></i>
                Please verify your email address to access all features.
                Check your inbox for the verification email.
              </div>
              <button
                className="btn btn-sm btn-outline-dark"
                onClick={() => {
                  console.log('🔄 Attempting to resend verification email to:', user.email);
                  alert('Resend verification email function would go here');
                }}
              >
                Resend Email
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="app-main">
        <div className="container-fluid">
          {user ? (
            <>
              {emailVerified ? (
                // ✅ FULL WIDTH Property Comparison (no sidebar)
                <div className="row">
                  <div className="col-12">
                    <PropertyComparison />
                  </div>
                </div>
              ) : (
                <div className="alert alert-warning mt-4">
                  <h4><i className="fas fa-envelope me-2"></i>Email Verification Required</h4>
                  <p>
                    Please verify your email address to access the Property Investment Analyzer.
                    Check your inbox for the verification link we sent to <strong>{user.email}</strong>.
                  </p>
                  <div className="mt-3">
                    <button
                      className="btn btn-primary me-2"
                      onClick={() => {
                        console.log('🔄 Manual resend requested for:', user.email);
                      }}
                    >
                      <i className="fas fa-redo me-1"></i> Resend Verification Email
                    </button>
                    <button
                      className="btn btn-outline-secondary"
                      onClick={handleSignOut}
                    >
                      <i className="fas fa-sign-out-alt me-1"></i> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="row justify-content-center mt-3 mt-md-5">
              <div className="col-12 col-md-8 col-lg-5 col-xl-4">
                {/* REMOVED: The outer "Sign In Required" card wrapper.
                   KEPT: The centered layout and the Auth component itself.
                */}
                <Auth />

                {/* Optional footer text kept clean below the form */}
                <div className="text-center mt-3 text-muted small">
                  <p>By signing in, you agree to our Terms of Service and Privacy Policy</p>
                  {process.env.NODE_ENV === 'development' && (
                    <small className="opacity-50">
                      Dev Mode | Theme: {theme}
                    </small>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer" style={{ backgroundColor: '#50C878', color: '#FFFFFF' }}>
        <div className="container text-center py-2"> {/* Added spacing (py-3) and centering */}

          {/* 1. Links (Top & Prominent) */}
          <div className="mb-3">
            <a href="#" className="text-white text-decoration-none mx-3 fw-bold hover-opacity-75">Privacy Policy</a>
            <span className="opacity-25">|</span>
            <a href="#" className="text-white text-decoration-none mx-3 fw-bold hover-opacity-75">Terms of Service</a>
            <span className="opacity-25">|</span>
            <a href="#" className="text-white text-decoration-none mx-3 fw-bold hover-opacity-75">Support</a>
          </div>

          {/* 2. Copyright (Middle & Distinct) */}
          <div className="mb-2 opacity-90">
            <small className="fw-bold" style={{ letterSpacing: '0.5px' }}>
              © {new Date().getFullYear()} Property Investment Analyzer • All Rights Reserved
            </small>
          </div>

          {/* 3. Technical Details (Bottom, Smallest & Faintest) */}
          <div className="opacity-50" style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
            v{config.version} • {config.isProduction() ? 'Production' : 'Dev'} Env
            {process.env.NODE_ENV === 'development' && ` • Build: ${new Date().toLocaleTimeString()}`}
          </div>
        </div>
      </footer>
    </div>
  );

  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainAppContent />} />
        <Route path="/verify-email" element={<EmailVerification />} />
      </Routes>
    </Router>
  );
}

export default App;