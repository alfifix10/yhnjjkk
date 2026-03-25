"""
جلب أسخن الفضائح والأسرار المنتشرة على تيك توك والإنترنت
"""

import httpx
import re
from config import settings


def fmt(num: int) -> str:
    if num >= 1_000_000_000: return f"{num/1e9:.1f}B"
    if num >= 1_000_000: return f"{num/1e6:.1f}M"
    if num >= 1_000: return f"{num/1e3:.1f}K"
    return str(num)


# ===========================================================
# جمع البيانات الحقيقية عن الفضائح من مصادر متعددة
# ===========================================================
async def _gather_real_scandals() -> str:
    """كشط فضائح وأسرار حقيقية من الإنترنت"""
    context_parts = []

    async with httpx.AsyncClient(timeout=15, headers={"User-Agent": "Mozilla/5.0"}) as client:

        # 1. Google Trends - ما يبحث عنه الناس (عربي)
        for geo, name in [("SA", "السعودية"), ("EG", "مصر"), ("AE", "الإمارات")]:
            try:
                resp = await client.get(f"https://trends.google.com/trending/rss?geo={geo}")
                if resp.status_code == 200:
                    titles = re.findall(r'<title>(.*?)</title>', resp.text)
                    if len(titles) > 1:
                        context_parts.append(f"الأكثر بحثاً في {name}:")
                        context_parts.extend(f"• {t.strip()}" for t in titles[1:10] if t.strip())
            except Exception:
                pass

        # 2. أخبار الفضائح من Google News
        searches = [
            ("فضيحة+مشهور+تيك+توك", "ar", "SA:ar"),
            ("فضيحة+فنان+تسريب", "ar", "SA:ar"),
            ("tiktok+scandal+exposed+celebrity", "en", "US:en"),
            ("tiktok+drama+influencer+fired", "en", "US:en"),
            ("فضيحة+يوتيوبر+جدل", "ar", "EG:ar"),
        ]
        for q, lang, ceid in searches:
            try:
                resp = await client.get(
                    f"https://news.google.com/rss/search?q={q}&hl={lang}&ceid={ceid}"
                )
                if resp.status_code == 200:
                    titles = re.findall(r'<title><!\[CDATA\[(.*?)\]\]></title>', resp.text)
                    if not titles:
                        titles = re.findall(r'<title>(.*?)</title>', resp.text)
                    for t in titles[1:5]:
                        t = t.strip()
                        if t and len(t) > 10:
                            context_parts.append(f"• خبر: {t}")
            except Exception:
                pass

        # 3. TikTok Creative Center
        try:
            resp = await client.get(
                "https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list",
                params={"page": 1, "limit": 20, "period": 7, "country_code": "", "sort_by": "popular"},
                headers={"Referer": "https://ads.tiktok.com/business/creativecenter/"},
            )
            if resp.status_code == 200:
                items = resp.json().get("data", {}).get("list", [])
                if items:
                    context_parts.append("هاشتاقات تيك توك الرائجة:")
                    context_parts.extend(f"• #{i['hashtag_name']}" for i in items[:15])
        except Exception:
            pass

    context = "\n".join(context_parts)
    if context:
        print(f"✅ تم جمع {len(context_parts)} معلومة حقيقية من الإنترنت")
    return context


# ===========================================================
# التوليد الرئيسي
# ===========================================================
async def fetch_trending_hashtags() -> list[dict]:
    real_data = await _gather_real_scandals()

    import anthropic
    client = anthropic.Anthropic(api_key=settings.CLAUDE_API_KEY)

    context_block = ""
    if real_data:
        context_block = f"""هذه بيانات حقيقية من الإنترنت الآن:

{real_data}

بناءً على هذه البيانات الحقيقية، """

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=3000,
        messages=[{"role": "user", "content": f"""{context_block}أنت صحفي فضائح محترف. أعطني 10 من أسخن الفضائح والأسرار المنتشرة الآن على تيك توك والسوشال ميديا.

أريد فقط:
🔥 فضائح مشاهير وتيكتوكرز (تسريبات، خيانات، كذب، نصب)
🔥 أسرار مكشوفة (شخص انفضح، كذبة انكشفت)
🔥 جدل كبير يتكلم عنه الناس (خلافات، مشاكل، هجوم)
🔥 تحديات خطيرة انتشرت وأضرت بناس
🔥 قصص صادمة ومثيرة حقيقية

مهم جداً:
- أحداث حقيقية يتحدث عنها الناس فعلاً
- عناوين نارية تجعل أي شخص ينقر فوراً
- اذكر أسماء حقيقية وتفاصيل
- امزج بين فضائح عربية وعالمية

الصيغة:
HASHTAG: #الهاشتاق
TITLE: عنوان ناري وصادم (جملة واحدة)
VIEWS: عدد المشاهدات
HEAT: 🔥🔥🔥🔥🔥 (من 1 لـ 5 نار حسب سخونة الموضوع)
---"""}],
    )

    return _parse(message.content[0].text)


def _parse(text: str) -> list[dict]:
    trends = []
    current = {}
    rank = 1

    for line in text.split("\n"):
        line = line.strip()
        if line.startswith("HASHTAG:"):
            current["hashtag"] = line.replace("HASHTAG:", "").strip()
        elif line.startswith("TITLE:"):
            current["title"] = line.replace("TITLE:", "").strip()
        elif line.startswith("VIEWS:"):
            try:
                current["views"] = int(line.replace("VIEWS:", "").strip())
            except ValueError:
                current["views"] = 15_000_000
        elif line.startswith("HEAT:"):
            current["heat"] = line.replace("HEAT:", "").strip()
        elif line == "---" and current.get("hashtag"):
            v = current.get("views", 15_000_000)
            heat = current.get("heat", "🔥🔥🔥")
            trends.append({
                "rank": rank,
                "title": current.get("title", current["hashtag"]),
                "hashtag": current["hashtag"] if current["hashtag"].startswith("#") else f"#{current['hashtag']}",
                "description": current.get("title", ""),
                "category": "scandals",
                "category_label": heat,
                "views": fmt(v),
                "likes": fmt(int(v * 0.3)),
                "shares": fmt(int(v * 0.12)),
                "comments": fmt(int(v * 0.08)),
                "growth": f"+{300 - rank * 15}%",
                "growth_up": True,
            })
            rank += 1
            current = {}

    if current.get("hashtag"):
        v = current.get("views", 15_000_000)
        heat = current.get("heat", "🔥🔥🔥")
        trends.append({
            "rank": rank,
            "title": current.get("title", current["hashtag"]),
            "hashtag": current["hashtag"] if current["hashtag"].startswith("#") else f"#{current['hashtag']}",
            "description": current.get("title", ""),
            "category": "scandals",
            "category_label": heat,
            "views": fmt(v),
            "likes": fmt(int(v * 0.3)),
            "shares": fmt(int(v * 0.12)),
            "comments": fmt(int(v * 0.08)),
            "growth": f"+{300 - rank * 15}%",
            "growth_up": True,
        })

    return trends


async def search_hashtag(keyword: str) -> dict:
    clean = keyword.strip().lstrip("#")
    return {
        "hashtag": clean, "view_count": 0, "video_count": 0,
        "views_formatted": "N/A", "videos_formatted": "N/A",
        "top_videos": [], "top_comments": [],
        "category": ("scandals", "فضائح"),
    }
