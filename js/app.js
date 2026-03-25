// ========================================
// TrendScope - Main Application
// يتصل بالـ Backend API مع مؤشر تحميل
// ========================================

const API_BASE = 'https://yhnjjkk.onrender.com';

let liveTrends = [];
let liveArticles = [];
let backendAvailable = false;

document.addEventListener('DOMContentLoaded', async () => {
    initParticles();
    initNavbar();
    initStats();
    initModal();
    initFilters();
    initAnalyzer();
    duplicateTicker();

    // عرض البيانات المحلية فوراً كاحتياط
    renderTrends('all', trendsData);
    renderArticles(articlesData);

    // اتصال بالخادم في الخلفية بصمت
    connectToBackend();
});

// ---- Loading Banner ----
function showLoadingBanner(msg) {
    let banner = document.getElementById('loadingBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'loadingBanner';
        banner.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#fe2c55,#25f4ee);color:white;padding:12px 28px;border-radius:50px;font-family:Cairo;font-size:14px;font-weight:700;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:flex;align-items:center;gap:10px;direction:rtl;';
        document.body.appendChild(banner);
    }
    banner.innerHTML = `<span style="display:inline-block;width:16px;height:16px;border:3px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite"></span> ${msg}`;
    banner.style.display = 'flex';
}

function hideLoadingBanner() {
    const banner = document.getElementById('loadingBanner');
    if (banner) banner.style.display = 'none';
}

function showSuccessBanner(msg) {
    let banner = document.getElementById('loadingBanner');
    if (!banner) return;
    banner.innerHTML = `✅ ${msg}`;
    banner.style.background = 'linear-gradient(135deg, #00c853, #00897b)';
    setTimeout(() => { banner.style.display = 'none'; }, 3000);
}

// ---- Backend Connection (مع إعادة المحاولة) ----
async function connectToBackend() {
    // Render المجاني ينام بعد عدم النشاط - يحتاج وقت للاستيقاظ
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 90000); // 90 ثانية

            const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
            clearTimeout(timeout);

            if (res.ok) {
                const data = await res.json();
                backendAvailable = true;
                console.log('✅ Backend متصل', data);

                await loadLiveTrends();
                await loadLiveArticles();
                return;
            }
        } catch (e) {
            console.log(`محاولة ${attempt}/3 فشلت:`, e.message);
            if (attempt < 3) {
                await sleep(5000);
            }
        }
    }

    console.log('ℹ️ تعذر الاتصال بالخادم - البيانات المحلية مُعروضة');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loadLiveTrends(category = 'all') {
    try {
        const res = await fetch(`${API_BASE}/api/trends?category=${category}`);
        const json = await res.json();
        if (json.success && json.data.length > 0) {
            liveTrends = json.data;
            renderTrends('all', liveTrends);
            updateTicker(liveTrends);
        }
    } catch (e) {
        console.log('خطأ في جلب الترندات:', e);
    }
}

async function loadLiveArticles() {
    try {
        const res = await fetch(`${API_BASE}/api/articles`);
        const json = await res.json();
        if (json.success && json.data.length > 0) {
            liveArticles = json.data;
            renderArticles(liveArticles);
        }
    } catch (e) {
        console.log('خطأ في جلب المقالات:', e);
    }
}

function updateTicker(trends) {
    const ticker = document.getElementById('tickerContent');
    ticker.innerHTML = '';
    trends.slice(0, 10).forEach(t => {
        ticker.innerHTML += `<span class="ticker-item">${t.hashtag} <em>${t.views}</em></span>`;
    });
    ticker.innerHTML += ticker.innerHTML;
}

// ---- Particles Background ----
function initParticles() {
    const container = document.getElementById('particles');
    const colors = ['#fe2c55', '#25f4ee', '#fffc00', '#ffffff'];
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 6 + 2;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.left = Math.random() * 100 + '%';
        p.style.background = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDuration = (Math.random() * 20 + 15) + 's';
        p.style.animationDelay = (Math.random() * 10) + 's';
        container.appendChild(p);
    }
}

// ---- Navbar ----
function initNavbar() {
    const navbar = document.querySelector('.navbar');
    const toggle = document.getElementById('menuToggle');
    const links = document.querySelector('.nav-links');

    window.addEventListener('scroll', () => {
        navbar.classList.toggle('scrolled', window.scrollY > 50);
    });

    toggle.addEventListener('click', () => {
        links.classList.toggle('active');
    });

    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            links.classList.remove('active');
            document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

// ---- Animated Stats ----
function initStats() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const nums = entry.target.querySelectorAll('.stat-number[data-target]');
                nums.forEach(num => animateNumber(num));
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    const statsContainer = document.querySelector('.hero-stats');
    if (statsContainer) observer.observe(statsContainer);
}

