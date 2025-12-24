const express = require('express');
const router = express.Router();
const { addPermissionToRole, 
    removePermissionFromRole, 
    getPermissionsForRole,
    getAllRolesWithPermissions 
} = 
    require('../controllers/rolePermission.controller');

const { authenticate, authorize } = require('../middlewares/authMiddleware');

/**
 * @swagger
 * tags:
 *   - name: Role Permissions
 *     description: Endpoints for managing role permissions
 */

router.use(authenticate, authorize("manage_role_permissions"));

/**
 * @swagger
 * /role-permissions/assign:
 *   post:
 *     summary: Assign a permission to a role
 *     tags: [Role Permissions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               roleId:
 *                 type: string
 *               permissionId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Assigned
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/assign', addPermissionToRole);

/**
 * @swagger
 * /role-permissions/remove:
 *   post:
 *     summary: Remove a permission from a role
 *     tags: [Role Permissions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               roleId:
 *                 type: string
 *               permissionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Removed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/remove', removePermissionFromRole);

/**
 * @swagger
 * /role-permissions/role/{role_id}:
 *   get:
 *     summary: Get permissions assigned to a role
 *     tags: [Role Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/role/:role_id', getPermissionsForRole);


/**
 * @swagger
 * /roles:
 *   get:
 *     summary: Get all roles with their assigned permissions
 *     tags: [Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles with permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: Admin
 *                       description:
 *                         type: string
 *                         example: "Administrator role"
 *                       permissions:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                               example: 101
 *                             name:
 *                               type: string
 *                               example: "manage_users"
 *                             description:
 *                               type: string
 *                               example: "Can manage user accounts"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.get("/", getAllRolesWithPermissions);


module.exports = router;
