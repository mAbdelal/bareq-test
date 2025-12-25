const { NODE_ENV, CLIENT_URL } = require('../config/env');
const cors = require("cors");


const corsOptions = {
    origin: NODE_ENV === 'production'
        ? CLIENT_URL
        : 'https://bareq-frontend-test-ab4z-mzaq9tfxh-majdis-projects-3748a949.vercel.app',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};


module.exports = cors(corsOptions);