import React, { useState, useEffect } from 'react';
import { fetchWeatherData } from '../services/weatherService';

const SimpleTemperature = () => {
  const [temp, setTemp] = useState(null);
  const [conditions, setConditions] = useState('');
  const [location, setLocation] = useState('Noida');
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState('metric');
  const [showLocationSelect, setShowLocationSelect] = useState(false);

  // Popular Indian cities for selection
  const popularLocations = [
    { name: 'Noida', coordinates: '28.5355,77.3910' },
    { name: 'New Delhi', coordinates: '28.6139,77.2090' },
    { name: 'Mumbai', coordinates: '19.0760,72.8777' },
    { name: 'Bangalore', coordinates: '12.9716,77.5946' },
    { name: 'Chennai', coordinates: '13.0827,80.2707' },
    { name: 'Kolkata', coordinates: '22.5726,88.3639' },
    { name: 'Hyderabad', coordinates: '17.3850,78.4867' },
    { name: 'Pune', coordinates: '18.5204,73.8567' },
    { name: 'Ahmedabad', coordinates: '23.0225,72.5714' },
    { name: 'Jaipur', coordinates: '26.9124,75.7873' }
  ];

  const loadWeather = async (loc = location) => {
    setLoading(true);
    try {
      // Find if it's a predefined location with coordinates
      const locationObj = popularLocations.find(l => l.name === loc);
      const locationToFetch = locationObj ? locationObj.coordinates : loc;
      
      const data = await fetchWeatherData(locationToFetch, unit);
      setTemp(Math.round(data.current.temp));
      setConditions(data.current.conditions);
      setLocation(loc); // Store the display name
    } catch (error) {
      console.error('Error loading temperature:', error);
      setTemp('--');
      setConditions('N/A');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeather();
    // Refresh every 30 minutes
    const interval = setInterval(loadWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [unit]);

  const handleLocationChange = (selectedLocation) => {
    setLocation(selectedLocation);
    loadWeather(selectedLocation);
    setShowLocationSelect(false);
  };

  const getWeatherIcon = (cond) => {
    if (!cond) return '🌤️';
    const lowerCond = cond.toLowerCase();
    if (lowerCond.includes('sun') || lowerCond.includes('clear')) return '☀️';
    if (lowerCond.includes('cloud')) return '☁️';
    if (lowerCond.includes('rain') || lowerCond.includes('drizzle')) return '🌧️';
    if (lowerCond.includes('snow') || lowerCond.includes('flurries')) return '❄️';
    if (lowerCond.includes('storm') || lowerCond.includes('thunder')) return '⛈️';
    return '🌤️';
  };

  const formatTemp = (tempValue) => {
    if (tempValue === '--') return '--';
    return `${tempValue}°${unit === 'metric' ? 'C' : 'F'}`;
  };

  const toggleUnit = () => {
    setUnit(unit === 'metric' ? 'us' : 'metric');
  };

  return (
    <div className="simple-temperature card border-0 shadow-sm">
      <div className="card-body p-2">
        {/* Location Selector */}
        <div className="location-selector mb-2">
          <div className="d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center">
              <i className="fas fa-map-marker-alt me-2 text-white opacity-75"></i>
              <span className="location-name text-white fw-semibold">
                {location}
              </span>
            </div>
            <button 
              onClick={() => setShowLocationSelect(!showLocationSelect)}
              className="btn btn-sm btn-outline-light p-1"
              style={{ fontSize: '0.7rem' }}
              title="Change location"
            >
              <i className={`fas ${showLocationSelect ? 'fa-times' : 'fa-chevron-down'}`}></i>
            </button>
          </div>
          
          {/* Location Dropdown */}
          {showLocationSelect && (
            <div className="location-dropdown mt-2">
              <div className="list-group" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {popularLocations.map((loc) => (
                  <button
                    key={loc.name}
                    type="button"
                    className={`list-group-item list-group-item-action py-2 ${location === loc.name ? 'active' : ''}`}
                    onClick={() => handleLocationChange(loc.name)}
                    style={{ fontSize: '0.8rem' }}
                  >
                    <div className="d-flex justify-content-between align-items-center">
                      <span>{loc.name}</span>
                      {location === loc.name && (
                        <i className="fas fa-check text-success"></i>
                      )}
                    </div>
                  </button>
                ))}
                
                {/* Custom Location Input */}
                <div className="p-2 border-top">
                  <div className="input-group input-group-sm">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Enter city name..."
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          handleLocationChange(e.target.value.trim());
                          e.target.value = '';
                        }
                      }}
                      style={{ fontSize: '0.8rem' }}
                    />
                    <button 
                      className="btn btn-primary"
                      onClick={(e) => {
                        const input = e.target.previousElementSibling;
                        if (input.value.trim()) {
                          handleLocationChange(input.value.trim());
                          input.value = '';
                        }
                      }}
                      style={{ fontSize: '0.8rem' }}
                    >
                      <i className="fas fa-search"></i>
                    </button>
                  </div>
                  <small className="text-muted d-block mt-1">
                    Press Enter or click search
                  </small>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Temperature Display */}
        <div className="temperature-section">
          <div className="d-flex align-items-center justify-content-between">
            {/* Weather Icon and Temp */}
            <div className="d-flex align-items-center">
              <div className="weather-icon me-2" style={{ fontSize: '1.8rem' }}>
                {getWeatherIcon(conditions)}
              </div>
              <div>
                <div className="temperature-display">
                  <span className="h4 mb-0 fw-bold text-white">
                    {loading ? '...' : formatTemp(temp)}
                  </span>
                  <button 
                    onClick={toggleUnit}
                    className="btn btn-link btn-sm p-0 ms-1"
                    style={{ 
                      fontSize: '0.8rem', 
                      textDecoration: 'none',
                      color: 'rgba(255, 255, 255, 0.8)'
                    }}
                    title={`Switch to ${unit === 'metric' ? '°F' : '°C'}`}
                  >
                    {unit === 'metric' ? '°F' : '°C'}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Conditions and Refresh */}
            <div className="text-end">
              <div className="conditions small text-white mb-1" style={{ opacity: 0.9 }}>
                {loading ? 'Loading...' : conditions}
              </div>
              <button 
                onClick={() => loadWeather()}
                className="btn btn-sm btn-outline-light p-1"
                disabled={loading}
                title="Refresh temperature"
                style={{ fontSize: '0.7rem' }}
              >
                <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
              </button>
            </div>
          </div>
        </div>

        {/* Additional Info (only visible when not selecting location) */}
        {!showLocationSelect && (
          <div className="additional-info mt-2 pt-2 border-top border-white border-opacity-25">
            <div className="row g-1">
              <div className="col-6">
                <div className="text-center p-1 bg-white bg-opacity-10 rounded">
                  <small className="d-block text-white opacity-75">Feels Like</small>
                  <span className="small fw-semibold text-white">
                    {temp !== null && temp !== '--' ? `${temp}°` : '--'}
                  </span>
                </div>
              </div>
              <div className="col-6">
                <div className="text-center p-1 bg-white bg-opacity-10 rounded">
                  <small className="d-block text-white opacity-75">Updated</small>
                  <span className="small fw-semibold text-white">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Footer with data source */}
      <div className="card-footer py-1 bg-transparent border-top-0">
        <small className="text-white opacity-75 d-flex justify-content-between align-items-center">
          <span>
            <i className="fas fa-info-circle me-1"></i>
            Visual Crossing
          </span>
          <span className="badge bg-white bg-opacity-25 text-white">
            {unit === 'metric' ? '°C' : '°F'}
          </span>
        </small>
      </div>
    </div>
  );
};

export default SimpleTemperature;