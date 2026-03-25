# TrendScope - دليل التشغيل السريع

## الخطوة 1: احصل على المفاتيح (5 دقائق)

### مفتاح RapidAPI (لجلب بيانات تيك توك)
1. افتح https://rapidapi.com وسجّل مجاناً
2. اذهب إلى https://rapidapi.com/tikapi-tikapi-default/api/tiktok-api23
3. اضغط "Subscribe" واختر الخطة المجانية
4. انسخ مفتاح `X-RapidAPI-Key` من الصفحة

### مفتاح Claude API (لتوليد المقالات)
1. افتح https://console.anthropic.com
2. اذهب إلى Settings > API Keys
3. أنشئ مفتاح جديد وانسخه

### مفتاح Supabase (لقاعدة البيانات)
1. افتح https://supabase.com وسجّل مجاناً
2. أنشئ مشروع جديد
3. اذهب إلى Settings > API
4. انسخ `Project URL` و `anon public key`
5. اذهب إلى SQL Editor وانسخ والصق محتوى الجداول من `backend/database.py`

---

## الخطوة 2: انشر على Render (3 دقائق)

1. افتح https://render.com وسجّل بحساب GitHub
2. اضغط "New" > "Web Service"
3. اربط مستودع `yhnjjkk`
4. الإعدادات:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. اضغط "Environment" وأضف المفاتيح:
   - `RAPIDAPI_KEY` = مفتاحك
   - `CLAUDE_API_KEY` = مفتاحك
   - `SUPABASE_URL` = رابط مشروعك
   - `SUPABASE_KEY` = مفتاح anon
6. اضغط "Create Web Service"
7. انتظر حتى يظهر "Live" ثم انسخ الرابط

---

## الخطوة 3: اربط الواجهة بالخادم

1. افتح ملف `js/app.js`
2. في السطر الأول، ضع رابط Render:
   ```js
   const RENDER_URL = 'https://trendscope-api.onrender.com';
   ```
3. ارفع التغيير على GitHub
4. الموقع جاهز على: https://alfifix10.github.io/yhnjjkk/

---

## الأوامر المفيدة

```bash
# تشغيل محلي
cd backend
cp .env.example .env   # ثم املأ المفاتيح
pip install -r requirements.txt
python main.py

# فحص حالة الخادم
curl http://localhost:8000/api/health

# تحديث الترندات يدوياً
curl http://localhost:8000/api/trends/refresh
```
