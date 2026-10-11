import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

/**
 * Sends an email via SMTP.
 * @param {{ from: string, to: string, subject: string, html: string }} options
 */
export const sendEmail = async (options) => {
  return transporter.sendMail(options);
};
