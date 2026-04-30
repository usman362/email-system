'use strict';
const express    = require('express');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const XLSX       = require('xlsx');
const fs         = require('fs');
const path       = require('path');
const { v4: uuid } = require('uuid');
const { exec }   = require('child_process');
const cfg        = require('./config');
const { checkReplies } = require('./reply-checker');

/** Gmail — explicit port (default 587 STARTTLS). Hosts often block 465. */
function createMailTransport(email, password) {
  const port = cfg.SMTP_PORT;
  const secure = port === 465;
  return nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port,
    secure,
    requireTLS: port === 587,
    auth: { user: email, pass: password },
  });
}

const app    = express();
const upload = multer({ dest: path.join(__dirname, 'uploads') });
const sigUpload = multer({
  dest: path.join(__dirname, 'signatures'),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files allowed'));
    cb(null, true);
  }
});
const DB         = path.join(__dirname, 'data.json');
const SIG_DIR    = path.join(__dirname, 'signatures');

if (!fs.existsSync(SIG_DIR)) fs.mkdirSync(SIG_DIR);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════
//  FOLLOW-UP TEMPLATES (built-in, stored in DB on first run)
// ═══════════════════════════════════════════════════════════
const DEFAULT_FOLLOWUPS = [
  {
    step: 1,
    subject: 'Re: Elevate Your Legacy Wikipedia Collaboration Opportunity',
    body: `Dear Professor {{name}},

I wanted to follow up regarding our services for both Wikipedia page creation and editing. We're currently offering 20% off our original fee for new clients. Whether you're looking to establish a new Wikipedia profile or enhance an existing one, SD Technologist Ltd ensures your content meets Wikipedia's high standards.

If you have any questions or would like further details, please don't hesitate to reach out.

--
Warm Regards,`
  },
  {
    step: 2,
    subject: 'Re: Elevate Your Legacy Wikipedia Collaboration Opportunity',
    body: `Hi Professor {{name}},

I'm following up to see if you're still considering our Wikipedia page creation or editing services. Our team at SD Technologist Ltd is dedicated to delivering high-quality, well-researched content that aligns with Wikipedia's guidelines for neutrality and verifiability.

If you need more information or have any specific questions, I'd be happy to assist.

--
Warm Regards,`
  },
  {
    step: 3,
    subject: 'Re: Elevate Your Legacy Wikipedia Collaboration Opportunity',
    body: `Hi Professor {{name}},

Just following up on our Wikipedia services. Whether you're looking to create a new page or refine your existing one, SD Technologist Ltd is here to ensure your content is credible, polished, and fully aligned with Wikipedia's strict guidelines.

We offer a Money-Back Guarantee, Safe Payments, and full GDPR compliance for your peace of mind. We are keen to ensure that your achievements and contributions are showcased in a manner that benefits both your legacy and the broader academic community.

If you have any questions or would like to explore how we can support your Wikipedia presence, feel free to reach out.

--
Warm Regards,`
  },
  {
    step: 4,
    subject: 'Re: Elevate Your Legacy Wikipedia Collaboration Opportunity',
    body: `Hi Professor {{name}},

I wanted to reach out one final time regarding your Wikipedia page. Whether it's creating a new profile or improving an existing one, SD Technologist Ltd ensures that your content reflects your professional contributions accurately and credibly. We are keen to ensure that your achievements are presented in a manner that benefits both your legacy and the broader academic community.

If you're interested in proceeding or have any final questions, I'm happy to assist.

--
Warm Regards,`
  },
  {
    step: 5,
    subject: 'Re: Elevate Your Legacy Wikipedia Collaboration Opportunity',
    body: `Hi Professor {{name}},

This will be my final follow-up regarding our Wikipedia creation and editing services. Whether you need a new page created or enhancements made to an existing one, SD Technologist Ltd guarantees professional service that fully meets Wikipedia's guidelines.

If you have any final questions or would like to move forward, I'm happy to assist.

--
Warm Regards,`
  }
];

// ═══════════════════════════════════════════════════════════
//  DATABASE
// ═══════════════════════════════════════════════════════════
function getDB() {
  if (!fs.existsSync(DB)) {
    const init = {
      users: [],
      templates: [
        {
          id: 'tpl_nowiki',
          name: 'No Wikipedia',
          subject: 'Elevate Your Legacy Wikipedia Collaboration Opportunity',
          body: `Hello Professor {{name}},

I hope this message finds you well. After reviewing your accomplishments, I believe you are a notable candidate for a Wikipedia page. This is a great opportunity to showcase your contributions globally, strengthen your online presence, and secure your legacy with credibility.

At SDTechnologist, we specialize in helping professionals and businesses establish a lasting presence on Wikipedia. With over a decade of experience, we ensure your page meets Wikipedia's stringent guidelines and stands strong against scrutiny.

We offer a Money-Back Guarantee, Safe Payments, and full GDPR compliance, ensuring peace of mind throughout the process. You can learn more about our services and process, or schedule a free consultation, on our website.

If you're interested, I'd be happy to guide you through the process or answer any questions. I'm eager to help showcase your achievements to a global audience.
Looking forward to the possibility of working together!

--
Warm Regards,`,
          updatedAt: new Date().toISOString()
        },
        {
          id: 'tpl_wiki',
          name: 'Has Wikipedia',
          subject: 'Elevate Your Legacy Wikipedia Collaboration Opportunity',
          body: `Hello Professor {{name}},

I hope this message finds you well. I noticed you already have a Wikipedia page — congratulations on that achievement! A Wikipedia presence is a powerful asset, but maintaining accuracy, completeness, and quality over time is equally important.

At SDTechnologist, we specialize in improving and maintaining Wikipedia pages for distinguished professionals like yourself. Whether it's updating your recent accomplishments, strengthening citations, or ensuring your page withstands Wikipedia's evolving guidelines, our team handles it all.

We offer a Money-Back Guarantee, Safe Payments, and full GDPR compliance — so you can trust us completely with your online legacy.

If you're interested in elevating your Wikipedia presence even further, I'd love to schedule a quick consultation to discuss what's possible.
Looking forward to the possibility of working together!

--
Warm Regards,`,
          updatedAt: new Date().toISOString()
        }
      ],
      followupTemplates: DEFAULT_FOLLOWUPS,
      campaigns: []
    };
    fs.writeFileSync(DB, JSON.stringify(init, null, 2));
    return init;
  }
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  // migrate: add followupTemplates if missing
  if (!d.followupTemplates) { d.followupTemplates = DEFAULT_FOLLOWUPS; saveDB(d); }
  return d;
}
function saveDB(d) { fs.writeFileSync(DB, JSON.stringify(d, null, 2)); }

