const prisma = require('../config/prisma');
const { success } = require('../utils/response');
const Joi = require("joi");


const getUserTransactions = async (req, res, next) => {
    try {
        const { user_id } = req.params;

        const transactions = await prisma.transactions.findMany({
            where: { user_id },
            orderBy: { created_at: "desc" },
        });

        return success(res, transactions);
    } catch (err) {
        next(err);
    }
};

const getMyTransactions = async (req, res, next) => {
    try {
        const user_id = req.user.id;

        const transactions = await prisma.transactions.findMany({
            where: { user_id },
            orderBy: { created_at: "desc" },
        });

        return success(res, transactions);
    } catch (err) {
        next(err);
    }
};


const searchTransactions = async (req, res, next) => {
    try {
        const schema = Joi.object({
            user_id: Joi.string().uuid().optional(),
            admin_id: Joi.string().uuid().optional(),
            direction: Joi.string().valid("credit", "debit").optional(),
            reason: Joi.string().optional(),
            from_date: Joi.date().optional(),
            to_date: Joi.date().optional(),
            page: Joi.number().integer().min(1).default(1),
            limit: Joi.number().integer().min(1).max(100).default(10),
        });

        const {
            user_id,
            admin_id,
            direction,
            reason,
            from_date,
            to_date,
            page,
            limit,
        } = await schema.validateAsync(req.query);

        const where = {
            ...(user_id && { user_id }),
            ...(admin_id && { admin_id }),
            ...(direction && { direction }),
            ...(reason && { reason }),
            ...(from_date || to_date
                ? {
                    created_at: {
                        ...(from_date && { gte: new Date(from_date) }),
                        ...(to_date && { lte: new Date(to_date) }),
                    },
                }
                : {}),
        };

        const total = await prisma.transactions.count({ where });


        const transactions = await prisma.transactions.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { created_at: "desc" },
            include: {
                admin: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                first_name_ar: true,
                                last_name_ar: true,
                                full_name_en: true,
                                username: true,
                                email: true,
                            },
                        },
                    },
                },
                user: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                first_name_ar: true,
                                last_name_ar: true,
                                full_name_en: true,
                                username: true,
                                email: true,
                            },
                        },
                    },
                },
            },
        });

        // 5️⃣ Transform result for easier API consumption
        const formatted = transactions.map((t) => ({
            id: t.id,
            amount: t.amount,
            direction: t.direction,
            reason: t.reason,
            description: t.description,
            payment_method: t.payment_method,
            created_at: t.created_at,
            user_id: t.user_id,
            admin_id: t.admin_id,
            user_name: t.user?.user
                ? `${t.user.user.first_name_ar} ${t.user.user.last_name_ar}`
                : null,
            admin_name: t.admin?.user
                ? `${t.admin.user.first_name_ar} ${t.admin.user.last_name_ar}`
                : null,
            user_email: t.user?.user?.email || null,
            admin_email: t.admin?.user?.email || null,
        }));

        // 6️⃣ Return paginated response
        return success(res, {
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
            data: formatted,
        });
    } catch (err) {
        next(err);
    }
};



module.exports = {
    getUserTransactions,
    getMyTransactions,
    searchTransactions,
};



