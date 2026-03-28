// ========================================
// جيرانك - Jiranak
// دردشة مجهولة مع الجيران
// ========================================

const SUPABASE_URL = 'https://hocxgsvrosyphgjpsxfh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvY3hnc3Zyb3N5cGhnanBzeGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Nzk3ODYsImV4cCI6MjA5MDI1NTc4Nn0.2NJmnwxT30IJBxuKrbWB3m_3vNfmPq7YmJs4PSiB0YU';

let supabaseClient = null;
let myId = localStorage.getItem('jiranak_id') || crypto.randomUUID();
localStorage.setItem('jiranak_id', myId);
let myName = '';
let myLat = 0;
let myLng = 0;
let currentChatUser = null;
let chatChannel = null;
let presenceChannel = null;
let notifyChannel = null;
let nearbyUsers = new Map();
let unreadFrom = new Set();
let blockedUsers = new Set(JSON.parse(localStorage.getItem('jiranak_blocked') || '[]'));
let lastMsgTime = 0;

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

// ---- تشغيل ----
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    const savedName = localStorage.getItem('jiranak_name');
    if (savedName) {
        myName = savedName;
        requestLocation();
    } else {
        initLanding();
    }
});

// ---- Particles ----
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

    joinBtn.addEventListener('click', () => {
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
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinBtn.click();
    });

    document.querySelectorAll('.name-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            input.value = chip.dataset.name;
            joinBtn.click();
        });
    });
}