// ═══════════════════════════════════════════════════════════
//  AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════
function auth(req, res, next) {
  const t = req.headers['x-auth-token'];
  if (!t) return res.status(401).json({ error: 'Not authenticated' });
  const db = getDB();
  const u  = db.users.find(u => u.token === t);
  if (!u)  return res.status(401).json({ error: 'Invalid session' });
  req.user = u;
  next();
}

// ═══════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════
app.post('/api/register', async (req, res) => {
  let { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  // Gmail app passwords shown as "xxxx xxxx xxxx xxxx" — strip ALL whitespace
  email    = String(email).trim().toLowerCase();
  password = String(password).replace(/\s+/g, '');
  name     = String(name).trim();
  if (password.length !== 16) {
    return res.status(400).json({ error: `App password must be 16 chars (got ${password.length}). Paste from myaccount.google.com/apppasswords.` });
  }
  const db = getDB();
  if (db.users.find(u => u.email === email))
    return res.status(400).json({ error: 'Account already exists' });
  try {
    const t = createMailTransport(email, password);
    await t.verify();
    try { t.close(); } catch(_) {}
  } catch(e) {
    return res.status(400).json({ error: 'Gmail connection failed: ' + e.message });
  }
  db.users.push({ id:uuid(), name, email, password, token:null, dailySent:0, lastReset:'', createdAt:new Date().toISOString() });
  saveDB(db);
  res.json({ success:true });
});

app.post('/api/login', (req, res) => {
  let { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  email    = String(email).trim().toLowerCase();
  password = String(password).replace(/\s+/g, '');
  const db  = getDB();
  const idx = db.users.findIndex(u => u.email === email);
  if (idx === -1) return res.status(401).json({ error: 'Account not found. Register first.' });
  if (db.users[idx].password !== password) return res.status(401).json({ error: 'Wrong password' });
  const token = uuid();
  db.users[idx].token = token;
  saveDB(db);
  res.json({ token, user:{ id:db.users[idx].id, name:db.users[idx].name, email:db.users[idx].email } });
});

app.post('/api/logout', auth, (req, res) => {
  const db = getDB();
  const i  = db.users.findIndex(u => u.id === req.user.id);
  if (i !== -1) { db.users[i].token = null; saveDB(db); }
  res.json({ success:true });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ id:req.user.id, name:req.user.name, email:req.user.email });
});

// ═══════════════════════════════════════════════════════════
//  SIGNATURE  (per-user, stored as image file + base64 in DB)
// ═══════════════════════════════════════════════════════════
app.get('/api/signature', auth, (req, res) => {
  const db   = getDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user || !user.signatureBase64) return res.json({ hasSignature: false });
  res.json({
    hasSignature: true,
    mimeType: user.signatureMime || 'image/png',
    base64: user.signatureBase64
  });
});

