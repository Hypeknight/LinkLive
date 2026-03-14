import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import healthRoutes from './routes/health.js';
import livekitRoutes from './routes/livekit.js';
import adminRoutes from './routes/admin.js';

const app = express();
const port = process.env.PORT || 8787;

app.use(cors({
  origin: [process.env.FRONTEND_ORIGIN, 'http://localhost:8080'].filter(Boolean),
  credentials: true
}));
app.use(express.json());

app.use('/api', healthRoutes);
app.use('/api', livekitRoutes);
app.use('/api/admin', adminRoutes);

app.listen(port, () => {
  console.log(`Linkd'N V2 backend listening on http://localhost:${port}`);
});
