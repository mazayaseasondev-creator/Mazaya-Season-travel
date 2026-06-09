import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  isProd,
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-jwt-secret',
  otpSecret: process.env.OTP_SECRET || 'dev-insecure-otp-secret',
  otpTtlMinutes: parseInt(process.env.OTP_TTL_MINUTES || '5', 10),
  otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10),
  sessionTtlDays: parseInt(process.env.SESSION_TTL_DAYS || '30', 10),
  // In development we return the OTP in the response so the flow can be tested
  // without a real SMS/email provider. Never expose it in production.
  exposeOtp: !isProd && process.env.EXPOSE_OTP !== 'false',
};

if (isProd && (config.jwtSecret.startsWith('dev-') || config.otpSecret.startsWith('dev-'))) {
  throw new Error('Refusing to start in production with default secrets. Set JWT_SECRET and OTP_SECRET.');
}
