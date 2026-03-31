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
        ctx.fillText('jeerani-fp', 2, 2);
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
        var stored = localStorage.getItem('jeerani_id');
        if (stored) return stored;
    } catch(e) {}

    // لو مسح localStorage، نحاول نسترجع من cookie
    try {
        var cookieMatch = document.cookie.match(/jeerani_id=([^;]+)/);
        if (cookieMatch) {
            try { localStorage.setItem('jeerani_id', cookieMatch[1]); } catch(e) {}
            return cookieMatch[1];
        }
    } catch(e) {}

    // هوية جديدة مبنية على بصمة الجهاز
    var fp = getDeviceFingerprint();
    var id = fp + '-' + generateId().slice(0, 8);
    try { localStorage.setItem('jeerani_id', id); } catch(e) {}
    try { document.cookie = 'jeerani_id=' + id + ';max-age=31536000;path=/;SameSite=Lax'; } catch(e) {}
    return id;
}

var myId = getOrCreateId();
var myName = '';
var myLat = 0;
var myLng = 0;
var currentChatUser = null;
var unreadFrom = new Set();
var myOldIds;
try { myOldIds = new Set(JSON.parse(localStorage.getItem('jeerani_old_ids') || '[]')); } catch(e) { myOldIds = new Set(); }
var blockedUsers;
try { blockedUsers = new Set(JSON.parse(localStorage.getItem('jeerani_blocked') || '[]')); } catch(e) { blockedUsers = new Set(); }
var lastMsgTime = 0;
var myGpsAccuracy = 0;
var msgsSentInMinute = 0;
var minuteStart = Date.now();
var chatHistory = loadChatHistory();

function loadChatHistory() {
    try {
        var saved = localStorage.getItem('jeerani_history');
        if (saved) {
            var parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) return new Map(parsed);
        }
    } catch(e) {
        try { localStorage.removeItem('jeerani_history'); } catch(x) {}
    }
    return new Map();
}

