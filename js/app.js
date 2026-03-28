// ========================================
// جيرانك - Jiranak
// دردشة مجهولة مع الجيران (Firebase)
// ========================================

const firebaseConfig = {
    apiKey: "AIzaSyBxr265lCyx0GJw02oE9GQev8kBQRgiTZw",
    authDomain: "jiranak-e9ee2.firebaseapp.com",
    databaseURL: "https://jiranak-e9ee2-default-rtdb.firebaseio.com",
    projectId: "jiranak-e9ee2",
    storageBucket: "jiranak-e9ee2.firebasestorage.app",
    messagingSenderId: "196785031299",
    appId: "1:196785031299:web:08147b2c4fc0023d2b73b6"
};

let db;
let myId = localStorage.getItem('jiranak_id') || crypto.randomUUID();
localStorage.setItem('jiranak_id', myId);
let myName = '';
let myLat = parseFloat(localStorage.getItem('jiranak_lat')) || 0;
let myLng = parseFloat(localStorage.getItem('jiranak_lng')) || 0;
let currentChatUser = null;
let unreadFrom = new Set();
let myOldIds = new Set(JSON.parse(localStorage.getItem('jiranak_old_ids') || '[]'));
let lastMsgTime = 0;
let chatHistory = new Map();
let presenceRef = null;
let myPresenceRef = null;
let msgListener = null;
let partnerPresenceRef = null;
let currentScreen = 'landing';
let heartbeatInterval = null;
let partnerWasOnline = true; // لمنع سبام "غادر"

const AVATARS = ['😎','🦊','🐱','🦁','🐸','🦉','🐼','🐨','🦋','🌸','⚡','🔥','🌙','🎭','👻','🤖','🎯','💎','🌈','🍀'];
const GRADIENTS = [
    'linear-gradient(135deg, #6c5ce7, #a29bfe)',
    'linear-gradient(135deg, #00cec9, #81ecec)',
    'linear-gradient(135deg, #fd79a8, #e84393)',
    'linear-gradient(135deg, #fdcb6e, #f39c12)',
    'linear-gradient(135deg, #55a3f8, #6c5ce7)',
    'linear-gradient(135deg, #00b894, #00cec9)',
    'linear-gradient(135deg, #e17055, #d63031)',
    'linear-gradient(135deg, #a29bfe, #fd79a8)',
];

function getAvatar(id) { return AVATARS[hashCode(id) % AVATARS.length]; }
function getGradient(id) { return GRADIENTS[hashCode(id) % GRADIENTS.length]; }
function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h) + str.charCodeAt(i);
    return Math.abs(h);
}

// تقريب الإحداثيات — 3 خانات عشرية = دقة ~100 متر (حماية الخصوصية)
function roundCoord(val) {
    return Math.round(val * 1000) / 1000;
}

const MAX_HISTORY_PER_USER = 100;

function playNotif() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const t = ctx.currentTime;

        // النغمة الأولى — pop قصير
        const o1 = ctx.createOscillator();
        const g1 = ctx.createGain();
        o1.connect(g1); g1.connect(ctx.destination);
        o1.type = 'sine';
        o1.frequency.setValueAtTime(1400, t);
        o1.frequency.exponentialRampToValueAtTime(900, t + 0.06);
        g1.gain.setValueAtTime(0.2, t);
        g1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        o1.start(t);
        o1.stop(t + 0.08);

        // النغمة الثانية — أعلى بشوي بعد فاصل قصير
        const o2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        o2.connect(g2); g2.connect(ctx.destination);
        o2.type = 'sine';
        o2.frequency.setValueAtTime(1600, t + 0.1);
        o2.frequency.exponentialRampToValueAtTime(1000, t + 0.18);
        g2.gain.setValueAtTime(0.001, t);
        g2.gain.setValueAtTime(0.25, t + 0.1);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o2.start(t + 0.1);
        o2.stop(t + 0.2);
    } catch (e) {}
}

// ---- تشغيل ----
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    // تسجيل دخول مجهول — مطلوب لـ Security Rules
    firebase.auth().signInAnonymously().then(() => {
        const savedName = localStorage.getItem('jiranak_name');
        if (savedName && myLat !== 0 && myLng !== 0) {
            myName = savedName;
            enterPeopleScreen();
        } else {
            initLanding();
        }
    }).catch(() => {
        // لو فشل التوثيق، ادخل بدونه
        const savedName = localStorage.getItem('jiranak_name');
        if (savedName && myLat !== 0 && myLng !== 0) {
            myName = savedName;
            enterPeopleScreen();
        } else {
            initLanding();
        }
    });
});

