import { Injectable } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import * as dns from "dns";

// ⚠️ FORCE IPv4: This fixes the ENETUNREACH IPv6 error on Render
// Requires Node.js v17+ (standard on Render)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

@Injectable()
export class EmailService {
  private transporter = nodemailer.createTransport({
    host: "smtp.office365.com",
    port: 587,
    secure: false, // uses STARTTLS
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      ciphers: "SSLv3",
      rejectUnauthorized: false, // Helps if Render IP is flagged
    },
    // Explicitly force IPv4 socket
    family: 4, 
  });

  async sendMail(to: string, subject: string, text: string) {
    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: to, // Use the dynamic 'to' argument, or hardcode if testing
        subject,
        text,
      });

      console.log("Email sent: %s", info.messageId);
    } catch (error) {
      console.error("Detailed Email Error:", error);
    }
  }
}
