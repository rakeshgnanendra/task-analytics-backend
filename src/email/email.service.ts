import { Injectable } from "@nestjs/common";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailService {
  private transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false, // TLS
    // This forces Node to use IPv4 and avoid the ENETUNREACH IPv6 error
    family: 4, 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // Useful for debugging connection issues in logs
    debug: true,
    logger: true,
  });

  async sendMail(to: string, subject: string, text: string) {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: ["rakeshgnanendra@gmail.com"], // Note: 'to' argument is ignored here per your original code
        subject,
        text,
      });

      console.log("Email sent successfully");
    } catch (error) {
      console.error("Email error:", error);
      // Check if error.code is 'EACCES' or 'ETIMEDOUT' - this confirms a Render firewall block
    }
  }
}