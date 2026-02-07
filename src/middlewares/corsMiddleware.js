const { NODE_ENV, CLIENT_URL } = require('../config/env');
const cors = require("cors");

const corsOptions = {
    origin: 'https://bareq-frontend-test.vercel.app', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, 
};

module.exports = cors(corsOptions);