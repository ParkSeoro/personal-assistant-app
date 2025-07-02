// DOM 요소
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const voiceInputBtn = document.getElementById('voice-input-btn');
const calendarWidget = document.getElementById('calendar-widget');
const moodWidget = document.getElementById('mood-widget');
const insightsWidget = document.getElementById('insights-widget');

// 간단한 암호화를 위한 설정
const chatHistory = [];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(password) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: encoder.encode('salt'),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

const keyPromise = deriveKey('default-password');

function buf2b64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
}

function b64ToBuf(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

async function encrypt(text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await keyPromise;
    const cipher = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(text)
    );
    const result = new Uint8Array(iv.length + cipher.byteLength);
    result.set(iv);
    result.set(new Uint8Array(cipher), iv.length);
    return buf2b64(result);
}

async function decrypt(b64) {
    const data = new Uint8Array(b64ToBuf(b64));
    const iv = data.slice(0, 12);
    const cipher = data.slice(12);
    const key = await keyPromise;
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        cipher
    );
    return decoder.decode(plain);
}

async function saveChatHistory() {
    const encrypted = await Promise.all(
        chatHistory.map((m) => encrypt(JSON.stringify(m)))
    );
    localStorage.setItem('chatHistory', JSON.stringify(encrypted));
}

async function loadChatHistory() {
    const stored = JSON.parse(localStorage.getItem('chatHistory') || '[]');
    for (const item of stored) {
        try {
            const text = await decrypt(item);
            const m = JSON.parse(text);
            chatHistory.push(m);
            addMessage(m.sender, m.text);
        } catch (e) {
            console.error('복호화 실패', e);
        }
    }
}

function speak(text) {
    if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'ko-KR';
        window.speechSynthesis.speak(utter);
    }
}

function requestLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                console.log('위도:', pos.coords.latitude, '경도:', pos.coords.longitude);
            },
            (err) => {
                console.error('위치 오류', err);
            }
        );
    }
}

function checkPermissions() {
    if (navigator.permissions) {
        ['microphone', 'geolocation'].forEach((name) => {
            navigator.permissions
                .query({ name })
                .then((res) => console.log(name + ' 권한:', res.state))
                .catch(() => console.log(name + ' 권한 정보를 가져올 수 없습니다.'));
        });
    }
}

// 가상 응답 데이터베이스
const responses = [
    "안녕하세요! 무엇을 도와드릴까요?",
    "그것에 대해 더 자세히 알려주세요.",
    "이해했습니다. 도움이 필요하신 것이 있으신가요?",
    "현재 날씨는 맑고 기온은 22도입니다.",
    "오늘 일정은 오후 3시에 회의가 있습니다.",
    "그 질문에 대한 답변을 찾고 있습니다...",
    "네, 그 작업을 완료했습니다.",
    "죄송합니다, 그 정보를 찾을 수 없습니다.",
    "다른 질문이 있으신가요?",
    "그 기능은 현재 개발 중입니다."
];

// 메시지 추가 함수
function addMessage(sender, text) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.classList.add(sender === 'user' ? 'user-message' : 'assistant-message');
    
    const senderElement = document.createElement('div');
    senderElement.classList.add('message-sender');
    senderElement.textContent = sender === 'user' ? '나' : '쟈비스';
    
    const textElement = document.createElement('div');
    textElement.classList.add('message-text');
    textElement.textContent = text;
    
    const timeElement = document.createElement('div');
    timeElement.classList.add('message-time');
    const now = new Date();
    timeElement.textContent = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    messageElement.appendChild(senderElement);
    messageElement.appendChild(textElement);
    messageElement.appendChild(timeElement);
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 가상 응답 생성 함수
function getAssistantResponse(userMessage) {
    // 간단한 키워드 기반 응답
    if (userMessage.includes('안녕') || userMessage.includes('하이')) {
        return "안녕하세요! 쟈비스입니다. 무엇을 도와드릴까요?";
    } else if (userMessage.includes('날씨')) {
        return "오늘은 맑고 기온은 22도로 예상됩니다.";
    } else if (userMessage.includes('일정') || userMessage.includes('약속')) {
        return "오늘 일정은 오후 3시에 회의가 있습니다.";
    } else if (userMessage.includes('감사') || userMessage.includes('고마워')) {
        return "천만에요! 더 필요한 것이 있으면 언제든지 말씀해주세요.";
    } else if (userMessage.includes('이름')) {
        return "저는 쟈비스입니다. 당신의 개인 AI 비서죠.";
    } else if (userMessage.includes('위치')) {
        requestLocation();
        return "현재 위치 정보를 확인해 보세요.";
    } else if (userMessage.includes('기능') || userMessage.includes('할 수 있')) {
        return "저는 일정 관리, 정보 검색, 감정 분석, 대화 등 다양한 기능을 제공합니다.";
    } else {
        // 랜덤 응답
        return responses[Math.floor(Math.random() * responses.length)];
    }
}

