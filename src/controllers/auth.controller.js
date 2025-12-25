const prisma = require('../config/prisma');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { hashPassword, comparePasswords, isValidEmail, isStrongPassword } = require('../utils/auth');
const { UnauthorizedError, BadRequestError, NotFoundError } = require('../utils/errors');
const { success } = require('../utils/response');
const crypto = require('crypto');
const { RESET_TOKEN_EXPIRES_IN, FRONTEND_URL, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CLIENT_URL, NODE_ENV } = require('../config/env');
const { sendEmail } = require("../utils/email");
const Joi = require("joi");
const { OAuth2Client } = require('google-auth-library');


function parseTimeToMilliseconds(timeString) {
    const unit = timeString.slice(-1);
    const value = parseInt(timeString.slice(0, -1), 10);
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        default: throw new Error('Invalid time unit');
    }
}


async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        if (!isValidEmail(email) || !password) {
            throw new BadRequestError('Invalid credentials');
        }

        const user = await prisma.users.findUnique({
            where: { email, is_active: true },
            include: {
                admin: {
                    include: { role: true },
                },
            },
        });

        if (!user) throw new UnauthorizedError('البريد الالكتروني او كلمة المرو غير صحيحة');

        const valid = await comparePasswords(password, user.password_hash);
        if (!valid) throw new UnauthorizedError('البريد الالكتروني او كلمة المرو غير صحيحة');
        if (!user.is_active) throw new UnauthorizedError('الحساب غير مفعل');

        const role = user.admin?.role?.name || null;

        const payload = {
            id: user.id,
            role,
            first_name_ar: user.first_name_ar,
            last_name_ar: user.last_name_ar,
            avatar: user.avatar,
        };

        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: parseTimeToMilliseconds(JWT_ACCESS_EXPIRES_IN),
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: parseTimeToMilliseconds(JWT_REFRESH_EXPIRES_IN),
        });

        res.cookie('userPayload', JSON.stringify(payload), {
            httpOnly: false,
            secure: true,
            sameSite: 'none',
            maxAge: parseTimeToMilliseconds(JWT_REFRESH_EXPIRES_IN),
        });


        return success(res, payload, 'Login successful');
    } catch (err) {
        next(err);
    }
}

async function logout(req, res, next) {
    try {

        res.clearCookie('accessToken', {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'strict',
        });
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: NODE_ENV === 'production',
            sameSite: 'strict',
        });
        res.clearCookie('userPayload', {
            httpOnly: false,
            secure: NODE_ENV === 'production',
            sameSite: 'strict',
        });

        return success(res, null, 'تم تسجيل الخروج بنجاح');
    } catch (err) {
        next(err);
    }
}


// async function refreshToken(req, res, next) {
//     try {
//         const { refreshToken } = req.body;

//         if (!refreshToken) throw new BadRequestError('No refresh token provided');

//         const decoded = verifyRefreshToken(refreshToken);
//         if (!decoded?.id) throw new UnauthorizedError('Invalid refresh token');

//         const user = await prisma.users.findUnique({
//             where: { id: decoded.id },
//             include: {
//                 admin: {
//                     include: {
//                         role: true
//                     }
//                 }
//             }
//         });

//         if (!user) throw new UnauthorizedError('User not found');
//         if (!user.is_active) throw new UnauthorizedError('Account is inactive');

//         const role = user.admin?.role?.name || null;

//         const payload = {
//             id: user.id,
//             role,
//             first_name_ar: user.first_name_ar,
//             last_name_ar: user.last_name_ar,
//             avatar: user.username,
//         };

//         const newAccessToken = signAccessToken(payload);

//         return success(res, {
//             accessToken: newAccessToken,
//             user: payload
//         }, 'Token refreshed');
//     } catch (err) {
//         next(err);
//     }
// }

async function refreshToken(req, res, next) {
    try {
        const { refreshToken } = req.cookies;

        if (!refreshToken) throw new BadRequestError('No refresh token provided');

        const decoded = verifyRefreshToken(refreshToken);
        if (!decoded?.id) throw new UnauthorizedError('Invalid refresh token');

        const user = await prisma.users.findUnique({
            where: { id: decoded.id },
            include: {
                admin: {
                    include: { role: true },
                },
            },
        });

        if (!user) throw new UnauthorizedError('User not found');
        if (!user.is_active) throw new UnauthorizedError('Account is inactive');

        const role = user.admin?.role?.name || null;

        const payload = {
            id: user.id,
            role,
            first_name_ar: user.first_name_ar,
            last_name_ar: user.last_name_ar,
            avatar: user.avatar,
        };

        const newAccessToken = signAccessToken(payload);
        const newRefreshToken = signRefreshToken(payload);

        res.cookie('accessToken', newAccessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: parseTimeToMilliseconds(JWT_ACCESS_EXPIRES_IN),
        });
        res.cookie('refreshToken', newRefreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: parseTimeToMilliseconds(JWT_REFRESH_EXPIRES_IN),
        });

        res.cookie('userPayload', JSON.stringify(payload), {
            httpOnly: false,
            secure: true,
            sameSite: 'none',
            maxAge: parseTimeToMilliseconds(JWT_REFRESH_EXPIRES_IN),
        });

        return success(res, { user: payload }, 'Token refreshed');
    } catch (err) {
        next(err);
    }
}