function persistChatHistory() {
    try {
        var arr = [...chatHistory.entries()].slice(-20);
        localStorage.setItem('jeerani_history', JSON.stringify(arr));
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
    if (!myLat || !lat || !lng) return '🟢 متصل';
    var dist = getDistance(lat, lng);
    if (!dist || isNaN(dist) || dist === Infinity) return '🟢 متصل';
    var m = Math.round(dist * 1000);
    if (m < 10) return '🟢 بجانبك تقريباً';
    if (m < 100) return '🟢 ' + m + ' متر';
    if (m < 1000) return '🟡 ' + m + ' متر';
    return '🟠 ' + dist.toFixed(1) + ' كم';
}

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

        var savedName = localStorage.getItem('jeerani_name');
        if (savedName) {
            myName = savedName;
            // نطلب GPS فوراً حتى لو الاسم محفوظ
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(function(pos) {
                    myLat = pos.coords.latitude;
                    myLng = pos.coords.longitude;
                    enterPeopleScreen();
                }, function() {
                    enterPeopleScreen();
                }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
            } else {
                enterPeopleScreen();
            }
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
    var savedName = localStorage.getItem('jeerani_name');
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
        localStorage.setItem('jeerani_name', name);
        requestLocation();
    };

    input.onkeypress = (e) => { if (e.key === 'Enter') joinBtn.click(); };

    document.querySelectorAll('.name-chip').forEach(chip => {
        chip.onclick = () => { input.value = chip.dataset.name; joinBtn.click(); };
    });
}


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
            myLat = pos.coords.latitude;
            myLng = pos.coords.longitude;
            enteredFromGeo = true;
            enterPeopleScreen();
            startGpsPoll();
        },
        () => {
            // GPS مرفوض أو فشل — ادخل بدون موقع
            enteredFromGeo = true;
            enterPeopleScreen();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

// polling GPS كل 10 ثواني — أوثق من watchPosition
var gpsPollInterval = null;
function startGpsPoll() {
    if (gpsPollInterval || !navigator.geolocation) return;
    function poll() {
        navigator.geolocation.getCurrentPosition(function(pos) {
            myLat = pos.coords.latitude;
            myLng = pos.coords.longitude;
            if (myPresenceRef) myPresenceRef.update({ lat: myLat, lng: myLng });
        }, function() {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
    }
    poll();
    gpsPollInterval = setInterval(poll, 10000);
}

// ========== SCREEN 2: People ==========
function enterPeopleScreen() {
    cleanup();

    currentScreen = 'people';
    showScreen('peopleScreen');
    document.getElementById('myName').textContent = myName;
    document.getElementById('onlineCount').textContent = 'جاري الاتصال...';
    history.pushState({ screen: 'people' }, '', '');

    // تحديث الموقع بالخلفية
    startGpsPoll();

    // لو GPS ما جهز بعد 20 ثانية → نعرض الكل كـ fallback
    setTimeout(function() {
        if (presenceRef) {
            presenceRef.once('value', function(s) { renderPeopleFromData(s.val() || {}); });
        }
    }, 20000);

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
            if (wasConnected) {
                // عاد الاتصال — نعيد تسجيل الحضور
                if (myPresenceRef) {
                    var presenceData = { name: myName, t: firebase.database.ServerValue.TIMESTAMP };
                    if (myLat !== 0) { presenceData.lat = myLat; presenceData.lng = myLng; }
                    myPresenceRef.set(presenceData);
                }
            }
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

    // كاش محلي للمتصلين — نحدّث بذكاء بدون إعادة تحميل الكل
    var onlineCache = {};
    var renderTimeout = null;

    function scheduleRender() {
        if (renderTimeout) clearTimeout(renderTimeout);
        renderTimeout = setTimeout(function() {
            renderPeopleFromData(onlineCache);
        }, 500);
    }

    // إخفاء spinner بعد 5 ثواني كحد أقصى
    setTimeout(function() {
        var spinner = document.getElementById('searchingSpinner');
        if (spinner && spinner.style.display !== 'none') {
            spinner.style.display = 'none';
            document.getElementById('onlineCount').textContent = '✅ متصل';
        }
    }, 5000);

    // أول تحميل
    presenceRef.once('value', function(snap) {
        onlineCache = snap.val() || {};
        var spinner = document.getElementById('searchingSpinner');
        if (spinner) spinner.style.display = 'none';
        document.getElementById('onlineCount').textContent = '✅ متصل';

        // تنظيف الحسابات الميتة
        var now = Date.now();
        Object.keys(onlineCache).forEach(function(id) {
            var u = onlineCache[id];
            if (u && u.t && now - u.t > 3 * 60 * 1000 && id !== myId) {
                db.ref('online/' + id).remove();
                delete onlineCache[id];
            }
        });

        renderPeopleFromData(onlineCache);

        // تنظيف السجل — مرة واحدة
        if (!window._logsCleanedUp) {
            window._logsCleanedUp = true;
            db.ref('logs').once('value', function(s) {
                var logData = s.val() || {};
                var convs = {};
                Object.entries(logData).forEach(function(e) {
                    var key = e[0], m = e[1];
                    if (!m.from || !m.to) return;
                    var pair = [m.from, m.to].sort().join('_');
                    if (!convs[pair]) convs[pair] = [];
                    convs[pair].push({ key: key, t: m.t || 0 });
                });
                var monthAgo = now - (30 * 24 * 60 * 60 * 1000);
                Object.values(convs).forEach(function(msgs) {
                    msgs.sort(function(a, b) { return b.t - a.t; });
                    if (now - (msgs[0] ? msgs[0].t : 0) > monthAgo) {
                        msgs.forEach(function(m) { db.ref('logs/' + m.key).remove(); });
                    } else if (msgs.length > 50) {
                        msgs.slice(50).forEach(function(m) { db.ref('logs/' + m.key).remove(); });
                    }
                });
            });
        }
    });

    // بعد أول تحميل، نستمع للتغييرات الجديدة فقط
    var initialLoadDone = false;
    setTimeout(function() { initialLoadDone = true; }, 2000);

    presenceRef.on('child_added', function(snap) {
        if (snap.key === myId) return;
        onlineCache[snap.key] = snap.val();
        // نتجاهل الأحداث أثناء التحميل الأولي (once يتكفل)
        if (initialLoadDone) scheduleRender();
    });
    presenceRef.on('child_changed', function(snap) {
        var oldData = onlineCache[snap.key];
        var newData = snap.val();
        onlineCache[snap.key] = newData;

        // تحديث المسافة بدون إعادة رسم القائمة بالكامل
        var card = document.querySelector('[data-uid="' + snap.key + '"]');
        if (card && newData) {
            // تحديث المسافة
            var distEl = card.querySelector('.person-distance');
            if (distEl) distEl.textContent = formatDistance(newData.lat, newData.lng);
            // تحديث الاسم لو تغيّر
            if (oldData && oldData.name !== newData.name) {
                var nameEl = card.querySelector('.person-name');
                if (nameEl) nameEl.textContent = newData.name;
                card.dataset.uname = newData.name;
            }
            // تحديث الإحداثيات في الـ data attributes
            if (newData.lat) card.dataset.ulat = newData.lat;
            if (newData.lng) card.dataset.ulng = newData.lng;
        }
    });
    presenceRef.on('child_removed', function(snap) {
        delete onlineCache[snap.key];
        scheduleRender();
    });

    // تحديث المسافات كل 5 ثواني — يلتقط أي تحديث GPS فاتنا
    setInterval(function() {
        if (currentScreen !== 'people') return;
        document.querySelectorAll('.person-card').forEach(function(card) {
            var uid = card.dataset.uid;
            var u = onlineCache[uid];
            if (u) {
                var distEl = card.querySelector('.person-distance');
                if (distEl) {
                    var newDist = formatDistance(u.lat, u.lng);
                    if (distEl.textContent !== newDist) distEl.textContent = newDist;
                }
            }
        });
    }, 5000);

    // تحديث المسافات كل 10 ثواني
    setInterval(function() {
        if (currentScreen !== 'people') return;
        document.querySelectorAll('.person-card').forEach(function(card) {
            var uid = card.dataset.uid;
            var u = onlineCache[uid];
            if (!u) return;
            var distEl = card.querySelector('.person-distance');
            if (distEl) {
                var d = formatDistance(u.lat, u.lng);
                if (distEl.textContent !== d) distEl.textContent = d;
            }
        });
    }, 10000);

    // استمع للرسائل
    const myMsgsRef = db.ref('msgs/' + myId);
    msgListener = myMsgsRef.on('child_added', (snap) => {
        const msg = snap.val();
        if (!msg) return;

        // تجاهل رسائل المحظورين
        if (blockedUsers.has(msg.from)) { snap.ref.remove(); return; }

        try {
            if (currentChatUser && currentChatUser.id === msg.from) {
                addMsg(msg.text, false);
                saveToHistory(msg.from, msg.text, false);
                if (navigator.vibrate) navigator.vibrate(50);
            } else {
                saveToHistory(msg.from, msg.text, false);
                unreadFrom.add(msg.from);
                playNotif();
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                // تحديث شارة "رسالة جديدة" على كارد المرسل
                var senderCard = document.querySelector('[data-uid="' + msg.from + '"]');
                if (senderCard && !senderCard.classList.contains('has-unread')) {
                    senderCard.classList.add('has-unread');
                    var nameEl = senderCard.querySelector('.person-name');
                    if (nameEl && !nameEl.querySelector('.new-msg-badge')) {
                        nameEl.innerHTML += ' <span class="new-msg-badge">رسالة جديدة</span>';
                    }
                }
            }
            // نحذف فقط بعد النجاح
            snap.ref.remove();
        } catch(e) {
            // لو فشل العرض — ما نحذف الرسالة عشان ما تضيع
        }
    });

    document.getElementById('backToLanding').onclick = () => {
        cleanup();
        localStorage.removeItem('jeerani_name');
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
                    localStorage.setItem('jeerani_name', myName);
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
                localStorage.setItem('jeerani_blocked', '[]');
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
        if (id !== myId && !myOldIds.has(id) && !blockedUsers.has(id) && u.name) {
            u.id = id;
            if (myLat && u.lat && u.lng) {
                u._dist = getDistance(u.lat, u.lng);
            } else {
                u._dist = 99999;
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
    users = allUsers.slice(0, maxShow);

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
            <div class="person-card ${hasUnread ? 'has-unread' : ''}" data-uid="${u.id}" data-uname="${esc(u.name)}" data-ulat="${u.lat || ''}" data-ulng="${u.lng || ''}">
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
            startChat(card.dataset.uid, card.dataset.uname, parseFloat(card.dataset.ulat) || 0, parseFloat(card.dataset.ulng) || 0);
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
                localStorage.setItem('jeerani_blocked', JSON.stringify([...blockedUsers]));
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

        var sendTimeout = setTimeout(function() {
            // لو ما وصل رد بعد 10 ثواني — نخلي ⏳ (ما نعرض ❌)
        }, 10000);

        var msgData = {
            from: myId,
            fromName: myName,
            to: userId,
            toName: userName,
            text: text,
            t: firebase.database.ServerValue.TIMESTAMP
        };

        // إرسال الرسالة — العلامة مربوطة بالإرسال مو السجل
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
        });
        // حفظ نسخة بالسجل بالخلفية
        db.ref('logs').push(msgData).catch(function() {});
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
function addMsg(text, isMe, delivered = true, msgId = null) {
    var msgs = document.getElementById('chatMessages');
    var div = document.createElement('div');
    if (msgId) div.id = msgId;
    var now = new Date();
    var time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    div.className = 'msg ' + (isMe ? 'msg-me' : 'msg-them');
    var tick = isMe ? '<span class="msg-tick">' + (delivered ? '✓' : '⏳') + '</span>' : '';
    div.innerHTML = esc(text) + '<span class="msg-time">' + time + ' ' + tick + '</span>';

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
        navigator.share({ title: 'Jeerani', text: 'دردش مع الناس اللي حولك - مجهول ومؤقت!', url });
    } else {
        navigator.clipboard.writeText(url).then(() => {
            showModal({
                title: 'تم النسخ',
                message: 'تم نسخ الرابط! شاركه مع أصدقائك.',
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
    if (gpsPollInterval) { clearInterval(gpsPollInterval); gpsPollInterval = null; }
    unreadFrom.clear();
    currentChatUser = null;
}

window.addEventListener('beforeunload', cleanup);

// كشف تبويب مكرر
window.addEventListener('storage', function(e) {
    if (e.key === 'jeerani_active_tab') {
        // تبويب ثاني فتح — أوقف هذا التبويب
        cleanup();
        document.body.innerHTML = '<div style="padding:60px 20px;text-align:center;color:white;font-family:Cairo,sans-serif;direction:rtl"><h2>⚠️ مفتوح في تبويب آخر</h2><p style="color:#7f7f9a;margin-top:12px">أغلق هذا التبويب واستخدم التبويب الآخر</p><button onclick="localStorage.setItem(\'jeerani_active_tab\',Date.now());location.reload()" style="margin-top:24px;padding:12px 32px;border-radius:14px;border:none;background:#6c5ce7;color:white;font-size:16px;font-family:Cairo;cursor:pointer">استخدم هنا بدلاً</button></div>';
    }
});
localStorage.setItem('jeerani_active_tab', Date.now());
