import { Note } from '../models/note.js';
import createHttpError from 'http-errors';

export const getAllNotes = async (req, res) => {
  const { page = 1, perPage = 10, tag, search } = req.query;
  const skip = (page - 1) * perPage;

  // Базовий запит тільки для поточного користувача
  const notesQuery = Note.find({ userId: req.user._id });

  // Фільтрація за тегом
  if (tag) {
    notesQuery.where('tag').equals(tag);
  }

  // Пошук за заголовком або вмістом
  if (search) {
    const searchText = search.trim();
    notesQuery.where({
      $or: [
        { title: { $regex: searchText, $options: 'i' } },
        { content: { $regex: searchText, $options: 'i' } },
      ],
    });
  }
  console.log('Query params:', req.query);
  console.log('MongoDB filter:', notesQuery.getFilter());

  const [totalNotes, notes] = await Promise.all([
    notesQuery.clone().countDocuments(),
    notesQuery.skip(skip).limit(perPage),
  ]);

  const totalPages = Math.ceil(totalNotes / perPage);

  res.status(200).json({
    page,
    perPage,
    totalNotes,
    totalPages,
    notes,
  });
};

export const getNoteById = async (req, res) => {
  const { noteId } = req.params;
  const note = await Note.findOne({
    _id: noteId,
    userId: req.user._id,
  });

  if (!note) {
    throw createHttpError(404, 'Note not found');
  }

  res.status(200).json(note);
};

export const createNote = async (req, res) => {
  const note = await Note.create({
    ...req.body,
    userId: req.user._id,
  });

  res.status(201).json(note);
};

export const deleteNote = async (req, res) => {
  const { noteId } = req.params;
  const note = await Note.findOneAndDelete({
    _id: noteId,
    userId: req.user._id,
  });

  if (!note) {
    throw createHttpError(404, 'Note not found');
  }

  res.status(200).json(note);
};

export const updateNote = async (req, res) => {
  const { noteId } = req.params;
  const note = await Note.findOneAndUpdate(
    { _id: noteId, userId: req.user._id },
    req.body,
    {
      returnDocument: 'after',
      runValidators: true,
    },
  );

  if (!note) {
    throw createHttpError(404, 'Note not found');
  }

  res.status(200).json(note);
};
