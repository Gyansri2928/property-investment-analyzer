import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendEmailVerification,  
  sendPasswordResetEmail  
} from 'firebase/auth';
import { auth } from '../firebase';

function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // 1. NEW STATE: Tracks if password is visible
  const [showPassword, setShowPassword] = useState(false); 
  
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false); 
  const [successMessage, setSuccessMessage] = useState(''); 

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setShowSuccess(false);
    setLoading(true);

    try {
      if (isLogin) {
        // Sign in
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        if (!user.emailVerified) {
          setError('Please verify your email before signing in. Check your inbox for the verification link.');
        } else {
          console.log('User signed in successfully');
          setSuccessMessage('Successfully signed in!');
          setShowSuccess(true);
        }
      } else {
        // Sign up
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await sendEmailVerification(user);
        
        console.log('User created successfully');
        setSuccessMessage('Account created! Please check your email to verify your account.');
        setShowSuccess(true);
      }
    } catch (error) {
      console.error('Authentication error:', error);
      
      let customMessage = "An error occurred. Please try again.";
      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          customMessage = "Incorrect email or password. Please try again.";
          break;
        case 'auth/email-already-in-use':
          customMessage = "This email is already registered. Try logging in instead.";
          break;
        case 'auth/weak-password':
          customMessage = "Password is too weak. Please use at least 6 characters.";
          break;
        case 'auth/invalid-email':
          customMessage = "Please enter a valid email address.";
          break;
        case 'auth/too-many-requests':
          customMessage = "Too many failed attempts. Please try again later or reset your password.";
          break;
        default:
          customMessage = error.message; 
      }
      setError(customMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage(`Password reset email sent to ${email}. Check your inbox!`);
      setShowSuccess(true);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const user = auth.currentUser;
    if (user) {
      setLoading(true);
      try {
        await sendEmailVerification(user);
        setSuccessMessage('Verification email resent! Check your inbox.');
        setShowSuccess(true);
      } catch (error) {
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="auth-container">
      <div className="card shadow">
        <div className="card-body p-4">
          <div className="text-center mb-4">
            <div className="d-inline-flex align-items-center justify-content-center bg-primary bg-opacity-10 rounded-circle p-3 mb-3" style={{ width: '70px', height: '70px' }}>
              <i className="fas fa-chart-line fa-2x text-primary"></i>
            </div>
            <h4 className="fw-bold">Access Property Tools</h4>
            <p className="text-muted small">
              {isLogin 
                ? "Welcome back! Please sign in to continue." 
                : "Create an account to save your investment scenarios."}
            </p>
          </div>
          
          <h4 className="text-center mb-4 fw-bold">
            <i className={`fas ${isLogin ? 'fa-sign-in-alt' : 'fa-user-plus'} me-2 text-primary`}></i>
            {isLogin ? 'Sign In to Your Account' : 'Create New Account'}
          </h4>

          {showSuccess && (
            <div className="alert alert-success alert-dismissible fade show" role="alert">
              {successMessage}
              <button type="button" className="btn-close" onClick={() => setShowSuccess(false)}></button>
            </div>
          )}

          {error && (
            <div className="alert alert-danger alert-dismissible fade show" role="alert">
              {error}
              <button type="button" className="btn-close" onClick={() => setError('')}></button>
              
              {error.includes('verify your email') && auth.currentUser && (
                <div className="mt-2">
                  <button 
                    onClick={handleResendVerification}
                    className="btn btn-sm btn-outline-danger"
                    disabled={loading}
                  >
                    <i className="fas fa-redo me-1"></i> Resend Verification Email
                  </button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="email" className="form-label">
                <i className="fas fa-envelope me-2"></i>Email Address
              </label>
              <input
                type="email"
                id="email"
                className="form-control"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="password" className="form-label">
                <i className="fas fa-lock me-2"></i>Password
              </label>
              
              {/* 2. UPDATED PASSWORD INPUT BLOCK */}
              <div className="position-relative">
                <input
                  type={showPassword ? "text" : "password"} // Dynamic Type
                  id="password"
                  className="form-control pe-5" // Added pe-5 for padding so text doesn't hit icon
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength="6"
                />
                <button
                  type="button"
                  className="btn btn-link position-absolute top-50 end-0 translate-middle-y text-decoration-none text-muted"
                  style={{ zIndex: 10, marginRight: '5px' }}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                </button>
              </div>
              {/* END UPDATED BLOCK */}

              <div className="form-text">
                Password must be at least 6 characters long
              </div>
              
              {isLogin && (
                <div className="mt-2 text-end">
                  <button 
                    type="button"
                    onClick={handleForgotPassword}
                    className="btn btn-link btn-sm text-decoration-none p-0"
                    disabled={loading || !email}
                  >
                    <i className="fas fa-key me-1"></i>Forgot Password?
                  </button>
                </div>
              )}
            </div>

            <button 
              type="submit" 
              className="btn btn-primary w-100 py-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                  {isLogin ? 'Signing In...' : 'Creating Account...'}
                </>
              ) : (
                <>
                  <i className={`fas ${isLogin ? 'fa-sign-in-alt' : 'fa-user-plus'} me-2`}></i>
                  {isLogin ? 'Sign In' : 'Create Account'}
                </>
              )}
            </button>
          </form>

          {!isLogin && (
            <div className="mt-3 alert alert-info">
              <i className="fas fa-info-circle me-2"></i>
              <small>
                After signing up, you'll receive a verification email. 
                You must verify your email before signing in.
              </small>
            </div>
          )}

          <div className="text-center mt-4">
            <button 
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setSuccessMessage('');
                setShowSuccess(false);
              }}
              className="btn btn-link text-decoration-none"
              disabled={loading}
            >
              <i className={`fas ${isLogin ? 'fa-user-plus' : 'fa-sign-in-alt'} me-1`}></i>
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>

          <div className="mt-4 pt-3 border-top">
            <div className="row g-2">
              <div className="col-12">
                <small className="text-muted">
                  <i className="fas fa-shield-alt me-1"></i>
                  Your data is secure and protected
                </small>
              </div>
              <div className="col-12">
                <small className="text-muted">
                  <i className="fas fa-info-circle me-1"></i>
                  {isLogin ? 'Need help signing in?' : 'Use a strong password for security'}
                </small>
              </div>
              <div className="col-12">
                <small className="text-muted">
                  <i className="fas fa-envelope me-1"></i>
                  Verification emails come from: Property Investment Analyzer
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Auth;