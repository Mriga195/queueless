const nodemailer = require('nodemailer');

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;
    this.firstName = user.name.split(' ')[0];
    this.url = url;
    this.from = `QueueLess <${process.env.EMAIL_FROM}>`;
  }

  newTransport() {
    if (process.env.NODE_ENV === 'production') {
      return nodemailer.createTransport({
        service: 'SendGrid',
        auth: {
          user: process.env.SENDGRID_USERNAME,
          pass: process.env.SENDGRID_PASSWORD
        }
      });
    }

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
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      text: `Hi ${this.firstName},\n\n${text}\n\nThe QueueLess team`
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
