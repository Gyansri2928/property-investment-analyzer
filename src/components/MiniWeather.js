import React, { useState, useEffect } from 'react';
import { fetchWeatherData } from '../services/weatherService';

const MiniWeather = () => {
  const [temp, setTemp] = useState(null);
  const [location, setLocation] = useState('Noida');
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState('metric');
  const [showDropdown, setShowDropdown] = useState(false);

  // Compact location options
  const locations = ['Noida', 'Delhi', 'Mumbai', 'Bangalore', 'Chennai'];

  const loadWeather = async (loc = location) => {
    setLoading(true);
    try {
      const data = await fetchWeatherData(loc, unit);
      setTemp(Math.round(data.current.temp));
      setLocation(loc);
    } catch (error) {
      console.error('Error loading temperature:', error);
      setTemp('--');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeather();
    const interval = setInterval(loadWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [unit]);

  const formatTemp = () => {
    if (temp === '--' || temp === null) return '--';
    return `${temp}°${unit === 'metric' ? 'C' : 'F'}`;
  };

  const toggleUnit = (e) => {
    e.stopPropagation();
    setUnit(unit === 'metric' ? 'us' : 'metric');
  };

  const handleLocationSelect = (loc) => {
    setLocation(loc);
    loadWeather(loc);
    setShowDropdown(false);
  };

  return (
    <div className="mini-weather" style={{ position: 'relative' }}>
      {/* Weather Display */}
      <div className="d-flex align-items-center bg-white bg-opacity-10 backdrop-blur border border-white border-opacity-20 rounded-pill px-2 py-1 shadow-sm">
        {/* Location Badge */}
        <div 
          className="location-badge me-2 cursor-pointer"
          onClick={() => setShowDropdown(!showDropdown)}
          title="Change location"
        >
          <span className="badge bg-primary bg-opacity-25 text-white px-2 py-1">
            <i className="fas fa-map-marker-alt me-1" style={{ fontSize: '0.7rem' }}></i>
            <span style={{ fontSize: '0.75rem' }}>{location}</span>
          </span>
        </div>
        
        {/* Temperature */}
        <div className="temperature-display">
          <span className="text-white fw-bold" style={{ fontSize: '0.9rem' }}>
            {loading ? '...' : formatTemp()}
          </span>
        </div>
        
        {/* Unit Toggle */}
        <button 
          onClick={toggleUnit}
          className="btn btn-link btn-sm p-0 ms-1"
          style={{ 
            fontSize: '0.7rem', 
            color: 'rgba(255, 255, 255, 0.7)',
            textDecoration: 'none',
            minWidth: 'auto'
          }}
          title={`Switch to ${unit === 'metric' ? '°F' : '°C'}`}
        >
          {unit === 'metric' ? '°F' : '°C'}
        </button>
        
        {/* Refresh Button */}
        <button 
          onClick={() => loadWeather()}
          className="btn btn-link btn-sm p-0 ms-1"
          disabled={loading}
          style={{ 
            fontSize: '0.7rem', 
            color: 'rgba(255, 255, 255, 0.7)',
            textDecoration: 'none',
            minWidth: 'auto'
          }}
          title="Refresh"
        >
          <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
        </button>
      </div>

      {/* Location Dropdown */}
      {showDropdown && (
        <div 
          className="mini-dropdown position-absolute mt-1 end-0 z-1000"
          style={{ 
            minWidth: '120px',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <div className="card shadow-lg border-0">
            <div className="card-body p-2">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <small className="text-muted fw-bold">Select City</small>
                <button 
                  onClick={() => setShowDropdown(false)}
                  className="btn btn-sm btn-link p-0"
                  style={{ fontSize: '0.7rem' }}
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
              
              <div className="list-group list-group-flush">
                {locations.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    className={`list-group-item list-group-item-action border-0 py-1 ${location === loc ? 'active bg-primary text-white' : ''}`}
                    onClick={() => handleLocationSelect(loc)}
                    style={{ fontSize: '0.8rem' }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <span>{loc}</span>
                      {location === loc && (
                        <i className="fas fa-check"></i>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              
              {/* Custom Search */}
              <div className="mt-2">
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Other city..."
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        handleLocationSelect(e.target.value.trim());
                        e.target.value = '';
                      }
                    }}
                    style={{ fontSize: '0.75rem' }}
                  />
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={(e) => {
                      const input = e.target.previousElementSibling;
                      if (input.value.trim()) {
                        handleLocationSelect(input.value.trim());
                        input.value = '';
                      }
                    }}
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                  >
                    <i className="fas fa-search"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiniWeather;