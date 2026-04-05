// ========================================
// Jeerani — Jeerani
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
var myFingerprint = getDeviceFingerprint();

// فحص الحظر بالـ ID + البصمة
function checkBanned(callback) {
    if (!db) return callback(false);
    var done = false;
    function finish(val) { if (!done) { done = true; callback(val); } }
    // timeout 3 ثواني — لو Firebase ما رد نسمح بالدخول
    setTimeout(function() { finish(false); }, 3000);
    try {
        db.ref('banned/' + myId).once('value').then(function(snap1) {
            if (snap1.exists()) return finish(true);
            db.ref('banned/' + myFingerprint).once('value').then(function(snap2) {
                finish(snap2.exists());
            }).catch(function() { finish(false); });
        }).catch(function() { finish(false); });
    } catch(e) { finish(false); }
}
var myName = '';
var myLat = 0;
var myLng = 0;
var currentChatUser = null;
var unreadFrom = new Set();
var blockedUsers;
try { blockedUsers = new Set(JSON.parse(localStorage.getItem('jiranak_blocked') || '[]')); } catch(e) { blockedUsers = new Set(); }
var lastMsgTime = 0;
var myGpsAccuracy = 0;
var msgsSentInMinute = 0;
var minuteStart = Date.now();
var DAILY_MSG_LIMIT = 200;
var dailyMsgCount = 0;
var dailyMsgDate = '';
try {
    var saved = JSON.parse(localStorage.getItem('jiranak_daily') || '{}');
    var today = new Date().toDateString();
    if (saved.date === today) { dailyMsgCount = saved.count || 0; dailyMsgDate = today; }
    else { dailyMsgDate = today; }
} catch(e) { dailyMsgDate = new Date().toDateString(); }
function saveDailyCount() {
    try { localStorage.setItem('jiranak_daily', JSON.stringify({date:dailyMsgDate, count:dailyMsgCount})); } catch(e) {}
}
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
let partnerTypingRef = null;
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

var soundEnabled = true;
try { soundEnabled = localStorage.getItem('jiranak_sound') !== 'off'; } catch(e) {}

// === نظام الجرس — إشعار عند وجود متصلين قريبين ===
var bellEnabled = false;
try { bellEnabled = localStorage.getItem('jiranak_bell') === 'on'; } catch(e) {}
var bellKnownUsers = new Set();
var bellInitialized = false;

function toggleBell() {
    if (!bellEnabled) {
        // تفعيل الجرس
        if ('Notification' in window && Notification.permission === 'denied') {
            showModal({
                title: '🔔 الإشعارات محظورة',
                message: 'فعّل الإشعارات من إعدادات المتصفح لهذا الموقع.\n\nالصوت والاهتزاز سيعملان بشكل طبيعي.',
                buttons: [{ text: 'فهمت، فعّل الجرس', cls: 'modal-btn-primary', action: function() { enableBell(); } }]
            });
        } else if ('Notification' in window && Notification.permission === 'default') {
            showModal({
                title: '🔔 تنبيه الجيران',
                message: 'عند تفعيل الجرس سنرسل لك تنبيه بصوت واهتزاز وإشعار عندما يدخل شخص قريب منك.',
                buttons: [
                    { text: 'فعّل مع الإشعارات', cls: 'modal-btn-primary', action: function() {
                        Notification.requestPermission().then(function() { enableBell(); });
                    }},
                    { text: 'صوت واهتزاز فقط', cls: 'modal-btn-cancel', action: function() { enableBell(); } }
                ]
            });
        } else {
            enableBell();
        }
    } else {
        // إيقاف الجرس
        bellEnabled = false;
        try { localStorage.setItem('jiranak_bell', 'off'); } catch(e) {}
        var btn = document.getElementById('bellToggle');
        if (btn) btn.textContent = '🔕';
        showToast('🔕 تم إيقاف التنبيهات');
    }
}

function enableBell() {
    bellEnabled = true;
    try { localStorage.setItem('jiranak_bell', 'on'); } catch(e) {}
    var btn = document.getElementById('bellToggle');
    if (btn) btn.textContent = '🔔';
    showToast('🔔 سيتم تنبيهك عند دخول جار قريب');
}

function playBellSound() {
    try {
        var ctx = getAudioContext();
        var t = ctx.currentTime;
        // صوت جرس مميز
        [800, 1000, 1200].forEach(function(freq, i) {
            var o = ctx.createOscillator();
            var g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'sine';
            o.frequency.setValueAtTime(freq, t + i * 0.15);
            g.gain.setValueAtTime(0.3, t + i * 0.15);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.3);
            o.start(t + i * 0.15);
            o.stop(t + i * 0.15 + 0.3);
        });
    } catch(e) {}
}

function bellNotify(count) {
    // صوت
    playBellSound();
    // اهتزاز
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    // إشعار المتصفح
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            new Notification('جيراني 🔔', {
                body: count + ' جار قريب متصل الآن!',
                icon: 'assets/logo.png',
                tag: 'jeerani-bell'
            });
        } catch(e) {}
    }
}

function checkBellAlert(onlineData) {
    if (!bellEnabled || !myGpsReady) return;
    var nearbyNow = new Set();
    Object.entries(onlineData).forEach(function(entry) {
        var id = entry[0], u = entry[1];
        if (id === myId || !u.lat || !u.lng) return;
        var dist = getDistance(u.lat, u.lng);
        if (dist <= 100) nearbyNow.add(id);
    });
    // أول مرة — نحفظ القائمة بدون إشعار
    if (!bellInitialized) {
        bellKnownUsers = nearbyNow;
        bellInitialized = true;
        return;
    }
    // نشوف لو فيه مستخدمين جدد
    var newUsers = 0;
    nearbyNow.forEach(function(id) {
        if (!bellKnownUsers.has(id)) newUsers++;
    });
    if (newUsers > 0) bellNotify(nearbyNow.size);
    bellKnownUsers = nearbyNow;
}

function showToast(text) {
    var old = document.querySelector('.btn-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'btn-toast';
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 2000);
}

function toggleSound() {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem('jiranak_sound', soundEnabled ? 'on' : 'off'); } catch(e) {}
    var btn = document.getElementById('soundToggle');
    if (btn) btn.textContent = soundEnabled ? '🔊' : '🔇';
    showToast(soundEnabled ? 'صوت الرسائل مفعّل' : 'صوت الرسائل مكتوم');
}