app.post('/api/signature', auth, sigUpload.single('signature'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const data     = fs.readFileSync(req.file.path);
    const base64   = data.toString('base64');
    const mimeType = req.file.mimetype;
    fs.unlinkSync(req.file.path); // clean up temp

    const db   = getDB();
    const idx  = db.users.findIndex(u => u.id === req.user.id);
    db.users[idx].signatureBase64 = base64;
    db.users[idx].signatureMime   = mimeType;
    saveDB(db);
    res.json({ success: true, mimeType, base64 });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/signature', auth, (req, res) => {
  const db  = getDB();
  const idx = db.users.findIndex(u => u.id === req.user.id);
  if (idx !== -1) {
    delete db.users[idx].signatureBase64;
    delete db.users[idx].signatureMime;
    saveDB(db);
  }
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════════════════════
app.get('/api/stats', auth, (req, res) => {
  const db   = getDB();
  const mine = db.campaigns.filter(c => c.userId === req.user.id);
  const totalSent      = mine.reduce((s,c) => s+(c.emailsSent||0), 0);
  const totalFollowups = mine.reduce((s,c) => {
    return s + (c.emails||[]).reduce((ss,e) => ss + (e.followupsSent||0), 0);
  }, 0);
  const totalOpens = mine.reduce((s,c) => {
    return s + (c.emails||[]).filter(e => (e.opens||[]).length > 0).length;
  }, 0);
  const totalReplies = mine.reduce((s,c) => {
    return s + (c.emails||[]).filter(e => !!e.replied).length;
  }, 0);
  const pendingFollowups = countPendingFollowups(mine);
  res.json({
    totalCampaigns: mine.length,
    totalEmailsSent: totalSent,
    totalFollowupsSent: totalFollowups,
    totalOpens,
    totalReplies,
    totalTemplates: db.templates.length,
    pendingFollowups
  });
});

function countPendingFollowups(campaigns) {
  let count = 0;
  for (const c of campaigns) {
    if (!c.followupsEnabled) continue;
    for (const e of (c.emails||[])) {
      if (!e.delivered) continue;
      if (e.replied) continue; // replied → stop follow-ups
      const sent = (e.followupsSent||0);
      if (sent >= 5) continue;
      // Only count if recipient opened the previous email
      const opens = e.opens || [];
      if (opens.length === 0) continue;
      if (sent > 0) {
        const lastFU = new Date(e.lastFollowupAt).getTime();
        const openedAfterLastFU = opens.some(o => new Date(o.time).getTime() > lastFU);
        if (!openedAfterLastFU) continue;
      }
      count++;
    }
  }
  return count;
}

// ═══════════════════════════════════════════════════════════
//  TEMPLATES
// ═══════════════════════════════════════════════════════════
app.get('/api/templates', auth, (req, res) => res.json(getDB().templates));

app.post('/api/templates', auth, (req, res) => {
  const { name, subject, body } = req.body;
  if (!name||!subject||!body) return res.status(400).json({ error:'All fields required' });
  const db = getDB();
  const t  = { id:'tpl_'+Date.now(), name, subject, body, createdBy:req.user.id, updatedAt:new Date().toISOString() };
  db.templates.push(t);
  saveDB(db);
  res.json(t);
});

app.put('/api/templates/:id', auth, (req, res) => {
  const { name, subject, body } = req.body;
  const db  = getDB();
  const idx = db.templates.findIndex(t => t.id === req.params.id);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  db.templates[idx] = { ...db.templates[idx], name, subject, body, updatedAt:new Date().toISOString() };
  saveDB(db);
  res.json(db.templates[idx]);
});

app.delete('/api/templates/:id', auth, (req, res) => {
  const db = getDB();
  db.templates = db.templates.filter(t => t.id !== req.params.id);
  saveDB(db);
  res.json({ success:true });
});

// ─── Follow-up templates ─────────────────────────────────
app.get('/api/followup-templates', auth, (req, res) => {
  res.json(getDB().followupTemplates);
});

app.put('/api/followup-templates/:step', auth, (req, res) => {
  const step = parseInt(req.params.step);
  const { subject, body } = req.body;
  const db  = getDB();
  const idx = db.followupTemplates.findIndex(f => f.step === step);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  db.followupTemplates[idx] = { ...db.followupTemplates[idx], subject, body };
  saveDB(db);
  res.json(db.followupTemplates[idx]);
});

// ═══════════════════════════════════════════════════════════
//  CAMPAIGNS
// ═══════════════════════════════════════════════════════════
app.get('/api/campaigns', auth, (req, res) => {
  const db   = getDB();
  const mine = db.campaigns.filter(c => c.userId===req.user.id)
    .map(c => {
      const emails = c.emails||[];
      const totalOpened = emails.filter(e=>(e.opens||[]).length>0).length;
      const totalReplied = emails.filter(e=>!!e.replied).length;
      const totalFollowups = emails.reduce((s,e)=>s+(e.followupsSent||0),0);
      return { ...c, emails:undefined, totalOpened, totalReplied, totalFollowups };
    });
  res.json(mine);
});

app.get('/api/campaigns/:id', auth, (req, res) => {
  const db = getDB();
  const c  = db.campaigns.find(c=>c.id===req.params.id && c.userId===req.user.id);
  if (!c) return res.status(404).json({ error:'Not found' });
  res.json({ ...c, emails:undefined });
});

app.get('/api/campaigns/:id/analytics', auth, (req, res) => {
  const db = getDB();
  const c  = db.campaigns.find(c=>c.id===req.params.id && c.userId===req.user.id);
  if (!c) return res.status(404).json({ error:'Not found' });
  const emails = (c.emails||[]).map(e => ({
    id:e.id, name:e.name, email:e.email, sentAt:e.sentAt,
    delivered:e.delivered,
    opensCount:(e.opens||[]).length,
    firstOpened:e.opens&&e.opens.length?e.opens[0].time:null,
    lastOpened:e.opens&&e.opens.length?e.opens[e.opens.length-1].time:null,
    openHistory:e.opens||[],
    replied: !!e.replied,
    repliedAt: e.repliedAt || null,
    followupsSent:e.followupsSent||0,
    lastFollowupAt:e.lastFollowupAt||null,
    nextFollowupAt:getNextFollowupDate(e)
  }));
  const delivered  = emails.filter(e=>e.delivered).length;
  const opened     = emails.filter(e=>e.opensCount>0).length;
  const openRate   = delivered ? Math.round((opened/delivered)*100) : 0;
  const replied    = emails.filter(e=>e.replied).length;
  const replyRate  = delivered ? Math.round((replied/delivered)*100) : 0;
  const fuSent     = emails.reduce((s,e)=>s+(e.followupsSent||0),0);
  res.json({
    campaignId:c.id, campaignName:c.name, status:c.status,
    totalLeads:c.totalLeads, emailsSent:c.emailsSent, emailsFailed:c.emailsFailed||0,
    delivered, opened, openRate, replied, replyRate, fuSent, emails
  });
});

function getNextFollowupDate(e) {
  if (!e.delivered) return null;
  if (e.replied) return null; // replied → no more follow-ups
  const sent = e.followupsSent||0;
  if (sent >= 5) return null;
  // Check if recipient opened the previous email
  const opens = e.opens || [];
  if (opens.length === 0) return null;
  if (sent > 0) {
    const lastFU = new Date(e.lastFollowupAt).getTime();
    const openedAfterLastFU = opens.some(o => new Date(o.time).getTime() > lastFU);
    if (!openedAfterLastFU) return null;
  }
  // Next Saturday
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilSat = (6 - dayOfWeek + 7) % 7 || 7;
  const nextSat = new Date(now);
  nextSat.setDate(now.getDate() + daysUntilSat);
  nextSat.setHours(9, 0, 0, 0);
  return nextSat.toISOString();
}

// Follow-up status for a campaign
app.get('/api/campaigns/:id/followups', auth, (req, res) => {
  const db = getDB();
  const c  = db.campaigns.find(c=>c.id===req.params.id && c.userId===req.user.id);
  if (!c) return res.status(404).json({ error:'Not found' });
  const dayOfWeek = new Date().getDay();
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  const rows = (c.emails||[]).filter(e=>e.delivered).map(e=>{
    const sent = e.followupsSent||0;
    const opens = e.opens || [];
    // Check if recipient opened the previous email
    let hasOpenedPrevious = opens.length > 0;
    if (hasOpenedPrevious && sent > 0) {
      const lastFU = new Date(e.lastFollowupAt).getTime();
      hasOpenedPrevious = opens.some(o => new Date(o.time).getTime() > lastFU);
    }
    return {
      name:e.name, email:e.email, followupsSent:sent,
      lastFollowupAt:e.lastFollowupAt||null,
      nextFollowupAt: getNextFollowupDate(e),
      isDue:(sent<5 && isWeekend && hasOpenedPrevious && !e.replied),
      hasOpenedPrevious,
      replied: !!e.replied,
      repliedAt: e.repliedAt || null,
      completed:(sent>=5 || !!e.replied)
    };
  });
  res.json(rows);
});

// ─── Manual follow-up send ───────────────────────────────────────────────────
// POST /api/campaigns/:id/send-followups
// Body: { step: 1-5, emailIds: ['id1','id2',...] }
// Sends follow-up step N as a REPLY to the last sent email for each lead.
// Respects daily limit. Skips replied/already-on-this-step leads.
app.post('/api/campaigns/:id/send-followups', auth, async (req, res) => {
  const { step, emailIds } = req.body;
  if (!step || !Array.isArray(emailIds) || emailIds.length === 0)
    return res.status(400).json({ error: 'step and emailIds[] required' });
  const stepNum = parseInt(step);
  if (stepNum < 1 || stepNum > 5)
    return res.status(400).json({ error: 'step must be 1-5' });

  const db = getDB();
  const camp = db.campaigns.find(c => c.id === req.params.id && c.userId === req.user.id);
  if (!camp) return res.status(404).json({ error: 'Campaign not found' });
  const user = db.users.find(u => u.id === req.user.id);
  if (!user || !user.email || !user.password)
    return res.status(400).json({ error: 'Account email/password not configured' });
  const fuTpl = db.followupTemplates.find(f => f.step === stepNum);
  if (!fuTpl) return res.status(400).json({ error: `No template for step ${stepNum}` });

  // Send asynchronously — return immediately with job count
  const targetIds = new Set(emailIds);
  const targets = (camp.emails || []).filter(e => targetIds.has(e.id) && e.delivered && !e.replied && (e.followupsSent || 0) < stepNum);
  if (targets.length === 0)
    return res.json({ queued: 0, message: 'No eligible leads' });

  res.json({ queued: targets.length, message: `Sending ${targets.length} follow-up(s) in background…` });

  // Run sends in background
  (async () => {
    for (const emailRec of targets) {
      try {
        const dbNow = getDB();
        const campNow = dbNow.campaigns.find(c => c.id === camp.id);
        const eNow = campNow && (campNow.emails || []).find(e => e.id === emailRec.id);
        const uNow = dbNow.users.find(u => u.id === user.id);
        if (!eNow || !uNow) continue;
        if (eNow.replied) continue;
        if ((eNow.followupsSent || 0) >= stepNum) continue; // already sent this step

        // Daily limit check
        const today = new Date().toDateString();
        if (uNow.lastReset !== today) { uNow.dailySent = 0; uNow.lastReset = today; }
        if ((uNow.dailySent || 0) >= cfg.DAILY_LIMIT) {
          console.log(`  Daily limit hit for ${uNow.email}, stopping manual followups`);
          saveDB(dbNow);
          break;
        }

        const body  = applyVars(fuTpl.body, eNow, uNow);
        const origSubj = eNow.sentSubject || fuTpl.subject;
        // Strip any existing Re: prefix then add one — ensures exact subject match for threading
        const bareSubj = origSubj.replace(/^(Re:\s*)+/i,'').trim();
        const subj  = `Re: ${bareSubj}`;
        const sigB64 = uNow.signatureBase64 || null;
        const sigMime = uNow.signatureMime || 'image/png';
        const html  = toHtml(body, uuid(), sigB64, sigMime);
        // Pre-generate new Message-ID for this follow-up
        const newMsgId = genMsgId();
        const threadOpts = { messageId: newMsgId };
        if (eNow.lastMessageId) {
          threadOpts.inReplyTo  = eNow.lastMessageId;
          // References = full chain from original to last
          const refs = [eNow.messageId, eNow.lastMessageId].filter(Boolean);
          if (!refs.includes(eNow.lastMessageId)) refs.push(eNow.lastMessageId);
          threadOpts.references = refs.join(' ');
        }

        try {
          const tr = createMailTransport(uNow.email, uNow.password);
          await tr.sendMail(buildMailOptions(`${uNow.name} <${uNow.email}>`, eNow.email, subj, body, html, sigB64, sigMime, threadOpts));
          try { tr.close(); } catch(_) {}
          console.log(`  ↳ Manual FU${stepNum} → ${eNow.email}`);
        } catch (sendErr) {
          console.error(`  ↳ Manual FU${stepNum} failed ${eNow.email}: ${sendErr.message}`);
          continue;
        }

        // Commit to DB
        const dbCommit = getDB();
        const campCommit = dbCommit.campaigns.find(c => c.id === camp.id);
        const eCommit = campCommit && (campCommit.emails || []).find(e => e.id === emailRec.id);
        const uCommit = dbCommit.users.find(u => u.id === user.id);
        if (eCommit && uCommit) {
          eCommit.followupsSent  = stepNum;
          eCommit.lastFollowupAt = new Date().toISOString();
          eCommit.lastMessageId = newMsgId;
          uCommit.dailySent = (uCommit.dailySent || 0) + 1;
          uCommit.lastReset = today;
          if (!campCommit.log) campCommit.log = [];
          campCommit.log.push({ time: new Date().toISOString(), msg: `📬 Follow-up ${stepNum} sent → ${eCommit.name} <${eCommit.email}>`, type: 'followup' });
          saveDB(dbCommit);
        }
        await sleep(45000); // 45s delay between sends
      } catch (err) {
        console.error('Manual FU error:', err.message);
      }
    }
    console.log(`  ✅ Manual FU${stepNum} batch complete`);
  })();
});

// Start campaign
app.post('/api/campaigns/start', auth, upload.single('leadsFile'), async (req, res) => {
  const { name, noWikiTemplateId, wikiTemplateId } = req.body;
  if (!name)             return res.status(400).json({ error:'Campaign name required' });
  if (!noWikiTemplateId) return res.status(400).json({ error:'Select a template' });
  if (!req.file)         return res.status(400).json({ error:'Upload a leads file' });

  const db   = getDB();
  const noWT = db.templates.find(t=>t.id===noWikiTemplateId);
  if (!noWT) { fs.unlinkSync(req.file.path); return res.status(400).json({ error:'Template not found' }); }
  const wT   = wikiTemplateId ? db.templates.find(t=>t.id===wikiTemplateId) : null;

  let leads = [];
  try {
    const wb   = XLSX.readFile(req.file.path);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1 });
    const skip = typeof(rows[0]||[])[0]==='string' && String(rows[0][0]).toLowerCase().match(/name|prof/);
    for (let i=skip?1:0; i<rows.length; i++) {
      const r = rows[i];
      if (r[0]&&r[1]) leads.push({
        name:String(r[0]).trim(),
        email:String(r[1]).trim(),
        hasWiki:String(r[2]||'').toLowerCase().trim()==='yes'
      });
    }
  } catch(e) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error:'Cannot parse file: '+e.message });
  }
  fs.unlinkSync(req.file.path);
  if (!leads.length) return res.status(400).json({ error:'No valid leads found' });

  const campaign = {
    id:'camp_'+Date.now(), userId:req.user.id, name,
    noWikiTemplateId, wikiTemplateId:wikiTemplateId||null,
    totalLeads:leads.length, emailsSent:0, emailsFailed:0,
    status:'running', createdAt:new Date().toISOString(),
    followupsEnabled:true, log:[], emails:[]
  };
  db.campaigns.push(campaign);
  saveDB(db);
  res.json({ success:true, campaign, leadsCount:leads.length });
  runCampaign(campaign.id, req.user.id, leads, noWT, wT);
});