function initParticles() {
    const c = document.getElementById('particles');
    const colors = ['#6c5ce7','#00cec9','#fd79a8','#a29bfe'];
    for (let i = 0; i < 25; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const s = Math.random() * 5 + 2;
        p.style.cssText = `width:${s}px;height:${s}px;left:${Math.random()*100}%;background:${colors[i%4]};animation-duration:${Math.random()*20+15}s;animation-delay:${Math.random()*10}s;`;
        c.appendChild(p);
    }
}

// ========== SCREEN 1: Landing ==========
function initLanding() {
    currentScreen = 'landing';
    showScreen('landingScreen');
    const input = document.getElementById('nicknameInput');
    const joinBtn = document.getElementById('joinBtn');
    const savedName = localStorage.getItem('jiranak_name');
    input.value = savedName || '';
    setTimeout(() => input.focus(), 300);

    joinBtn.onclick = () => {
        const name = input.value.trim();
        if (name.length < 1) {
            input.style.borderColor = '#fd79a8';
            input.focus();
            setTimeout(() => input.style.borderColor = '', 1500);
            return;
        }
        myName = name;
        localStorage.setItem('jiranak_name', name);
        // لو عندنا موقع من قبل، ندخل مباشرة
        if (myLat !== 0 && myLng !== 0) {
            enterPeopleScreen();
        } else {
            requestLocation();
        }
    };

    input.onkeypress = (e) => { if (e.key === 'Enter') joinBtn.click(); };

    document.querySelectorAll('.name-chip').forEach(chip => {
        chip.onclick = () => { input.value = chip.dataset.name; joinBtn.click(); };
    });
}

let geoWatchId = null;
let enteredFromGeo = false;