function playNotif() {
    if (!soundEnabled) return;
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
        var errDiv = document.createElement('div');
        errDiv.style.cssText = 'padding:40px;text-align:center;color:white;font-family:sans-serif;direction:rtl';
        errDiv.innerHTML = '<h2>حدث خطأ</h2><p id="errMsg"></p><button onclick="localStorage.clear();location.reload()" style="padding:12px 24px;font-size:16px;margin-top:20px;border-radius:12px;border:none;background:#6c5ce7;color:white;cursor:pointer">إعادة تشغيل</button>';
        document.body.innerHTML = '';
        document.body.appendChild(errDiv);
        document.getElementById('errMsg').textContent = e.message;
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
        // التحقق من الحظر قبل الدخول (بالـ ID + البصمة)
        joinBtn.textContent = '⏳ انتظر...';
        joinBtn.disabled = true;
        checkBanned(function(isBanned) {
            if (isBanned) {
                joinBtn.textContent = 'ادخل';
                joinBtn.disabled = false;
                showBannedMessage();
                return;
            }
            myName = name;
            localStorage.setItem('jiranak_name', name);
            requestLocation();
        });
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
            // نحفظ الإحداثيات فقط لو دقيقة
            if (accuracy < 200) {
                myLat = pos.coords.latitude;
                myLng = pos.coords.longitude;
                myGpsReady = true;
            }
            enteredFromGeo = true;
            enterPeopleScreen();
            startGeoWatch();
        },
        () => {
            // GPS مرفوض أو فشل — ادخل بدون موقع مع محاولة GPS بالخلفية
            enteredFromGeo = true;
            enterPeopleScreen();
            startGeoWatch();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
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

function showBannedMessage() {
    // منع التكرار
    if (document.getElementById('banOverlay')) return;
    var overlay = document.createElement('div');
    overlay.id = 'banOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
    overlay.innerHTML = '<div style="background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:40px 30px;text-align:center;max-width:340px;width:100%">'
        + '<div style="font-size:50px;margin-bottom:12px">🚫</div>'
        + '<div style="font-size:18px;font-weight:700;color:#e17055;margin-bottom:8px">تم حظرك</div>'
        + '<div style="font-size:13px;color:#7f7f9a">تم حظرك من قبل الإدارة. لا يمكنك استخدام الدردشة حالياً.</div>'
        + '</div>';
    document.body.appendChild(overlay);
    setTimeout(function() { var el = document.getElementById('banOverlay'); if (el) el.remove(); }, 5000);
}

// ========== SCREEN 2: People ==========
function enterPeopleScreen() {
    cleanup();

    currentScreen = 'people';
    showScreen('peopleScreen');
    document.getElementById('myName').textContent = myName;
    document.getElementById('onlineCount').textContent = 'جاري الاتصال...';
    history.pushState({ screen: 'people' }, '', '');

    // مراقبة الحظر أثناء الاستخدام — بالـ ID والبصمة
    function onBanned() {
        db.ref('banned/' + myId).off();
        db.ref('banned/' + myFingerprint).off();
        cleanup();
        showBannedMessage();
        setTimeout(function() { initLanding(); }, 5000);
    }
    db.ref('banned/' + myId).off();
    db.ref('banned/' + myFingerprint).off();
    db.ref('banned/' + myId).on('value', function(snap) { if (snap.exists()) onBanned(); });
    db.ref('banned/' + myFingerprint).on('value', function(snap) { if (snap.exists()) onBanned(); });

    // تحديث الموقع بالخلفية
    startGeoWatch();

    // لو GPS ما جهز بعد 20 ثانية → نعرض الكل كـ fallback
    setTimeout(function() {
        if (!myGpsReady && currentScreen === 'people') {
            myGpsReady = true; // نقبل أي موقع متاح
            if (presenceRef) {
                presenceRef.once('value', function(s) { renderPeopleFromData(s.val() || {}); });
            }
        }
    }, 20000);

    presenceRef = db.ref('online');
    myPresenceRef = presenceRef.child(myId);


    // مراقبة اتصال Firebase — يظهر البانر فقط لو انقطع بعد ما كان متصل
    var wasConnected = false;
    db.ref('.info/connected').off(); // تنظيف أي listener سابق
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
    // لا نحفظ الإحداثيات إلا لما تكون دقيقة (GPS حقيقي)
    if (myGpsReady && myLat !== 0) {
        presenceData.lat = myLat;
        presenceData.lng = myLng;
    }
    myPresenceRef.set(presenceData);
    myPresenceRef.onDisconnect().remove();

    // تسجيل دخول المستخدم في السجل — يحفظ الاسم حتى بعد الخروج
    db.ref('logs').push({
        from: myId, fromName: myName,
        to: myId, toName: myName,
        text: '📌 انضم للدردشة',
        t: firebase.database.ServerValue.TIMESTAMP
    });

    // [FIX 2] heartbeat واحد فقط
    heartbeatInterval = setInterval(() => {
        if (myPresenceRef) myPresenceRef.update({ t: firebase.database.ServerValue.TIMESTAMP });
    }, 60000);

    // بناء قائمة المتصلين بـ child events بدل value (أداء أفضل)
    var onlineData = {};
    var initialLoadDone = false;
    var renderTimer = null;

    function debouncedRender() {
        if (renderTimer) clearTimeout(renderTimer);
        renderTimer = setTimeout(function() {
            var spinner = document.getElementById('searchingSpinner');
            if (spinner) spinner.style.display = 'none';
            document.getElementById('onlineCount').textContent = '✅ متصل';
            renderPeopleFromData(onlineData);
            checkBellAlert(onlineData);
        }, 300);
    }

    presenceRef.once('value', function(snap) {
        onlineData = snap.val() || {};
        initialLoadDone = true;
        debouncedRender();
    });
    presenceRef.on('child_added', function(snap) {
        if (!initialLoadDone) return;
        onlineData[snap.key] = snap.val();
        debouncedRender();
    });
    presenceRef.on('child_changed', function(snap) {
        onlineData[snap.key] = snap.val();
        if (initialLoadDone) debouncedRender();
    });
    presenceRef.on('child_removed', function(snap) {
        delete onlineData[snap.key];
        if (initialLoadDone) debouncedRender();
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
            // إرسال إشعار قراءة للمرسل
            db.ref('typing/' + msg.from + '/read_' + myId).set(Date.now());
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

    // تحديث أيقونة الجرس
    var bellBtn = document.getElementById('bellToggle');
    if (bellBtn) bellBtn.textContent = bellEnabled ? '🔔' : '🔕';

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
    var list = document.getElementById('peopleList');
    var noPeople = document.getElementById('noPeople');
    var count = document.getElementById('onlineCount');

    var allUsers = [];
    Object.entries(data).forEach(function(entry) {
        var id = entry[0], u = entry[1];
        if (id !== myId && !blockedUsers.has(id) && u.name) {
            u.id = id;
            // حساب المسافة لكل مستخدم
            if (myGpsReady && u.lat && u.lng) {
                u._dist = getDistance(u.lat, u.lng);
            } else {
                u._dist = 99999; // بدون GPS → يروح آخر القائمة
            }
            allUsers.push(u);
        }
    });

    // ترتيب بالمسافة — الأقرب أولاً
    allUsers.sort(function(a, b) { return a._dist - b._dist; });

    // النظام الذكي التدريجي:
    // معادلة سلسة: كل ما زاد مستخدم، ينقص العدد المعروض بشكل تدريجي
    // maxShow = 20 عند 1 مستخدم، ينزل تدريجياً لـ 8 عند 200+ مستخدم
    var total = allUsers.length;
    var maxShow = Math.max(8, Math.round(20 - (total * 0.06)));
    if (total <= 5) maxShow = total;

    var users;
    if (!myGpsReady) {
        // GPS لم يجهز → ننتظر بدل ما نعرض ناس من مدن بعيدة
        count.textContent = '⏳ جاري تحديد موقعك...';
        list.style.display = 'none';
        noPeople.style.display = 'none';
        return;
    } else {
        // فلتر: أبعد شخص معروض لازم يكون ضمن 100 كم
        var nearby = allUsers.filter(function(u) { return u._dist <= 100; });
        users = nearby.slice(0, maxShow);
    }

    if (users.length === 0) {
        count.textContent = 'لا يوجد أحد قريب';
        list.style.display = 'none';
        noPeople.style.display = 'block';
        return;
    }

    count.textContent = users.length + ' جار قريب';

    list.style.display = 'flex';
    noPeople.style.display = 'none';

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
    if (partnerTypingRef) partnerTypingRef.off();
    partnerTypingRef = db.ref('typing/' + myId + '/' + userId);
    var typingIndicator = document.getElementById('typingIndicator');
    myTypingRef.onDisconnect().remove();

    // مراقبة إشعار القراءة — تحديث ✓ إلى ✓✓
    var readRef = db.ref('typing/' + myId + '/read_' + userId);
    readRef.on('value', function(snap) {
        if (snap.val()) {
            // تحديث آخر رسالة مرسلة إلى ✓✓
            var allTicks = document.querySelectorAll('.msg-me .msg-tick');
            allTicks.forEach(function(tick) { if (tick.textContent === '✓') tick.textContent = '✓✓'; });
            readRef.remove();
        }
    });

    partnerTypingRef.on('value', function(snap) {
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
        // حد يومي
        var today = new Date().toDateString();
        if (dailyMsgDate !== today) { dailyMsgCount = 0; dailyMsgDate = today; }
        if (dailyMsgCount >= DAILY_MSG_LIMIT) {
            addSystemMsg('⚠️ وصلت الحد اليومي (' + DAILY_MSG_LIMIT + ' رسالة). حاول غداً');
            return;
        }
        dailyMsgCount++;
        saveDailyCount();
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

        var msgData = {
            from: myId,
            fromName: myName,
            to: userId,
            toName: userName,
            text: text,
            t: firebase.database.ServerValue.TIMESTAMP
        };

        // إرسال + حفظ نسخة في السجل
        var msgPush = db.ref('msgs/' + userId).push({
            from: myId,
            name: myName,
            text: text,
            t: firebase.database.ServerValue.TIMESTAMP
        });
        var logPush = db.ref('logs').push(msgData);

        Promise.all([msgPush, logPush]).then(function() {
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
    var time = now.toLocaleTimeString('ar', {hour:'2-digit', minute:'2-digit', hour12:true});
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
    if (partnerTypingRef) { partnerTypingRef.off(); partnerTypingRef = null; }
    // تنظيف typing + read
    try {
        if (currentChatUser) {
            db.ref('typing/' + currentChatUser.id + '/' + myId).set(null);
            db.ref('typing/' + myId + '/' + currentChatUser.id).off();
            db.ref('typing/' + myId + '/read_' + currentChatUser.id).off();
        }
    } catch(e) {}
    currentChatUser = null;
    currentScreen = 'people';
    showScreen('peopleScreen');
    // تحديث قائمة الجيران
    if (presenceRef) presenceRef.once('value', function(s) { renderPeopleFromData(s.val() || {}); });
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
    return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shareLink() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ title: 'Jeerani', text: 'دردش مع الناس اللي حولك - مجهول ومؤقت!', url });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showModal({
                title: 'تم النسخ',
                message: 'تم نسخ الرابط! شاركه مع أصدقائك.',
                buttons: [{ text: 'حسناً', cls: 'modal-btn-primary', action: () => {} }]
            });
        }).catch(() => {
            showModal({
                title: 'مشاركة',
                message: url,
                buttons: [{ text: 'حسناً', cls: 'modal-btn-primary', action: () => {} }]
            });
        });
    }
}

function cleanup() {
    if (partnerTypingRef) { partnerTypingRef.off(); partnerTypingRef = null; }
    if (partnerPresenceRef) { partnerPresenceRef.off(); partnerPresenceRef = null; }
    if (myPresenceRef) { myPresenceRef.remove(); myPresenceRef = null; }
    if (presenceRef) { presenceRef.off(); presenceRef = null; }
    if (msgListener) { db.ref('msgs/' + myId).off(); msgListener = null; }
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    if (geoWatchId !== null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    // تنظيف مراقبة الحظر والاتصال
    try { db.ref('banned/' + myId).off(); } catch(e) {}
    try { db.ref('banned/' + myFingerprint).off(); } catch(e) {}
    try { db.ref('.info/connected').off(); } catch(e) {}
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
