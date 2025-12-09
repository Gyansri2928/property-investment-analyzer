import React, { useState, useEffect } from 'react';
import { fetchWeatherData, getUserLocationWeather } from '../services/weatherService';

const WeatherWidget = ({ defaultLocation = 'Noida' }) => {
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [location, setLocation] = useState(defaultLocation);
  const [unit, setUnit] = useState('metric'); // 'metric' or 'us'

  const loadWeather = async (loc = location) => {
    setLoading(true);
    setError('');
    
    try {
      const data = await fetchWeatherData(loc, unit);
      setWeather(data);
    } catch (err) {
      setError('Failed to load weather data. Try another location.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-detect location on first load
  useEffect(() => {
    const initializeWeather = async () => {
      setLoading(true);
      try {
        // Try to get user's location first
        const userWeather = await getUserLocationWeather(unit);
        setWeather(userWeather);
        setLocation(userWeather.location.split(',')[0]); // Just city name
      } catch (error) {
        console.log('Using default location:', defaultLocation);
        await loadWeather(defaultLocation);
      }
    };

    initializeWeather();
  }, []);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (location.trim()) {
      loadWeather(location.trim());
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSubmit(e);
    }
  };

  const formatTemp = (temp) => {
    return `${Math.round(temp)}°${unit === 'metric' ? 'C' : 'F'}`;
  };

  const getWeatherIcon = (conditions) => {
    if (!conditions) return '🌈';
    
    const lowerConditions = conditions.toLowerCase();
    
    if (lowerConditions.includes('clear') || lowerConditions.includes('sunny')) {
      return '☀️';
    } else if (lowerConditions.includes('cloud')) {
      return '☁️';
    } else if (lowerConditions.includes('rain') || lowerConditions.includes('drizzle')) {
      return '🌧️';
    } else if (lowerConditions.includes('snow') || lowerConditions.includes('flurries')) {
      return '❄️';
    } else if (lowerConditions.includes('storm') || lowerConditions.includes('thunder')) {
      return '⛈️';
    } else if (lowerConditions.includes('partly')) {
      return '⛅';
    } else if (lowerConditions.includes('fog') || lowerConditions.includes('mist')) {
      return '🌫️';
    } else {
      return '🌈';
    }
  };

  return (
    <div className="weather-widget card shadow-sm h-100">
      <div className="card-header bg-info text-white py-2">
        <div className="d-flex justify-content-between align-items-center">
          <h6 className="mb-0">
            <i className="fas fa-cloud-sun me-1"></i>
            Weather Forecast
          </h6>
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className={`btn ${unit === 'metric' ? 'btn-light' : 'btn-outline-light'}`}
              onClick={() => setUnit('metric')}
              disabled={loading || unit === 'metric'}
            >
              °C
            </button>
            <button
              type="button"
              className={`btn ${unit === 'us' ? 'btn-light' : 'btn-outline-light'}`}
              onClick={() => setUnit('us')}
              disabled={loading || unit === 'us'}
            >
              °F
            </button>
          </div>
        </div>
      </div>
      
      <div className="card-body p-3">
        {/* Location Search */}
        <form onSubmit={handleSubmit} className="mb-3">
          <div className="input-group input-group-sm">
            <input
              type="text"
              className="form-control"
              placeholder="Search city..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            <button 
              className="btn btn-primary" 
              type="submit"
              disabled={loading}
            >
              <i className="fas fa-search"></i>
            </button>
            <button 
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    async (position) => {
                      const { latitude, longitude } = position.coords;
                      setLocation(`${latitude},${longitude}`);
                      await loadWeather(`${latitude},${longitude}`);
                    },
                    () => {
                      setError('Location access denied. Please search manually.');
                    }
                  );
                }
              }}
              disabled={loading}
              title="Use my location"
            >
              <i className="fas fa-location-arrow"></i>
            </button>
          </div>
        </form>

        {error && (
          <div className="alert alert-warning alert-sm py-2 mb-3" role="alert">
            <small>
              <i className="fas fa-exclamation-triangle me-1"></i>
              {error}
            </small>
          </div>
        )}

        {loading && !weather ? (
          <div className="text-center py-4">
            <div className="spinner-border text-primary spinner-border-sm" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-2 small text-muted">Loading weather data...</p>
          </div>
        ) : weather && (
          <>
            {/* Current Weather */}
            <div className="current-weather text-center mb-4">
              <div className="weather-icon display-4 mb-2">
                {getWeatherIcon(weather.current.conditions)}
              </div>
              <div className="temperature display-5 fw-bold mb-1">
                {formatTemp(weather.current.temp)}
              </div>
              <h6 className="mb-1">{weather.location.split(',')[0]}</h6>
              <p className="text-muted small mb-2">
                {weather.current.conditions}
                <br />
                H: {formatTemp(weather.current.tempmax)} • L: {formatTemp(weather.current.tempmin)}
              </p>
            </div>

            {/* Weather Stats */}
            <div className="weather-stats mb-4">
              <div className="row g-2 text-center">
                <div className="col-4">
                  <div className="stat-item p-2 border rounded">
                    <div className="stat-icon text-primary mb-1">
                      <i className="fas fa-wind"></i>
                    </div>
                    <div className="stat-value fw-bold small">
                      {weather.current.windspeed} km/h
                    </div>
                    <div className="stat-label text-muted extra-small">
                      Wind
                    </div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="stat-item p-2 border rounded">
                    <div className="stat-icon text-primary mb-1">
                      <i className="fas fa-tint"></i>
                    </div>
                    <div className="stat-value fw-bold small">
                      {weather.current.humidity}%
                    </div>
                    <div className="stat-label text-muted extra-small">
                      Humidity
                    </div>
                  </div>
                </div>
                <div className="col-4">
                  <div className="stat-item p-2 border rounded">
                    <div className="stat-icon text-primary mb-1">
                      <i className="fas fa-sun"></i>
                    </div>
                    <div className="stat-value fw-bold small">
                      {weather.current.uvindex}
                    </div>
                    <div className="stat-label text-muted extra-small">
                      UV Index
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Forecast */}
            <div className="forecast-section">
              <h6 className="border-bottom pb-2 mb-3 small fw-bold">
                <i className="fas fa-calendar-alt me-1"></i>
                3-Day Forecast
              </h6>
              <div className="row g-2">
                {weather.forecast.slice(0, 3).map((day, index) => {
                  const date = new Date(day.datetime);
                  const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                  
                  return (
                    <div className="col-4" key={index}>
                      <div className="forecast-day text-center p-2 border rounded">
                        <div className="day-name small fw-bold mb-1">
                          {dayName}
                        </div>
                        <div className="weather-icon mb-1">
                          {getWeatherIcon(day.conditions)}
                        </div>
                        <div className="temperature fw-bold">
                          {formatTemp(day.temp)}
                        </div>
                        <div className="conditions extra-small text-muted mt-1">
                          {day.conditions.split(' ')[0]}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
      
      <div className="card-footer py-2">
        <div className="d-flex justify-content-between align-items-center">
          <small className="text-muted">
            <i className="fas fa-info-circle me-1"></i>
            Visual Crossing
          </small>
          {weather && (
            <button 
              className="btn btn-sm btn-outline-secondary"
              onClick={() => loadWeather()}
              disabled={loading}
              title="Refresh"
            >
              <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`}></i>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeatherWidget;