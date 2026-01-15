import crypto from 'crypto';

/**
 * Generate a 6-digit OTP code
 */
export function generateOtp(): string {
  // Generate a random 6-digit number
  const otp = crypto.randomInt(100000, 999999).toString();
  return otp;
}

/**
 * Generate a more secure OTP (alphanumeric, 8 characters)
 */
export function generateSecureOtp(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let otp = '';
  for (let i = 0; i < 8; i++) {
    otp += chars[crypto.randomInt(0, chars.length)];
  }
  return otp;
}
