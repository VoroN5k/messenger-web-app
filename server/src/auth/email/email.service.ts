import { Injectable } from '@nestjs/common';
import { MailerService } from "@nestjs-modules/mailer";

@Injectable()
export class EmailService {
    constructor(private readonly mailer: MailerService) {}

    async sendVerificationEmail(email: string, token: string) {
        const serverUrl = process.env.SERVER_URL ?? 'http://localhost:4000';
        const verificationLink = `${serverUrl}/api/auth/verify-email?token=${token}`;

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
        const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';
        const resetLink = `${clientUrl}/auth/reset-password?token=${token}`;

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

  async sendAdminReportNotification(adminEmail: string, data: {
    id: number; type: string; title: string;
    nickname: string; email: string; page: string;
  }) {
    const adminUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';
    await this.mailer.sendMail({
      to:      adminEmail,
      subject: `[Vesper Report #${data.id}] ${data.type}: ${data.title}`,
      html: `
      <div style="font-family:monospace;max-width:600px;margin:0 auto;
                  background:#09090f;color:#eeeef5;padding:32px;border-radius:12px">
        <h2 style="color:#9d77ff;margin:0 0 24px">
          🐛 New Report #${data.id}
        </h2>
        <table style="width:100%;border-collapse:collapse">
          ${[
        ['Type',     data.type],
        ['Title',    data.title],
        ['User',     `${data.nickname} &lt;${data.email}&gt;`],
        ['Page',     data.page],
      ].map(([k, v]) => `
            <tr>
              <td style="padding:8px 12px;color:#7c4dff;width:80px">${k}</td>
              <td style="padding:8px 12px;border-left:2px solid #7c4dff">${v}</td>
            </tr>
          `).join('')}
        </table>
        <a href="${adminUrl}/admin/reports"
           style="display:inline-block;margin-top:24px;padding:10px 24px;
                  background:#7c4dff;color:#fff;border-radius:8px;text-decoration:none">
          View in Admin Panel →
        </a>
      </div>
    `,
    });
  }
}