async function forgotPassword(req, res, next) {
    try {
        const { email } = req.body;

        if (!isValidEmail(email)) {
            throw new BadRequestError('Invalid email');
        }

        const user = await prisma.users.findUnique({ where: { email } });
        if (!user) {
            throw new NotFoundError('User not found');
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
        const resetTokenExpires = new Date(Date.now() + parseTimeToMilliseconds(RESET_TOKEN_EXPIRES_IN));

        await prisma.users.update({
            where: { email },
            data: {
                reset_password_token: resetTokenHash,
                reset_password_expires: resetTokenExpires,
            },
        });

        const resetLink = `${FRONTEND_URL}/reset-password?token=${resetToken}`;

        if (NODE_ENV === 'production') {
            await sendEmail({
                to: email,
                subject: 'Password Reset',
                html: `<p>Click <a href="${resetLink}">here</a> to reset your password.</p>`,
            });
        } else {
            console.log(resetLink);
        }

        return success(res, {}, 'Password reset link sent');
    } catch (err) {
        next(err);
    }
}

async function resetPassword(req, res, next) {
    try {
        const { token, password } = req.body;
        if (!token) throw new BadRequestError('Invalid request');
        if (!isStrongPassword(password)) throw new BadRequestError('Weak password: it must be at least 8 characters long and contain letters and numbers');

        const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await prisma.users.findFirst({
            where: {
                reset_password_token: resetTokenHash,
                reset_password_expires: { gt: new Date() },
            },
        });

        if (!user) throw new UnauthorizedError('Invalid or expired token');

        const newPasswordHash = await hashPassword(password);

        await prisma.users.update({
            where: { id: user.id },
            data: {
                password_hash: newPasswordHash,
                reset_password_token: null,
                reset_password_expires: null,
            },
        });

        return success(res, {});
    } catch (err) {
        next(err);
    }
}

async function changePassword(req, res, next) {
    try {
        const userId = req.user.id;
        const { oldPassword, newPassword } = req.body;
        if (!isStrongPassword(newPassword)) throw new BadRequestError('Weak password: it must be at least 8 characters long and contain letters and numbers');

        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) throw new UnauthorizedError('User not found');

        const valid = await comparePasswords(oldPassword, user.password_hash);
        if (!valid) throw new UnauthorizedError('Old password incorrect');

        const newPasswordHash = await hashPassword(newPassword);

        await prisma.users.update({
            where: { id: userId },
            data: { password_hash: newPasswordHash },
        });

        return success(res, {}, 'Password changed successfully');
    } catch (err) {
        next(err);
    }
}

async function checkUsernameAvailability(req, res, next) {
    try {
        const { username } = req.params;

        if (!username || username.length < 3) {
            throw new BadRequestError('Username must be at least 3 characters long');
        }

        const existing = await prisma.users.findUnique({
            where: { username }
        });

        const isAvailable = !existing;

        return success(res, {
            username,
            isAvailable
        }, isAvailable ? 'Username is available' : 'Username is already taken');
    } catch (err) {
        next(err);
    }
}


function registerUser(type) {
    return async function handler(req, res, next) {
        try {
            if (!['academic', 'admin'].includes(type)) {
                throw new BadRequestError('Invalid registration type');
            }

            const baseSchema = Joi.object({
                email: Joi.string().email().required(),
                username: Joi.string().required(),
                password: Joi.string().min(8).regex(/[a-zA-Z]/).regex(/[0-9]/).required(),
                first_name_ar: Joi.string().allow('', null),
                last_name_ar: Joi.string().allow('', null),
                full_name_en: Joi.string().allow('', null),
                academicData: Joi.object().optional(),
                role_id: Joi.number().optional()
            });

            const {
                email,
                username,
                password,
                first_name_ar,
                last_name_ar,
                full_name_en,
                academicData,
                role_id
            } = await baseSchema.validateAsync(req.body, { abortEarly: false });

            const existingUser = await prisma.users.findFirst({
                where: {
                    OR: [{ email }, { username }]
                }
            });

            if (existingUser) {
                throw new BadRequestError('البريد الالكتروني او اسم المستخدم مستخدمين مسبقا');
            }

            const password_hash = await hashPassword(password);

            let user, academicUser, admin;

            if (type === 'academic') {
                const AcademicStatusEnum = [
                    'high_school_student',
                    'high_school_graduate',
                    'bachelor_student',
                    'bachelor',
                    'master_student',
                    'master',
                    'phd_candidate',
                    'phd',
                    'alumni',
                    'researcher',
                    'other'
                ];

                const academicSchema = Joi.object({
                    academic_status: Joi.string()
                        .valid(...AcademicStatusEnum)
                        .messages({
                            "any.only": "القيمة غير صالحة للحالة الأكاديمية",
                        }),

                });

                const validatedAcademicData = await academicSchema.validateAsync(academicData || {}, { abortEarly: false });

                await prisma.$transaction(async (tx) => {
                    user = await tx.users.create({
                        data: {
                            email,
                            username,
                            password_hash,
                            first_name_ar,
                            last_name_ar,
                            full_name_en,
                            is_active: true
                        }
                    });

                    academicUser = await tx.academicUsers.create({
                        data: {
                            user_id: user.id,
                            ...validatedAcademicData
                        }
                    });

                    await tx.userBalances.create({
                        data: {
                            user_id: user.id,
                            balance: 0,
                            frozen_balance: 0
                        }
                    });
                });

            } else if (type === 'admin') {
                if (!role_id) {
                    throw new BadRequestError('Missing admin role ID');
                }

                await prisma.$transaction(async (tx) => {
                    user = await tx.users.create({
                        data: {
                            email,
                            username,
                            password_hash,
                            first_name_ar,
                            last_name_ar,
                            full_name_en,
                            is_active: true
                        }
                    });

                    admin = await tx.admins.create({
                        data: {
                            user_id: user.id,
                            role_id
                        }
                    });
                });
            }

            return success(res, {
                user,
                ...(academicUser && { academicUser }),
                ...(admin && { admin })
            }, 'User registered successfully');
        } catch (err) {
            next(err);
        }
    };
}

