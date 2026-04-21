'use strict';
// ═══════════════════════════════════════════════════════════
//  REPLY CHECKER — Gmail IMAP
//  Detects replies from campaign recipients so we can skip
//  follow-ups once a prospect responds (positive or negative).
// ═══════════════════════════════════════════════════════════
const { ImapFlow } = require('imapflow');

/**
 * Connect to Gmail IMAP and check which recipient emails have replied.
 *
 * @param {Object} user  - { email, password }
 * @param {Array<string>} recipientEmails - addresses to check for replies
 * @param {Date} since   - only check messages received after this date
 * @returns {Promise<Map<string, Date>>} - Map of repliedEmail → firstReplyDate
 */
async function checkReplies(user, recipientEmails, since) {
  const replied = new Map(); // email (lowercase) → Date
  if (!recipientEmails || recipientEmails.length === 0) return replied;

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: user.email, pass: user.password },
    logger: false,
    // Fail fast if IMAP is disabled or credentials are wrong
    socketTimeout: 30000,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Build a set for O(1) lookups (lowercased)
      const target = new Set(recipientEmails.map(e => String(e).toLowerCase()));

      // Search INBOX for all messages since the given date.
      // Gmail returns the "All Mail" via [Gmail]/All Mail — we check INBOX
      // because replies land there. If user has filters routing replies
      // to labels, we'd need to also scan All Mail. For now: INBOX only.
      const searchCriteria = since ? { since } : { all: true };
      const uids = await client.search(searchCriteria, { uid: true });
      if (!uids || uids.length === 0) return replied;

      // Fetch envelope only (cheap — no body)
      for await (const msg of client.fetch(uids, { envelope: true, uid: true }, { uid: true })) {
        const env = msg.envelope;
        if (!env || !env.from || env.from.length === 0) continue;
        const fromAddr = String(env.from[0].address || '').toLowerCase();
        if (!fromAddr) continue;
        if (target.has(fromAddr)) {
          const when = env.date ? new Date(env.date) : new Date();
          // Keep the earliest reply date
          const existing = replied.get(fromAddr);
          if (!existing || when < existing) replied.set(fromAddr, when);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch (_) {}
  }

  return replied;
}

module.exports = { checkReplies };
