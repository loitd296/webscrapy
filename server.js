// ==========================================================
// 1. IMPORTS & CÀI ĐẶT CƠ BẢN
// ==========================================================
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { YoutubeTranscript } = require('youtube-transcript'); // Thư viện lấy phụ đề

const app = express();
app.use(cors());
app.use(express.json());

// === THAY THẾ KHÓA API CỦA BẠN ===
const YOUTUBE_API_KEY = 'AIzaSyD0PGUqrmQqX7j33SuOfDf3QvZ0nrY9baw'; 
const PORT = 3000;
// =================================

// Bản đồ mẫu Category ID (vì API trả về ID, không phải tên)
const CATEGORY_MAP = {
    '1': 'Film & Animation', '10': 'Music', '17': 'Sports',
    '22': 'People & Blogs', '24': 'Entertainment', '25': 'News & Politics',
    '27': 'Education', '28': 'Science & Technology', ' Khác': 'Other'
};


// ==========================================================
// 2. LOGIC CÀO SUBTITLE
// ==========================================================

async function getTranscript(videoId) {
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        // Trả về văn bản gộp lại
        return transcript.map(item => item.text).join(' ');
    } catch (e) {
        console.warn(`Không lấy được transcript cho video ${videoId}:`, e.message);
        return "Không có phụ đề/transcript tự động.";
    }
}

async function fetchVideoDetails(videoIds) {
    // Gọi API /videos để lấy chi tiết (Category, Full Description)
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos`;
    
    try {
        const response = await axios.get(apiUrl, {
            params: {
                part: 'snippet,contentDetails', 
                id: videoIds.join(','), 
                key: YOUTUBE_API_KEY
            }
        });
        
        const videoPromises = response.data.items.map(async (item) => {
            const videoId = item.id;
            
            // === BƯỚC QUAN TRỌNG: GỌI HÀM CÀO SUBTITLE CHO TỪNG VIDEO ===
            const transcriptText = await getTranscript(videoId);

            return {
                videoId: videoId,
                title: item.snippet.title,
                channel: item.snippet.channelTitle,
                description: item.snippet.description, 
                categoryName: CATEGORY_MAP[item.snippet.categoryId] || 'Khác', 
                embedUrl: `https://www.youtube.com/embed/${videoId}`,
                image: item.snippet.thumbnails.high.url,
                // Dữ liệu mới
                transcriptText: transcriptText 
            };
        });

        // Đợi tất cả Transcript được lấy xong
        return await Promise.all(videoPromises);

    } catch (error) {
        console.error("Lỗi gọi YouTube /videos API:", error.response ? error.response.data : error.message);
        return [];
    }
}


// ==========================================================
// 3. ENDPOINTS SERVER
// ==========================================================

// Endpoint tìm kiếm chính
app.post('/scrape-embed', async (req, res) => {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Vui lòng nhập từ khóa chủ đề' });
    
    // Bước 1: Gọi API /search để lấy danh sách ID
    const searchUrl = `https://www.googleapis.com/youtube/v3/search`;
    const searchResponse = await axios.get(searchUrl, {
        params: { part: 'id', q: `${title} English lesson`, maxResults: 5, type: 'video', key: YOUTUBE_API_KEY } // Giới hạn 5 kết quả
    });

    const videoIds = searchResponse.data.items.map(item => item.id.videoId);
    
    // Bước 2: Dùng IDs để gọi API /videos và lấy Transcript
    const results = await fetchVideoDetails(videoIds);
    res.json(results);
});

// Endpoint Export JSON
app.post('/export-json', (req, res) => {
    const dataToExport = req.body;
    
    // Thiết lập header để trình duyệt tự động tải xuống
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="youtube_export.json"');
    
    // Gửi dữ liệu JSON đã được định dạng
    res.send(JSON.stringify(dataToExport, null, 2));
});

// Endpoint phục vụ HTML (để đáp ứng yêu cầu "cùng 1 file")
app.get('/', (req, res) => {
    res.send(getHtmlPage());
});