function animateNumber(el) {
    const target = parseInt(el.dataset.target);
    const duration = 2000;
    const start = performance.now();

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.floor(target * eased).toLocaleString('ar-EG');
        if (progress < 1) requestAnimationFrame(update);
        else el.textContent = target.toLocaleString('ar-EG') + '+';
    }
    requestAnimationFrame(update);
}

// ---- Render Trends ----
function renderTrends(filter = 'all', data = null) {
    const grid = document.getElementById('trendsGrid');
    grid.innerHTML = '';

    const source = data || (liveTrends.length > 0 ? liveTrends : trendsData);
    const filtered = filter === 'all'
        ? source
        : source.filter(t => t.category === filter);

    filtered.forEach((trend, i) => {
        const card = document.createElement('div');
        card.className = 'trend-card';
        card.style.animationDelay = (i * 0.1) + 's';

        const catLabel = trend.category_label || trend.categoryLabel || trend.category;
        const growthUp = trend.growth_up !== undefined ? trend.growth_up : trend.growthUp;

        card.innerHTML = `
            <div class="trend-card-header">
                <div class="trend-rank">${trend.rank}</div>
                <span class="trend-category">${catLabel}</span>
            </div>
            <div class="trend-card-body">
                <h3>${trend.title}</h3>
                <p>${trend.description}</p>
            </div>
            <div class="trend-card-footer">
                <div class="trend-stats">
                    <span>&#128065; ${trend.views}</span>
                    <span>&#10084;&#65039; ${trend.likes}</span>
                    <span>&#128257; ${trend.shares}</span>
                </div>
                <span class="trend-growth ${growthUp ? '' : 'down'}">${trend.growth}</span>
            </div>
        `;
        card.addEventListener('click', () => {
            document.getElementById('analyzerInput').value = trend.hashtag;
            document.getElementById('analyzer').scrollIntoView({ behavior: 'smooth' });
            setTimeout(() => document.getElementById('analyzeBtn').click(), 500);
        });
        grid.appendChild(card);
    });
}

// ---- Filters ----
function initFilters() {
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', async () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const filter = tab.dataset.filter;

            if (backendAvailable && liveTrends.length > 0) {
                const filtered = filter === 'all'
                    ? liveTrends
                    : liveTrends.filter(t => t.category === filter);
                renderTrends('all', filtered);
            } else {
                renderTrends(filter, trendsData);
            }
        });
    });
}

// ---- Render Articles ----
function renderArticles(articles) {
    const grid = document.getElementById('articlesGrid');
    grid.innerHTML = '';

    const gradients = [
        'linear-gradient(135deg, #1a1a2e, #e94560)',
        'linear-gradient(135deg, #0f3460, #e94560)',
        'linear-gradient(135deg, #533483, #e94560)',
    ];

    articles.forEach((article, i) => {
        const card = document.createElement('div');
        card.className = 'article-card';
        card.style.animationDelay = (i * 0.1) + 's';

        const readTime = article.read_time || article.readTime || '5 دقائق';
        const date = article.created_at ? timeAgo(article.created_at) : (article.date || 'حديث');
        const emoji = article.emoji || '📝';
        const bg = article.bgGradient || gradients[i % gradients.length];
        const category = article.category || 'تحليل';

        card.innerHTML = `
            <div class="article-image">
                <div class="article-image-bg" style="background:${bg}">${emoji}</div>
                <span class="article-badge">${category}</span>
            </div>
            <div class="article-body">
                <h3>${article.title}</h3>
                <p>${article.excerpt}</p>
                <div class="article-meta">
                    <span class="article-read-time">&#128214; ${readTime}</span>
                    <span>${date}</span>
                </div>
            </div>
        `;
        card.addEventListener('click', () => openArticle(article));
        grid.appendChild(card);
    });
}

// ---- Article Modal ----
function initModal() {
    const overlay = document.getElementById('articleModal');
    const closeBtn = document.getElementById('closeModal');

    closeBtn.addEventListener('click', () => overlay.classList.remove('active'));
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') overlay.classList.remove('active');
    });
}

