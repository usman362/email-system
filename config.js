// PORT / BASE_URL: cPanel ya VPS par env se set karo (see README)
module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  // Public URL — email tracking pixel ke liye zaroori (https://yourdomain.com)
  BASE_URL: process.env.BASE_URL || 'https://rugs-money-hand-hardcover.trycloudflare.com',
  // Gmail SMTP — bahut shared hosts outbound 465 block karti hain; 587 zyada safe
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
  // How many days between follow-ups
  FOLLOWUP_INTERVAL_DAYS: 5,
  // Max daily emails per account
  DAILY_LIMIT: 60,
  // Seconds between emails in a campaign
  EMAIL_DELAY_SECONDS: 45,
};
