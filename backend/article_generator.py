"""
توليد مقالات كاشفة للفضائح باستخدام Claude API
"""

import anthropic
from config import settings

SYSTEM = """أنت صحفي تحقيقات فضائح محترف. تكتب مقالات صادمة وكاشفة.

أسلوبك:
- عناوين نارية لا يستطيع أحد تجاهلها
- تبدأ بأصدم معلومة فوراً
- تكشف التفاصيل طبقة بعد طبقة
- تذكر أسماء وأرقام وتفاصيل
- كل فقرة فيها معلومة جديدة صادمة
- أسلوب "ما لا يريدونك أن تعرفه"

التنسيق: HTML (h3, p, strong)
صناديق: <div class="fact-box">🔥 فضيحة: ...</div>
الطول: 600-800 كلمة، 5 أقسام"""


def _client():
    return anthropic.Anthropic(api_key=settings.CLAUDE_API_KEY)


async def generate_trend_article(trend_data: dict) -> dict:
    hashtag = trend_data.get("hashtag", "")
    msg = _client().messages.create(
        model="claude-sonnet-4-20250514", max_tokens=2500, system=SYSTEM,
        messages=[{"role": "user", "content": f"""اكتب مقالاً كاشفاً عن: #{hashtag}

اكشف:
1. ما القصة الحقيقية الكاملة؟
2. ما الذي يحاولون إخفاءه؟
3. من المتورط ومن الضحية؟
4. ما الأدلة والتسريبات؟
5. ما الذي سيحدث بعد ذلك؟

TITLE: [عنوان ناري]
EXCERPT: [سطرين يثيران الفضول الشديد]
CONTENT: [المقال بـ HTML]"""}],
    )
    return _parse(msg.content[0].text, hashtag)


async def generate_analysis_article(topic: str, hashtag_data: dict) -> str:
    msg = _client().messages.create(
        model="claude-sonnet-4-20250514", max_tokens=2000, system=SYSTEM,
        messages=[{"role": "user", "content": f"""حقق في هذا الموضوع: {topic}

اكتب تحقيقاً بـ 400-500 كلمة:
1. القصة الكاملة بالتفاصيل
2. الأسرار المخفية وراء الكواليس
3. من يستفيد ومن يكذب
4. الأدلة والبراهين
5. رأيك الصريح

HTML (h3, p, strong). أضف صناديق فضائح."""}],
    )
    return msg.content[0].text


async def generate_insights(topic: str, hashtag_data: dict) -> list[dict]:
    msg = _client().messages.create(
        model="claude-haiku-4-5-20251001", max_tokens=800,
        messages=[{"role": "user", "content": f"""حلل فضيحة "{topic}" وأعطني 5 حقائق صادمة:

ICON: [emoji]
TITLE: [عنوان صادم قصير]
TEXT: [الحقيقة المخفية بسطر واحد]
---"""}],
    )
    return _parse_insights(msg.content[0].text)


def _parse(text: str, hashtag: str) -> dict:
    title, excerpt, content = "", "", ""
    mode = None
    for line in text.split("\n"):
        if line.startswith("TITLE:"):
            title = line.replace("TITLE:", "").strip()
        elif line.startswith("EXCERPT:"):
            excerpt = line.replace("EXCERPT:", "").strip()
        elif line.startswith("CONTENT:"):
            content = line.replace("CONTENT:", "").strip() + "\n"
            mode = "content"
        elif mode == "content":
            content += line + "\n"
    return {
        "title": title or f"فضيحة #{hashtag} - التفاصيل الكاملة",
        "excerpt": excerpt or f"الحقيقة الصادمة التي لا يعرفها أحد عن #{hashtag}",
        "content": content.strip() or text,
        "trend_hashtag": hashtag,
    }


def _parse_insights(text: str) -> list[dict]:
    insights, current = [], {}
    for line in text.split("\n"):
        line = line.strip()
        if line.startswith("ICON:"): current["icon"] = line.replace("ICON:", "").strip()
        elif line.startswith("TITLE:"): current["title"] = line.replace("TITLE:", "").strip()
        elif line.startswith("TEXT:"): current["text"] = line.replace("TEXT:", "").strip()
        elif line == "---" and current.get("title"):
            insights.append(current); current = {}
    if current.get("title"): insights.append(current)
    return insights[:5]