function openArticle(article) {
    const body = document.getElementById('modalBody');

    // مقال من الـ Backend (HTML مباشر)
    if (typeof article.content === 'string') {
        const readTime = article.read_time || article.readTime || '5 دقائق';
        const date = article.created_at ? timeAgo(article.created_at) : 'حديث';
        body.innerHTML = `
            <h2 class="article-full-title">${article.title}</h2>
            <div class="article-full-meta">
                <span>&#128214; ${readTime}</span>
                <span>&#128197; ${date}</span>
                <span>&#127991;&#65039; ${article.category || 'تحليل'}</span>
            </div>
            <div class="article-full-content">${article.content}</div>
        `;
    }
    // مقال محلي (بيانات مهيكلة)
    else if (article.content && article.content.sections) {
        let html = `
            <h2 class="article-full-title">${article.content.title}</h2>
            <div class="article-full-meta">
                <span>&#128214; ${article.readTime}</span>
                <span>&#128197; ${article.date}</span>
                <span>&#127991;&#65039; ${article.category}</span>
            </div>
            <div class="article-full-content">
        `;
        article.content.sections.forEach(section => {
            html += `<h3>${section.heading}</h3><p>${section.text}</p>`;
            if (section.fact) {
                html += `<div class="fact-box">&#128161; حقيقة: ${section.fact}</div>`;
            }
        });
        html += '</div>';
        body.innerHTML = html;
    }

    document.getElementById('articleModal').classList.add('active');
}

// ---- Analyzer ----
function initAnalyzer() {
    const input = document.getElementById('analyzerInput');
    const btn = document.getElementById('analyzeBtn');
    const btnText = btn.querySelector('span');
    const btnLoader = btn.querySelector('.btn-loader');

    btn.addEventListener('click', async () => {
        const topic = input.value.trim();
        if (!topic) {
            input.style.borderColor = '#fe2c55';
            setTimeout(() => input.style.borderColor = '', 1500);
            return;
        }
        btnText.style.display = 'none';
        btnLoader.style.display = 'block';
        btn.disabled = true;

        // دائماً نحاول الـ Backend أولاً
        const success = await analyzeViaBackend(topic);
        if (!success) {
            generateLocalAnalysis(topic);
        }

        btnText.style.display = '';
        btnLoader.style.display = 'none';
        btn.disabled = false;
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') btn.click();
    });

    document.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            input.value = chip.dataset.topic;
            document.getElementById('analyzeBtn').click();
        });
    });
}