function requestLocation() {
    const btn = document.getElementById('joinBtn');
    if (btn) {
        btn.textContent = '⏳ انتظر...';
        btn.disabled = true;
    }

    if (!navigator.geolocation) {
        alert('متصفحك لا يدعم تحديد الموقع');
        if (btn) { btn.textContent = 'ادخل'; btn.disabled = false; }
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            myLat = pos.coords.latitude;
            myLng = pos.coords.longitude;
            enterPeopleScreen();
        },
        (err) => {
            if (btn) { btn.textContent = 'ادخل'; btn.disabled = false; }
            alert('لازم تسمح بتحديد الموقع عشان تشوف جيرانك!');
            showScreen('landingScreen');
            initLanding();
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

// ========== SCREEN 2: People ==========
function enterPeopleScreen() {
    showScreen('peopleScreen');
    document.getElementById('myName').textContent = myName;

    // زر الرجوع في المتصفح
    history.pushState({ screen: 'people' }, '', '');

    initSupabase();

    document.getElementById('backToLanding').addEventListener('click', () => {
        localStorage.removeItem('jiranak_name');
        cleanup();
        showScreen('landingScreen');
        initLanding();
    });

    document.getElementById('shareBtn')?.addEventListener('click', shareLink);
}

function renderPeopleList() {
    const list = document.getElementById('peopleList');
    const noPeople = document.getElementById('noPeople');
    const count = document.getElementById('onlineCount');

    const users = Array.from(nearbyUsers.values()).filter(u => !blockedUsers.has(u.id));
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
            <div class="person-card ${hasUnread ? 'has-unread' : ''}" style="animation-delay:${i * 0.08}s" onclick="startChat('${u.id}')">
                <div class="person-avatar" style="background:${getGradient(u.id)}">
                    ${getAvatar(u.id)}
                    ${hasUnread ? '<span class="unread-dot"></span>' : ''}
                </div>
                <div class="person-info">
                    <div class="person-name">${escapeHtml(u.name)} ${hasUnread ? '<span class="new-msg-badge">رسالة جديدة</span>' : ''}</div>
                    <div class="person-distance">📍 ${distText}</div>
                </div>
                <div class="person-arrow">←</div>
            </div>
        `;
    }).join('');
}

// ========== SCREEN 3: Chat ==========
function startChat(userId) {
    const user = nearbyUsers.get(userId);
    if (!user) return;

    unreadFrom.delete(userId);
    renderPeopleList();

    currentChatUser = user;
    showScreen('chatScreen');
    history.pushState({ screen: 'chat' }, '', '');

    const dist = getDistance(user.lat, user.lng);
    const distText = dist < 1 ? `${Math.round(dist * 1000)} متر` : `${dist.toFixed(1)} كم`;

    document.getElementById('chatWith').textContent = user.name;
    document.getElementById('chatDistance').textContent = `📍 يبعد ${distText}`;

    const msgs = document.getElementById('chatMessages');
    msgs.innerHTML = '';
    addSystemMsg(`بدأت محادثة مع ${user.name} 💨`);

    // الاشتراك في غرفة الدردشة
    const roomId = [myId, userId].sort().join('-');
    if (chatChannel) { chatChannel.unsubscribe(); chatChannel = null; }
    chatChannel = supabaseClient.channel(`chat-${roomId}`);
    chatChannel.on('broadcast', { event: 'msg' }, ({ payload }) => {
        if (payload.from !== myId) {
            addMsg(payload.text, false);
            // اهتزاز خفيف
            if (navigator.vibrate) navigator.vibrate(50);
        }
    }).subscribe();

    // مراقبة خروج الطرف الآخر
    const checkLeave = setInterval(() => {
        if (!nearbyUsers.has(userId) && currentChatUser?.id === userId) {
            addSystemMsg(`${user.name} طلع من الدردشة 👋`);
            clearInterval(checkLeave);
        }
    }, 3000);

    // إعداد الإرسال
    setupChatInput(userId);

    document.getElementById('backToPeople').onclick = () => {
        clearInterval(checkLeave);
        leaveChatScreen();
    };
}

function setupChatInput(userId) {
    const input = document.getElementById('msgInput');
    const sendBtn = document.getElementById('sendBtn');

    const sendMsg = () => {
        const text = input.value.trim();
        if (!text) return;
        if (text.length > 500) {
            input.value = text.substring(0, 500);
            return;
        }

        // منع السبام (رسالة كل ثانية)
        const now = Date.now();
        if (now - lastMsgTime < 1000) return;
        lastMsgTime = now;

        addMsg(text, true);
        input.value = '';

        chatChannel.send({
            type: 'broadcast',
            event: 'msg',
            payload: { from: myId, text, ts: now }
        });

        notifyChannel.send({
            type: 'broadcast',
            event: 'notify',
            payload: { from: myId, to: userId, name: myName }
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
}

function leaveChatScreen() {
    document.getElementById('chatMessages').innerHTML = '';
    if (chatChannel) { chatChannel.unsubscribe(); chatChannel = null; }
    currentChatUser = null;
    showScreen('peopleScreen');
}

function addMsg(text, isMe) {
    const msgs = document.getElementById('chatMessages');
    const div = document.createElement('div');
    const now = new Date();
    const time = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    div.className = `msg ${isMe ? 'msg-me' : 'msg-them'}`;
    div.innerHTML = `${escapeHtml(text)}<span class="msg-time">${time}</span>`;
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
    if (currentChatUser) {
        leaveChatScreen();
    }
});

// ========== Supabase ==========
function initSupabase() {
    try {
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        document.getElementById('onlineCount').textContent = 'جاري الاتصال...';

        presenceChannel = supabaseClient.channel('jiranak-room');
        presenceChannel
            .on('presence', { event: 'sync' }, () => {
                const state = presenceChannel.presenceState();
                nearbyUsers.clear();
                Object.entries(state).forEach(([key, users]) => {
                    users.forEach(u => {
                        if (u.id && u.id !== myId) {
                            nearbyUsers.set(u.id, { id: u.id, name: u.name, lat: u.lat, lng: u.lng });
                        }
                    });
                });
                renderPeopleList();
            })
            .on('presence', { event: 'join' }, ({ newPresences }) => {
                newPresences.forEach(u => {
                    if (u.id && u.id !== myId) {
                        nearbyUsers.set(u.id, { id: u.id, name: u.name, lat: u.lat, lng: u.lng });
                    }
                });
                renderPeopleList();
            })
            .on('presence', { event: 'leave' }, ({ leftPresences }) => {
                leftPresences.forEach(u => {
                    nearbyUsers.delete(u.id);
                    unreadFrom.delete(u.id);
                });
                renderPeopleList();
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    document.getElementById('onlineCount').textContent = '✅ متصل';
                    await presenceChannel.track({
                        id: myId,
                        name: myName,
                        lat: myLat,
                        lng: myLng,
                    });
                } else if (status === 'CHANNEL_ERROR') {
                    document.getElementById('onlineCount').textContent = '❌ خطأ في الاتصال';
                }
            });

        notifyChannel = supabaseClient.channel('jiranak-notify');
        notifyChannel
            .on('broadcast', { event: 'notify' }, ({ payload }) => {
                if (payload.to === myId && !blockedUsers.has(payload.from)) {
                    if (!currentChatUser || currentChatUser.id !== payload.from) {
                        unreadFrom.add(payload.from);
                        renderPeopleList();
                        if (navigator.vibrate) navigator.vibrate(100);
                    }
                }
            })
            .subscribe();

    } catch (e) {
        document.getElementById('onlineCount').textContent = '❌ خطأ: ' + e.message;
    }
}

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

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function shareLink() {
    const url = window.location.href;
    const text = 'جرب "دردش مع جيرانك" - مجهول ومؤقت!';
    if (navigator.share) {
        navigator.share({ title: 'دردش مع جيرانك', text, url });
    } else {
        navigator.clipboard.writeText(url).then(() => alert('تم نسخ الرابط!'));
    }
}

function cleanup() {
    if (presenceChannel) { presenceChannel.untrack(); presenceChannel.unsubscribe(); }
    if (chatChannel) chatChannel.unsubscribe();
    if (notifyChannel) notifyChannel.unsubscribe();
    nearbyUsers.clear();
    unreadFrom.clear();
    currentChatUser = null;
}

window.addEventListener('beforeunload', cleanup);
