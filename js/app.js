// ========================================
// Jeerani — دردش مع جيرانك
// Anonymous proximity chat
// ========================================

'use strict';

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
    let parts = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || 0,
        navigator.maxTouchPoints || 0
    ];
    // Canvas fingerprint
    try {
        let c = document.createElement('canvas');
        let ctx = c.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('jeerani-fp', 2, 2);
        parts.push(c.toDataURL().slice(-50));
    } catch(e) {}
    // Hash
    let str = parts.join('|');
    let hash = 0;
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
        let stored = localStorage.getItem('jeerani_id');
        if (stored) return stored;
    } catch(e) {}

    // لو مسح localStorage، نحاول نسترجع من cookie
    try {
        let cookieMatch = document.cookie.match(/jeerani_id=([^;]+)/);
        if (cookieMatch) {
            try { localStorage.setItem('jeerani_id', cookieMatch[1]); } catch(e) {}
            return cookieMatch[1];
        }
    } catch(e) {}

    // هوية جديدة مبنية على بصمة الجهاز
    let fp = getDeviceFingerprint();
    let id = fp + '-' + generateId().slice(0, 8);
    try { localStorage.setItem('jeerani_id', id); } catch(e) {}
    try { document.cookie = 'jeerani_id=' + id + ';max-age=31536000;path=/;SameSite=Lax'; } catch(e) {}
    return id;
}

const myId = getOrCreateId();
let myName = '';
let myLat = 0;
let myLng = 0;
let currentChatUser = null;
const unreadFrom = new Set();
let myOldIds;
try { myOldIds = new Set(JSON.parse(localStorage.getItem('jeerani_old_ids') || '[]')); } catch(e) { myOldIds = new Set(); }
let blockedUsers;
try { blockedUsers = new Set(JSON.parse(localStorage.getItem('jeerani_blocked') || '[]')); } catch(e) { blockedUsers = new Set(); }
let lastMsgTime = 0;
let msgsSentInMinute = 0;
let minuteStart = Date.now();
let chatHistory = loadChatHistory();

function loadChatHistory() {
    try {
        let saved = localStorage.getItem('jeerani_history');
        if (saved) {
            let parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) return new Map(parsed);
        }
    } catch(e) {
        try { localStorage.removeItem('jeerani_history'); } catch(x) {}
    }
    return new Map();
}

function persistChatHistory() {
    try {
        let arr = [...chatHistory.entries()].slice(-20);
        localStorage.setItem('jeerani_history', JSON.stringify(arr));
    } catch(e) {}
}
let presenceRef = null;
let myPresenceRef = null;
let partnerPresenceRef = null;
let currentScreen = 'landing';
let heartbeatInterval = null;
let partnerWasOnline = true;
let typingTimeout = null;
const _intervals = []; // كل الـ intervals عشان نقدر ننظفها

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
    if (!myLat || !lat || !lng) return '';
    let dist = getDistance(lat, lng);
    if (!dist || isNaN(dist) || dist === Infinity) return '';
    let m = Math.round(dist * 1000);
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

