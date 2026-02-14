const { NODE_ENV, CLIENT_URL } = require('../config/env');
const cors = require("cors");

const allowedOrigins = [
    'https://bareq-frontend-test.vercel.app', // Production
    'http://localhost:3000'                    // Local development
];

const corsOptions = {
    origin: function (origin, callback) {
        callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

module.exports = cors(corsOptions);
