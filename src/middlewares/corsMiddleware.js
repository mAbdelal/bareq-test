const { NODE_ENV, CLIENT_URL } = require('../config/env');
const cors = require("cors");

const allowedOrigins = [
    'https://bareq-frontend-test.vercel.app', // Production
    'http://localhost:3000'                    // Local development
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

module.exports = cors(corsOptions);