app.post('/api/campaigns/:id/stop', auth, (req, res) => {
  if (activeCampaigns[req.params.id]) activeCampaigns[req.params.id].running = false;
  const db  = getDB();
  const idx = db.campaigns.findIndex(c=>c.id===req.params.id&&c.userId===req.user.id);
  if (idx!==-1 && db.campaigns[idx].status==='running') {
    db.campaigns[idx].status='stopped'; saveDB(db);
  }
  res.json({ success:true });
});

// Toggle follow-ups for a campaign
app.post('/api/campaigns/:id/toggle-followups', auth, (req, res) => {
  const db  = getDB();
  const idx = db.campaigns.findIndex(c=>c.id===req.params.id&&c.userId===req.user.id);
  if (idx===-1) return res.status(404).json({ error:'Not found' });
  db.campaigns[idx].followupsEnabled = !db.campaigns[idx].followupsEnabled;
  saveDB(db);
  res.json({ followupsEnabled:db.campaigns[idx].followupsEnabled });
});

// Manually mark a recipient as replied (or un-mark)
app.post('/api/campaigns/:id/mark-replied', auth, (req, res) => {
  const { email, replied } = req.body || {};
  if (!email) return res.status(400).json({ error:'email required' });
  const db  = getDB();
  const c   = db.campaigns.find(c => c.id===req.params.id && c.userId===req.user.id);
  if (!c) return res.status(404).json({ error:'Not found' });
  const target = String(email).toLowerCase();
  const rec = (c.emails||[]).find(e => String(e.email||'').toLowerCase() === target);
  if (!rec) return res.status(404).json({ error:'Recipient not found in campaign' });
  if (replied === false) {
    rec.replied = false;
    rec.repliedAt = null;
  } else {
    rec.replied = true;
    rec.repliedAt = rec.repliedAt || new Date().toISOString();
  }
  saveDB(db);
  res.json({ email: rec.email, replied: rec.replied, repliedAt: rec.repliedAt });
});

