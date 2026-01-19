import React from 'react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="container py-5">

      <div className="p-4 p-md-5">
        {/* Header Section */}
        <div className="text-center mb-5">
          <h1 className="fw-bold gradient-text mb-2">Privacy Policy</h1>
          <h5 className="text-muted">Property Investment Analyzer</h5>
          <p className="text-secondary small mb-0">Owned and Operated by Agenthum AI Solutions Pvt. Ltd.</p>
          <p className="text-muted fw-bold small">Last updated: 13 January 2026</p>
        </div>

        {/* Content Section */}
        <div className="content-section text-secondary" style={{ lineHeight: '1.7' }}>
          
          <h4 className="fw-bold mt-4 mb-3">1. Introduction</h4>
          <p>
            This Privacy Policy explains how <strong>Agenthum AI Solutions Pvt. Ltd.</strong> (“Company”, “we”, “us”, or “our”), as the owner and operator of the <strong>Property Investment Analyzer</strong> (the “App”), collects, uses, stores, and protects user information.
          </p>
          <p>By accessing or using the App, you agree to the practices described in this Privacy Policy.</p>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">2. Scope of This Policy</h4>
          <p>This Privacy Policy applies to:</p>
          <ul>
            <li>The Property Investment Analyzer web application</li>
            <li>Any related mobile or digital interfaces</li>
            <li>All users, including free and paid users</li>
          </ul>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">3. Information We Collect</h4>
          
          <h6 className="fw-bold mt-3">a) User-Entered Information</h6>
          <p>When you use the App, you may voluntarily enter information such as:</p>
          <ul>
            <li>Property details</li>
            <li>Financial values (price, loan amount, interest rate, tenure, rent, etc.)</li>
            <li>Investment assumptions and scenarios</li>
          </ul>
          <p>This information is used only to generate calculations, analysis, and results within the App.</p>

          <h6 className="fw-bold mt-3">b) Technical & Usage Information</h6>
          <p>We may collect limited technical data, including:</p>
          <ul>
            <li>Device type</li>
            <li>Browser or operating system</li>
            <li>App usage data (pages viewed, features used, session duration)</li>
          </ul>
          <p>This data helps us improve performance, stability, and user experience.</p>

          <h6 className="fw-bold mt-3">c) Payment Information (If Applicable)</h6>
          <p>
            For paid plans, payments may be processed through third-party payment gateways. We do not store or process sensitive payment details such as card numbers or banking credentials. Such information is handled directly by secure third-party payment processors.
          </p>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">4. How We Use Information</h4>
          <p>We use collected information solely to:</p>
          <ul>
            <li>Perform calculations and generate analysis</li>
            <li>Display results and insights to users</li>
            <li>Improve App functionality and usability</li>
            <li>Provide customer support when requested</li>
            <li>Comply with legal or regulatory requirements</li>
          </ul>
          <p>We do not use user data for advertising or unsolicited marketing.</p>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">5. Data Storage & Retention</h4>
          <ul>
            <li>User-entered data may be processed temporarily to generate results.</li>
            <li>The App does not guarantee long-term storage of user data unless explicitly stated.</li>
            <li>Data retention may vary based on usage patterns, system requirements, or legal obligations.</li>
          </ul>
          <p>Users are encouraged to save or export results if long-term access is required.</p>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">6. Data Security</h4>
          <p>
            We implement reasonable technical and organizational measures to protect data against unauthorized access, alteration, or disclosure. However, no digital system can be guaranteed to be 100% secure, and users acknowledge and accept this risk.
          </p>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">7. Sharing of Information</h4>
          <p>We do not sell, rent, or trade user data. Information may be disclosed only:</p>
          <ul>
            <li>When required by law or legal process</li>
            <li>To comply with regulatory obligations</li>
            <li>To protect the legal rights or safety of the Company or users</li>
          </ul>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">8. Cookies & Analytics</h4>
          <p>The App may use basic cookies or analytics tools to:</p>
          <ul>
            <li>Understand how users interact with the App</li>
            <li>Improve features and performance</li>
          </ul>
          <p>
            These tools do not collect sensitive financial or personally identifiable investment data. Users may control cookies through browser or device settings.
          </p>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">9. Third-Party Services</h4>
          <p>The App may rely on third-party service providers for:</p>
          <ul>
            <li>Hosting and infrastructure</li>
            <li>Analytics and performance monitoring</li>
            <li>Payment processing (if applicable)</li>
          </ul>
          <p>
            These providers are used solely to support App operations and are expected to follow reasonable privacy and security standards.
          </p>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">10. User Responsibilities</h4>
          <p>Users are responsible for:</p>
          <ul>
            <li>The information they choose to enter into the App</li>
            <li>Maintaining the security of their device and login credentials (if applicable)</li>
          </ul>
          <p>The Company is not responsible for data exposure caused by user negligence or compromised devices.</p>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">11. Changes to This Privacy Policy</h4>
          <p>
            We may update this Privacy Policy from time to time. Any changes will be reflected on this page, and continued use of the App after updates constitutes acceptance of the revised policy.
          </p>

          <hr className="my-4 opacity-25" />

          <h4 className="fw-bold mt-4 mb-3">12. Contact Information</h4>
          <p>For questions, concerns, or requests related to this Privacy Policy, please contact:</p>
          
          <div className="glass-card p-3 rounded border">
            <p className="fw-bold mb-1">Agenthum AI Solutions Pvt. Ltd.</p>
            <p className="mb-1"><i className="bi bi-envelope me-2"></i>Email: support@agenthumsolutions.com</p>
            <p className="mb-0"><i className="bi bi-telephone me-2"></i>Phone: +91 955 582 1832</p>
          </div>

        </div>

        {/* Footer Note */}
        <div className="mt-5 text-center text-muted small border-top pt-3">
          <p className="mb-0">© 2026 Agenthum AI Solutions. All rights reserved.</p>
          <p>Property Investment Analyzer is a product of Agenthum AI Solutions Pvt. Ltd.</p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;