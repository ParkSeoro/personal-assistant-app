// DOM 요소
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const voiceInputBtn = document.getElementById('voice-input-btn');
const calendarWidget = document.getElementById('calendar-widget');
const moodWidget = document.getElementById('mood-widget');
const insightsWidget = document.getElementById('insights-widget');
const engineStatusList = document.getElementById('engine-status-list');
const activityLog = document.getElementById('activity-log');

const policyControls = {
    highRiskApproval: document.getElementById('policy-high-risk'),
    autoInvest: document.getElementById('policy-auto-invest'),
    messageSync: document.getElementById('policy-message-sync')
};

// 간단한 암호화를 위한 설정
const chatHistory = [];
const activityHistory = [];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const engines = [
    { id: 'orchestrator', name: '오케스트레이터 엔진', status: 'active' },
    { id: 'schedule', name: '일정/생산성 엔진', status: 'active' },
    { id: 'finance', name: '금융 분석 엔진', status: 'idle' },
    { id: 'voice', name: '음성 인터페이스 엔진', status: 'active' },
    { id: 'policy', name: '정책/리스크 엔진', status: 'active' }
];

async function deriveKey(password) {
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: encoder.encode('salt'), iterations: 100000, hash: 'SHA-256' },
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
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

async function encrypt(text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await keyPromise;
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
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
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return decoder.decode(plain);
}

async function saveEncrypted(key, value) {
    const encrypted = await encrypt(JSON.stringify(value));
    localStorage.setItem(key, encrypted);
}

async function loadEncrypted(key, fallback) {
    const stored = localStorage.getItem(key);
    if (!stored) return fallback;
    try {
        const text = await decrypt(stored);
        return JSON.parse(text);
    } catch {
        return fallback;
    }
}

function speak(text) {
    if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'ko-KR';
        window.speechSynthesis.speak(utter);
    }
}

function addActivity(engine, summary) {
    const now = new Date();
    const item = { engine, summary, time: now.toISOString() };
    activityHistory.unshift(item);
    if (activityHistory.length > 40) activityHistory.pop();
    renderActivities();
    saveEncrypted('activityHistory', activityHistory);
}

function renderActivities() {
    activityLog.innerHTML = '';
    activityHistory.slice(0, 20).forEach((item) => {
        const row = document.createElement('div');
        row.className = 'activity-item';
        const t = new Date(item.time);
        row.innerHTML = `${item.summary}<div class="activity-meta">${item.engine} · ${t.toLocaleString('ko-KR')}</div>`;
        activityLog.appendChild(row);
    });
}

function renderEngines() {
    engineStatusList.innerHTML = '';
    engines.forEach((engine) => {
        const row = document.createElement('div');
        row.className = 'engine-item';
        row.innerHTML = `<span>${engine.name}</span><span class="engine-badge status-${engine.status}">${engine.status.toUpperCase()}</span>`;
        engineStatusList.appendChild(row);
    });
}

function setEngineStatus(id, status) {
    const target = engines.find((e) => e.id === id);
    if (!target) return;
    target.status = status;
    renderEngines();
}

function evaluatePolicy(userMessage) {
    if (!policyControls.messageSync.checked && (userMessage.includes('메시지') || userMessage.includes('통화'))) {
        return '현재 메시지/통화 데이터 분석 권한이 꺼져 있어요. 정책 패널에서 먼저 허용해 주세요.';
    }
    if (!policyControls.autoInvest.checked && (userMessage.includes('투자') || userMessage.includes('매수') || userMessage.includes('매도'))) {
        return '자동 투자 실행은 기본적으로 비활성화되어 있습니다. 정책 패널에서 명시적으로 켜야 실행할 수 있어요.';
    }
    if (policyControls.highRiskApproval.checked && (userMessage.includes('송금') || userMessage.includes('삭제') || userMessage.includes('자동 실행'))) {
        return '고위험 작업은 실행 전 사용자 승인 절차가 필요합니다. 승인 대기 상태로 전환할게요.';
    }
    return null;
}

