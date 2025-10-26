import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => res.send('ok'));

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});