function requestLocation() {
    const btn = document.getElementById('joinBtn');
    if (btn) { btn.textContent = '⏳ انتظر...'; btn.disabled = true; }

    if (!navigator.geolocation) {
        alert('متصفحك لا يدعم تحديد الموقع');
        if (btn) { btn.textContent = 'ادخل'; btn.disabled = false; }
        return;
    }

    enteredFromGeo = false;

    // watchPosition يتتبع الموقع ويحسّن الدقة مع الوقت
    geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            myLat = pos.coords.latitude;
            myLng = pos.coords.longitude;
            localStorage.setItem('jiranak_lat', myLat);
            localStorage.setItem('jiranak_lng', myLng);

            // أول موقع — ادخل فوراً
            if (!enteredFromGeo) {
                enteredFromGeo = true;
                enterPeopleScreen();
            }

            // حدّث موقعي في Firebase بإحداثيات مقرّبة
            if (myPresenceRef) {
                myPresenceRef.update({ lat: roundCoord(myLat), lng: roundCoord(myLng) });
            }
        },
        () => {
            if (!enteredFromGeo) {
                if (btn) { btn.textContent = 'ادخل'; btn.disabled = false; }
                alert('لازم تسمح بتحديد الموقع عشان تشوف جيرانك!');
                localStorage.removeItem('jiranak_name');
                initLanding();
            }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

// ========== SCREEN 2: People ==========
function enterPeopleScreen() {
    // [FIX 1+2] تنظيف أي listeners و intervals قديمة أولاً
    cleanup();

    currentScreen = 'people';
    showScreen('peopleScreen');
    document.getElementById('myName').textContent = myName;
    document.getElementById('onlineCount').textContent = 'جاري الاتصال...';
    history.pushState({ screen: 'people' }, '', '');

    presenceRef = db.ref('online');
    myPresenceRef = presenceRef.child(myId);

    myPresenceRef.set({ name: myName, lat: roundCoord(myLat), lng: roundCoord(myLng), t: firebase.database.ServerValue.TIMESTAMP });
    myPresenceRef.onDisconnect().remove();

    // [FIX 2] heartbeat واحد فقط
    heartbeatInterval = setInterval(() => {
        if (myPresenceRef) myPresenceRef.update({ t: firebase.database.ServerValue.TIMESTAMP });
    }, 60000);

    presenceRef.on('value', (snap) => {
        const data = snap.val() || {};
        // تنظيف الحسابات الميتة (أكثر من 3 دقائق)
        const now = Date.now();
        Object.entries(data).forEach(([id, u]) => {
            if (u.t && now - u.t > 3 * 60 * 1000 && id !== myId) {
                db.ref('online/' + id).remove();
            }
        });
        document.getElementById('onlineCount').textContent = '✅ متصل';
        renderPeopleFromData(data);
    });

    // استمع للرسائل
    const myMsgsRef = db.ref('msgs/' + myId);
    msgListener = myMsgsRef.on('child_added', (snap) => {
        const msg = snap.val();
        if (!msg) return;

        if (currentChatUser && currentChatUser.id === msg.from) {
            addMsg(msg.text, false);
            saveToHistory(msg.from, msg.text, false);
            playNotif();
            if (navigator.vibrate) navigator.vibrate(50);
        } else {
            unreadFrom.add(msg.from);
            presenceRef.once('value', s => { renderPeopleFromData(s.val() || {}); });
            playNotif();
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }

        snap.ref.remove();
    });

    document.getElementById('backToLanding').onclick = () => {
        cleanup();
        localStorage.removeItem('jiranak_name');
        myOldIds.add(myId);
        localStorage.setItem('jiranak_old_ids', JSON.stringify([...myOldIds]));
        myId = crypto.randomUUID();
        localStorage.setItem('jiranak_id', myId);
        initLanding();
    };

    document.getElementById('editNameBtn').onclick = () => {
        const newName = prompt('اكتب اسمك الجديد:', myName);
        if (newName && newName.trim().length > 0 && newName.trim().length <= 20) {
            myName = newName.trim();
            localStorage.setItem('jiranak_name', myName);
            document.getElementById('myName').textContent = myName;
            myPresenceRef.update({ name: myName });
        }
    };

    document.getElementById('shareBtn')?.addEventListener('click', shareLink);
}

function renderPeopleFromData(data) {
    const list = document.getElementById('peopleList');
    const noPeople = document.getElementById('noPeople');
    const count = document.getElementById('onlineCount');

    const users = [];
    Object.entries(data).forEach(([id, u]) => {
        if (id !== myId && !myOldIds.has(id) && u.name) {
            users.push({ id, ...u });
        }
    });

    count.textContent = `${users.length} جار متصل`;

    if (users.length === 0) {
        list.style.display = 'none';
        noPeople.style.display = 'block';
        return;
    }
    list.style.display = 'flex';
    noPeople.style.display = 'none';

    users.sort((a, b) => getDistance(a.lat, a.lng) - getDistance(b.lat, b.lng));

    // [FIX 3] استخدام addEventListener بدل onclick inline لتفادي XSS
    list.innerHTML = users.map((u, i) => {
        const dist = getDistance(u.lat, u.lng);
        const meters = Math.round(dist * 1000);
        const distText = meters < 50 ? 'قريب جداً' : meters < 1000 ? `${meters} متر` : `${dist.toFixed(1)} كم`;
        const hasUnread = unreadFrom.has(u.id);
        return `
            <div class="person-card ${hasUnread ? 'has-unread' : ''}" style="animation-delay:${i*0.08}s" data-uid="${u.id}" data-uname="${esc(u.name)}" data-ulat="${u.lat}" data-ulng="${u.lng}">
                <div class="person-avatar" style="background:${getGradient(u.id)}">
                    ${getAvatar(u.id)}
                    ${hasUnread ? '<span class="unread-dot"></span>' : ''}
                </div>
                <div class="person-info">
                    <div class="person-name">${esc(u.name)} ${hasUnread ? '<span class="new-msg-badge">رسالة جديدة</span>' : ''}</div>
                    <div class="person-distance">📍 ${distText}</div>
                </div>
                <div class="person-arrow">←</div>
            </div>`;
    }).join('');

    // ربط الأحداث بأمان
    list.querySelectorAll('.person-card').forEach(card => {
        card.onclick = () => {
            startChat(card.dataset.uid, card.dataset.uname, parseFloat(card.dataset.ulat), parseFloat(card.dataset.ulng));
        };
    });
}

// ========== SCREEN 3: Chat ==========
function startChat(userId, userName, uLat, uLng) {
    unreadFrom.delete(userId);
    currentChatUser = { id: userId, name: userName, lat: uLat, lng: uLng };
    currentScreen = 'chat';
    partnerWasOnline = true;
    showScreen('chatScreen');
    history.pushState({ screen: 'chat' }, '', '');

    const dist = getDistance(uLat, uLng);
    const meters = Math.round(dist * 1000);
    const distText = meters < 50 ? 'قريب جداً' : meters < 1000 ? `${meters} متر` : `${dist.toFixed(1)} كم`;
    document.getElementById('chatWith').textContent = userName;
    document.getElementById('chatDistance').textContent = `📍 يبعد ${distText}`;

    const msgsDiv = document.getElementById('chatMessages');
    msgsDiv.innerHTML = '';

    const prevMsgs = chatHistory.get(userId) || [];
    if (prevMsgs.length > 0) {
        prevMsgs.forEach(m => addMsg(m.text, m.isMe));
    } else {
        addSystemMsg(`بدأت محادثة مع ${userName} 💬`);
    }

    // [FIX 4] مراقبة حالة الطرف الثاني — بدون سبام
    if (partnerPresenceRef) partnerPresenceRef.off();
    partnerPresenceRef = db.ref('online/' + userId);
    partnerPresenceRef.on('value', (snap) => {
        const statusEl = document.getElementById('chatDistance');
        if (snap.exists()) {
            statusEl.textContent = `📍 يبعد ${distText}`;
            statusEl.style.color = '';
            partnerWasOnline = true;
        } else if (partnerWasOnline) {
            // يظهر الرسالة مرة واحدة فقط
            statusEl.textContent = '⚫ غير متصل';
            statusEl.style.color = '#e17055';
            addSystemMsg('الطرف الثاني غادر المحادثة');
            partnerWasOnline = false;
        }
    });

    const inputEl = document.getElementById('msgInput');
    const charCounter = document.getElementById('charCounter');
    inputEl.setAttribute('maxlength', '500');
    inputEl.oninput = () => {
        const len = inputEl.value.length;
        if (len > 400) {
            charCounter.textContent = `${len}/500`;
            charCounter.style.display = 'block';
            charCounter.style.color = len > 480 ? '#e17055' : '#a29bfe';
        } else {
            charCounter.style.display = 'none';
        }
    };

    const sendBtn = document.getElementById('sendBtn');
    let msgCounter = 0;

    const sendMsg = () => {
        const el = document.getElementById('msgInput');
        const text = el.value.trim();
        if (!text || text.length > 500) return;
        const now = Date.now();
        if (now - lastMsgTime < 500) return;
        lastMsgTime = now;

        // [FIX 5] كل رسالة تاخذ ID فريد لعلامة ✓
        const thisMsgId = 'msg-' + (++msgCounter);
        addMsg(text, true, false, thisMsgId);
        saveToHistory(userId, text, true);
        el.value = '';
        charCounter.style.display = 'none';
        el.focus();

        db.ref('msgs/' + userId).push({
            from: myId,
            name: myName,
            text: text,
            t: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            // [FIX 5] علامة ✓ للرسالة الصحيحة بالضبط
            const msgEl = document.getElementById(thisMsgId);
            if (msgEl) {
                const tick = msgEl.querySelector('.msg-tick');
                if (tick) tick.textContent = '✓';
            }
        });
    };

    sendBtn.onclick = sendMsg;
    inputEl.onkeypress = (e) => { if (e.key === 'Enter') sendMsg(); };
    inputEl.focus();

    document.getElementById('backToPeople').onclick = () => {
        if (partnerPresenceRef) { partnerPresenceRef.off(); partnerPresenceRef = null; }
        currentChatUser = null;
        currentScreen = 'people';
        showScreen('peopleScreen');
    };
}

function saveToHistory(userId, text, isMe) {
    if (!chatHistory.has(userId)) chatHistory.set(userId, []);
    const h = chatHistory.get(userId);
    h.push({ text, isMe });
    // حد أقصى 100 رسالة لكل محادثة — لمنع تسريب الذاكرة
    if (h.length > MAX_HISTORY_PER_USER) h.shift();
}

function addMsg(text, isMe, delivered = true, msgId = null) {
    const msgs = document.getElementById('chatMessages');
    const div = document.createElement('div');
    if (msgId) div.id = msgId;
    const now = new Date();
    const time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    div.className = `msg ${isMe ? 'msg-me' : 'msg-them'}`;
    const tick = isMe ? `<span class="msg-tick">${delivered ? '✓' : '⏳'}</span>` : '';
    div.innerHTML = `${esc(text)}<span class="msg-time">${time} ${tick}</span>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

function addSystemMsg(text) {
    const msgs = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = 'msg msg-system';
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

// ========== زر الرجوع في المتصفح ==========
window.addEventListener('popstate', (e) => {
    if (currentScreen === 'chat') {
        if (partnerPresenceRef) { partnerPresenceRef.off(); partnerPresenceRef = null; }
        currentChatUser = null;
        currentScreen = 'people';
        showScreen('peopleScreen');
    } else if (currentScreen === 'people') {
        history.pushState({ screen: 'people' }, '', '');
    }
});

// ========== المساعدات ==========
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function getDistance(lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - myLat) * Math.PI / 180;
    const dLng = (lng2 - myLng) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(myLat*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function esc(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function shareLink() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ title: 'دردش مع جيرانك', text: 'دردش مع الناس اللي حولك - مجهول ومؤقت!', url });
    } else {
        navigator.clipboard.writeText(url).then(() => alert('تم نسخ الرابط!'));
    }
}

function cleanup() {
    if (partnerPresenceRef) { partnerPresenceRef.off(); partnerPresenceRef = null; }
    if (myPresenceRef) { myPresenceRef.remove(); myPresenceRef = null; }
    if (presenceRef) { presenceRef.off(); presenceRef = null; }
    if (msgListener) { db.ref('msgs/' + myId).off(); msgListener = null; }
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    if (geoWatchId !== null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    unreadFrom.clear();
    currentChatUser = null;
}

window.addEventListener('beforeunload', cleanup);
