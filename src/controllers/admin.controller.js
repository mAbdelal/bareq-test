const prisma = require('../config/prisma');
const { NotFoundError, BadRequestError, ForbiddenError, UnauthorizedError } = require('../utils/errors');
const { success } = require('../utils/response');
const path = require("path");
const fs = require("fs");


const getAllAdmins = async (req, res, next) => {
    try {
        const admins = await prisma.admins.findMany({
            include: {
                user: true,
                role: true
            },
            orderBy: {
                created_at: 'desc'
            }
        });

        return success(res, admins);
    } catch (err) {
        next(err);
    }
};

const getAdminById = async (req, res, next) => {
    try {
        const { id } = req.params;

        const admin = await prisma.admins.findUnique({
            where: { user_id: id },
            include: {
                user: true,
                role: true
            }
        });

        if (!admin) throw new NotFoundError('Admin not found');

        return success(res, admin);
    } catch (err) {
        next(err);
    }
};

const updateAdminRole = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { newRoleId } = req.body;

        const admin = await prisma.admins.findUnique({
            where: { user_id: id }
        });

        if (!admin) throw new NotFoundError('Admin not found');

        // Fetch the role being assigned
        const targetRole = await prisma.roles.findUnique({
            where: { id: Number.parseInt(newRoleId) }
        });

        if (!targetRole) {
            throw new NotFoundError('Target role not found');
        }

        // Prevent changing any admin *to* SuperAdmin
        if (targetRole.name === 'SuperAdmin') {
            throw new ForbiddenError('You cannot assign the SuperAdmin role to anyone');
        }

        const updatedAdmin = await prisma.admins.update({
            where: { user_id: id },
            data: {
                role_id: Number.parseInt(newRoleId),
                updated_at: new Date()
            },
            include: {
                role: true
            }
        });

        return success(res, updatedAdmin, 'Admin role updated successfully');
    } catch (err) {
        next(err);
    }
};


const softDeleteAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;

        const adminExists = await prisma.admins.findUnique({
            where: { user_id: id },
            select: { user_id: true }
        });

        if (!adminExists) {
            throw new NotFoundError('Admin not found');
        }

        await prisma.users.update({
            where: { id },
            data: {
                is_active: false,
                updated_at: new Date()
            }
        });

        return success(res, null, 'Admin deactivated successfully');
    } catch (err) {
        next(err);
    }
};

const activateAdmin = async (req, res, next) => {
    try {
        const { id } = req.params;

        const admin = await prisma.admins.findUnique({
            where: { user_id: id },
            select: {
                user: {
                    select: {
                        is_active: true
                    }
                }
            }
        });

        if (!admin) {
            throw new NotFoundError('Admin not found');
        }

        if (admin.user?.is_active) {
            return success(res, null, 'Admin is already active');
        }

        await prisma.users.update({
            where: { id },
            data: {
                is_active: true,
                updated_at: new Date()
            }
        });

        return success(res, null, 'Admin activated successfully');
    } catch (err) {
        next(err);
    }
};

const updateAdminUserInfo = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { username, first_name_ar, last_name_ar, full_name_en } = req.body;

        const user = await prisma.users.findUnique({
            where: { id },
            include: {
                admin: true
            }
        });

        if (!user) {
            throw new NotFoundError('User not found');
        }

        // Ensure user is an admin
        if (!user.admin) {
            throw new ForbiddenError('Only admin users can be updated with this controller');
        }

        // Check if username is being changed and is unique
        if (username && username !== user.username) {
            const existingUserWithUsername = await prisma.users.findUnique({
                where: { username }
            });

            if (existingUserWithUsername) {
                throw new BadRequestError('Username is already taken');
            }
        }

        const updated = await prisma.users.update({
            where: { id },
            data: {
                ...(username && { username }),
                ...(first_name_ar && { first_name_ar }),
                ...(last_name_ar && { last_name_ar }),
                ...(full_name_en && { full_name_en }),
                updated_at: new Date()
            }
        });

        return success(res, updated, 'Admin user info updated successfully');
    } catch (error) {
        next(error);
    }
};

const getAdminProfile = async (req, res, next) => {
    try {
        const userId = req.user?.id;

        const admin = await prisma.admins.findUnique({
            where: { user_id: userId },
            include: { user: true, role: true }
        });

        if (!admin) throw new NotFoundError('Admin not found');

        return success(res, admin);
    } catch (err) {
        next(err);
    }
};

const searchAdmins = async (req, res, next) => {
    try {
        const {
            name,
            email,
            role,
            is_active,
            page = 1,
            limit = 10
        } = req.query;

        const userFilters = {};

        if (name) {
            userFilters.OR = [
                { first_name_ar: { contains: name, mode: 'insensitive' } },
                { last_name_ar: { contains: name, mode: 'insensitive' } },
                { full_name_en: { contains: name, mode: 'insensitive' } }
            ];
        }

        // Email search
        if (email) userFilters.email = { contains: email, mode: 'insensitive' };

        if (is_active !== undefined) userFilters.is_active = is_active === 'true';

        const where = {
            ...(Object.keys(userFilters).length > 0 && { user: userFilters }),
            ...(role && { role: { name: role } })
        };

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [admins, total] = await Promise.all([
            prisma.admins.findMany({
                where,
                include: {
                    user: {
                        select: {
                            id: true,
                            first_name_ar: true,
                            last_name_ar: true,
                            full_name_en: true,
                            email: true,
                            is_active: true,
                            avatar: true
                        }
                    },
                    role: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                skip,
                take,
                orderBy: { created_at: 'desc' }
            }),
            prisma.admins.count({ where })
        ]);

        const result = {
            data: admins,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        };

        return success(res, result, 'Admins fetched successfully');
    } catch (err) {
        next(err);
    }
};



const getAdminStats = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user.role) {
            throw new UnauthorizedError("you are not an admin");
        }
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const [disputesCount, newComplaints, transactionsToday, activeUsers] = await Promise.all([
            prisma.disputes.count(),
            prisma.disputes.count({
                where: {
                    created_at: { gte: startOfToday }
                }
            }),
            prisma.transactions.count({
                where: {
                    created_at: { gte: startOfToday }
                }
            }),
            prisma.users.count({ where: { is_active: true } })
        ]);

        const stats = { disputesCount, newComplaints, transactionsToday, activeUsers };

        return success(res, stats);
    } catch (err) {
        next(err);
    }
};


const updateAdminAvatar = async (req, res, next) => {
    try {
        const id = req.user.id;
        if (!req.file) {
            throw new ForbiddenError('No file uploaded');
        }

        // Check if admin exists
        const admin = await prisma.admins.findUnique({
            where: { user_id: id },
            include: { user: true }
        });
        if (!admin) {
            throw new NotFoundError('Admin not found');
        }

        // Optional: delete previous avatar file from server
        if (admin.user.avatar) {
            const oldPath = path.join(__dirname, '..', '..', 'uploads', admin.user.avatar);
            if (fs.existsSync(oldPath)) {
                fs.unlink(oldPath, (err) => { if (err) console.error('Failed to delete old avatar', err); });
            }
        }

        // Save new avatar path in DB (store relative path)
        await prisma.users.update({
            where: { id },
            data: {
                avatar: req.file.filename,
                updated_at: new Date()
            }
        });


        return success(res, { url: req.file.filename });
    } catch (err) {
        next(err);
    }
};



module.exports = {
    getAllAdmins,
    getAdminById,
    updateAdminRole,
    softDeleteAdmin,
    updateAdminUserInfo,
    activateAdmin,
    getAdminProfile,
    searchAdmins,
    getAdminStats,
    updateAdminAvatar
};
