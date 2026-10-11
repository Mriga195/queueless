const nodemailer = require('nodemailer');

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.name.split(' ')[0];
    this.url = url;
    this.from = `QueueLess <${process.env.EMAIL_FROM}>`;
  }

  // Render's free plan blocks SMTP, so production sends through Brevo's HTTP API
  async sendWithBrevo(subject, text) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: 'QueueLess', email: process.env.EMAIL_FROM },
        to: [{ email: this.to }],
        subject,
        textContent: text
      })
    });

    if (!res.ok) {
      throw new Error(`Brevo ${res.status}: ${await res.text()}`);
    }
  }

  newTransport() {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  async send(subject, text) {
    const body = `Hi ${this.firstName},\n\n${text}\n\nThe QueueLess team`;

    if (process.env.NODE_ENV === 'production') {
      return this.sendWithBrevo(subject, body);
    }

    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      text: body
    };

    await this.newTransport().sendMail(mailOptions);
  }

  async sendWelcome() {
    await this.send(
      'Welcome to QueueLess!',
      `You can now order canteen food ahead and skip the queue. See the menu: ${this.url}`
    );
  }

  async sendPasswordReset() {
    await this.send(
      'Your password reset token (valid for only 10 minutes)',
      `Forgot your password? Set a new one here: ${this.url}\nIf you didn't forget your password, please ignore this email!`
    );
  }

  async sendOrderConfirmation(order) {
    await this.send(
      'Your order is confirmed',
      `We got your order of ${order.totalAmount}. Your pickup code is ${order.pickupCode}.\nWe will email you when it is ready. Track it here: ${this.url}`
    );
  }

  async sendOrderReady(order) {
    await this.send(
      'Your order is ready!',
      `Your order is ready at the counter. Show your pickup code ${order.pickupCode} to collect it.`
    );
  }
};
