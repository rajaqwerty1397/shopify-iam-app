import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { createModuleLogger } from '../lib/logger.js';

const logger = createModuleLogger('EmailService');

/**
 * Email Service
 * Handles sending emails via SendGrid SMTP
 */
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Create transporter using SendGrid SMTP configuration
    // SendGrid uses port 2525 (non-SSL) or 465 (SSL)
    const isSecure = config.email.port === 465 || config.email.encryption === 'ssl' || config.email.encryption === 'tls';
    
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: isSecure, // true for SSL (465), false for STARTTLS (2525, 587)
      auth: {
        user: config.email.username,
        pass: config.email.password,
      },
      tls: {
        rejectUnauthorized: false, // For development/testing
        ciphers: 'SSLv3', // For older servers
      },
      requireTLS: config.email.encryption === 'tls' && !isSecure, // Require TLS for STARTTLS
    });

    // Verify connection
    this.transporter.verify((error) => {
      if (error) {
        logger.error({ error }, 'Email service connection failed');
      } else {
        logger.info('Email service ready');
      }
    });
  }

  /**
   * Send account activation email
   */
  async sendAccountActivationEmail(
    email: string,
    activationUrl: string,
    storeName: string,
    returnTo?: string
  ): Promise<void> {
    const finalUrl = returnTo 
      ? `${activationUrl}${activationUrl.includes('?') ? '&' : '?'}return_to=${encodeURIComponent(returnTo)}`
      : activationUrl;

    const mailOptions = {
      from: {
        name: config.email.fromName,
        address: config.email.fromAddress,
      },
      to: email,
      subject: `Activate Your ${storeName} Account`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activate Your Account</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to ${storeName}!</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <p style="font-size: 16px; margin-bottom: 24px;">
      Thank you for signing up! To complete your account setup, please click the button below to activate your account.
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <a href="${finalUrl}" 
         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Activate Account
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${finalUrl}" style="color: #667eea; word-break: break-all;">${finalUrl}</a>
    </p>
    
    <p style="font-size: 12px; color: #999; margin-top: 24px;">
      This activation link will expire in 30 days. If you didn't create an account, you can safely ignore this email.
    </p>
  </div>
  <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
    <p>This email was sent by ${config.email.fromName}</p>
  </div>
</body>
</html>
      `,
      text: `
Welcome to ${storeName}!

Thank you for signing up! To complete your account setup, please click the link below to activate your account:

${finalUrl}

This activation link will expire in 30 days. If you didn't create an account, you can safely ignore this email.

This email was sent by ${config.email.fromName}
      `,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info({ 
        email, 
        messageId: info.messageId,
        storeName 
      }, 'Account activation email sent');
    } catch (error) {
      logger.error({ error, email, storeName }, 'Failed to send account activation email');
      throw error;
    }
  }

  /**
   * Send OTP verification email
   */
  async sendOtpEmail(
    email: string,
    otp: string,
    storeName: string
  ): Promise<void> {
    const mailOptions = {
      from: {
        name: config.email.fromName,
        address: config.email.fromAddress,
      },
      to: email,
      subject: `Your ${storeName} Login Code`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Login Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Your Login Code</h1>
  </div>
  <div style="background: #ffffff; padding: 40px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <p style="font-size: 16px; margin-bottom: 24px;">
      You're signing in to <strong>${storeName}</strong>. Use this code to complete your login:
    </p>
    
    <div style="text-align: center; margin: 32px 0;">
      <div style="display: inline-block; background: #f5f5f5; border: 2px dashed #667eea; border-radius: 12px; padding: 24px 40px;">
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #667eea; font-family: 'Courier New', monospace;">
          ${otp}
        </div>
      </div>
    </div>
    
    <p style="font-size: 14px; color: #666; margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee;">
      Enter this code on the login page to complete your sign-in. This code will expire in 10 minutes.
    </p>
    
    <p style="font-size: 12px; color: #999; margin-top: 24px;">
      If you didn't request this code, you can safely ignore this email. Your account remains secure.
    </p>
  </div>
  <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
    <p>This email was sent by ${config.email.fromName}</p>
  </div>
</body>
</html>
      `,
      text: `
Your Login Code for ${storeName}

You're signing in to ${storeName}. Use this code to complete your login:

${otp}

Enter this code on the login page to complete your sign-in. This code will expire in 10 minutes.

If you didn't request this code, you can safely ignore this email. Your account remains secure.

This email was sent by ${config.email.fromName}
      `,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info({ 
        email, 
        messageId: info.messageId,
        storeName,
        otpLength: otp.length
      }, 'OTP email sent');
    } catch (error) {
      logger.error({ error, email, storeName }, 'Failed to send OTP email');
      throw error;
    }
  }
}

// Singleton instance
export const emailService = new EmailService();
