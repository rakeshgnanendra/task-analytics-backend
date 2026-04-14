import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
 private transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // 🔥 IMPORTANT (use TLS, not SSL)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // optional safety
  },
});

  async sendMail(to: string, subject: string, text: string) {
    try {
      await this.transporter.sendMail({
        from: `"Task Analytics" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        text,
      });

      console.log("Email sent to:", to);
    } catch (error) {
      console.error("Email error:", error);
    }
  }
}