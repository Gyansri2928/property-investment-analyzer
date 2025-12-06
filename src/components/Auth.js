import React, { useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  sendEmailVerification,  // ADDED
  sendPasswordResetEmail  // ADDED (optional)
} from 'firebase/auth';
import { auth } from '../firebase';

function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false); // ADDED for success messages
  const [successMessage, setSuccessMessage] = useState(''); // ADDED

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setShowSuccess(false);
    setLoading(true);

    try {
      if (isLogin) {
        // Sign in existing user
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Check if email is verified
        if (!user.emailVerified) {
          setError('Please verify your email before signing in. Check your inbox for the verification link.');
          // Optional: Add button to resend verification email
        } else {
          console.log('User signed in successfully');
          setSuccessMessage('Successfully signed in!');
          setShowSuccess(true);
        }
      } else {
        // Create new user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        // Send verification email
        await sendEmailVerification(user);
        
        console.log('User created successfully');
        setSuccessMessage('Account created! Please check your email to verify your account.');
        setShowSuccess(true);
        
        // Optional: Auto-switch to login mode after successful signup
        // setIsLogin(true);
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // ADDED: Forgot password function
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

  // ADDED: Resend verification email
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
        <div className="card-header bg-primary text-white">
          <h4 className="mb-0">
            <i className={`fas ${isLogin ? 'fa-sign-in-alt' : 'fa-user-plus'} me-2`}></i>
            {isLogin ? 'Sign In to Your Account' : 'Create New Account'}
          </h4>
        </div>
        
        <div className="card-body p-4">
          {/* SUCCESS MESSAGE - ADDED */}
          {showSuccess && (
            <div className="alert alert-success alert-dismissible fade show" role="alert">
              {successMessage}
              <button type="button" className="btn-close" onClick={() => setShowSuccess(false)}></button>
            </div>
          )}

          {/* ERROR MESSAGE */}
          {error && (
            <div className="alert alert-danger alert-dismissible fade show" role="alert">
              {error}
              <button type="button" className="btn-close" onClick={() => setError('')}></button>
              
              {/* ADDED: Show resend verification button if error is about unverified email */}
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
              <input
                type="password"
                id="password"
                className="form-control"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength="6"
              />
              <div className="form-text">
                Password must be at least 6 characters long
              </div>
              
              {/* ADDED: Forgot password link */}
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

          {/* ADDED: Email verification info for sign-up */}
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
              {/* ADDED: Email note */}
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