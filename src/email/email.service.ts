import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  async sendMail(to: string, subject: string, text: string) {
    try {
      await this.resend.emails.send({
        from: 'Task Analytics <no-reply@digitalpersonas.com>', // default (works immediately)
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