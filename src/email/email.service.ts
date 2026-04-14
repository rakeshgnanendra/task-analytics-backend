import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
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