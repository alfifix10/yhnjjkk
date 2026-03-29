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

// بصمة الجهاز — ثابتة حتى لو مسح localStorage أو فتح incognito
function getDeviceFingerprint() {
    var parts = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
        navigator.maxTouchPoints || 0
    ];
    // Canvas fingerprint
    try {
        var c = document.createElement('canvas');
        var ctx = c.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('jiranak-fp', 2, 2);
        parts.push(c.toDataURL().slice(-50));
    } catch(e) {}
    // Hash
    var str = parts.join('|');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash;
    }
    return 'fp-' + Math.abs(hash).toString(36);
}

function generateId() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxx-xxxx-xxxx'.replace(/x/g, function() { return Math.floor(Math.random() * 16).toString(16); });
}

// استرجاع الهوية: localStorage أولاً، ثم بصمة الجهاز، ثم إنشاء جديد
function getOrCreateId() {
    try {
        var stored = localStorage.getItem('jiranak_id');
        if (stored) return stored;
    } catch(e) {}

    // لو مسح localStorage، نحاول نسترجع من cookie
    try {
        var cookieMatch = document.cookie.match(/jiranak_id=([^;]+)/);
        if (cookieMatch) {
            try { localStorage.setItem('jiranak_id', cookieMatch[1]); } catch(e) {}
            return cookieMatch[1];
        }
    } catch(e) {}

    // هوية جديدة مبنية على بصمة الجهاز
    var fp = getDeviceFingerprint();
    var id = fp + '-' + generateId().slice(0, 8);
    try { localStorage.setItem('jiranak_id', id); } catch(e) {}
    try { document.cookie = 'jiranak_id=' + id + ';max-age=31536000;path=/;SameSite=Lax'; } catch(e) {}
    return id;
}

var myId = getOrCreateId();
var myName = '';
var myLat = 0;
var myLng = 0;
var currentChatUser = null;
var unreadFrom = new Set();
var myOldIds;
try { myOldIds = new Set(JSON.parse(localStorage.getItem('jiranak_old_ids') || '[]')); } catch(e) { myOldIds = new Set(); }
var blockedUsers;
try { blockedUsers = new Set(JSON.parse(localStorage.getItem('jiranak_blocked') || '[]')); } catch(e) { blockedUsers = new Set(); }
var lastMsgTime = 0;
var myGpsAccuracy = 0;
var msgsSentInMinute = 0;
var minuteStart = Date.now();
var chatHistory = loadChatHistory();

function loadChatHistory() {
    try {
        var saved = localStorage.getItem('jiranak_history');
        if (saved) {
            var parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) return new Map(parsed);
        }
    } catch(e) {
        try { localStorage.removeItem('jiranak_history'); } catch(x) {}
    }
    return new Map();
}

function persistChatHistory() {
    try {
        var arr = [...chatHistory.entries()].slice(-20);
        localStorage.setItem('jiranak_history', JSON.stringify(arr));
    } catch(e) {}
}
let presenceRef = null;
let myPresenceRef = null;
let msgListener = null;
let partnerPresenceRef = null;
let currentScreen = 'landing';
let heartbeatInterval = null;
let partnerWasOnline = true;
let typingTimeout = null;

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

function formatDistance(lat, lng) {
    if (!myGpsReady || myLat === 0 || !lat || !lng) return '⏳ جاري تحديد الموقع';
    var dist = getDistance(lat, lng);
    if (isNaN(dist) || dist === Infinity) return '⏳ جاري تحديد الموقع';
    var meters = Math.round(dist * 1000);
    if (meters < 10) return '🟢 بجانبك تقريباً';
    if (meters < 100) return '🟢 ' + meters + ' متر';
    if (meters < 1000) return '🟡 ' + meters + ' متر';
    if (dist < 10) return '🟠 ' + dist.toFixed(1) + ' كم';
    return '⚪ ' + Math.round(dist) + ' كم';
}

var myGpsReady = false; // يصبح true فقط لما الدقة < 100 متر

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

