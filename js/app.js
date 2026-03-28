// ========================================
// جيرانك - Jiranak
// دردشة مجهولة مع الجيران
// ========================================

// Supabase (مجاني - للدردشة الفورية)
const SUPABASE_URL = 'https://hocxgsvrosyphgjpsxfh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvY3hnc3Zyb3N5cGhnanBzeGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Nzk3ODYsImV4cCI6MjA5MDI1NTc4Nn0.2NJmnwxT30IJBxuKrbWB3m_3vNfmPq7YmJs4PSiB0YU';

let supabaseClient = null;
let myId = crypto.randomUUID();
let myName = '';
let myLat = 0;
let myLng = 0;
let currentChatUser = null;
let chatChannel = null;
let presenceChannel = null;
let nearbyUsers = new Map();

// ---- الألوان والأيقونات للمستخدمين ----
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

// ---- تشغيل التطبيق ----
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initLanding();
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
        requestLocation();
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinBtn.click();
    });

    // أسماء مستعارة جاهزة
    document.querySelectorAll('.name-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            input.value = chip.dataset.name;
            joinBtn.click();
        });
    });
}

// ---- طلب الموقع ----
function requestLocation() {
    const btn = document.getElementById('joinBtn');
    btn.textContent = '⏳ انتظر...';
    btn.disabled = true;

    if (!navigator.geolocation) {
        alert('متصفحك لا يدعم تحديد الموقع');
        btn.textContent = 'ادخل';
        btn.disabled = false;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            myLat = pos.coords.latitude;
            myLng = pos.coords.longitude;
            enterPeopleScreen();
        },
        (err) => {
            btn.textContent = 'ادخل';
            btn.disabled = false;
            alert('لازم تسمح بتحديد الموقع عشان تشوف جيرانك!');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

// ========== SCREEN 2: People ==========
function enterPeopleScreen() {
    showScreen('peopleScreen');
    document.getElementById('myName').textContent = myName;

    initSupabase();

    // زر الرجوع
    document.getElementById('backToLanding').addEventListener('click', () => {
        cleanup();
        showScreen('landingScreen');
    });

    // زر المشاركة
    document.getElementById('shareBtn')?.addEventListener('click', shareLink);
}


function renderPeopleList() {
    const list = document.getElementById('peopleList');
    const noPeople = document.getElementById('noPeople');
    const count = document.getElementById('onlineCount');

    const users = Array.from(nearbyUsers.values());
    count.textContent = `${users.length} جار متصل`;

    if (users.length === 0) {
        list.style.display = 'none';
        noPeople.style.display = 'block';
        return;
    }

    list.style.display = 'flex';
    noPeople.style.display = 'none';

    // ترتيب بالمسافة
    users.sort((a, b) => getDistance(a.lat, a.lng) - getDistance(b.lat, b.lng));

    list.innerHTML = users.map((u, i) => {
        const dist = getDistance(u.lat, u.lng);
        const distText = dist < 1 ? `${Math.round(dist * 1000)} متر` : `${dist.toFixed(1)} كم`;
        return `
            <div class="person-card" data-uid="${u.id}" style="animation-delay:${i * 0.08}s" onclick="startChat('${u.id}')">
                <div class="person-avatar" style="background:${getGradient(u.id)}">${getAvatar(u.id)}</div>
                <div class="person-info">
                    <div class="person-name">${escapeHtml(u.name)}</div>
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

    currentChatUser = user;
    showScreen('chatScreen');

    const dist = getDistance(user.lat, user.lng);
    const distText = dist < 1 ? `${Math.round(dist * 1000)} متر` : `${dist.toFixed(1)} كم`;

    document.getElementById('chatWith').textContent = user.name;
    document.getElementById('chatDistance').textContent = `📍 يبعد ${distText}`;

    const msgs = document.getElementById('chatMessages');
    msgs.innerHTML = '';
    addSystemMsg(`بدأت محادثة مع ${user.name} - كل الرسائل مؤقتة 💨`);

    // إعداد الإرسال
    const input = document.getElementById('msgInput');
    const sendBtn = document.getElementById('sendBtn');

    const sendMsg = () => {
        const text = input.value.trim();
        if (!text) return;
        addMsg(text, true);
        input.value = '';

        sendViaSupabase(text);
    };

    // إزالة listeners قديمة
    const newSend = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSend, sendBtn);
    newSend.addEventListener('click', sendMsg);

    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    newInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMsg(); });
    newInput.focus();

    // زر الرجوع
    document.getElementById('backToPeople').onclick = () => {
        // حذف الرسائل عند الخروج
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
}


// ========== Supabase (الاتصال الحقيقي) ==========
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
                });
                renderPeopleList();
            })
            .subscribe(async (status) => {
                console.log('Supabase status:', status);
                if (status === 'SUBSCRIBED') {
                    document.getElementById('onlineCount').textContent = '✅ متصل - في انتظار جيران...';
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
    } catch (e) {
        console.error('Supabase error:', e);
        document.getElementById('onlineCount').textContent = '❌ خطأ: ' + e.message;
    }
}

function sendViaSupabase(text) {
    if (!currentChatUser || !supabaseClient) return;
    const roomId = [myId, currentChatUser.id].sort().join('-');

    if (!chatChannel) {
        chatChannel = supabaseClient.channel(`chat-${roomId}`);
        chatChannel.on('broadcast', { event: 'msg' }, ({ payload }) => {
            if (payload.from !== myId) {
                addMsg(payload.text, false);
            }
        }).subscribe((status) => {
            console.log('Chat channel:', status);
            if (status === 'SUBSCRIBED') {
                chatChannel.send({
                    type: 'broadcast',
                    event: 'msg',
                    payload: { from: myId, text, ts: Date.now() }
                });
            }
        });
    } else {
        chatChannel.send({
            type: 'broadcast',
            event: 'msg',
            payload: { from: myId, text, ts: Date.now() }
        });
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
    const text = 'جرب جيرانك - دردش مع الناس اللي حولك مجهول ومؤقت!';
    if (navigator.share) {
        navigator.share({ title: 'جيرانك', text, url });
    } else {
        navigator.clipboard.writeText(url).then(() => alert('تم نسخ الرابط!'));
    }
}

function cleanup() {
    if (presenceChannel) {
        presenceChannel.untrack();
        presenceChannel.unsubscribe();
    }
    if (chatChannel) chatChannel.unsubscribe();
    nearbyUsers.clear();
    currentChatUser = null;
}

// تنظيف عند الإغلاق
window.addEventListener('beforeunload', cleanup);