function getAssistantResponse(userMessage) {
    const policyResponse = evaluatePolicy(userMessage);
    if (policyResponse) {
        addActivity('정책/리스크 엔진', `정책 점검 결과: ${policyResponse}`);
        setEngineStatus('policy', 'active');
        return policyResponse;
    }

    if (userMessage.includes('안녕') || userMessage.includes('하이')) return '안녕하세요! 쟈비스입니다. 무엇을 도와드릴까요?';
    if (userMessage.includes('날씨')) return '날씨 API 연동 전 단계입니다. 현재는 예시 응답으로 표시하고 있어요.';
    if (userMessage.includes('일정') || userMessage.includes('약속')) return '일정 엔진이 오늘 우선 작업과 회의 알림을 정리했습니다.';
    if (userMessage.includes('자산')) return '자산 대시보드는 수동 입력 + API 연동 방식으로 확장할 수 있습니다. 우선 리스크 한도를 먼저 설정해 주세요.';
    if (userMessage.includes('기능') || userMessage.includes('할 수 있')) return '현재 버전은 대화, 음성, 위젯, 엔진상태 패널, 정책 통제, 활동 로그를 제공합니다.';

    return '요청을 분석했고, 오케스트레이터 엔진이 하위 엔진 작업 우선순위를 조정 중입니다.';
}

function addMessage(sender, text) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'assistant-message');

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

    messageElement.append(senderElement, textElement, timeElement);
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addMessage('user', text);
    addActivity('오케스트레이터 엔진', `사용자 요청 접수: "${text}"`);
    chatHistory.push({ sender: 'user', text, time: new Date().toISOString() });
    await saveEncrypted('chatHistory', chatHistory);
    userInput.value = '';

    setEngineStatus('orchestrator', 'active');
    setEngineStatus('schedule', 'idle');

    setTimeout(async () => {
        const response = getAssistantResponse(text);
        addMessage('assistant', response);
        speak(response);
        addActivity('오케스트레이터 엔진', `응답 생성 완료: "${response}"`);
        chatHistory.push({ sender: 'assistant', text: response, time: new Date().toISOString() });
        await saveEncrypted('chatHistory', chatHistory);
    }, 600);
}

function initWidgets() {
    const today = new Date();
    calendarWidget.innerHTML = `<div class="calendar-header">${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일</div>
    <div class="calendar-event">오후 3:00 - 팀 회의</div><div class="calendar-event">오후 5:30 - 운동</div>`;

    moodWidget.innerHTML = `<div class="mood-item">오늘의 감정: 긍정적 (78%)</div><div class="mood-item">주간 트렌드: 상승 ↑</div><div class="mood-chart">📊</div>`;
    insightsWidget.innerHTML = `<div class="insight-item">생산성이 지난주보다 12% 향상되었습니다.</div><div class="insight-item">고위험 자동화는 승인 기반으로 제한됩니다.</div><div class="insight-item">정책 패널에서 권한을 직접 제어할 수 있습니다.</div>`;
}

function initPolicyControls() {
    Object.entries(policyControls).forEach(([key, el]) => {
        el.addEventListener('change', () => {
            addActivity('정책/리스크 엔진', `정책 변경: ${key} = ${el.checked ? 'ON' : 'OFF'}`);
        });
    });
}

voiceInputBtn.addEventListener('click', () => {
    if ('webkitSpeechRecognition' in window) {
        const recognition = new webkitSpeechRecognition();
        recognition.lang = 'ko-KR';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onstart = () => voiceInputBtn.classList.add('listening');
        recognition.onresult = (event) => {
            userInput.value = event.results[0][0].transcript;
            addActivity('음성 인터페이스 엔진', `음성 입력 감지: "${userInput.value}"`);
        };
        recognition.onend = () => voiceInputBtn.classList.remove('listening');
        recognition.start();
    } else {
        alert('이 브라우저는 음성 인식을 지원하지 않습니다.');
    }
});

sendBtn.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => e.key === 'Enter' && sendMessage());

window.addEventListener('load', async () => {
    const loadedChat = await loadEncrypted('chatHistory', []);
    loadedChat.forEach((m) => {
        chatHistory.push(m);
        addMessage(m.sender, m.text);
    });

    const loadedActivity = await loadEncrypted('activityHistory', []);
    loadedActivity.forEach((a) => activityHistory.push(a));

    renderEngines();
    renderActivities();
    initWidgets();
    initPolicyControls();

    if (chatHistory.length === 0) {
        const msg = '안녕하세요! 쟈비스입니다. 정책 패널과 엔진 상태를 보면서 명령을 내려보세요.';
        addMessage('assistant', msg);
        speak(msg);
        chatHistory.push({ sender: 'assistant', text: msg, time: new Date().toISOString() });
        await saveEncrypted('chatHistory', chatHistory);
        addActivity('오케스트레이터 엔진', '초기 안내 메시지 전송');
    }
});
