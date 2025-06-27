require('dotenv').config(); // โหลด Environment Variables จากไฟล์ .env

const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware สำหรับการ Parse JSON body ในทุก request
app.use(express.json());

// --- การตั้งค่า Spotify API ---
const spotifyApi = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

// ฟังก์ชันสำหรับขอและรีเฟรช Access Token จาก Spotify
// เราใช้ Client Credentials Flow ซึ่งเหมาะกับ Server-to-Server communication
async function getSpotifyAccessToken() {
    try {
        const data = await spotifyApi.clientCredentialsGrant();
        console.log('The access token expires in ' + data.body['expires_in'] + ' seconds.');
        console.log('Successfully retrieved a new access token.');

        // ตั้งค่า Access Token ให้กับ Spotify API object
        spotifyApi.setAccessToken(data.body['access_token']);

        // ตั้งเวลาเพื่อเรียกขอ Access Token ใหม่ก่อนหมดอายุเล็กน้อย
        // ตัวอย่าง: รีเฟรช 60 วินาทีก่อนหมดอายุ
        setTimeout(getSpotifyAccessToken, (data.body['expires_in'] - 60) * 1000);
    } catch (err) {
        console.error('Something went wrong when retrieving an access token:', err.message);
        // อาจจะต้องมี logic ในการ retry หรือแจ้งเตือนผู้ดูแลระบบ
    }
}

// เรียกขอ Access Token ทันทีที่เซิร์ฟเวอร์เริ่มทำงาน
getSpotifyAccessToken();

---

// --- ฟังก์ชันช่วยเหลือ (Helper Functions) ---

// ฟังก์ชันสำหรับแปลง 'mood' เป็น Audio Features ที่ Spotify API เข้าใจ
// ค่าเหล่านี้สามารถปรับจูนได้ตามความเหมาะสมของคำว่า 'mood'
function mapMoodToAudioFeatures(mood) {
    switch (mood.toLowerCase()) {
        case 'happy':
            return { target_valence: 0.9, target_energy: 0.8, target_danceability: 0.7 };
        case 'relaxed':
            return { target_valence: 0.7, target_energy: 0.3, target_danceability: 0.4 };
        case 'sad':
            return { target_valence: 0.2, target_energy: 0.3, target_danceability: 0.3 };
        case 'energetic':
            return { target_valence: 0.8, target_energy: 0.9, target_danceability: 0.8 };
        case 'calm':
            return { target_valence: 0.6, target_energy: 0.2, target_danceability: 0.3 };
        case 'party':
            return { target_valence: 0.9, target_energy: 0.9, target_danceability: 0.9 };
        default:
            // ค่าเริ่มต้น หรือค่าที่ปลอดภัย หาก mood ไม่ตรงกับที่กำหนด
            return { target_valence: 0.5, target_energy: 0.5, target_danceability: 0.5 };
    }
}

// ฟังก์ชันสำหรับ Map ภาษาเป็น Market Code ของ Spotify
// Spotify ใช้ market code (ISO 3166-1 alpha-2 country code) ในการจำกัดผลลัพธ์
function mapLanguageToMarketCode(language) {
    const marketCodeMap = {
        'thai': 'TH',
        'english': 'US', // หรือ 'GB', 'CA', 'AU' ฯลฯ ขึ้นอยู่กับความต้องการ
        'japanese': 'JP',
        'korean': 'KR',
        'chinese': 'TW', // หรือ 'HK', 'SG'
        'french': 'FR',
        'german': 'DE',
        'spanish': 'ES',
        'vietnamese': 'VN',
        'indonesian': 'ID',
        // สามารถเพิ่มภาษาอื่นๆ ได้ตามต้องการ
    };
    return marketCodeMap[language.toLowerCase()];
}

// --- API Endpoint ---