const MAX_HISTORY_PER_USER = 100;
const GPS_FAST_INTERVAL = 3000;
const GPS_SLOW_INTERVAL = 15000;
const GPS_FAST_DURATION = 30000;
const GPS_TIMEOUT = 15000;
const STALE_USER_MS = 60000;
const STALE_CHECK_MS = 10000;
const HEARTBEAT_MS = 60000;
const DISTANCE_REFRESH_MS = 5000;

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

        let savedName = localStorage.getItem('jeerani_name');
        if (savedName) {
            myName = savedName;
            // نحاول نحصل الموقع من IP فوراً (سريع وما يحتاج إذن)
            getLocationByIP();
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
    let savedName = localStorage.getItem('jeerani_name');
    input.value = savedName || '';
    joinBtn.disabled = false;
    joinBtn.textContent = 'ادخل';
    setTimeout(function() { input.focus(); }, 300);

    joinBtn.onclick = () => {
        let name = input.value.trim();
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



function requestLocation() {
    let btn = document.getElementById('joinBtn');
    if (btn) { btn.textContent = '⏳ انتظر...'; btn.disabled = true; }
    // ندخل فوراً — GPS يشتغل بالخلفية عبر startGpsPoll
    enterPeopleScreen();
}

// polling GPS كل 10 ثواني — أوثق من watchPosition
let gpsPollInterval = null;
function startGpsPoll() {
    if (gpsPollInterval || !navigator.geolocation) return;

    function onSuccess(pos) {
        myLat = pos.coords.latitude;
        myLng = pos.coords.longitude;
        if (myPresenceRef) myPresenceRef.update({ lat: myLat, lng: myLng });
        let badge = document.getElementById('onlineCount');
        if (badge) badge.textContent = '✅ متصل';
        updateAllDistances();
    }

    function poll() {
        navigator.geolocation.getCurrentPosition(onSuccess, function(err) {
            if (err.code === 3 && !myLat) {
                // TIMEOUT → نحاول بدون دقة عالية
                navigator.geolocation.getCurrentPosition(onSuccess, function() {},
                    { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 });
            }
            if (err.code === 1) {
                // مرفوض → نحاول IP + نرشد المستخدم
                if (!myLat) getLocationByIP();
                if (!window._gpsDeniedShown) {
                    window._gpsDeniedShown = true;
                    const isIOS = /iPhone|iPad/i.test(navigator.userAgent);
                    showModal({
                        title: '📍 المسافات غير دقيقة',
                        message: isIOS
                            ? 'لتحسين دقة المسافات:\n\nالإعدادات ← الخصوصية ← خدمات الموقع ← Safari ← أثناء الاستخدام\n\nثم حدّث الصفحة'
                            : 'لتحسين دقة المسافات:\n\nاضغط 🔒 بجانب الرابط ← أذونات الموقع ← سماح\n\nثم حدّث الصفحة',
                        buttons: [
                            { text: 'حدّث الصفحة', cls: 'modal-btn-primary', action: function() { location.reload(); } },
                            { text: 'تخطي', cls: 'modal-btn-cancel', action: function() {} }
                        ]
                    });
                }
            }
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: GPS_TIMEOUT });
    }

    poll();
    let fastPoll = setInterval(poll, GPS_FAST_INTERVAL);
    setTimeout(function() {
        clearInterval(fastPoll);
        gpsPollInterval = setInterval(poll, GPS_SLOW_INTERVAL);
    }, GPS_FAST_DURATION);
}

function cleanStaleUsers(cache) {
    let now = Date.now();
    Object.keys(cache).forEach(function(id) {
        let u = cache[id];
        if (u && u.t && now - u.t > STALE_USER_MS && id !== myId) {
            db.ref('online/' + id).remove();
            delete cache[id];
        }
    });
}

// خطة بديلة: لو GPS مرفوض — نحصل الموقع من IP (بدون إذن!)
function getLocationByIP() {
    if (myLat) return; // GPS شغّال — ما نحتاج
    fetch('https://ipapi.co/json/')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.latitude && data.longitude && !myLat) {
                myLat = data.latitude;
                myLng = data.longitude;
                if (myPresenceRef) myPresenceRef.update({ lat: myLat, lng: myLng });
                updateAllDistances();
            }
        })
        .catch(function() {
            // نجرب API ثاني
            fetch('https://ip-api.com/json/?fields=lat,lon')
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.lat && data.lon && !myLat) {
                        myLat = data.lat;
                        myLng = data.lon;
                        if (myPresenceRef) myPresenceRef.update({ lat: myLat, lng: myLng });
                        updateAllDistances();
                    }
                }).catch(function() {});
        });
}

