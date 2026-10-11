import bcrypt from 'bcrypt';
import createHttpError from 'http-errors';
import { isValidObjectId } from 'mongoose';

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
