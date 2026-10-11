import bcrypt from 'bcrypt';
import createHttpError from 'http-errors';
import { isValidObjectId } from 'mongoose';

import jwt from 'jsonwebtoken';
import Handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import { sendEmail } from '../utils/sendMail.js';

import { User } from '../models/user.js';
import { Session } from '../models/session.js';
import { createSession, setSessionCookies } from '../services/auth.js';

export const registerUser = async (req, res) => {
  const { email, password } = req.body;

  // Перевіряємо, чи існує користувач
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    throw createHttpError(400, 'Email in use');
  }

  // Хешуємо пароль
  const hashedPassword = await bcrypt.hash(password, 10);

  // Створюємо користувача
  const user = await User.create({
    email,
    password: hashedPassword,
  });

  // Створюємо сесію
  const session = await createSession(user._id);

  // Встановлюємо cookies
  setSessionCookies(res, session);

  res.status(201).json(user);
};

export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  // Шукаємо користувача за email
  const user = await User.findOne({ email });

  if (!user) {
    throw createHttpError(401, 'Invalid credentials');
  }

  // Перевіряємо пароль
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw createHttpError(401, 'Invalid credentials');
  }

  // Видаляємо попередні сесії користувача
  await Session.deleteMany({ userId: user._id });

  // Створюємо нову сесію
  const session = await createSession(user._id);

  // Встановлюємо cookies
  setSessionCookies(res, session);

  res.status(200).json(user);
};

export const refreshUserSession = async (req, res) => {
  const { sessionId, refreshToken } = req.cookies ?? {};

  if (!sessionId || !isValidObjectId(sessionId) || !refreshToken) {
    throw createHttpError(401, 'Session not found');
  }

  const session = await Session.findOne({
    _id: sessionId,
    refreshToken,
  });

  if (!session) {
    throw createHttpError(401, 'Session not found');
  }

  // Якщо refresh-токен прострочений
  if (session.refreshTokenValidUntil <= new Date()) {
    await Session.deleteOne({ _id: session._id });

    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    };

    res.clearCookie('sessionId', cookieOptions);
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    throw createHttpError(401, 'Session token expired');
  }

  // Видаляємо стару сесію
  await Session.deleteOne({ _id: session._id });

  // Створюємо нову сесію
  const newSession = await createSession(session.userId);

  // Встановлюємо нові cookies
  setSessionCookies(res, newSession);

  res.status(200).json({
    message: 'Session refreshed',
  });
};

export const logoutUser = async (req, res) => {
  const { sessionId } = req.cookies;

  if (sessionId && isValidObjectId(sessionId)) {
    await Session.deleteOne({ _id: sessionId });
  }

  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });

  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });

  res.clearCookie('sessionId', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
  });

  res.status(204).send();
};

export const requestResetEmail = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  const successMessage = {
    message: 'Password reset email sent successfully',
  };

  if (!user) {
    return res.status(200).json(successMessage);
  }

  const token = jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' },
  );

  const resetLink = `${process.env.FRONTEND_DOMAIN.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

  const template = await readFile(
    new URL('../templates/reset-password-email.html', import.meta.url),
    'utf8',
  );

  const html = Handlebars.compile(template)({
    username: user.username || user.email,
    resetLink,
  });

  try {
    await sendEmail({
      from: process.env.SMTP_FROM,
      to: user.email,
      subject: 'Reset your password',
      html,
    });
  } catch (error) {
    console.error('SMTP error:', {
      code: error.code,
      command: error.command,
      message: error.message,
    });

    throw createHttpError(
      500,
      'Failed to send the email, please try again later.',
    );
  }

  res.status(200).json(successMessage);
};

export const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw createHttpError(401, 'Invalid or expired token');
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    typeof payload.sub !== 'string' ||
    typeof payload.email !== 'string' ||
    !isValidObjectId(payload.sub)
  ) {
    throw createHttpError(401, 'Invalid or expired token');
  }

  const user = await User.findOne({
    _id: payload.sub,
    email: payload.email,
  });

  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  user.password = hashedPassword;
  await user.save();

  // Invalidates existing authenticated sessions
  await Session.deleteMany({ userId: user._id });

  res.status(200).json({
    message: 'Password reset successfully',
  });
};
