import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { applyActionCode } from 'firebase/auth';

function EmailVerification() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const mode = searchParams.get('mode');
      const actionCode = searchParams.get('oobCode');
      
      if (mode === 'verifyEmail' && actionCode) {
        try {
          await applyActionCode(auth, actionCode);
          setStatus('success');
          setMessage('Email verified successfully! You can now sign in.');
          
          // Redirect to login after 3 seconds
          setTimeout(() => {
            navigate('/login');
          }, 3000);
        } catch (error) {
          setStatus('error');
          setMessage(`Error: ${error.message}`);
        }
      } else {
        setStatus('error');
        setMessage('Invalid verification link.');
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card shadow">
            <div className="card-header bg-primary text-white">
              <h4 className="mb-0">
                <i className="fas fa-envelope me-2"></i>
                Email Verification
              </h4>
            </div>
            <div className="card-body p-4 text-center">
              {status === 'verifying' && (
                <>
                  <div className="spinner-border text-primary mb-3" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <h5>Verifying your email...</h5>
                </>
              )}
              
              {status === 'success' && (
                <>
                  <div className="text-success mb-3">
                    <i className="fas fa-check-circle fa-3x"></i>
                  </div>
                  <h5 className="text-success">Email Verified!</h5>
                  <p>{message}</p>
                  <p>Redirecting to login page...</p>
                </>
              )}
              
              {status === 'error' && (
                <>
                  <div className="text-danger mb-3">
                    <i className="fas fa-times-circle fa-3x"></i>
                  </div>
                  <h5 className="text-danger">Verification Failed</h5>
                  <p>{message}</p>
                  <button 
                    className="btn btn-primary mt-3"
                    onClick={() => navigate('/login')}
                  >
                    Go to Login
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmailVerification;