// Manually trigger a reply sync from Gmail IMAP (current user only)
app.post('/api/sync-replies', auth, async (req, res) => {
  try {
    await syncReplies(req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  ADMIN — GIT PULL + APP RESTART (for cPanel deployments)
//  Hosts that block terminal access (shared cPanel) need this.
// ═══════════════════════════════════════════════════════════
app.get('/api/deploy/status', auth, (req, res) => {
  exec('git rev-parse HEAD && git log -1 --pretty=format:"%h %s (%cr)" && git status --short',
    { cwd: __dirname, timeout: 10000 },
    (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: err.message, stderr });
      res.json({ output: stdout, stderr });
    });
});

app.post('/api/deploy/pull', auth, (req, res) => {
  // Run git fetch + reset to avoid merge conflicts on the server
  const cmd = 'git fetch --all && git reset --hard origin/$(git rev-parse --abbrev-ref HEAD) && git log -1 --pretty=format:"%h %s"';
  exec(cmd, { cwd: __dirname, timeout: 60000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: err.message,
        stdout: stdout || '',
        stderr: stderr || ''
      });
    }
    // Touch tmp/restart.txt so cPanel Passenger reloads the app
    try {
      const tmpDir = path.join(__dirname, 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'restart.txt'), new Date().toISOString());
    } catch(e) {
      console.error('Failed to touch restart.txt:', e.message);
    }
    res.json({ success: true, output: stdout, stderr, restartTriggered: true });
  });
});

// Optional: run `npm install --production` after a pull (for dependency changes)
app.post('/api/deploy/install', auth, (req, res) => {
  exec('npm install --production --no-audit --no-fund',
    { cwd: __dirname, timeout: 180000 },
    (err, stdout, stderr) => {
      if (err) return res.status(500).json({ error: err.message, stdout, stderr });
      res.json({ success: true, output: stdout, stderr });
    });
});

// ═══════════════════════════════════════════════════════════
//  TRACKING PIXEL
// ═══════════════════════════════════════════════════════════
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64');

app.get('/track/open/:trackId', (req, res) => {
  res.setHeader('Content-Type','image/gif');
  res.setHeader('Cache-Control','no-store,no-cache');
  res.end(PIXEL);
  const ua = req.headers['user-agent']||'';
  if (/bot|crawl|spider|preview|applebot/i.test(ua)) return;
  const now = new Date().toISOString();
  try {
    const db = getDB();
    for (const c of db.campaigns) {
      const i = (c.emails||[]).findIndex(e=>e.trackId===req.params.trackId);
      if (i!==-1) {
        if (!c.emails[i].opens) c.emails[i].opens=[];
        c.emails[i].opens.push({ time:now, ua:ua.slice(0,120) });
        saveDB(db); break;
      }
    }
  } catch(e) {}
});

// ═══════════════════════════════════════════════════════════
//  CAMPAIGN RUNNER
// ═══════════════════════════════════════════════════════════
const activeCampaigns = {};