function updateAllDistances() {
    document.querySelectorAll('.person-card').forEach(function(card) {
        let uid = card.dataset.uid;
        let u = window._onlineCache ? window._onlineCache[uid] : null;
        if (!u) return;
        let distEl = card.querySelector('.person-distance');
        if (distEl) {
            let d = formatDistance(u.lat, u.lng);
            if (distEl.textContent !== d) distEl.textContent = d;
        }
    });
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

    // لو GPS ما جهز بعد 15 ثانية → نعرض الكل بدون فلتر GPS
    setTimeout(function() {
        if (!myLat && presenceRef) {
            window._skipGpsFilter = true;
            presenceRef.once('value', function(s) { renderPeopleFromData(s.val() || {}); });
        }
    }, 15000);

    presenceRef = db.ref('online');
    myPresenceRef = presenceRef.child(myId);

    // تنظيف هوياتي القديمة من Firebase
    myOldIds.forEach(function(oldId) {
        db.ref('online/' + oldId).remove();
    });

    // مراقبة اتصال Firebase — يظهر البانر فقط لو انقطع بعد ما كان متصل
    let wasConnected = false;
    db.ref('.info/connected').on('value', function(snap) {
        let banner = document.getElementById('offlineBanner');
        if (snap.val() === true) {
            if (wasConnected) {
                // عاد الاتصال — نعيد تسجيل الحضور
                if (myPresenceRef) {
                    let presenceData = { name: myName, t: firebase.database.ServerValue.TIMESTAMP };
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

    let presenceData = { name: myName, t: firebase.database.ServerValue.TIMESTAMP };
    if (myLat !== 0) { presenceData.lat = myLat; presenceData.lng = myLng; }
    myPresenceRef.set(presenceData);
    myPresenceRef.onDisconnect().remove();

    // [FIX 2] heartbeat واحد فقط
    heartbeatInterval = setInterval(() => {
        if (myPresenceRef) {
            let hb = { t: firebase.database.ServerValue.TIMESTAMP };
            if (myLat) { hb.lat = myLat; hb.lng = myLng; }
            myPresenceRef.update(hb);
        }
    }, HEARTBEAT_MS);

    // كاش محلي للمتصلين — نحدّث بذكاء بدون إعادة تحميل الكل
    let onlineCache = {};
    window._onlineCache = onlineCache;
    let renderTimeout = null;

    function scheduleRender() {
        if (renderTimeout) clearTimeout(renderTimeout);
        renderTimeout = setTimeout(function() {
            renderPeopleFromData(onlineCache);
        }, 500);
    }

    // إخفاء spinner بعد 5 ثواني كحد أقصى
    setTimeout(function() {
        let spinner = document.getElementById('searchingSpinner');
        if (spinner && spinner.style.display !== 'none') {
            spinner.style.display = 'none';
            if (myLat) {
                document.getElementById('onlineCount').textContent = '✅ متصل';
            } else {
                document.getElementById('onlineCount').textContent = '📍 فعّل الموقع لرؤية الجيران';
            }
        }
    }, 5000);

    // تنظيف كل البيانات القديمة من Firebase فوراً
    presenceRef.once('value', function(snap) {
        let data = snap.val() || {};
        let now = Date.now();
        Object.keys(data).forEach(function(id) {
            if (id !== myId && data[id] && data[id].t && now - data[id].t > STALE_USER_MS) {
                db.ref('online/' + id).remove();
            }
        });
    });

    // أول تحميل
    presenceRef.once('value', function(snap) {
        onlineCache = snap.val() || {};
        let spinner = document.getElementById('searchingSpinner');
        if (spinner) spinner.style.display = 'none';
        document.getElementById('onlineCount').textContent = '✅ متصل';

        // تنظيف الحسابات الميتة
        cleanStaleUsers(onlineCache);
        renderPeopleFromData(onlineCache);

        // تنظيف دوري كل 30 ثانية
        _intervals.push(setInterval(function() {
            presenceRef.once('value', function(snap) {
                let data = snap.val() || {};
                let cleaned = false;
                let now = Date.now();
                Object.keys(data).forEach(function(id) {
                    if (id !== myId && data[id] && data[id].t && now - data[id].t > STALE_USER_MS) {
                        db.ref('online/' + id).remove();
                        delete onlineCache[id];
                        cleaned = true;
                    }
                });
                if (cleaned) renderPeopleFromData(onlineCache);
            });
        }, STALE_CHECK_MS));

        // تنظيف السجل — مرة واحدة
        if (!window._logsCleanedUp) {
            window._logsCleanedUp = true;
            db.ref('logs').once('value', function(s) {
                let logData = s.val() || {};
                let convs = {};
                Object.entries(logData).forEach(function(e) {
                    let key = e[0], m = e[1];
                    if (!m.from || !m.to) return;
                    let pair = [m.from, m.to].sort().join('_');
                    if (!convs[pair]) convs[pair] = [];
                    convs[pair].push({ key: key, t: m.t || 0 });
                });
                let monthAgo = now - (30 * 24 * 60 * 60 * 1000);
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
    let initialLoadDone = false;
    setTimeout(function() { initialLoadDone = true; }, 2000);

    presenceRef.on('child_added', function(snap) {
        if (snap.key === myId) return;
        onlineCache[snap.key] = snap.val();
        // نتجاهل الأحداث أثناء التحميل الأولي (once يتكفل)
        if (initialLoadDone) scheduleRender();
    });
    presenceRef.on('child_changed', function(snap) {
        let oldData = onlineCache[snap.key] || {};
        let newData = snap.val();
        // نحتفظ بالإحداثيات القديمة لو الجديدة ما فيها
        if (oldData && oldData.lat && !newData.lat) { newData.lat = oldData.lat; newData.lng = oldData.lng; }
        let hadCoords = oldData && oldData.lat;
        let hasCoords = newData.lat;
        onlineCache[snap.key] = newData;

        // لو حصل على إحداثيات جديدة ما كانت موجودة → نعيد رسم القائمة (يظهر بالقائمة لأول مرة)
        if (!hadCoords && hasCoords) {
            scheduleRender();
            return;
        }

        let card = document.querySelector('[data-uid="' + snap.key + '"]');
        if (card && newData) {
            // نحدّث المسافة بس لو فيه إحداثيات
            if (newData.lat && newData.lng) {
                let distEl = card.querySelector('.person-distance');
                if (distEl) distEl.textContent = formatDistance(newData.lat, newData.lng);
            }
            if (oldData.name && newData.name && oldData.name !== newData.name) {
                let nameEl = card.querySelector('.person-name');
                if (nameEl) nameEl.textContent = newData.name;
                card.dataset.uname = newData.name;
            }
        }
    });
    presenceRef.on('child_removed', function(snap) {
        delete onlineCache[snap.key];
        scheduleRender();
    });

    // تحديث المسافات كل 5 ثواني
    _intervals.push(setInterval(function() {
        if (currentScreen !== 'people') return;
        document.querySelectorAll('.person-card').forEach(function(card) {
            let uid = card.dataset.uid;
            let u = onlineCache[uid];
            if (u) {
                let distEl = card.querySelector('.person-distance');
                if (distEl) {
                    let newDist = formatDistance(u.lat, u.lng);
                    if (distEl.textContent !== newDist) distEl.textContent = newDist;
                }
            }
        });
    }, DISTANCE_REFRESH_MS));


    // استمع للرسائل — نوقف أي listener قديم أولاً
    db.ref('msgs/' + myId).off();
    const myMsgsRef = db.ref('msgs/' + myId);
    myMsgsRef.on('child_added', (snap) => {
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
                let senderCard = document.querySelector('[data-uid="' + msg.from + '"]');
                if (senderCard && !senderCard.classList.contains('has-unread')) {
                    senderCard.classList.add('has-unread');
                    let nameEl = senderCard.querySelector('.person-name');
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
    let unblockBtn = document.getElementById('unblockBtn');
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
    let list = document.getElementById('peopleList');
    let noPeople = document.getElementById('noPeople');
    let count = document.getElementById('onlineCount');

    let allUsers = [];
    Object.entries(data).forEach(function(entry) {
        let id = entry[0], u = entry[1];
        if (id !== myId && !myOldIds.has(id) && !blockedUsers.has(id) && u.name && (window._skipGpsFilter || (u.lat && u.lng))) {
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
    let total = allUsers.length;
    let maxShow = Math.max(8, Math.round(20 - (total * 0.06)));
    if (total <= 5) maxShow = total;

    let users;
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
        let distText = formatDistance(u.lat, u.lng);
        let hasUnread = unreadFrom.has(u.id);
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

    let msgsDiv = document.getElementById('chatMessages');
    msgsDiv.innerHTML = '';
    let scrollBtn = document.getElementById('scrollDownBtn');
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
        let statusEl = document.getElementById('chatDistance');
        let nameEl = document.getElementById('chatWith');
        if (snap.exists()) {
            let data = snap.val();
            // تحديث الاسم إذا تغيّر
            if (data.name && data.name !== nameEl.textContent) {
                let oldName = nameEl.textContent;
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
    let myTypingRef = db.ref('typing/' + userId + '/' + myId);
    let partnerTypingRef2 = db.ref('typing/' + myId + '/' + userId);
    let typingIndicator = document.getElementById('typingIndicator');
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
        let el = document.getElementById('msgInput');
        let text = el.value.trim();
        if (!text || text.length > 500) return;
        let now = Date.now();
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


        let msgData = {
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
            let msgEl = document.getElementById(thisMsgId);
            if (msgEl) {
                let tick = msgEl.querySelector('.msg-tick');
                if (tick) tick.textContent = '✓';
            }
        }).catch(function() {
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
    let h = chatHistory.get(userId);
    h.push({ text, isMe });
    if (h.length > MAX_HISTORY_PER_USER) h.shift();
    persistChatHistory();
}
function addMsg(text, isMe, delivered = true, msgId = null) {
    let msgs = document.getElementById('chatMessages');
    let div = document.createElement('div');
    if (msgId) div.id = msgId;
    let now = new Date();
    let time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    div.className = 'msg ' + (isMe ? 'msg-me' : 'msg-them');
    let tick = isMe ? '<span class="msg-tick">' + (delivered ? '✓' : '⏳') + '</span>' : '';
    div.innerHTML = esc(text) + '<span class="msg-time">' + time + ' ' + tick + '</span>';

    // لا تسحب للأسفل إذا المستخدم يقرأ رسائل قديمة
    let isAtBottom = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80;
    msgs.appendChild(div);
    if (isAtBottom || isMe) {
        msgs.scrollTop = msgs.scrollHeight;
    } else {
        showNewMsgButton();
    }
}

function showNewMsgButton() {
    let btn = document.getElementById('scrollDownBtn');
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
    db.ref('msgs/' + myId).off();
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
    if (gpsPollInterval) { clearInterval(gpsPollInterval); gpsPollInterval = null; }
    _intervals.forEach(clearInterval); _intervals.length = 0;
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