app.listen(PORT, () => {
    console.log(`Server chạy tại http://localhost:${PORT}`);
});


// ==========================================================
// 4. FRONTEND HTML/JS (Được gửi từ Node.js)
// ==========================================================

function getHtmlPage() {
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Video Scraper with Subtitle Export</title>
    <style>
        body { font-family: sans-serif; background-color: #f4f4f4; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .controls { margin-bottom: 20px; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; gap: 10px; }
        input { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 4px; }
        button { padding: 12px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        .video-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 20px; }
        .card { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
        iframe { width: 100%; height: 200px; }
        .card-info { padding: 15px; }
        .card-info h3 { margin-top: 0; font-size: 1.1em; }
        .subtitle-box { max-height: 150px; overflow-y: scroll; border: 1px solid #eee; padding: 10px; margin-top: 10px; font-size: 0.9em; background: #fafafa; white-space: pre-wrap;}
        #exportBtn { background: #28a745; margin-left: 10px; }
    </style>
</head>
<body>
    <div class="container">
        <h2>🎥 YouTube Scraper with Transcript</h2>
        <div class="controls">
            <input type="text" id="keyword" placeholder="Nhập chủ đề tiếng Anh...">
            <button onclick="startScraping()" id="searchBtn">Tìm kiếm & Cào Subtitle</button>
            <button onclick="exportJson()" id="exportBtn" disabled>Export JSON (0)</button>
        </div>

        <div id="loader" style="display:none; text-align:center;">
            Đang tìm kiếm và cào Subtitle (quá trình này mất 10-20 giây)... ⏳
        </div>
        <div class="video-grid" id="results"></div>
    </div>

    <script>
        let videoData = []; // Biến lưu trữ data toàn cục

        async function startScraping() {
            const keyword = document.getElementById('keyword').value;
            const searchBtn = document.getElementById('searchBtn');
            const exportBtn = document.getElementById('exportBtn');
            const loader = document.getElementById('loader');
            const resultsDiv = document.getElementById('results');

            if (!keyword) return alert("Vui lòng nhập từ khóa!");

            resultsDiv.innerHTML = '';
            searchBtn.disabled = true;
            exportBtn.disabled = true;
            loader.style.display = 'block';

            try {
                const response = await fetch('/scrape-embed', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: keyword })
                });

                videoData = await response.json();
                
                resultsDiv.innerHTML = '';
                if(videoData.length === 0) {
                    resultsDiv.innerHTML = '<p style="text-align:center">Không tìm thấy video hoặc bị chặn API.</p>';
                    return;
                }

                // Hiển thị kết quả
                videoData.forEach(vid => {
                    const card = \`
                        <div class="card">
                            <iframe src="\${vid.embedUrl}" frameborder="0" allowfullscreen></iframe>
                            <div class="card-info">
                                <h3>\${vid.title}</h3>
                                <p><strong>Kênh:</strong> \${vid.channel} | <strong>Danh mục:</strong> \${vid.categoryName}</p>
                                <p><strong>Mô tả:</strong> \${vid.description.substring(0, 100)}...</p>
                                <h4>Subtitle/Transcript:</h4>
                                <div class="subtitle-box">\${vid.transcriptText}</div>
                            </div>
                        </div>
                    \`;
                    resultsDiv.innerHTML += card;
                });

                exportBtn.disabled = false;
                exportBtn.innerText = \`Export JSON (\${videoData.length})\`;

            } catch (err) {
                console.error("Lỗi kết nối server:", err);
                alert("Lỗi kết nối server!");
            } finally {
                searchBtn.disabled = false;
                loader.style.display = 'none';
            }
        }

        async function exportJson() {
            if (videoData.length === 0) return alert("Không có dữ liệu để xuất.");

            try {
                const response = await fetch('/export-json', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(videoData)
                });

                // Xử lý download file từ response
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = 'youtube_export.json';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                alert("Đã xuất file youtube_export.json thành công!");
                
            } catch (err) {
                console.error("Lỗi xuất file:", err);
            }
        }
    </script>
</body>
</html>
    `;
}