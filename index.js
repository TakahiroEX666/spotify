const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- การตั้งค่า Spotify API ---
const spotifyApi = new SpotifyWebApi({
  clientId: "7b188586c0004c14837336cd1f89d144",
  clientSecret: "6a35ebad8f5847e7ac30794eba88a0e2",
});

// --- ฟังก์ชันรับ Access Token ---
async function getSpotifyAccessToken() {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    console.log('Access token expires in', data.body.expires_in, 'seconds.');
    spotifyApi.setAccessToken(data.body.access_token);
    setTimeout(getSpotifyAccessToken, (data.body.expires_in - 60) * 1000);
  } catch (err) {
    console.error('Failed to retrieve Spotify access token:', err.message);
  }
}

// เรียกใช้เมื่อเริ่มเซิร์ฟเวอร์
getSpotifyAccessToken();

// --- Map Mood เป็น Audio Features ---
function mapMoodToAudioFeatures(mood) {
  switch (mood.toLowerCase()) {
    case 'happy': return { target_valence: 0.9, target_energy: 0.8, target_danceability: 0.7 };
    case 'relaxed': return { target_valence: 0.7, target_energy: 0.3, target_danceability: 0.4 };
    case 'sad': return { target_valence: 0.2, target_energy: 0.3, target_danceability: 0.3 };
    case 'energetic': return { target_valence: 0.8, target_energy: 0.9, target_danceability: 0.8 };
    case 'calm': return { target_valence: 0.6, target_energy: 0.2, target_danceability: 0.3 };
    case 'party': return { target_valence: 0.9, target_energy: 0.9, target_danceability: 0.9 };
    default: return { target_valence: 0.5, target_energy: 0.5, target_danceability: 0.5 };
  }
}

// --- Map ภาษาเป็น Market Code ---
function mapLanguageToMarketCode(language) {
  const map = {
    'thai': 'TH', 'english': 'US', 'japanese': 'JP', 'korean': 'KR',
    'chinese': 'TW', 'french': 'FR', 'german': 'DE',
    'spanish': 'ES', 'vietnamese': 'VN', 'indonesian': 'ID',
  };
  return map[language.toLowerCase()];
}

// --- API Endpoint ---
app.post('/api/random-music', async (req, res) => {
  const { mood, genre, language } = req.body;

  if (!mood && !genre && !language) {
    return res.status(400).json({ error: 'At least one parameter (mood, genre, or language) is required.' });
  }

  if (!spotifyApi.getAccessToken()) {
    return res.status(503).json({ error: 'Spotify API not ready. Try again shortly.' });
  }

  let seedParameters = {};
  let options = { limit: 20 };

  if (genre) {
    seedParameters.seed_genres = [genre.toLowerCase()];
  }

  if (mood) {
    Object.assign(options, mapMoodToAudioFeatures(mood));
  }

  if (language) {
    const market = mapLanguageToMarketCode(language);
    if (market) {
      options.market = market;
    } else {
      console.warn(`Unknown language "${language}"`);
    }
  }

  if (Object.keys(seedParameters).length === 0) {
    seedParameters.seed_genres = ['pop', 'rock', 'hip-hop'];
    console.log("Using default genre seeds.");
  }

  console.log('Request to Spotify:', { ...seedParameters, ...options });

  try {
    const data = await spotifyApi.getRecommendations({
      ...seedParameters,
      ...options
    });

    const tracks = data.body.tracks.map(track => ({
      id: track.id,
      name: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      preview_url: track.preview_url,
      external_url: track.external_urls.spotify,
      image: track.album.images[0]?.url || null,
      audio_features: {
        valence: null,
        energy: null,
        danceability: null
      }
    }));

    if (tracks.length > 0) {
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
      return res.json(randomTrack);
    } else {
      return res.status(404).json({ message: 'No tracks found. Try different parameters.' });
    }

  } catch (err) {
    console.error('Spotify API error:', err);
    const status = err.statusCode || 500;
    const message = err.body?.error?.message || err.message || 'Unknown error';

    if (status === 401) {
      console.warn('Access token expired. Refreshing...');
      await getSpotifyAccessToken();
      return res.status(500).json({ error: 'Spotify token expired. Please retry.' });
    }

    return res.status(status).json({
      error: 'Failed to fetch music from Spotify API.',
      details: message
    });
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`POST http://localhost:${PORT}/api/random-music`);
});