let _audioCtx = null;
function getAudioContext() {
    if (!_audioCtx || _audioCtx.state === 'closed') {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    return _audioCtx;
}

function playNotif() {
    try {
        const ctx = getAudioContext();
        const t = ctx.currentTime;

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

function showModal(opts) {
    const overlay = document.getElementById('modalOverlay');
    const titleEl = document.getElementById('modalTitle');
    const msgEl = document.getElementById('modalMessage');
    const inputEl = document.getElementById('modalInput');
    const buttonsEl = document.getElementById('modalButtons');

    titleEl.textContent = opts.title || '';
    msgEl.textContent = opts.message || '';

    if (opts.input) {
        inputEl.style.display = 'block';
        inputEl.value = opts.inputValue || '';
        inputEl.maxLength = opts.inputMax || 20;
    } else {
        inputEl.style.display = 'none';
    }

    buttonsEl.innerHTML = '';

    const buttons = opts.buttons || [];
    if (buttons.length > 0) {
        buttons.forEach(b => {
            const btn = document.createElement('button');
            btn.className = 'modal-btn ' + (b.cls || 'modal-btn-primary');
            btn.textContent = b.text;
            btn.onclick = () => {
                overlay.style.display = 'none';
                if (b.action) b.action(inputEl.value.trim());
            };
            buttonsEl.appendChild(btn);
        });
    } else {
        if (opts.onConfirm) {
            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'modal-btn modal-btn-primary';
            confirmBtn.textContent = opts.confirmText || 'تأكيد';
            confirmBtn.onclick = () => {
                overlay.style.display = 'none';
                opts.onConfirm(inputEl.value.trim());
            };
            buttonsEl.appendChild(confirmBtn);
        }
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'modal-btn modal-btn-cancel';
        cancelBtn.textContent = opts.cancelText || 'إلغاء';
        cancelBtn.onclick = () => {
            overlay.style.display = 'none';
            if (opts.onCancel) opts.onCancel();
        };
        buttonsEl.appendChild(cancelBtn);
    }

    overlay.style.display = 'flex';

    if (opts.input) {
        setTimeout(() => inputEl.focus(), 100);
    }
}

// ---- تشغيل ----
document.addEventListener('DOMContentLoaded', () => {
    try {
        initParticles();
        firebase.initializeApp(firebaseConfig);
        db = firebase.database();

        var savedName = localStorage.getItem('jiranak_name');
        if (savedName) {
            myName = savedName;
            enterPeopleScreen();
        } else {
            initLanding();
        }
    } catch (e) {
        document.body.innerHTML = '<div style="padding:40px;text-align:center;color:white;font-family:sans-serif;direction:rtl"><h2>حدث خطأ</h2><p>' + e.message + '</p><button onclick="localStorage.clear();location.reload()" style="padding:12px 24px;font-size:16px;margin-top:20px;border-radius:12px;border:none;background:#6c5ce7;color:white;cursor:pointer">إعادة تشغيل</button></div>';
    }
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
    var savedName = localStorage.getItem('jiranak_name');
    input.value = savedName || '';
    joinBtn.disabled = false;
    joinBtn.textContent = 'ادخل';
    setTimeout(function() { input.focus(); }, 300);

    joinBtn.onclick = () => {
        var name = input.value.trim();
        if (name.length < 1) {
            input.style.borderColor = '#fd79a8';
            input.focus();
            setTimeout(() => input.style.borderColor = '', 1500);
            return;
        }
        myName = name;
        localStorage.setItem('jiranak_name', name);
        requestLocation();
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
        // المتصفح ما يدعم GPS — ادخل بدون موقع
        enterPeopleScreen();
        return;
    }

    enteredFromGeo = false;

    // محاولة واحدة سريعة أولاً
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            var accuracy = pos.coords.accuracy || 99999;
            myGpsAccuracy = accuracy;
            // نقبل الموقع الأولي حتى لو غير دقيق — watchPosition سيحسّنه
            myLat = pos.coords.latitude;
            myLng = pos.coords.longitude;
            if (accuracy < 200) myGpsReady = true;
            enteredFromGeo = true;
            enterPeopleScreen();
            startGeoWatch();
        },
        () => {
            // GPS مرفوض أو فشل — ادخل بدون موقع
            enteredFromGeo = true;
            enterPeopleScreen();
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
}

function startGeoWatch() {
    if (geoWatchId !== null) return;
    if (!navigator.geolocation) return;
    geoWatchId = navigator.geolocation.watchPosition(
        function(pos) {
            var newLat = pos.coords.latitude;
            var newLng = pos.coords.longitude;
            var accuracy = pos.coords.accuracy || 99999;
            myGpsAccuracy = accuracy;

            // نقبل الموقع فقط لو الدقة أقل من 200 متر (GPS حقيقي)
            if (accuracy > 200) return;

            // كشف قفزة مريبة
            if (myLat !== 0 && myLng !== 0) {
                var jump = getDistance(newLat, newLng);
                if (jump > 50) return;
            }

            myLat = newLat;
            myLng = newLng;
            myGpsReady = true;

            // حدّث Firebase + أعد عرض القائمة
            if (myPresenceRef) {
                myPresenceRef.update({ lat: myLat, lng: myLng, acc: Math.round(accuracy) });
            }
            // تحديث المسافات في القائمة
            if (presenceRef && currentScreen === 'people') {
                presenceRef.once('value', function(s) { renderPeopleFromData(s.val() || {}); });
            }
        },
        function() {},
        { enableHighAccuracy: true, maximumAge: 0 }
    );
}

// ========== SCREEN 2: People ==========
function enterPeopleScreen() {
    cleanup();

    currentScreen = 'people';
    showScreen('peopleScreen');
    document.getElementById('myName').textContent = myName;
    document.getElementById('onlineCount').textContent = 'جاري الاتصال...';
    history.pushState({ screen: 'people' }, '', '');

    // دائماً نحدّث الموقع بالخلفية لتحسين الدقة
    startGeoWatch();

    presenceRef = db.ref('online');
    myPresenceRef = presenceRef.child(myId);

    // تنظيف هوياتي القديمة من Firebase
    myOldIds.forEach(function(oldId) {
        db.ref('online/' + oldId).remove();
    });

    // مراقبة اتصال Firebase — يظهر البانر فقط لو انقطع بعد ما كان متصل
    var wasConnected = false;
    db.ref('.info/connected').on('value', function(snap) {
        var banner = document.getElementById('offlineBanner');
        if (snap.val() === true) {
            wasConnected = true;
            if (banner) banner.style.display = 'none';
            if (myPresenceRef) myPresenceRef.onDisconnect().remove();
        } else if (wasConnected && banner) {
            banner.style.display = 'flex';
        }
    });

    var presenceData = { name: myName, t: firebase.database.ServerValue.TIMESTAMP };
    if (myLat !== 0) { presenceData.lat = myLat; presenceData.lng = myLng; }
    myPresenceRef.set(presenceData);
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
        // إخفاء spinner البحث
        var spinner = document.getElementById('searchingSpinner');
        if (spinner) spinner.style.display = 'none';
        document.getElementById('onlineCount').textContent = '✅ متصل';
        renderPeopleFromData(data);
    });

    // استمع للرسائل
    const myMsgsRef = db.ref('msgs/' + myId);
    msgListener = myMsgsRef.on('child_added', (snap) => {
        const msg = snap.val();
        if (!msg) return;

        // تجاهل رسائل المحظورين
        if (blockedUsers.has(msg.from)) { snap.ref.remove(); return; }

        if (currentChatUser && currentChatUser.id === msg.from) {
            addMsg(msg.text, false);
            saveToHistory(msg.from, msg.text, false);
            if (navigator.vibrate) navigator.vibrate(50);
        } else {
            saveToHistory(msg.from, msg.text, false);
            unreadFrom.add(msg.from);
            // الصوت فقط لو أنت بصفحة الجيران (مو بدردشة ثانية)
            if (currentScreen === 'people') {
                presenceRef.once('value', s => { renderPeopleFromData(s.val() || {}); });
                playNotif();
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            }
        }

        snap.ref.remove();
    });

    document.getElementById('backToLanding').onclick = () => {
        cleanup();
        localStorage.removeItem('jiranak_name');
        initLanding();
    };

    document.getElementById('editNameBtn').onclick = () => {
        showModal({
            title: 'تعديل الاسم',
            message: 'اكتب اسمك الجديد:',
            input: true,
            inputValue: myName,
            confirmText: 'تغيير',
            onConfirm: (val) => {
                if (val.length > 0 && val.length <= 20) {
                    myName = val;
                    localStorage.setItem('jiranak_name', myName);
                    document.getElementById('myName').textContent = myName;
                    myPresenceRef.update({ name: myName });
                }
            }
        });
    };

    // زر إلغاء الحظر
    var unblockBtn = document.getElementById('unblockBtn');
    if (blockedUsers.size > 0) {
        unblockBtn.style.display = 'inline-flex';
        unblockBtn.textContent = '🔓 إلغاء الحظر (' + blockedUsers.size + ')';
    } else {
        unblockBtn.style.display = 'none';
    }
    unblockBtn.onclick = () => {
        showModal({
            title: 'إلغاء الحظر',
            message: 'إلغاء حظر ' + blockedUsers.size + ' شخص؟',
            confirmText: 'إلغاء الحظر',
            onConfirm: () => {
                blockedUsers.clear();
                localStorage.setItem('jiranak_blocked', '[]');
                unblockBtn.style.display = 'none';
                presenceRef.once('value', function(s) { renderPeopleFromData(s.val() || {}); });
            }
        });
    };

    document.getElementById('shareBtn')?.addEventListener('click', shareLink);
}

function renderPeopleFromData(data) {
    const list = document.getElementById('peopleList');
    const noPeople = document.getElementById('noPeople');
    const count = document.getElementById('onlineCount');

    const users = [];
    Object.entries(data).forEach(([id, u]) => {
        if (id !== myId && !myOldIds.has(id) && !blockedUsers.has(id) && u.name) {
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

    if (myLat !== 0 && myLng !== 0) {
        users.sort((a, b) => getDistance(a.lat, a.lng) - getDistance(b.lat, b.lng));
    }

    list.innerHTML = users.map((u, i) => {
        var distText = formatDistance(u.lat, u.lng);
        var hasUnread = unreadFrom.has(u.id);
        return `
            <div class="person-card ${hasUnread ? 'has-unread' : ''}" style="animation-delay:${i*0.08}s" data-uid="${u.id}" data-uname="${esc(u.name)}" data-ulat="${u.lat}" data-ulng="${u.lng}">
                <div class="person-avatar" style="background:${getGradient(u.id)}">
                    ${getAvatar(u.id)}
                    ${hasUnread ? '<span class="unread-dot"></span>' : ''}
                </div>
                <div class="person-info">
                    <div class="person-name">${esc(u.name)} ${hasUnread ? '<span class="new-msg-badge">رسالة جديدة</span>' : ''}</div>
                    <div class="person-distance">${distText}</div>
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

    document.getElementById('chatWith').textContent = userName;
    document.getElementById('chatDistance').textContent = formatDistance(uLat, uLng);

    var msgsDiv = document.getElementById('chatMessages');
    msgsDiv.innerHTML = '';
    var scrollBtn = document.getElementById('scrollDownBtn');
    if (scrollBtn) scrollBtn.style.display = 'none';
    msgsDiv.onscroll = function() {
        if (msgsDiv.scrollHeight - msgsDiv.scrollTop - msgsDiv.clientHeight < 80) {
            if (scrollBtn) scrollBtn.style.display = 'none';
        }
    };

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
        var statusEl = document.getElementById('chatDistance');
        var nameEl = document.getElementById('chatWith');
        if (snap.exists()) {
            var data = snap.val();
            // تحديث الاسم إذا تغيّر
            if (data.name && data.name !== nameEl.textContent) {
                var oldName = nameEl.textContent;
                nameEl.textContent = data.name;
                currentChatUser.name = data.name;
                addSystemMsg('غيّر اسمه إلى: ' + data.name);
            }
            statusEl.textContent = formatDistance(data.lat, data.lng);
            statusEl.style.color = '';
            partnerWasOnline = true;
        } else if (partnerWasOnline) {
            statusEl.textContent = '⚫ غير متصل';
            statusEl.style.color = '#e17055';
            addSystemMsg('الطرف الثاني غادر المحادثة');
            partnerWasOnline = false;
        }
    });

    // زر الحظر
    document.getElementById('blockBtn').onclick = () => {
        showModal({
            title: 'حظر المستخدم',
            message: 'حظر ' + userName + '؟ لن تظهر رسائله بعد الآن.',
            confirmText: 'حظر',
            onConfirm: () => {
                blockedUsers.add(userId);
                localStorage.setItem('jiranak_blocked', JSON.stringify([...blockedUsers]));
                if (partnerPresenceRef) { partnerPresenceRef.off(); partnerPresenceRef = null; }
                currentChatUser = null;
                currentScreen = 'people';
                showScreen('peopleScreen');
            }
        });
    };

    // مؤشر "يكتب..."
    var myTypingRef = db.ref('typing/' + userId + '/' + myId);
    var partnerTypingRef2 = db.ref('typing/' + myId + '/' + userId);
    var typingIndicator = document.getElementById('typingIndicator');
    myTypingRef.onDisconnect().remove();

    partnerTypingRef2.on('value', function(snap) {
        if (snap.val()) {
            typingIndicator.style.display = 'flex';
        } else {
            typingIndicator.style.display = 'none';
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
        // إرسال حالة "يكتب..."
        db.ref('typing/' + userId + '/' + myId).set(true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            db.ref('typing/' + userId + '/' + myId).set(null);
        }, 2000);
    };

    const sendBtn = document.getElementById('sendBtn');

    const sendMsg = () => {
        var el = document.getElementById('msgInput');
        var text = el.value.trim();
        if (!text || text.length > 500) return;
        var now = Date.now();
        // حد 500ms بين كل رسالة
        if (now - lastMsgTime < 500) {
            sendBtn.style.opacity = '0.5';
            setTimeout(function() { sendBtn.style.opacity = '1'; }, 300);
            return;
        }
        // حد 20 رسالة بالدقيقة
        if (now - minuteStart > 60000) {
            msgsSentInMinute = 0;
            minuteStart = now;
        }
        msgsSentInMinute++;
        if (msgsSentInMinute > 20) {
            addSystemMsg('⚠️ أرسلت رسائل كثيرة، انتظر قليلاً');
            return;
        }
        lastMsgTime = now;

        const thisMsgId = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        addMsg(text, true, false, thisMsgId);
        saveToHistory(userId, text, true);
        el.value = '';
        charCounter.style.display = 'none';
        el.focus();
        // إيقاف "يكتب..." بعد الإرسال
        db.ref('typing/' + userId + '/' + myId).set(null);
        clearTimeout(typingTimeout);

        // timeout: لو Firebase ما رد خلال 10 ثواني = فشل
        var sendTimeout = setTimeout(function() {
            var msgEl = document.getElementById(thisMsgId);
            if (msgEl) {
                var tick = msgEl.querySelector('.msg-tick');
                if (tick && tick.textContent === '⏳') tick.textContent = '❌';
            }
        }, 10000);

        db.ref('msgs/' + userId).push({
            from: myId,
            name: myName,
            text: text,
            t: firebase.database.ServerValue.TIMESTAMP
        }).then(function() {
            clearTimeout(sendTimeout);
            var msgEl = document.getElementById(thisMsgId);
            if (msgEl) {
                var tick = msgEl.querySelector('.msg-tick');
                if (tick) tick.textContent = '✓';
            }
        }).catch(function() {
            clearTimeout(sendTimeout);
            var msgEl = document.getElementById(thisMsgId);
            if (msgEl) {
                var tick = msgEl.querySelector('.msg-tick');
                if (tick) tick.textContent = '❌';
            }
        });
    };

    sendBtn.onclick = sendMsg;
    inputEl.onkeypress = (e) => { if (e.key === 'Enter') sendMsg(); };
    inputEl.focus();

    document.getElementById('backToPeople').onclick = leaveChat;
}

function saveToHistory(userId, text, isMe) {
    if (!chatHistory.has(userId)) chatHistory.set(userId, []);
    var h = chatHistory.get(userId);
    h.push({ text, isMe });
    if (h.length > MAX_HISTORY_PER_USER) h.shift();
    persistChatHistory();
}

function linkify(text) {
    var escaped = esc(text);
    return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#81ecec;text-decoration:underline">$1</a>');
}

function addMsg(text, isMe, delivered = true, msgId = null) {
    var msgs = document.getElementById('chatMessages');
    var div = document.createElement('div');
    if (msgId) div.id = msgId;
    var now = new Date();
    var time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    div.className = 'msg ' + (isMe ? 'msg-me' : 'msg-them');
    var tick = isMe ? '<span class="msg-tick">' + (delivered ? '✓' : '⏳') + '</span>' : '';
    div.innerHTML = linkify(text) + '<span class="msg-time">' + time + ' ' + tick + '</span>';

    // لا تسحب للأسفل إذا المستخدم يقرأ رسائل قديمة
    var isAtBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    msgs.appendChild(div);
    if (isAtBottom || isMe) {
        msgs.scrollTop = msgs.scrollHeight;
    } else {
        showNewMsgButton();
    }
}

function showNewMsgButton() {
    var btn = document.getElementById('scrollDownBtn');
    if (btn) btn.style.display = 'flex';
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
// دالة موحدة للخروج من الدردشة
function leaveChat() {
    if (partnerPresenceRef) { partnerPresenceRef.off(); partnerPresenceRef = null; }
    // تنظيف typing
    try {
        if (currentChatUser) {
            db.ref('typing/' + currentChatUser.id + '/' + myId).set(null);
            db.ref('typing/' + myId + '/' + currentChatUser.id).off();
        }
    } catch(e) {}
    currentChatUser = null;
    currentScreen = 'people';
    showScreen('peopleScreen');
}

window.addEventListener('popstate', (e) => {
    if (currentScreen === 'chat') {
        leaveChat();
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
    if (lat2 == null || lng2 == null || isNaN(lat2) || isNaN(lng2)) return Infinity;
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
        navigator.clipboard.writeText(url).then(() => {
            showModal({
                title: 'تم النسخ',
                message: 'تم نسخ الرابط! شاركه مع جيرانك.',
                buttons: [{ text: 'حسناً', cls: 'modal-btn-primary', action: () => {} }]
            });
        });
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

// كشف تبويب مكرر
window.addEventListener('storage', function(e) {
    if (e.key === 'jiranak_active_tab') {
        // تبويب ثاني فتح — أوقف هذا التبويب
        cleanup();
        document.body.innerHTML = '<div style="padding:60px 20px;text-align:center;color:white;font-family:Cairo,sans-serif;direction:rtl"><h2>⚠️ مفتوح في تبويب آخر</h2><p style="color:#7f7f9a;margin-top:12px">أغلق هذا التبويب واستخدم التبويب الآخر</p><button onclick="localStorage.setItem(\'jiranak_active_tab\',Date.now());location.reload()" style="margin-top:24px;padding:12px 32px;border-radius:14px;border:none;background:#6c5ce7;color:white;font-size:16px;font-family:Cairo;cursor:pointer">استخدم هنا بدلاً</button></div>';
    }
});
localStorage.setItem('jiranak_active_tab', Date.now());
