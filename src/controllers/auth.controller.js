const prisma = require('../config/prisma');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { hashPassword, comparePasswords, isValidEmail, isStrongPassword } = require('../utils/auth');
const { UnauthorizedError, BadRequestError, NotFoundError } = require('../utils/errors');
const { success } = require('../utils/response');
const crypto = require('crypto');
const { RESET_TOKEN_EXPIRES_IN, FRONTEND_URL, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, NODE_ENV } = require('../config/env');
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
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            throw new BadRequestError('بيانات التسجيل غير صحيحة');
        }

        // Find user by email or username
        const user = await prisma.users.findFirst({
            where: {
                is_active: true,
                OR: [
                    { email: identifier },
                    { username: identifier }
                ]
            },
            include: {
                admin: {
                    include: { role: true },
                },
            },
        });

        if (!user) throw new UnauthorizedError('البريد الالكتروني او كلمة المرور غير صحيحة');

        // Compare password
        const valid = await comparePasswords(password, user.password_hash);
        if (!valid) throw new UnauthorizedError('البريد الالكتروني او كلمة المرور غير صحيحة');
        if (!user.is_active) throw new UnauthorizedError('الحساب غير مفعل');

        const role = user.admin?.role?.name || null;

        const payload = {
            id: user.id,
            role,
            first_name_ar: user.first_name_ar,
            last_name_ar: user.last_name_ar,
            avatar: user.avatar,
        };

        // Sign tokens
        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        // Set cookies
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

        // Optional user payload cookie for frontend
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
            throw new BadRequestError('البريد الإلكتروني غير صالح');
        }

        const user = await prisma.users.findUnique({ where: { email } });
        if (!user) {
            throw new NotFoundError('المستخدم غير موجود');
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
        if (!isStrongPassword(password))
            throw new BadRequestError('كلمة المرور ضعيفة: يجب أن تتكون من 8 أحرف على الأقل وتحتوي على أحرف وأرقام');


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
        if (!isStrongPassword(password))
            throw new BadRequestError('كلمة المرور ضعيفة: يجب أن تتكون من 8 أحرف على الأقل وتحتوي على أحرف وأرقام');


        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) throw new UnauthorizedError('User not found');

        const valid = await comparePasswords(oldPassword, user.password_hash);
        if (!valid) throw new UnauthorizedError('كلمة المرور القديمة غير صحيحة');


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
            throw new BadRequestError('يجب أن يتكون اسم المستخدم من 3 أحرف على الأقل');

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
                password: Joi.string()
                    .min(8)
                    .regex(/[a-zA-Z\u0600-\u06FF]/, 'أحرف') 
                    .regex(/[0-9]/, 'أرقام')                
                    .required()
                    .messages({
                        'string.base': 'يجب أن تكون كلمة المرور نصًا',
                        'string.empty': 'كلمة المرور لا يمكن أن تكون فارغة',
                        'string.min': 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل',
                        'string.pattern.name': 'يجب أن تحتوي كلمة المرور على حرف واحد على الاقل ',
                        'any.required': 'كلمة المرور مطلوبة'
                    }),

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

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const googleLogin = async (req, res, next) => {
    try {
        const { token } = req.body; // token from frontend
        if (!token) throw new BadRequestError('Google token is required');

        // Verify Google token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        if (!email) throw new BadRequestError('Google account email not found');

        // Check if user exists
        let user = await prisma.users.findUnique({
            where: { email },
            include: { academicUser: true, admin: { include: { role: true } } },
        });

        let isNewUser = false;

        if (!user) {
            // Register as academic user if not found
            isNewUser = true;

            await prisma.$transaction(async (tx) => {
                user = await tx.users.create({
                    data: {
                        email,
                        username: email.split('@')[0], // fallback username from email
                        password_hash: '', // empty because Google login
                        first_name_ar: name.split(' ')[0] || '',
                        last_name_ar: name.split(' ')[1] || '',
                        full_name_en: name || '',
                        avatar: picture,
                        googleId,
                        is_active: true,
                    },
                });

                await tx.academicUsers.create({
                    data: {
                        user_id: user.id,
                        academic_status: 'other', // default status
                    },
                });

                await tx.userBalances.create({
                    data: {
                        user_id: user.id,
                        balance: 0,
                        frozen_balance: 0,
                    },
                });
            });
        } else {
            // If user exists but no googleId, link it
            if (!user.googleId) {
                user = await prisma.users.update({
                    where: { id: user.id },
                    data: { googleId },
                });
            }

            if (!user.is_active) throw new UnauthorizedError('الحساب غير مفعل');
        }

        // Optional: get role if user is admin
        const role = user.admin?.role?.name || null;

        const userPayload = {
            id: user.id,
            role,
            first_name_ar: user.first_name_ar,
            last_name_ar: user.last_name_ar,
            avatar: user.avatar,
        };

        // Create access & refresh tokens
        const accessToken = signAccessToken(userPayload);
        const refreshToken = signRefreshToken(userPayload);

        // Set cookies
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
        res.cookie('userPayload', JSON.stringify(userPayload), {
            httpOnly: false,
            secure: true,
            sameSite: 'none',
            maxAge: parseTimeToMilliseconds(JWT_REFRESH_EXPIRES_IN),
        });

        return success(
            res,
            { ...userPayload, isNewUser },
            isNewUser ? 'User registered and logged in via Google' : 'Google login successful'
        );
    } catch (err) {
        next(err);
    }
};


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
    googleLogin
};
