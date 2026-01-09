import React from 'react';
import './ThemeToggle.css';

const ThemeToggle = ({ theme, toggleTheme }) => {
  return (
    <div 
      className={`theme-toggle-wrapper ${theme}`} 
      onClick={toggleTheme}
      title="Toggle Dark Mode"
    >
      <div className="toggle-track">
        {/* The sliding circle */}
        <div className="toggle-thumb" />
        
        {/* The Icons (Sitting on top) */}
        <div className="icons-container">
          <i className="bi bi-brightness-high-fill sun-icon"></i>
          <i className="bi bi-moon-fill moon-icon"></i>
        </div>
      </div>
    </div>
  );
};

export default ThemeToggle;