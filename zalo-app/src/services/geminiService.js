import { convertBlobToWav } from '../utils/wavUtils';


// Model Google AI Studio, thử lần lượt. Mặc định hợp gói miễn phí (demo): Flash Lite 500 lần/ngày,
// Flash chỉ 20 lần/ngày nên để sau. Đổi không cần sửa code: VITE_GEMINI_MODELS="a,b,c" trong .env
const DEFAULT_GEMINI_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-1.5-flash'];

export function getGeminiModels() {
  const fromEnv = typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_MODELS;
  const models = (fromEnv || '').split(',').map((m) => m.trim()).filter(Boolean);
  return models.length > 0 ? models : DEFAULT_GEMINI_MODELS;
}

// Sai tên model (404), hết lượt (429), quá tải (503) -> thử model tiếp theo
const RETRY_NEXT_MODEL_STATUS = new Set([404, 429, 503]);

export function getActiveApiKey(providedKey) {
  if (providedKey && typeof providedKey === 'string' && providedKey.trim()) {
    return providedKey.trim();
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('gemini_api_key');
    if (stored && stored.trim()) return stored.trim();
  }
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
    const envKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (envKey && envKey.trim()) return envKey.trim();
  }
  return '';
}

export function cleanJsonOutput(text) {
  if (!text) return '';
  let str = text.trim();

  // 1. Kiểm tra khối markdown ```json ... ```
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    str = codeBlockMatch[1].trim();
  }

  // 2. Tìm khối JSON { ... } lớn nhất
  const jsonMatch = str.match(/\{[\s\S]*\}/);
  if (jsonMatch && jsonMatch[0]) {
    return jsonMatch[0].trim();
  }

  return str;
}

export async function postVilaoChatCompletion(payload, apiKey, customEndpoints = null) {
  const endpoints = Array.isArray(customEndpoints) && customEndpoints.length > 0 ? [...customEndpoints] : [];
  if (endpoints.length === 0) {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      endpoints.push('/api-ai/v1/chat/completions');
    }
    const configuredBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AI_BASE_URL) || 'https://api.vilao.ai/v1';
    const directEndpoint = `${configuredBase.replace(/\/+$/, '')}/chat/completions`;
    if (!endpoints.includes(directEndpoint)) {
      endpoints.push(directEndpoint);
    }
    if (!endpoints.includes('https://api.vilao.ai/v1/chat/completions')) {
      endpoints.push('https://api.vilao.ai/v1/chat/completions');
    }
  }

  let lastErr = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        return await response.json();
      }

      const errBody = await response.json().catch(() => ({}));
      lastErr = new Error(errBody.error?.message || `Lỗi API HTTP ${response.status} (${endpoint})`);
    } catch (netErr) {
      lastErr = netErr;
      console.warn(`Kết nối endpoint ${endpoint} thất bại, thử endpoint dự phòng:`, netErr);
    }
  }

  throw lastErr || new Error('Không thể kết nối đến máy chủ AI vilao.ai');
}

export async function callVilaoApi(prompt, apiKey) {
  const result = await postVilaoChatCompletion({
    model: 'gemini-3.8-flash',
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    max_tokens: 3000,
    temperature: 0.1
  }, apiKey);

  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI không trả về nội dung dữ liệu');
  }
  const cleaned = cleanJsonOutput(content);
  const parsed = JSON.parse(cleaned);
  parsed._modelUsed = 'vilao.ai (gemini-3.8-flash)';
  return parsed;
}

export async function callGoogleGeminiApi(payload, apiKey) {
  let lastError = null;

  for (const model of getGeminiModels()) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      lastError = new Error(`Gemini (${model}): ${errBody.error?.message || `Lỗi HTTP ${response.status}`}`);
      if (RETRY_NEXT_MODEL_STATUS.has(response.status)) {
        console.warn(`[AI] ${model} lỗi ${response.status}, thử model tiếp theo`);
        continue;
      }
      throw lastError;
    }

    const result = await response.json();
    const outputText = result.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    if (!outputText) {
      throw new Error(`Gemini AI (${model}) không trả về dữ liệu`);
    }
    const parsed = JSON.parse(cleanJsonOutput(outputText));
    parsed._modelUsed = `Google Gemini (${model})`;
    return parsed;
  }

  throw lastError || new Error('Không thể kết nối đến Google Gemini');
}