async function initiateGoogleLogin(req, res, next) {
    try {
        const oauth2Client = new OAuth2Client(
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET,
            'http://localhost:8080/api/v1/auth/google/callback'
        );

        const scopes = [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email'
        ];

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            include_granted_scopes: true
        });

        res.redirect(url);
    } catch (err) {
        next(err);
    }
}

async function handleGoogleCallback(req, res, next) {
    try {
        const { code } = req.query;

        const oauth2Client = new OAuth2Client(
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET,
            'http://localhost:8080/api/v1/auth/google/callback'
        );

        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const oauth2 = new OAuth2Client();
        const ticket = await oauth2.verifyIdToken({
            idToken: tokens.id_token,
            audience: GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const { email, name, picture, given_name, family_name } = payload;

        let user = await prisma.users.findUnique({
            where: { email },
            include: {
                admin: {
                    include: { role: true },
                },
                academicUser: true
            },
        });

        // If user exists and is an admin, reject the login
        if (user?.admin) {
            throw new UnauthorizedError('Admins cannot login using Google');
        }

        if (!user) {
            // Generate a random username from email
            const baseUsername = email.split('@')[0];
            const randomSuffix = Math.random().toString(36).substring(2, 6);
            const username = `${baseUsername}_${randomSuffix}`;

            // Create new user with academic profile
            await prisma.$transaction(async (tx) => {
                user = await tx.users.create({
                    data: {
                        email,
                        username,
                        password_hash: await hashPassword(crypto.randomBytes(32).toString('hex')),
                        first_name_ar: given_name || name.split(' ')[0],
                        last_name_ar: family_name || name.split(' ').slice(1).join(' '),
                        full_name_en: name,
                        avatar: picture,
                        is_active: true
                    },
                    include: {
                        admin: {
                            include: { role: true },
                        },
                    },
                });

                // Create academic user profile
                await tx.academicUsers.create({
                    data: {
                        user_id: user.id,
                    }
                });

                // Create user balance
                await tx.userBalances.create({
                    data: {
                        user_id: user.id,
                        balance: 0,
                        frozen_balance: 0
                    }
                });
            });
        } else if (!user.academicUser) {
            // If user exists but doesn't have an academic profile, create one
            await prisma.$transaction(async (tx) => {
                await tx.academicUsers.create({
                    data: {
                        user_id: user.id,
                    }
                });

                await tx.userBalances.create({
                    data: {
                        user_id: user.id,
                        balance: 0,
                        frozen_balance: 0
                    }
                });
            });
        }

        const role = user.admin?.role?.name || null;
        const tokenPayload = {
            id: user.id,
            role,
            first_name_ar: user.first_name_ar,
            last_name_ar: user.last_name_ar,
            avatar: user.avatar,
        };

        const accessToken = signAccessToken(tokenPayload);
        const refreshToken = signRefreshToken(tokenPayload);

        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: parseTimeToMilliseconds(JWT_ACCESS_EXPIRES_IN),
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: parseTimeToMilliseconds(JWT_REFRESH_EXPIRES_IN),
        });

        res.cookie('userPayload', JSON.stringify(tokenPayload), {
            httpOnly: false,
            secure:true,
            sameSite: 'none',
            maxAge: parseTimeToMilliseconds(JWT_REFRESH_EXPIRES_IN),
        });

        res.redirect(`${CLIENT_URL}/home`);
    } catch (err) {
        next(err);
    }
}

module.exports = {
    login,
    logout,
    refreshToken,
    forgotPassword,
    resetPassword,
    changePassword,
    checkUsernameAvailability,
    registerAcademicUser: registerUser('academic'),
    registerAdminUser: registerUser('admin'),
    initiateGoogleLogin,
    handleGoogleCallback
};
