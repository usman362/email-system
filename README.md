# 📧 SDTech Email Command Center v3.0

## Setup (3 Steps)

### 1. Node.js Install
https://nodejs.org (LTS)

### 2. Dependencies
```
npm install
```

### 3. Start
```
node server.js
```
Open: **http://localhost:3000**

---

## Gmail App Password

1. https://myaccount.google.com/security
2. Enable **2-Step Verification**
3. https://myaccount.google.com/apppasswords
4. Create for "Mail" → get 16-char password

---

## Email Tracking (Open/Read Analytics)

For tracking to work, server must be public:
- **Ngrok (free):** `ngrok http 3000` → paste URL in `config.js` BASE_URL
- **VPS:** set your domain in `config.js`

---

## Follow-up Automation

- ✅ 5 follow-ups per lead, sent every **5 days** automatically
- ✅ Scheduler runs every 30 minutes in background
- ✅ Respects 40/day limit
- ✅ Follow-up templates editable from UI
- ✅ Per-campaign follow-up tracking

**Timeline per lead:**
- Day 0: Initial email
- Day 5: Follow-up 1
- Day 10: Follow-up 2
- Day 15: Follow-up 3
- Day 20: Follow-up 4
- Day 25: Follow-up 5 (final)

---

## Excel Format
| Col 1 Name | Col 2 Email | Col 3 Wikipedia |
|---|---|---|
| John Rossi | j@uni.edu | no |
| Sarah Chen | s@uni.edu | yes |

---

## Config (config.js)
```js
BASE_URL: 'http://localhost:3000'  // Change for tracking
FOLLOWUP_INTERVAL_DAYS: 5          // Days between follow-ups
DAILY_LIMIT: 40                    // Emails per day per account
EMAIL_DELAY_SECONDS: 45            // Delay between emails
```
