import { Injectable } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER, // company email
      pass: process.env.EMAIL_PASS, // password or app password
    },
  });

  async sendMail(to: string, subject: string, text: string) {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_USER, // ✅ must match SMTP user
        to:["rakeshgnanendra@gmail.com"],
        subject,
        text,
      });

      console.log("Email sent to:", to);
    } catch (error) {
      console.error("Email error:", error);
    }
  }
}