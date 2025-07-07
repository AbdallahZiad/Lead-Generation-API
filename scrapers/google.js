const axios = require('axios');
const { normalizeCompany } = require('../normalize');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

async function geocodeLocation(locationName) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json`;
  const response = await axios.get(url, {
    params: {
      address: locationName,
      key: GOOGLE_API_KEY,
    }
  });

  const { results } = response.data;
  if (!results || results.length === 0) {
    throw new Error(`Could not geocode location: ${locationName}`);
  }

  return results[0].geometry.location; // { lat, lng }
}

async function searchPlaces(keyword, location, radius = 50000) {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json`;
  const response = await axios.get(url, {
    params: {
      query: keyword,
      location,
      radius,
      key: GOOGLE_API_KEY
    }
  });
  return response.data.results || [];
}

async function getPlaceDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json`;
  const response = await axios.get(url, {
    params: {
      place_id: placeId,
      fields: 'name,formatted_address,formatted_phone_number,website',
      key: GOOGLE_API_KEY
    }
  });
  return response.data.result || {};
}

// 🧠 Exported function to be used directly as the POST route handler
module.exports = async function googleScraper(req, res, next) {
  const { keyword, location } = req.body;

  if (!keyword || !location) {
    return res.status(400).json({ error: 'Missing keyword or location in body.' });
  }

  try {
    const coords = await geocodeLocation(location);
    const places = await searchPlaces(keyword, `${coords.lat},${coords.lng}`);
    const detailedResults = await Promise.all(
      places.map(async (place) => {
        const details = await getPlaceDetails(place.place_id);
        return normalizeCompany({ ...place, ...details }, 'google');
      })
    );

    res.json(detailedResults);
  } catch (err) {
    next(err); // use global error handler in index.js
  }
};
