const rateLimit = require('express-rate-limit');
const { NODE_ENV } = require('../config/env');

// Paths that are safe to exempt from rate limiting (read-only endpoints)
const readHeavyPaths = [
    '/api/v1/academic-users',
    '/api/v1/notifications',
    '/api/v1/purchases',
    '/api/v1/requests/offers',
];

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    // Do not set to 0; v7 treats 0 as block-all. Use a generous ceiling in dev.
    max: NODE_ENV === 'production' ? 1000 : 100000,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later',
    // Skip CORS preflight and read-only/static endpoints
    skip: (req) => {
        if (req.method === 'OPTIONS') return true;
        if (req.method === 'GET') {
            return readHeavyPaths.some((path) => req.path.startsWith(path))
                || req.path.startsWith('/api/v1/assets')
                || req.path.startsWith('/assets'); // just in case static served differently
        }
        return false;
    },
});

module.exports = limiter;