async function runCampaign(campId, userId, leads, noWT, wT) {
  activeCampaigns[campId] = { running:true };
  for (let i=0; i<leads.length; i++) {
    if (!activeCampaigns[campId]?.running) break;
    const lead  = leads[i];
    const today = new Date().toDateString();
    let db = getDB();
    const uIdx = db.users.findIndex(u=>u.id===userId);
    if (uIdx===-1) break;
    if (db.users[uIdx].lastReset!==today) { db.users[uIdx].dailySent=0; db.users[uIdx].lastReset=today; saveDB(db); }
    db = getDB();
    if ((db.users.find(u=>u.id===userId)?.dailySent||0) >= cfg.DAILY_LIMIT) {
      const ci = db.campaigns.findIndex(c=>c.id===campId);
      if (ci!==-1) { db.campaigns[ci].status='paused_daily_limit'; db.campaigns[ci].log.push({ time:new Date().toISOString(), msg:`Daily limit reached. Paused.`, type:'warn' }); saveDB(db); }
      break;
    }
    const tpl   = (lead.hasWiki && wT) ? wT : noWT;
    const user  = getDB().users.find(u=>u.id===userId);
    const body  = applyVars(tpl.body, lead, user);
    const subj  = applyVars(tpl.subject, lead, user);
    const trkId = uuid();
    const sigB64 = user.signatureBase64 || null;
    const sigMime= user.signatureMime   || 'image/png';
    const html  = toHtml(body, trkId, sigB64, sigMime);
    // Pre-generate Message-ID so we store exactly what was sent
    const msgId = genMsgId();
    let ok = false;
    try {
      const tr = createMailTransport(user.email, user.password);
      await tr.sendMail(buildMailOptions(`${user.name} <${user.email}>`, lead.email, subj, body, html, sigB64, sigMime, { messageId: msgId }));
      ok = true;
    } catch(e) {
      const db2 = getDB(); const ci=db2.campaigns.findIndex(c=>c.id===campId);
      if (ci!==-1) { db2.campaigns[ci].emailsFailed=(db2.campaigns[ci].emailsFailed||0)+1; db2.campaigns[ci].log.push({ time:new Date().toISOString(), msg:`✗ ${lead.email}: ${e.message}`, type:'error' }); db2.campaigns[ci].emails.push({ id:uuid(),trackId:trkId,name:lead.name,email:lead.email,sentAt:new Date().toISOString(),delivered:false,opens:[],followupsSent:0 }); saveDB(db2); }
    }
    if (ok) {
      const db2=getDB(); const ci=db2.campaigns.findIndex(c=>c.id===campId); const ui=db2.users.findIndex(u=>u.id===userId);
      db2.campaigns[ci].emailsSent+=1; db2.campaigns[ci].log.push({ time:new Date().toISOString(), msg:`✓ Sent → ${lead.name} <${lead.email}>`, type:'success' });
      db2.campaigns[ci].emails.push({ id:uuid(),trackId:trkId,name:lead.name,email:lead.email,sentAt:new Date().toISOString(),delivered:true,opens:[],followupsSent:0,lastFollowupAt:null,messageId:msgId,lastMessageId:msgId,sentSubject:subj });
      db2.users[ui].dailySent=(db2.users[ui].dailySent||0)+1; db2.users[ui].lastReset=today;
      saveDB(db2);
    }
    if (i<leads.length-1 && activeCampaigns[campId]?.running) await sleep(cfg.EMAIL_DELAY_SECONDS*1000);
  }
  const db3=getDB(); const ci3=db3.campaigns.findIndex(c=>c.id===campId);
  if (ci3!==-1&&db3.campaigns[ci3].status==='running') { db3.campaigns[ci3].status='completed'; saveDB(db3); }
  delete activeCampaigns[campId];
}

// ═══════════════════════════════════════════════════════════
//  REPLY SYNC — Gmail IMAP → mark replied emails in DB
// ═══════════════════════════════════════════════════════════
let _syncReplyRunning = false;
async function syncReplies(onlyUserId = null) {
  // Prevent concurrent IMAP connections — Gmail hates parallel auth attempts
  if (_syncReplyRunning) {
    console.log('  ⏸  Reply sync already in progress, skipping');
    return;
  }
  _syncReplyRunning = true;
  try {
    return await _syncRepliesInner(onlyUserId);
  } finally {
    _syncReplyRunning = false;
  }
}

async function _syncRepliesInner(onlyUserId) {
  const db = getDB();
  let changed = false;

  // Group: per-user, collect all recipient emails that are still
  // candidates for follow-ups (delivered, not yet replied, not done).
  const byUser = new Map(); // userId → { user, recipients: Set, emailRefs: [] }

  for (const camp of db.campaigns) {
    if (!camp.followupsEnabled) continue;
    if (onlyUserId && camp.userId !== onlyUserId) continue;
    const user = db.users.find(u => u.id === camp.userId);
    if (!user || !user.email || !user.password) continue;

    let bucket = byUser.get(user.id);
    if (!bucket) {
      bucket = { user, recipients: new Set(), emailRefs: [] };
      byUser.set(user.id, bucket);
    }
    for (const e of (camp.emails || [])) {
      if (!e.delivered) continue;
      if (e.replied) continue;
      const sent = e.followupsSent || 0;
      if (sent >= 5) continue;
      const addr = String(e.email || '').toLowerCase();
      if (!addr) continue;
      bucket.recipients.add(addr);
      bucket.emailRefs.push(e);
    }
  }

  for (const { user, recipients, emailRefs } of byUser.values()) {
    if (recipients.size === 0) continue;
    // Only look back 60 days — avoids scanning the entire inbox
    const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    console.log(`  📥 Checking replies for ${user.email} (${recipients.size} recipients)…`);
    let repliedMap;
    try {
      repliedMap = await checkReplies(user, Array.from(recipients), since);
    } catch (e) {
      console.error(`  IMAP failed for ${user.email}: ${e.message}`);
      continue;
    }
    if (repliedMap.size === 0) { console.log('    no new replies'); continue; }

    for (const e of emailRefs) {
      const addr = String(e.email || '').toLowerCase();
      const when = repliedMap.get(addr);
      if (when && !e.replied) {
        e.replied   = true;
        e.repliedAt = when.toISOString();
        changed = true;
        console.log(`    ✓ reply from ${addr} at ${e.repliedAt}`);
      }
    }
  }

  if (changed) saveDB(db);
}

