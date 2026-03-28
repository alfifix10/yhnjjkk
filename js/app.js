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
let myLat = 0;
let myLng = 0;
let currentChatUser = null;
let unreadFrom = new Set();
let myOldIds = new Set(JSON.parse(localStorage.getItem('jiranak_old_ids') || '[]'));
let lastMsgTime = 0;
let presenceRef, myPresenceRef, msgListener;

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

function playNotif() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; gain.gain.value = 0.3;
        osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
}

// ---- تشغيل ----
document.addEventListener('DOMContentLoaded', () => {
    initParticles();

    // Firebase init
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    const savedName = localStorage.getItem('jiranak_name');
    if (savedName) {
        myName = savedName;
        requestLocation();
    } else {
        initLanding();
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
    showScreen('landingScreen');
    const input = document.getElementById('nicknameInput');
    const joinBtn = document.getElementById('joinBtn');
    input.value = '';
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
        requestLocation();
    };

    input.onkeypress = (e) => { if (e.key === 'Enter') joinBtn.click(); };

    document.querySelectorAll('.name-chip').forEach(chip => {
        chip.onclick = () => { input.value = chip.dataset.name; joinBtn.click(); };
    });
}

function requestLocation() {
    const btn = document.getElementById('joinBtn');
    if (btn) { btn.textContent = '⏳ انتظر...'; btn.disabled = true; }

    if (!navigator.geolocation) {
        alert('متصفحك لا يدعم تحديد الموقع');
        if (btn) { btn.textContent = 'ادخل'; btn.disabled = false; }
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => { myLat = pos.coords.latitude; myLng = pos.coords.longitude; enterPeopleScreen(); },
        () => {
            if (btn) { btn.textContent = 'ادخل'; btn.disabled = false; }
            alert('لازم تسمح بتحديد الموقع عشان تشوف جيرانك!');
            localStorage.removeItem('jiranak_name');
            initLanding();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

// ========== SCREEN 2: People ==========
function enterPeopleScreen() {
    showScreen('peopleScreen');
    document.getElementById('myName').textContent = myName;
    document.getElementById('onlineCount').textContent = 'جاري الاتصال...';
    history.pushState({ screen: 'people' }, '', '');

    presenceRef = db.ref('online');
    myPresenceRef = presenceRef.child(myId);

    // سجّل حضوري
    myPresenceRef.set({ name: myName, lat: myLat, lng: myLng, t: firebase.database.ServerValue.TIMESTAMP });
    myPresenceRef.onDisconnect().remove(); // يحذف تلقائياً عند الخروج

    // استمع للمتصلين
    presenceRef.on('value', (snap) => {
        const data = snap.val() || {};
        document.getElementById('onlineCount').textContent = '✅ متصل';
        renderPeopleFromData(data);
    });

    // استمع للرسائل الموجهة لي
    const myMsgsRef = db.ref('msgs/' + myId);
    msgListener = myMsgsRef.on('child_added', (snap) => {
        const msg = snap.val();
        if (!msg) return;

        if (currentChatUser && currentChatUser.id === msg.from) {
            addMsg(msg.text, false);
            playNotif();
            if (navigator.vibrate) navigator.vibrate(50);
        } else {
            unreadFrom.add(msg.from);
            const data = {};
            presenceRef.once('value', s => { renderPeopleFromData(s.val() || {}); });
            playNotif();
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
        }

        // حذف الرسالة بعد قراءتها
        snap.ref.remove();
    });

    document.getElementById('backToLanding').onclick = async () => {
        localStorage.removeItem('jiranak_name');
        cleanup();
        myOldIds.add(myId);
        localStorage.setItem('jiranak_old_ids', JSON.stringify([...myOldIds]));
        myId = crypto.randomUUID();
        localStorage.setItem('jiranak_id', myId);
        initLanding();
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

    list.innerHTML = users.map((u, i) => {
        const dist = getDistance(u.lat, u.lng);
        const distText = dist < 1 ? `${Math.round(dist * 1000)} متر` : `${dist.toFixed(1)} كم`;
        const hasUnread = unreadFrom.has(u.id);
        return `
            <div class="person-card ${hasUnread ? 'has-unread' : ''}" style="animation-delay:${i*0.08}s" onclick="startChat('${u.id}','${esc(u.name)}',${u.lat},${u.lng})">
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
}

// ========== SCREEN 3: Chat ==========
function startChat(userId, userName, uLat, uLng) {
    unreadFrom.delete(userId);
    currentChatUser = { id: userId, name: userName, lat: uLat, lng: uLng };
    showScreen('chatScreen');
    history.pushState({ screen: 'chat' }, '', '');

    const dist = getDistance(uLat, uLng);
    const distText = dist < 1 ? `${Math.round(dist * 1000)} متر` : `${dist.toFixed(1)} كم`;
    document.getElementById('chatWith').textContent = userName;
    document.getElementById('chatDistance').textContent = `📍 يبعد ${distText}`;

    document.getElementById('chatMessages').innerHTML = '';
    addSystemMsg(`بدأت محادثة مع ${userName} 💨`);

    // إعداد الإرسال
    const input = document.getElementById('msgInput');
    const sendBtn = document.getElementById('sendBtn');

    const sendMsg = () => {
        const text = input.value.trim();
        if (!text || text.length > 500) return;
        const now = Date.now();
        if (now - lastMsgTime < 500) return;
        lastMsgTime = now;

        addMsg(text, true);
        input.value = '';

        // إرسال عبر Firebase - فوري
        db.ref('msgs/' + userId).push({
            from: myId,
            name: myName,
            text: text,
            t: firebase.database.ServerValue.TIMESTAMP
        });
    };

    const newSend = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSend, sendBtn);
    newSend.addEventListener('click', sendMsg);

    const newInput = input.cloneNode(true);
    newInput.setAttribute('maxlength', '500');
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
    newInput.focus();

    document.getElementById('backToPeople').onclick = () => {
        document.getElementById('chatMessages').innerHTML = '';
        currentChatUser = null;
        showScreen('peopleScreen');
    };
}

function addMsg(text, isMe) {
    const msgs = document.getElementById('chatMessages');
    const div = document.createElement('div');
    const now = new Date();
    const time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    div.className = `msg ${isMe ? 'msg-me' : 'msg-them'}`;
    div.innerHTML = `${esc(text)}<span class="msg-time">${time}</span>`;
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

// ========== زر الرجوع ==========
window.addEventListener('popstate', () => {
    if (currentChatUser) {
        document.getElementById('chatMessages').innerHTML = '';
        currentChatUser = null;
        showScreen('peopleScreen');
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
    if (myPresenceRef) myPresenceRef.remove();
    if (presenceRef) presenceRef.off();
    if (msgListener) db.ref('msgs/' + myId).off();
    unreadFrom.clear();
    currentChatUser = null;
}

window.addEventListener('beforeunload', cleanup);
