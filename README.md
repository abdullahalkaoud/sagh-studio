# صاغ — موقع الاستوديو

موقع بصفحة واحدة بلغتين: العربية على `/` والإنجليزية على `/en/`. مبني بـ HTML وCSS وJS بلا مكتبات.

| الملف | المحتوى |
| --- | --- |
| `content/ar.json`، `content/en.json` | كل نصوص الموقع. تُعدَّل من لوحة التحكم |
| `src/index.html` | قالب الصفحة؛ كل `{{...}}` يُملأ من ملفات المحتوى |
| `styles.css` | التصميم والألوان (المتغيرات في أعلى الملف) |
| `main.js` | الشاشة الافتتاحية، المكعب، الحركة، ونموذج واتساب (رقم واتساب في أعلاه) |
| `admin/` | لوحة التحكم Decap CMS على `/admin` |
| `build.js` | يولّد الموقع في `dist/` |
| `worker.js`، `wrangler.jsonc` | Cloudflare Worker: يعرض الموقع ويتولى تسجيل الدخول للوحة التحكم |

## تعديل النصوص

ادخل على `https://sagh.co/admin` وسجّل الدخول بحساب GitHub. عدّل ثم اضغط **Publish**، ويتحدّث الموقع خلال دقيقة تقريباً.

## التشغيل محلياً

```bash
node build.js
```

```bash
python3 -m http.server 4173 -d dist
```

ثم افتح http://localhost:4173 (والإنجليزية على /en/).

## النشر

Cloudflare Workers Builds يبني الموقع تلقائياً من فرع `main`: الأمر `node build.js` ثم `npx wrangler deploy`، وينشره على https://sagh.co.

يحتاج الـ Worker سرّين في إعداداته: `GITHUB_CLIENT_ID` و`GITHUB_CLIENT_SECRET` (من تطبيق «Sagh CMS» على GitHub، وعنوان الرجوع فيه `https://sagh.co/api/callback`).
