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

 async sendMail(
  to: string | string[],
  subject: string,
  html: string,
  cc?: string[]   // 👈 OPTIONAL
) {
  try {
    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: Array.isArray(to) ? to.join(",") : to,
      cc: cc?.length ? cc.join(",") : undefined, // 👈 ADD THIS
      subject,
      html,
    });

    console.log("Email sent via API!");
  } catch (error) {
    console.error("API Email error:", error);
  }
}
}