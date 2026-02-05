const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/authMiddleware');

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/refresh-token', authController.refreshToken);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/change-password', authenticate, authController.changePassword);
router.get('/username/:username', authController.checkUsernameAvailability);
router.post('/register/academic', authController.registerAcademicUser);
router.post('/register/admin', authController.registerAdminUser);

// Google OAuth routes
router.post('/google', authController.googleLogin);


module.exports = router;