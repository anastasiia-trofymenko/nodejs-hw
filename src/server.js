import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import cookieParser from 'cookie-parser';
import { errors } from 'celebrate';
import { connectMongoDB } from './db/connectMongoDB.js';
import { logger } from './middleware/logger.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';
import notesRoutes from './routes/notesRoutes.js';
import authRouter from './routes/authRoutes.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

//Middleware
app.use(logger);
app.use(express.json());
app.use(cors());
app.use(cookieParser());

//routes
app.use(notesRoutes);
app.use(authRouter);

//error handlers
app.use(notFoundHandler);
// обробка помилок від celebrate (валідація)
app.use(errors());
// глобальна обробка інших помилок
app.use(errorHandler);

// connection to MongoDB
await connectMongoDB();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
