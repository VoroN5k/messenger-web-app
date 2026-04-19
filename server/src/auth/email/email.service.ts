import { Injectable } from '@nestjs/common';
import { MailerService } from "@nestjs-modules/mailer";

@Injectable()
export class EmailService {
    constructor(private readonly mailer: MailerService) {}

    async sendVerificationEmail(email: string, token: string) {
        const verificationLink = `https://09d065b6e3bc99ab-82-60-63-84.serveousercontent.com/api/auth/verify-email?token=${token}`

        await this.mailer.sendMail({
            to: email,
            subject: 'Verify Your Email',
            html: `
                <p>Click the link below to verify your email:</p>
                <a href="${verificationLink}">Verify Email</a>
            `,
        });
    }

    async sendPasswordResetEmail(email: string, token: string) {
        const resetLink = `http://localhost:3000/auth/reset-password?token=${token}`;

        await this.mailer.sendMail({
            to: email,
            subject: 'Reset Password',
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #1e293b;">Відновлення паролю</h2>
                    <p style="color: #475569;">
                        Ми отримали запит на скидання паролю для вашого акаунту.
                        Натисніть кнопку нижче, щоб встановити новий пароль.
                    </p>
                    <a href="${resetLink}"
                       style="display:inline-block;margin:16px 0;padding:12px 28px;
                              background:#7c3aed;color:#fff;border-radius:8px;
                              text-decoration:none;font-weight:600;">
                        Скинути пароль
                    </a>
                    <p style="color:#94a3b8;font-size:13px;">
                        Посилання дійсне 1 годину. Якщо ви не робили цього запиту — просто ігноруйте цей лист.
                    </p>
                </div>
            `,
        });
    }
}