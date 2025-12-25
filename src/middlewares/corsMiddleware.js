const { NODE_ENV, CLIENT_URL } = require('../config/env');
const cors = require("cors");

const additionalOrigins = [
    'https://bareq-frontend-test-ab4z-mzaq9tfxh-majdis-projects-3748a949.vercel.app',
    'https://bareq-frontend-test-ab4z-git-main-majdis-projects-3748a949.vercel.app',
    'https://bareq-frontend-test-fyjis5igy-majdis-projects-3748a949.vercel.app'
];

const whitelist = new Set(additionalOrigins.filter(Boolean));
if (CLIENT_URL) whitelist.add(CLIENT_URL);

const corsOptions = {
    origin: (origin, callback) => {
        // allow server-to-server requests or tools like Postman (no origin)
        if (!origin) return callback(null, true);
        if (whitelist.has(origin)) return callback(null, true);
        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

module.exports = cors(corsOptions);