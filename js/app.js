// ========================================
// جيرانك - Jiranak
// دردشة مجهولة مع الجيران
// ========================================

const SUPABASE_URL = 'https://hocxgsvrosyphgjpsxfh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhvY3hnc3Zyb3N5cGhnanBzeGZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2Nzk3ODYsImV4cCI6MjA5MDI1NTc4Nn0.2NJmnwxT30IJBxuKrbWB3m_3vNfmPq7YmJs4PSiB0YU';

let sb = null;
let myId = localStorage.getItem('jiranak_id') || crypto.randomUUID();
localStorage.setItem('jiranak_id', myId);
let myName = '';
let myLat = 0;
let myLng = 0;
let currentChatUser = null;
let presenceChannel = null;
let msgChannel = null;
let nearbyUsers = new Map();
let unreadFrom = new Set();
let myOldIds = new Set(JSON.parse(localStorage.getItem('jiranak_old_ids') || '[]'));
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
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

    input.onkeypress = (e) => {
        if (e.key === 'Enter') joinBtn.click();
    };

    document.querySelectorAll('.name-chip').forEach(chip => {
        chip.onclick = () => {
            input.value = chip.dataset.name;
            joinBtn.click();
        };
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
        (pos) => {
            myLat = pos.coords.latitude;
            myLng = pos.coords.longitude;
            enterPeopleScreen();
        },
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

    // Presence - من متصل
    presenceChannel = sb.channel('jiranak-room', {
        config: { presence: { key: myId } }
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            nearbyUsers.clear();
            const state = presenceChannel.presenceState();
            Object.values(state).flat().forEach(u => {
                if (u.uid && u.uid !== myId && !myOldIds.has(u.uid)) {
                    nearbyUsers.set(u.uid, u);
                }
            });
            renderPeopleList();
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                document.getElementById('onlineCount').textContent = '✅ متصل';
                await presenceChannel.track({ uid: myId, name: myName, lat: myLat, lng: myLng });
            } else if (status === 'CHANNEL_ERROR') {
                document.getElementById('onlineCount').textContent = '❌ خطأ في الاتصال';
            }
        });

    // استماع للرسائل الجديدة من جدول messages
    msgChannel = sb.channel('db-messages')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `to_id=eq.${myId}`
        }, (payload) => {
            const msg = payload.new;
            if (currentChatUser && currentChatUser.uid === msg.from_id) {
                addMsg(msg.text, false);
                if (navigator.vibrate) navigator.vibrate(50);
            } else {
                unreadFrom.add(msg.from_id);
                renderPeopleList();
                if (navigator.vibrate) navigator.vibrate(100);
            }
        })
        .subscribe();

    document.getElementById('backToLanding').onclick = async () => {
        localStorage.removeItem('jiranak_name');
        await cleanup();
        myOldIds.add(myId);
        localStorage.setItem('jiranak_old_ids', JSON.stringify([...myOldIds]));
        myId = crypto.randomUUID();
        localStorage.setItem('jiranak_id', myId);
        initLanding();
    };

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

    users.sort((a, b) => getDistance(a.lat, a.lng) - getDistance(b.lat, b.lng));

    list.innerHTML = users.map((u, i) => {
        const dist = getDistance(u.lat, u.lng);
        const distText = dist < 1 ? `${Math.round(dist * 1000)} متر` : `${dist.toFixed(1)} كم`;
        const hasUnread = unreadFrom.has(u.uid);
        return `
            <div class="person-card ${hasUnread ? 'has-unread' : ''}" style="animation-delay:${i*0.08}s" onclick="startChat('${u.uid}')">
                <div class="person-avatar" style="background:${getGradient(u.uid)}">
                    ${getAvatar(u.uid)}
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

    // مراقبة خروج الطرف الآخر
    const checkLeave = setInterval(() => {
        if (!nearbyUsers.has(userId) && currentChatUser?.uid === userId) {
            addSystemMsg(`${user.name} طلع 👋`);
            clearInterval(checkLeave);
        }
    }, 3000);

    // إعداد الإرسال
    const input = document.getElementById('msgInput');
    const sendBtn = document.getElementById('sendBtn');

    const sendMsg = async () => {
        const text = input.value.trim();
        if (!text || text.length > 500) return;
        const now = Date.now();
        if (now - lastMsgTime < 1000) return;
        lastMsgTime = now;

        addMsg(text, true);
        input.value = '';

        // إدخال الرسالة في جدول messages
        const { error } = await sb.from('messages').insert({
            from_id: myId,
            to_id: userId,
            from_name: myName,
            text: text
        });
        if (error) {
            addSystemMsg('❌ ' + error.message);
        }
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
        clearInterval(checkLeave);
        document.getElementById('chatMessages').innerHTML = '';
        currentChatUser = null;
        showScreen('peopleScreen');
        // حذف الرسائل القديمة
        sb.from('messages').delete().or(`from_id.eq.${myId},to_id.eq.${myId}`).then(() => {});
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

// ========== زر الرجوع في المتصفح ==========
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

async function cleanup() {
    if (presenceChannel) { await presenceChannel.untrack(); presenceChannel.unsubscribe(); presenceChannel = null; }
    if (msgChannel) { msgChannel.unsubscribe(); msgChannel = null; }
    nearbyUsers.clear();
    unreadFrom.clear();
    currentChatUser = null;
}

window.addEventListener('beforeunload', () => {
    // حذف كل رسائلي عند الخروج
    if (sb) sb.from('messages').delete().or(`from_id.eq.${myId},to_id.eq.${myId}`).then(() => {});
    cleanup();
});
