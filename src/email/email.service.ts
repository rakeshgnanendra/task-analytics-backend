import { Injectable } from "@nestjs/common";
import * as nodemailer from "nodemailer";
const BrevoTransport = require("nodemailer-brevo-transport"); // CommonJS require if needed

@Injectable()
export class EmailService {
  private transporter = nodemailer.createTransport(
    new BrevoTransport({
      apiKey: process.env.BREVO_API_KEY, // Get this from Brevo Dashboard
    })
  );

  async sendMail(to: string, subject: string, text: string) {
    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM, // Must be a verified sender in Brevo
        to: to, 
        subject: subject,
        text: text,
      });
      console.log("Email sent via API!");
    } catch (error) {
      console.error("API Email error:", error);
    }
  }
}