async function analyzeViaBackend(topic) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 120000); // دقيقتين

        const res = await fetch(`${API_BASE}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        const json = await res.json();

        if (json.success) {
            const d = json.data;
            const result = document.getElementById('analysisResult');
            result.style.display = 'block';

            document.getElementById('resultTitle').textContent = 'تحليل: ' + d.topic;
            document.getElementById('resultViews').innerHTML = '&#128065; ' + d.views + ' مشاهدة';
            document.getElementById('resultTrend').textContent = d.growth + ' نمو';

            drawChart(topic, d.chart_data);
            renderInsights(d.insights);
            document.getElementById('generatedArticle').innerHTML = d.article;

            result.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return true;
        }
    } catch (e) {
        console.log('خطأ في التحليل عبر Backend:', e);
    }
    return false;
}

function renderInsights(insights) {
    const container = document.getElementById('insightsList');
    container.innerHTML = '';

    insights.forEach(insight => {
        const card = document.createElement('div');
        card.className = 'insight-card';
        card.innerHTML = `
            <div class="insight-icon">${insight.icon}</div>
            <div>
                <h5>${insight.title}</h5>
                <p>${insight.text}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

function generateLocalAnalysis(topic) {
    const result = document.getElementById('analysisResult');
    result.style.display = 'block';

    const views = (Math.random() * 50 + 5).toFixed(1) + 'M';
    const growth = '+' + Math.floor(Math.random() * 500 + 50) + '%';

    document.getElementById('resultTitle').textContent = 'تحليل: ' + topic;
    document.getElementById('resultViews').innerHTML = '&#128065; ' + views + ' مشاهدة';
    document.getElementById('resultTrend').textContent = growth + ' نمو';

    drawChart(topic);
    generateLocalInsights(topic);
    generateLocalArticle(topic);

    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Chart Drawing ----
function drawChart(topic, apiData = null) {
    const canvas = document.getElementById('trendChart');
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = 500;
    ctx.scale(2, 2);

    const w = canvas.offsetWidth;
    const h = 250;
    const padding = 40;
    const chartW = w - padding * 2;
    const chartH = h - padding * 2;

    ctx.clearRect(0, 0, w, h);

    const days = 14;
    let data;
    if (apiData && apiData.length === days) {
        data = apiData;
    } else {
        data = [];
        let val = Math.random() * 20 + 10;
        for (let i = 0; i < days; i++) {
            val += (Math.random() - 0.3) * 15;
            val = Math.max(5, val);
            data.push(val);
        }
        data[days - 1] = Math.max(...data) * 1.2;
        data[days - 2] = Math.max(...data) * 0.9;
    }

    const maxVal = Math.max(...data) * 1.1;

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = padding + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(w - padding, y);
        ctx.stroke();
    }

    const gradient = ctx.createLinearGradient(0, padding, 0, h - padding);
    gradient.addColorStop(0, 'rgba(254, 44, 85, 0.3)');
    gradient.addColorStop(1, 'rgba(254, 44, 85, 0)');

    ctx.beginPath();
    ctx.moveTo(padding, h - padding);
    data.forEach((val, i) => {
        const x = padding + (chartW / (days - 1)) * i;
        const y = h - padding - (val / maxVal) * chartH;
        if (i === 0) ctx.lineTo(x, y);
        else {
            const prevX = padding + (chartW / (days - 1)) * (i - 1);
            const prevY = h - padding - (data[i - 1] / maxVal) * chartH;
            const cpX = (prevX + x) / 2;
            ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
        }
    });
    ctx.lineTo(w - padding, h - padding);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    data.forEach((val, i) => {
        const x = padding + (chartW / (days - 1)) * i;
        const y = h - padding - (val / maxVal) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else {
            const prevX = padding + (chartW / (days - 1)) * (i - 1);
            const prevY = h - padding - (data[i - 1] / maxVal) * chartH;
            const cpX = (prevX + x) / 2;
            ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
        }
    });
    ctx.strokeStyle = '#fe2c55';
    ctx.lineWidth = 3;
    ctx.stroke();

    data.forEach((val, i) => {
        const x = padding + (chartW / (days - 1)) * i;
        const y = h - padding - (val / maxVal) * chartH;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fe2c55';
        ctx.fill();
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 2;
        ctx.stroke();
    });

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px Cairo';
    ctx.textAlign = 'center';
    const dayLabels = ['قبل 14 يوم', '', '', '', '', '', 'قبل أسبوع', '', '', '', '', '', '', 'اليوم'];
    dayLabels.forEach((label, i) => {
        if (label) {
            const x = padding + (chartW / (days - 1)) * i;
            ctx.fillText(label, x, h - 10);
        }
    });
}

// ---- Local Fallbacks ----
function generateLocalInsights(topic) {
    const container = document.getElementById('insightsList');
    container.innerHTML = '';

    const templates = analysisTemplates.insights;
    const region = analysisTemplates.regions[Math.floor(Math.random() * analysisTemplates.regions.length)];
    const principle = analysisTemplates.principles[Math.floor(Math.random() * analysisTemplates.principles.length)];
    const warning = analysisTemplates.warnings[Math.floor(Math.random() * analysisTemplates.warnings.length)];
    const growth = Math.floor(Math.random() * 30 + 5);
    const amount = (Math.random() * 10 + 1).toFixed(1);

    templates.forEach(template => {
        const card = document.createElement('div');
        card.className = 'insight-card';
        const text = template.text
            .replace('{growth}', growth)
            .replace('{region}', region)
            .replace('{principle}', principle)
            .replace('{amount}', amount)
            .replace('{warning}', warning);

        card.innerHTML = `
            <div class="insight-icon">${template.icon}</div>
            <div>
                <h5>${template.title}</h5>
                <p>${text}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

function generateLocalArticle(topic) {
    const container = document.getElementById('generatedArticle');
    const template = analysisTemplates.articleTemplates[0];
    let html = `<p>${template.intro.replace('{topic}', topic)}</p>`;
    template.body.forEach(section => { html += section; });
    container.innerHTML = html;
}

// ---- Helpers ----
function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000);

    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} ساعة`;
    if (diff < 604800) return `منذ ${Math.floor(diff / 86400)} يوم`;
    return `منذ ${Math.floor(diff / 604800)} أسبوع`;
}

function duplicateTicker() {
    const ticker = document.getElementById('tickerContent');
    ticker.innerHTML += ticker.innerHTML;
}