// ═══════════════════════════════════════════════════════════
//  FOLLOW-UP SCHEDULER  (runs every 30 minutes)
//  CONCURRENCY SAFE: single-flight lock + reserve-before-send
// ═══════════════════════════════════════════════════════════
let _schedulerRunning = false;
async function runFollowupScheduler() {
  if (_schedulerRunning) {
    console.log('  ⏸  Follow-up scheduler already running, skipping this tick');
    return;
  }
  _schedulerRunning = true;
  try {
    return await _runFollowupSchedulerInner();
  } finally {
    _schedulerRunning = false;
  }
}

async function _runFollowupSchedulerInner() {
  // Follow-ups ONLY on Saturday (6) and Sunday (0)
  const day = new Date().getDay();
  if (day !== 0 && day !== 6) {
    console.log('  Skipping follow-ups: not weekend (Mon-Fri)');
    return;
  }

  // First: sync replies from Gmail so we skip anyone who responded
  try { await syncReplies(); }
  catch (e) { console.error('  Reply sync error (continuing anyway):', e.message); }

  // Collect what's due — snapshot of identifiers, not references
  const initial = getDB();
  const dueList = []; // { campId, emailId, userId, step }

  for (const camp of initial.campaigns) {
    if (!camp.followupsEnabled) continue;
    for (const email of (camp.emails || [])) {
      if (!email.delivered) continue;
      if (email.replied) continue;
      const sent = email.followupsSent || 0;
      if (sent >= 5) continue;
      const opens = email.opens || [];
      if (opens.length === 0) continue;
      if (sent > 0) {
        const lastFU = new Date(email.lastFollowupAt).getTime();
        const openedAfterLastFU = opens.some(o => new Date(o.time).getTime() > lastFU);
        if (!openedAfterLastFU) continue;
      }
      dueList.push({ campId: camp.id, emailId: email.id, userId: camp.userId, step: sent + 1 });
    }
  }

  if (dueList.length === 0) { console.log('  No follow-ups due'); return; }
  console.log(`  ${dueList.length} follow-up(s) due`);

  for (const job of dueList) {
    // ── RESERVE SLOT: re-read DB, verify still due, increment, save — BEFORE sending ──
    let reserved = null;
    {
      const db = getDB();
      const camp = db.campaigns.find(c => c.id === job.campId);
      if (!camp) continue;
      const email = (camp.emails || []).find(e => e.id === job.emailId);
      if (!email) continue;
      if (email.replied) continue;
      const sentNow = email.followupsSent || 0;
      if (sentNow !== job.step - 1) {
        // State has changed (maybe another run sent this) → skip
        console.log(`  ↷ skip ${email.email} (step drifted from ${job.step-1} to ${sentNow})`);
        continue;
      }
      const user = db.users.find(u => u.id === job.userId);
      if (!user || !user.email || !user.password) continue;

      // Daily limit reset
      const today = new Date().toDateString();
      if (user.lastReset !== today) { user.dailySent = 0; user.lastReset = today; }
      if ((user.dailySent || 0) >= cfg.DAILY_LIMIT) {
        console.log(`  Daily limit hit for ${user.email}, stopping`);
        saveDB(db);
        return;
      }

      const fuTpl = db.followupTemplates.find(f => f.step === job.step);
      if (!fuTpl) continue;

      // RESERVE: bump the counter and persist NOW, before sending.
      // If send fails, we roll back.
      const prev = {
        followupsSent: sentNow,
        lastFollowupAt: email.lastFollowupAt,
        dailySent: user.dailySent || 0
      };
      email.followupsSent  = sentNow + 1;
      email.lastFollowupAt = new Date().toISOString();
      user.dailySent       = (user.dailySent || 0) + 1;
      saveDB(db);

      reserved = { user, fuTpl, email: { id: email.id, name: email.name, email: email.email, lastMessageId: email.lastMessageId||null, messageId: email.messageId||null, sentSubject: email.sentSubject||null }, prev, campId: camp.id };
    }

    // ── ACTUAL SEND (outside DB lock window) ──
    const { user, fuTpl, email, prev, campId } = reserved;
    const body  = applyVars(fuTpl.body, email, user);
    // Strip existing Re: prefix then add one for clean threading
    const origSubj = email.sentSubject || applyVars(fuTpl.subject, email, user);
    const bareSubj = origSubj.replace(/^(Re:\s*)+/i,'').trim();
    const subj  = `Re: ${bareSubj}`;
    const sigB64 = user.signatureBase64 || null;
    const sigMime = user.signatureMime || 'image/png';
    const html  = toHtml(body, uuid(), sigB64, sigMime);
    // Pre-generate Message-ID for this follow-up
    const fuMsgId = genMsgId();
    const threadOpts = { messageId: fuMsgId };
    if (email.lastMessageId) {
      threadOpts.inReplyTo  = email.lastMessageId;
      const refs = [email.messageId, email.lastMessageId].filter(Boolean);
      threadOpts.references = refs.join(' ');
    }

    let sendOk = false;
    try {
      const tr = createMailTransport(user.email, user.password);
      await tr.sendMail(buildMailOptions(`${user.name} <${user.email}>`, email.email, subj, body, html, sigB64, sigMime, threadOpts));
      try { tr.close(); } catch(_) {}
      sendOk = true;
      console.log(`  ↳ Follow-up ${job.step} → ${email.email}`);
    } catch (e) {
      console.error(`  ↳ Follow-up failed ${email.email}: ${e.message}`);
    }

    // ── COMMIT OR ROLLBACK ──
    {
      const db2 = getDB();
      const camp2 = db2.campaigns.find(c => c.id === campId);
      const email2 = camp2 && (camp2.emails || []).find(e => e.id === email.id);
      const user2 = db2.users.find(u => u.id === user.id);
      if (!email2 || !user2) continue;
      if (sendOk) {
        email2.lastMessageId = fuMsgId;
        if (!camp2.log) camp2.log = [];
        camp2.log.push({ time: new Date().toISOString(), msg: `📬 Follow-up ${job.step} sent → ${email.name} <${email.email}>`, type: 'followup' });
        saveDB(db2);
      } else {
        // Rollback the reservation so it retries next run
        email2.followupsSent  = prev.followupsSent;
        email2.lastFollowupAt = prev.lastFollowupAt;
        user2.dailySent       = prev.dailySent;
        saveDB(db2);
      }
    }

    // 45s delay between follow-ups (only if send succeeded — failures shouldn't delay)
    if (sendOk) await sleep(45000);
  }
}