// Endpoint สำหรับสุ่มเพลงตาม mood, genre, หรือ language
app.post('/api/random-music', async (req, res) => {
    const { mood, genre, language } = req.body;

    // ตรวจสอบว่ามีพารามิเตอร์อย่างน้อยหนึ่งตัวหรือไม่
    if (!mood && !genre && !language) {
        return res.status(400).json({ error: 'At least one parameter (mood, genre, or language) is required.' });
    }

    // กำหนดค่าเริ่มต้นสำหรับ Parameters ของ Spotify Recommendations API
    let seedParameters = {};
    let recommendationOptions = {
        limit: 20, // จำนวนเพลงที่ต้องการให้ Spotify แนะนำ (สูงสุด 100)
    };

    // 1. จัดการ Genre
    if (genre) {
        // Spotify API ใช้ genre เป็นตัวพิมพ์เล็กเสมอ
        // สามารถดึง Available Genre Seeds มาตรวจสอบก่อนได้ถ้าต้องการความถูกต้องสูงสุด
        seedParameters.seed_genres = [genre.toLowerCase()];
    }

    // 2. จัดการ Mood (แปลงเป็น Audio Features)
    if (mood) {
        const audioFeatures = mapMoodToAudioFeatures(mood);
        // ผนวก Audio Features เข้าไปใน recommendationOptions
        recommendationOptions = { ...recommendationOptions, ...audioFeatures };
    }

    // 3. จัดการ Language (แปลงเป็น Market Code)
    if (language) {
        const market = mapLanguageToMarketCode(language);
        if (market) {
            recommendationOptions.market = market;
        } else {
            console.warn(`Unsupported language "${language}". Not setting market parameter.`);
        }
    }

    // ข้อกำหนดของ Spotify API: ต้องมี seed อย่างน้อยหนึ่งตัว (artist, track, หรือ genre)
    // หากไม่มี seed จากพารามิเตอร์ที่ผู้ใช้ส่งมา เราจะใช้ genre default
    if (Object.keys(seedParameters).length === 0) {
        // หากไม่มี genre ที่ระบุ และไม่มี artist/track seeds
        // เราสามารถใช้ genre ที่เป็นที่นิยมเป็น fallback ได้
        seedParameters.seed_genres = ['pop', 'rock', 'hip-hop']; // ใช้หลายแนวเพลงเป็น seed ได้
        console.log("No specific genre seed provided, falling back to popular genres.");
    }

    try {
        // เรียก Spotify Recommendations API
        const data = await spotifyApi.getRecommendations({
            ...seedParameters,    // seed_genres, seed_artists, seed_tracks
            ...recommendationOptions // limit, target_valence, target_energy, market, ฯลฯ
        });

        // Map ผลลัพธ์ให้เป็นข้อมูลที่เราต้องการ
        const tracks = data.body.tracks.map(track => ({
            id: track.id,
            name: track.name,
            artist: track.artists.map(artist => artist.name).join(', '),
            album: track.album.name,
            preview_url: track.preview_url, // URL ของคลิปตัวอย่าง 30 วินาที
            external_url: track.external_urls.spotify, // ลิงก์ไป Spotify
            image: track.album.images[0] ? track.album.images[0].url : null, // ภาพปกอัลบั้ม
            // สามารถเพิ่ม audio features อื่นๆ ได้ เช่น track.valence, track.energy
            audio_features: {
                valence: track.valence, // Note: spotify-web-api-node might not directly return audio features in getRecommendations result.
                energy: track.energy,   // You might need an additional call to getAudioFeaturesForTracks.
                danceability: track.danceability
            }
        }));

        if (tracks.length > 0) {
            // สุ่มเลือกเพลงหนึ่งเพลงจากผลลัพธ์ที่ได้
            const randomIndex = Math.floor(Math.random() * tracks.length);
            const randomTrack = tracks[randomIndex];
            res.json(randomTrack);
        } else {
            // กรณีไม่พบเพลงใดๆ ที่ตรงตามเงื่อนไข
            res.status(404).json({ message: 'No tracks found for the given criteria. Try different parameters.' });
        }

    } catch (err) {
        console.error('Error fetching recommendations from Spotify:', err);

        // การจัดการข้อผิดพลาดจาก Spotify API
        if (err.statusCode === 401) { // Unauthorized: Access Token หมดอายุหรือไม่ถูกต้อง
            console.warn('Spotify access token expired or invalid. Attempting to refresh...');
            await getSpotifyAccessToken(); // พยายามขอ token ใหม่
            // เนื่องจากนี่เป็น Server-side, เราอาจจะตอบกลับ error แล้วให้ client ลองใหม่
            // หรือ implement retry logic ที่นี่
            return res.status(500).json({ error: 'Spotify access token expired. Please try your request again.' });
        } else if (err.statusCode === 400) { // Bad Request: อาจเกิดจาก seed ที่ไม่ถูกต้อง
            return res.status(400).json({ error: 'Spotify API received a bad request. Check your parameters (e.g., genre seed might be invalid).', details: err.message });
        }
        
        // ข้อผิดพลาดอื่นๆ ที่ไม่ได้มาจาก Spotify API โดยตรง
        res.status(500).json({ error: 'Failed to fetch music from Spotify API.', details: err.message });
    }
});

---

// --- เริ่มต้นเซิร์ฟเวอร์ ---
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`API Endpoint: POST http://localhost:${PORT}/api/random-music`);
    console.log('Expected JSON Body: { "mood": "happy", "genre": "pop", "language": "thai" } (at least one parameter)');
});
