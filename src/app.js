const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const errorHandler = require("./middlewares/errorHandler")
const rateLimit = require("./middlewares/rateLimiter");
const cors = require("./middlewares/corsMiddleware");
const app = express();
const checkDatabase = require("./utils/dbHealth");
const { success } = require("./utils/response");
const { NODE_ENV } = require("./config/env");
const indexRoutes = require("./routes/index");
const path = require('path');
const cookieParser = require('./middlewares/cookieParserMiddleware');
const { setupSwagger } = require("./swagger");


// Middlewares
// Respect proxy headers (e.g., when behind Nginx/Heroku) so rate limiting uses client IP
app.set('trust proxy', 1);
app.use(cookieParser);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors); // ensure CORS headers are applied before any other middleware responses
app.use(helmet());
app.use(morgan("dev"));
app.use(rateLimit);
app.use('/api/v1/assets', express.static(path.join(__dirname, '..', "uploads")));
setupSwagger(app);

app.use("/api/v1", indexRoutes);

app.get('/health', async (req, res) => {
    const dbStatus = await checkDatabase();
    if (dbStatus.status === 'error') {
        return res.status(500).json({ success: false, message: 'Database connection failed', error: NODE_ENV === 'production' ? 'Internal Server Error' : dbStatus.error });
    }
    success(res, { status: dbStatus.status }, 'Database health check successful');

});

app.use(errorHandler);

module.exports = app;