// 메시지 전송 함수
function sendMessage() {
    const text = userInput.value.trim();
    if (text) {
        addMessage('user', text);
        chatHistory.push({ sender: 'user', text, time: new Date().toISOString() });
        saveChatHistory();

        // 입력 필드 초기화
        userInput.value = '';

        // 비서 응답 시뮬레이션 (약간의 지연 후)
        setTimeout(() => {
            const response = getAssistantResponse(text);
            addMessage('assistant', response);
            speak(response);
            chatHistory.push({ sender: 'assistant', text: response, time: new Date().toISOString() });
            saveChatHistory();
        }, 1000);
    }
}

// 이벤트 리스너
sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

voiceInputBtn.addEventListener('click', () => {
    // 음성 인식 기능 (SpeechRecognition API)
    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.lang = 'ko-KR';
        recognition.continuous = false;
        recognition.interimResults = false;
        
        recognition.onstart = () => {
            voiceInputBtn.classList.add('listening');
        };
        
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
        };
        
        recognition.onend = () => {
            voiceInputBtn.classList.remove('listening');
        };
        
        recognition.start();
    } else {
        alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
    }
});

// 위젯 초기화
function initWidgets() {
    // 캘린더 위젯 초기화
    const today = new Date();
    const formattedDate = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
    calendarWidget.innerHTML = `
        <div class="calendar-header">${formattedDate}</div>
        <div class="calendar-event">오후 3:00 - 팀 회의</div>
        <div class="calendar-event">오후 5:30 - 운동</div>
    `;
    
    // 감정 분석 위젯 초기화
    moodWidget.innerHTML = `
        <div class="mood-item">오늘의 감정: 긍정적 (78%)</div>
        <div class="mood-item">주간 트렌드: 상승 ↑</div>
        <div class="mood-chart">📊</div>
    `;
    
    // 인사이트 위젯 초기화
    insightsWidget.innerHTML = `
        <div class="insight-item">생산성이 지난주보다 12% 향상되었습니다.</div>
        <div class="insight-item">수면 패턴이 개선되고 있습니다.</div>
        <div class="insight-item">오늘은 집중력이 높은 날입니다.</div>
    `;
}

// 메시지 스타일 추가
const styleElement = document.createElement('style');
styleElement.textContent = `
    .message {
        margin-bottom: 15px;
        padding: 10px;
        border-radius: 10px;
        max-width: 80%;
    }
    
    .user-message {
        background-color: #e1f5fe;
        margin-left: auto;
    }
    
    .assistant-message {
        background-color: #f1f1f1;
        margin-right: auto;
    }
    
    .message-sender {
        font-weight: bold;
        margin-bottom: 5px;
    }
    
    .message-time {
        font-size: 0.8rem;
        color: #888;
        text-align: right;
        margin-top: 5px;
    }
    
    .calendar-header {
        font-weight: bold;
        margin-bottom: 10px;
    }
    
    .calendar-event {
        padding: 5px;
        background-color: #e3f2fd;
        margin-bottom: 5px;
        border-radius: 5px;
    }
    
    .mood-item, .insight-item {
        margin-bottom: 10px;
    }
    
    .mood-chart {
        font-size: 2rem;
        text-align: center;
        margin-top: 10px;
    }
    
    .listening {
        background-color: #f44336 !important;
    }
`;
document.head.appendChild(styleElement);

// 페이지 로드 시 초기화
window.addEventListener('load', async () => {
    await loadChatHistory();
    initWidgets();
    checkPermissions();
    // 초기 인사 메시지
    if (chatHistory.length === 0) {
        setTimeout(() => {
            const msg = '안녕하세요! 쟈비스입니다. 무엇을 도와드릴까요?';
            addMessage('assistant', msg);
            speak(msg);
            chatHistory.push({ sender: 'assistant', text: msg, time: new Date().toISOString() });
            saveChatHistory();
        }, 500);
    }
});
