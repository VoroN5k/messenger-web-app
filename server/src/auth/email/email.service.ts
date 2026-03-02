import { Injectable } from '@nestjs/common';
import { MailerService } from "@nestjs-modules/mailer";

@Injectable()
export class EmailService {
    constructor(private readonly mailer: MailerService) {}

    async sendVerificationEmail(email: string, token: string) {
        const verificationLink = `http://localhost:4000/api/auth/verify-email?token=${token}`

        await this.mailer.sendMail({
            to: email,
            subject: 'Verify Your Email',
            html: `
                <p>Click the link below to verify your email:</p>
                <a href="${verificationLink}">Verify Email</a>
            `,
        });
    }
}