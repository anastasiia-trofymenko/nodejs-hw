import bcrypt from 'bcrypt';
import createHttpError from 'http-errors';

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
