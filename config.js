// PORT / BASE_URL: cPanel ya VPS par env se set karo (see README)
module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  // Public URL — email tracking pixel ke liye zaroori (https://yourdomain.com)
  BASE_URL: process.env.BASE_URL || 'https://rugs-money-hand-hardcover.trycloudflare.com',
  // Gmail SMTP — port 465 (SSL) use karo agar hosting 587 block kare
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: Number(process.env.SMTP_PORT) || 465,
  // How many days between follow-ups
  FOLLOWUP_INTERVAL_DAYS: 5,
  // Max daily emails per account
  DAILY_LIMIT: 60,
  // Seconds between emails in a campaign
  EMAIL_DELAY_SECONDS: 45,
};
