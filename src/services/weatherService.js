const API_KEY = process.env.REACT_APP_WEATHER_API_KEY;
const BASE_URL = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

// Debug logging helper
const logApiCall = (url, location, unitGroup) => {
  const safeUrl = url.replace(API_KEY, '***HIDDEN***');
  console.log('🌤️ Weather API Request:', {
    url: safeUrl,
    location,
    unitGroup,
    hasApiKey: !!API_KEY,
    apiKeyLength: API_KEY ? API_KEY.length : 0,
    keyPrefix: API_KEY ? API_KEY.substring(0, 6) : 'none'
  });
};

// Main API function
export const fetchWeatherData = async (location, unitGroup = 'metric') => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Visual Crossing API expects format: location/startDate/endDate
    // For single day: use same start and end date
    const url = `${BASE_URL}/${encodeURIComponent(location)}/${today}/${today}?unitGroup=${unitGroup}&include=days&key=${API_KEY}&contentType=json`;
    
    // Log API call (with hidden API key)
    logApiCall(url, location, unitGroup);
    
    console.log('⏳ Fetching weather data from Visual Crossing...');
    
    // Add timeout and better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      }
    });
    
    clearTimeout(timeoutId);
    
    console.log('📡 Weather API Response Status:', response.status, response.statusText);
    
    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorText = await response.text();
        errorDetails = errorText.substring(0, 200);
        console.error('❌ Weather API Error Response:', errorDetails);
      } catch (e) {
        errorDetails = 'Could not read error response';
      }
      
      // Specific error handling
      if (response.status === 400) {
        throw new Error(`Invalid location: "${location}". Try "Noida, India" or "28.5355,77.3910"`);
      } else if (response.status === 401) {
        throw new Error('Invalid API key. Check your Visual Crossing API key.');
      } else if (response.status === 403) {
        throw new Error('API key not authorized or rate limited.');
      } else if (response.status === 404) {
        throw new Error('Weather data not found for this location.');
      } else {
        throw new Error(`Weather API error: ${response.status} - ${response.statusText}`);
      }
    }
    
    const data = await response.json();
    
    console.log('✅ Weather API Success:', {
      location: data.resolvedAddress,
      days: data.days?.length || 0,
      timezone: data.timezone,
      currentTemp: data.days[0]?.temp
    });
    
    // Handle case where days array might be empty
    if (!data.days || data.days.length === 0) {
      throw new Error('No weather data available for this location and date.');
    }
    
    return {
      location: data.resolvedAddress,
      current: {
        ...data.days[0],
        conditions: data.days[0].conditions || 'Unknown',
        temp: data.days[0].temp || 0,
        tempmax: data.days[0].tempmax || data.days[0].temp,
        tempmin: data.days[0].tempmin || data.days[0].temp,
        humidity: data.days[0].humidity || 50,
        windspeed: data.days[0].windspeed || 0
      },
      forecast: data.days.slice(1, 5).map(day => ({
        ...day,
        conditions: day.conditions || 'Unknown',
        temp: day.temp || 0
      })),
      timezone: data.timezone
    };
    
  } catch (error) {
    console.error('❌ Error fetching weather:', error);
    
    // If it's a network/abort error, provide helpful message
    if (error.name === 'AbortError') {
      throw new Error('Weather request timeout. Please check your internet connection.');
    }
    
    // If it's a location error, suggest alternatives
    if (error.message.includes('Invalid location')) {
      throw new Error(`${error.message}. Try: "New Delhi", "Delhi, India", or "28.6139,77.2090"`);
    }
    
    throw error;
  }
};

export const fetchWeatherForCoordinates = async (lat, lng, unitGroup = 'metric') => {
  try {
    const location = `${lat},${lng}`;
    console.log(`📍 Fetching weather for coordinates: ${lat}, ${lng}`);
    return await fetchWeatherData(location, unitGroup);
  } catch (error) {
    console.error('❌ Error fetching weather by coordinates:', error);
    // Try with city name as fallback
    console.log('🔄 Falling back to city name...');
    return await fetchWeatherData('Noida', unitGroup);
  }
};

export const getUserLocationWeather = async (unitGroup = 'metric') => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      console.warn('📍 Geolocation not supported by browser');
      // Fallback to default location
      resolve(fetchWeatherData('Noida, India', unitGroup));
      return;
    }

    console.log('📍 Requesting user location permission...');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          console.log('📍 User location obtained:', { latitude, longitude });
          const weather = await fetchWeatherForCoordinates(latitude, longitude, unitGroup);
          resolve(weather);
        } catch (error) {
          console.error('❌ Error getting weather for user location:', error);
          // Fallback to default location
          resolve(fetchWeatherData('Noida, India', unitGroup));
        }
      },
      (error) => {
        console.error('❌ Geolocation permission denied or error:', error.message);
        // User denied location, use default
        resolve(fetchWeatherData('Noida, India', unitGroup));
      },
      {
        timeout: 10000,
        maximumAge: 600000,
        enableHighAccuracy: false // Faster response
      }
    );
  });
};

// Test the API connection
export const testWeatherAPI = async () => {
  console.log('🧪 Testing Visual Crossing Weather API Connection...');
  console.log('🔑 API Key:', API_KEY ? `Present (starts with: ${API_KEY.substring(0, 6)}...)` : 'Missing');
  console.log('🌐 Environment:', process.env.NODE_ENV);
  
  const testLocations = [
    'Noida, India',
    '28.5355,77.3910', // Noida coordinates
    'New Delhi',
    'London,UK'
  ];
  
  for (const location of testLocations) {
    try {
      console.log(`\n📍 Testing location: "${location}"`);
      const data = await fetchWeatherData(location);
      console.log(`✅ Success for "${location}":`, data.location);
      console.log(`🌡️ Current temperature: ${data.current.temp}°C`);
      return data;
    } catch (error) {
      console.log(`❌ Failed for "${location}":`, error.message);
    }
  }
  
  throw new Error('All test locations failed. Check your API key and network.');
};