// Auto follow-up scheduler DISABLED — follow-ups are now sent manually via the UI
// setInterval(async () => {
//   try { await runFollowupScheduler(); } catch(e) { console.error('Scheduler error:', e.message); }
// }, 30 * 60 * 1000);

// Reply sync — runs EVERY DAY (not just weekends) every 15 minutes.
// This is independent of follow-up sending so replies get detected
// on weekdays too, so campaigns accurately reflect who responded.
setInterval(async () => {
  console.log(`[${new Date().toLocaleTimeString()}] Syncing replies from Gmail…`);
  try { await syncReplies(); } catch(e) { console.error('Reply sync error:', e.message); }
}, 15 * 60 * 1000);

// Also run on startup
setTimeout(async () => {
  console.log('[Startup] Syncing replies from Gmail…');
  try { await syncReplies(); } catch(e) { console.error('Startup reply sync error:', e.message); }
}, 10000);

// Startup auto follow-up check DISABLED — follow-ups are manual now
// setTimeout(async () => { try { await runFollowupScheduler(); } catch(e) {} }, 30000);

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
// Replace template variables with recipient + sender data.
// Recipient (lead):  {{name}}  {{first_name}}
// Sender (logged-in user):  {{sender_name}}  {{sender_first_name}}  {{my_name}}
function applyVars(text, lead, user) {
  if (!text) return '';
  const rName = lead && lead.name ? String(lead.name) : '';
  const rFirst = rName.split(' ')[0] || '';
  const sName = user && user.name ? String(user.name) : '';
  const sFirst = sName.split(' ')[0] || '';
  return String(text)
    .replace(/\{\{\s*name\s*\}\}/g, rName)
    .replace(/\{\{\s*first_name\s*\}\}/g, rFirst)
    .replace(/\{\{\s*sender_name\s*\}\}/g, sName)
    .replace(/\{\{\s*sender_first_name\s*\}\}/g, sFirst)
    .replace(/\{\{\s*my_name\s*\}\}/g, sName);
}

function toHtml(text, trackId, sigBase64 = null, sigMime = 'image/png') {
  // Split on blank lines → paragraphs. Single \n within a paragraph = <br>.
  // This produces tight, Gmail-style spacing regardless of how many blank
  // lines the user typed between paragraphs.
  const raw = String(text || '').replace(/\r\n/g, '\n');

  // Detect signature marker "--" (standard email convention).
  // Everything after it is collapsed into one tight block (no paragraph gaps).
  const sigIdx = raw.search(/(^|\n)\s*--\s*(\n|$)/);
  const bodyPart = sigIdx >= 0 ? raw.slice(0, sigIdx) : raw;
  const sigPart  = sigIdx >= 0 ? raw.slice(sigIdx).replace(/^(\n)?\s*--\s*\n?/, '') : '';

  const paragraphs = bodyPart
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  const pStyle = 'margin:0 0 10px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#333';
  let lines = paragraphs.map(p => {
    const inner = p.split('\n').map(l => l.trim()).filter(Boolean).join('<br>');
    return `<p style="${pStyle}">${inner}</p>`;
  }).join('');

  // Render signature block tight: all non-empty lines joined with <br>, no gaps.
  if (sigPart.trim()) {
    const sigLines = sigPart.split('\n').map(l => l.trim()).filter(Boolean).join('<br>');
    lines += `<p style="${pStyle};margin-top:14px">${sigLines}</p>`;
  }

  const sigHtml = sigBase64
    ? `<div style="margin-top:18px;padding-top:14px;border-top:1px solid #e5e5e5">
         <img src="cid:signature_img" alt="Signature" style="max-width:400px;height:auto;display:block"/>
       </div>`
    : '';

  return `<div style="max-width:600px">
    ${lines}
    ${sigHtml}
    <img src="${cfg.BASE_URL}/track/open/${trackId}" width="1" height="1" alt="" style="width:1px;height:1px;border:0;display:block"/>
  </div>`;
}

function buildMailOptions(from, to, subject, bodyText, htmlBody, sigBase64, sigMime, threadOpts = {}) {
  // Generate a stable Message-ID we control — critical for reply threading.
  // Format: <uuid@gmail.com> — Gmail recognises the gmail.com domain.
  const msgId = threadOpts.messageId || `<${uuid()}@gmail.com>`;

  const opts = {
    from, to, subject,
    text: bodyText,
    html: htmlBody,
    // Explicitly set Message-ID so we know exactly what was sent
    messageId: msgId,
    // Reply threading headers — Gmail uses these to group into same thread
    ...(threadOpts.inReplyTo  && { inReplyTo:  threadOpts.inReplyTo }),
    ...(threadOpts.references && { references: threadOpts.references }),
    // Extra headers to reduce spam score
    headers: {
      'X-Mailer': 'Mozilla/5.0',          // looks like a regular mail client
      'X-Priority': '3',                  // Normal priority (not bulk)
      ...(threadOpts.inReplyTo && {
        // These extra headers help Gmail thread properly
        'In-Reply-To': threadOpts.inReplyTo,
        'References':  threadOpts.references || threadOpts.inReplyTo,
      }),
    },
  };

  if (sigBase64) {
    opts.attachments = [{
      filename: 'signature.png',
      content:  Buffer.from(sigBase64, 'base64'),
      cid:      'signature_img',
      contentType: sigMime || 'image/png'
    }];
  }
  return opts;
}

// Generate a Message-ID in the format Gmail expects
function genMsgId() { return `<${uuid()}@gmail.com>`; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

app.listen(cfg.PORT, () => {
  console.log(`\n✅  Email System v3.0 → http://localhost:${cfg.PORT}`);
  console.log(`📌  Follow-ups every ${cfg.FOLLOWUP_INTERVAL_DAYS} days (5 steps)`);
  console.log(`⏱   Scheduler runs every 30 minutes\n`);
});