export async function analyzeVoiceWithGemini(userText, apiKey, customRemotes = []) {
  const activeKey = getActiveApiKey(apiKey);
  if (!activeKey) {
    throw new Error('Chưa cấu hình API Key trong file .env');
  }

  let customPromptBlock = '';
  if (Array.isArray(customRemotes) && customRemotes.length > 0) {
    const lines = [];
    for (const remote of customRemotes) {
      if (!remote.buttons || !Array.isArray(remote.buttons)) continue;
      for (const btn of remote.buttons) {
        const aliases = (btn.voiceAliases || []).join(', ');
        lines.push(`- Nút "${btn.label}" (action: "${btn.action || 'CUSTOM_ACTION'}", remote: "${remote.name || 'Remote ảo'}", bí danh: [${aliases}])`);
      }
    }
    if (lines.length > 0) {
      customPromptBlock = `\n--- CÁC PHÍM TÙY CHỈNH / REMOTE ẢO TRONG NHÀ ---\n${lines.join('\n')}\n`;
    }
  }

  const prompt = `Phân loại khẩu lệnh nhà thông minh (Smart TV, Điều hòa hoặc Thiết bị trong nhà): "${userText}"
Hiểu phương ngữ Bắc/Trung/Nam, tiếng người già, trẻ nhỏ, cách nói tự nhiên.

DANH SÁCH LỆNH:
--- ĐIỀU HÒA (Air Conditioner) ---
1. AC_COOL: Bật điều hòa, mở điều hòa, làm mát, mở máy lạnh... -> action: "AC_COOL", title: "Bật điều hòa làm mát", device: "Điều hòa (Hồng ngoại)", temp: 24
2. AC_OFF: Tắt điều hòa, tắt máy lạnh, nóng quá tắt đi, lạnh quá tắt máy... -> action: "AC_OFF", title: "Tắt điều hòa", device: "Điều hòa (Hồng ngoại)"
3. AC_SET_TEMP: Đặt nhiệt độ điều hòa (VD: "điều hòa 24 độ", "26 độ", "hạ xuống 22 độ", "nóng quá", "lạnh quá") -> action: "AC_SET_TEMP", title: "Đặt điều hòa nhiệt độ", device: "Điều hòa (Hồng ngoại)", temp: [16-30]

--- SMART TV ---
4. YOUTUBE_SEARCH: Khi người dùng muốn xem kênh cụ thể, ca sĩ, phim, video trên YouTube -> action: "YOUTUBE_SEARCH", title: "Mở kênh trên YouTube", channelQuery: "[Tên kênh/nội dung]", device: "Smart TV (Hồng ngoại)"
5. APP_YOUTUBE: Mở chung ứng dụng YouTube -> action: "APP_YOUTUBE", title: "Mở YouTube", device: "Smart TV (Hồng ngoại)"
6. APP_NETFLIX: Netflix, nét phờ lích, coi phim... -> action: "APP_NETFLIX", title: "Mở Netflix", device: "Smart TV (Hồng ngoại)"
7. TV_POWER_ON: Bật tivi, mở tivi, mở đài, xem tivi... -> action: "TV_POWER_ON", title: "Bật Tivi", device: "Smart TV (Hồng ngoại)"
8. TV_POWER_OFF: Tắt tivi, tắt đài, đi ngủ, nghỉ coi, dẹp tivi... -> action: "TV_POWER_OFF", title: "Tắt Tivi", device: "Smart TV (Hồng ngoại)"
9. VOL_UP: Tăng âm lượng, to lên, lớn tiếng... -> action: "VOL_UP", title: "Tăng âm lượng", device: "Smart TV (Hồng ngoại)"
10. VOL_DOWN: Giảm âm lượng, nhỏ lại, bớt ồn... -> action: "VOL_DOWN", title: "Giảm âm lượng", device: "Smart TV (Hồng ngoại)"
11. MUTE: Tắt tiếng, im lặng... -> action: "MUTE", title: "Tắt tiếng (Mute)", device: "Smart TV (Hồng ngoại)"
12. CH_VTV1: Thời sự, vtv1, đài 1... -> action: "CH_VTV1", title: "Kênh VTV1", device: "Smart TV (Hồng ngoại)"
13. CH_VTV3: VTV3, kênh 3, giải trí... -> action: "CH_VTV3", title: "Kênh VTV3", device: "Smart TV (Hồng ngoại)"
${customPromptBlock}
14. UNKNOWN: Hoàn toàn không liên quan đến điều khiển thiết bị nhà thông minh -> action: "UNKNOWN", title: "Lệnh chưa xác định", device: "Chưa xác định"

Trả về DUY NHẤT một JSON hợp lệ:
{"action":"TÊN_LỆNH","title":"Tên ngắn","temp":24,"channelQuery":"","device":"Tên thiết bị","explanation":"Giải thích ngắn 1 câu"}`;

  if (activeKey.startsWith('sk-')) {
    return await callVilaoApi(prompt, activeKey);
  }

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      // Dư chỗ cho phần "suy nghĩ" của model 3.x; JSON trả về chỉ ~100 token
      maxOutputTokens: 1024
    }
  };

  return await callGoogleGeminiApi(payload, activeKey);
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function transcribeAndAnalyzeAudioWithGemini(audioBlob, apiKey) {
  const activeKey = getActiveApiKey(apiKey);
  if (!activeKey) {
    throw new Error('Chưa cấu hình API Key trong file .env');
  }

  const prompt = `Bạn là Trợ lý AI Nhà thông minh chuyên nghe giọng nói tiếng Việt từ micro để điều khiển Tivi và Điều hòa.

HÃY NGHE KỸ ĐOẠN ÂM THANH ĐÍNH KÈM VÀ TRẢ VỀ DUY NHẤT 1 ĐỐI TƯỢNG JSON TRONG CẶP NGOẶC NHỌN {}:
{
  "transcript": "Ghi lại chính xác câu nói tiếng Việt nghe được từ đoạn âm thanh (để chuỗi rỗng nếu chỉ có im lặng, rè hoặc không có người nói)",
  "action": "TÊN_LỆNH",
  "temp": 24,
  "title": "Tên ngắn gọn"
}

DANH SÁCH LỆNH CHÍNH:
- Điều hòa: "bật điều hòa", "mở điều hòa", "máy lạnh", "24 độ", "26 độ", "hạ nhiệt độ", "nóng quá" -> action: "AC_SET_TEMP", temp: [16-30]
- Tắt điều hòa: "tắt điều hòa", "tắt máy lạnh" -> action: "AC_OFF"
- Tivi: "bật tivi" (TV_POWER_ON), "tắt tivi" (TV_POWER_OFF), "mở youtube" (APP_YOUTUBE), "tăng âm lượng" (VOL_UP), "giảm âm lượng" (VOL_DOWN), "tắt tiếng" (MUTE), "vtv1" (CH_VTV1), "vtv3" (CH_VTV3)
- Không có tiếng hoặc không rõ: action: "UNKNOWN", transcript: ""

BẮT BUỘC: Chỉ trả về JSON duy nhất, tuyệt đối KHÔNG thêm lời chào, KHÔNG giải thích, KHÔNG viết markdown ngoài cặp ngoặc nhọn.`;

  if (activeKey.startsWith('sk-')) {
    // Vilao.ai (sk-...) là proxy văn bản (model_type: text), không hỗ trợ nghe file âm thanh (audio STT).
    // Nếu gửi audio đến Vilao sẽ gây sinh ảo (hallucination) tự bịa lệnh như "Bật tivi lên".
    return {
      transcript: '',
      action: 'UNKNOWN',
      title: 'Chưa nghe rõ giọng nói',
      channelQuery: '',
      irCode: '0x00000000',
      icon: '❓',
      device: 'Chưa xác định',
      };
  }

  const base64Audio = await blobToBase64(audioBlob);
  let mimeType = audioBlob.type ? audioBlob.type.split(';')[0] : 'audio/webm';
  if (!mimeType || mimeType === 'audio') mimeType = 'audio/webm';

  const payload = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Audio } },
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  };

  const parsed = await callGoogleGeminiApi(payload, activeKey);
  if (!parsed.transcript || !parsed.transcript.trim() ||
      parsed.transcript.toLowerCase().includes('không phát hiện') ||
      parsed.transcript.toLowerCase().includes('im lặng') ||
      parsed.transcript.toLowerCase().includes('không có tiếng') ||
      parsed.transcript.toLowerCase().includes('tiếng ồn')) {
    parsed.transcript = '';
    parsed.action = 'UNKNOWN';
    parsed.title = 'Chưa nhận diện được giọng nói';
  }
  return parsed;
}
