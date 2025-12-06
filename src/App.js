import React, { useState, useEffect } from 'react';
import { PropertyComparison } from './components';
import Auth from './components/Auth';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import config from './config';
import { auth } from './firebase'; // Make sure this is imported
import { onAuthStateChanged } from 'firebase/auth'; // ADD THIS IMPORT

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);

  // 🔍 TEMPORARY DEBUG LOGS - ADD THIS EFFECT
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
    
    // 🔍 TEMPORARY: Log Firebase auth object
    console.log('Firebase Auth Object:', auth ? '✓ Loaded' : '✗ Missing');
    console.log('Firebase App Name:', auth?.app?.name || 'Unknown');
    
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      console.log('Auth State Changed:', currentUser ? `User: ${currentUser.email}` : 'No user');
      
      setUser(currentUser);
      
      if (currentUser) {
        setEmailVerified(currentUser.emailVerified);
        
        // 🔍 TEMPORARY: Log user details
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
      // 🔍 TEMPORARY: Log auth errors
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

  // 🔍 TEMPORARY: Add import for signOut
  const handleSignOut = async () => {
    try {
      // Import signOut if not already imported
      const { signOut } = await import('firebase/auth');
      await signOut(auth);
      setEmailVerified(false);
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
          {/* 🔍 TEMPORARY: Show debug info in loading state */}
          <small className="text-muted d-block mt-2">
            Environment: {process.env.NODE_ENV} | 
            Firebase: {auth ? 'Initialized' : 'Loading...'}
          </small>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      {/* 🔍 TEMPORARY: Debug banner (remove after testing) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-banner bg-dark text-white py-1 small">
          <div className="container">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <i className="fas fa-bug me-1"></i>
                DEBUG: {process.env.NODE_ENV} | 
                Firebase: {auth?.app?.name || 'Not loaded'} | 
                Env Vars: {process.env.REACT_APP_FIREBASE_API_KEY ? 'Loaded' : 'Missing'}
              </div>
              <button 
                className="btn btn-sm btn-outline-light"
                onClick={() => {
                  console.log('📊 Current State:', { user, emailVerified, loading });
                  console.log('🔧 Firebase Auth:', auth);
                }}
              >
                <i className="fas fa-code me-1"></i> Log State
              </button>
            </div>
          </div>
        </div>
      )}
      
      <header className="app-header">
        <div className="container">
          <div className="header-content">
            <div className="logo-title">
              <img 
                src="/logo_124.png" 
                alt="Property Investment Analyzer Logo" 
                className="app-logo"
              />
              <div className="title-section">
                <h1 className="app-title">
                  <i className="fas fa-chart-line"></i> Property Investment Analyzer
                </h1>
                <p className="app-subtitle">
                  Compare and analyze property investments with detailed financial breakdowns
                </p>
                <div className="environment-badge">
                  <span className="badge bg-info">v{config.version}</span>
                  {config.isProduction() && <span className="badge bg-success ms-2">Production</span>}
                  {config.isDevelopment() && <span className="badge bg-warning ms-2">Development</span>}
                  {/* 🔍 TEMPORARY: Show env var status */}
                  <span className="badge bg-secondary ms-2">
                    <i className={`fas ${process.env.REACT_APP_FIREBASE_API_KEY ? 'fa-check' : 'fa-times'} me-1`}></i>
                    Firebase
                  </span>
                </div>
              </div>
            </div>
            
            {user && (
              <div className="user-info ms-auto">
                <div className="d-flex align-items-center">
                  <div className="me-3 text-end">
                    <div className="user-email text-light small">
                      {user.email}
                      {emailVerified ? (
                        <span className="badge bg-success ms-2">
                          <i className="fas fa-check-circle me-1"></i>Verified
                        </span>
                      ) : (
                        <span className="badge bg-warning ms-2">
                          <i className="fas fa-exclamation-circle me-1"></i>Unverified
                        </span>
                      )}
                    </div>
                    <button 
                      onClick={handleSignOut}
                      className="btn btn-sm btn-outline-light mt-1"
                    >
                      <i className="fas fa-sign-out-alt me-1"></i> Sign Out
                    </button>
                  </div>
                  <div className="user-avatar">
                    <i className="fas fa-user-circle fa-2x text-light"></i>
                  </div>
                </div>
              </div>
            )}
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
                  // 🔍 TEMPORARY: Log resend attempt
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
        <div className="container">
          {user ? (
            <>
              {emailVerified ? (
                <PropertyComparison />
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
                        // Implement resend logic here
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
            <div className="row justify-content-center">
              <div className="col-md-6 col-lg-5">
                <div className="card shadow-lg border-0">
                  <div className="card-header bg-primary text-white">
                    <h3 className="card-title mb-0">
                      <i className="fas fa-lock me-2"></i>
                      Sign In Required
                    </h3>
                    {/* 🔍 TEMPORARY: Debug info in card */}
                    <small className="opacity-75">
                      Firebase: {auth ? 'Ready' : 'Loading...'}
                    </small>
                  </div>
                  <div className="card-body p-4">
                    <div className="text-center mb-4">
                      <i className="fas fa-chart-line fa-3x text-primary mb-3"></i>
                      <h4>Access Property Investment Tools</h4>
                      <p className="text-muted">
                        Please sign in or create an account to use the Property Investment Analyzer
                      </p>
                    </div>
                    <Auth />
                    <div className="mt-4 text-center text-muted small">
                      <p>By signing in, you agree to our Terms of Service and Privacy Policy</p>
                      {/* 🔍 TEMPORARY: Environment info */}
                      {process.env.NODE_ENV === 'development' && (
                        <small className="text-info">
                          <i className="fas fa-info-circle me-1"></i>
                          Dev Mode | Firebase Project: {process.env.REACT_APP_FIREBASE_PROJECT_ID || 'Not set'}
                        </small>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      
      <footer className="app-footer">
        <div className="container">
          <p>© {new Date().getFullYear()} Property Investment Analyzer • v{config.version}</p>
          <small className="text-muted">
            {config.isProduction() ? 'Production Environment' : 'Development Environment'} • 
            Currency: {config.currency}
            {user && ` • Logged in as: ${user.email}`}
            {user && ` • Email Status: ${emailVerified ? 'Verified' : 'Pending Verification'}`}
            {/* 🔍 TEMPORARY: Add build info */}
            {process.env.NODE_ENV === 'development' && ` • Build: ${new Date().toLocaleTimeString()}`}
          </small>
        </div>
      </footer>
    </div>
  );
}

export default App;