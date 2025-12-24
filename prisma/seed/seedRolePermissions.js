// prisma/seedRolePermissions.js
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function seedRolePermissions() {
    // Define permissions for each admin role except SuperAdmin
    const rolesPermissionsMap = {
        Moderator: [
            'manage_users',
            'manage_services',
            'manage_requests',
            'view_reports',
        ],
        SupportAdmin: [
            'resolve_disputes',
            'view_reports',
        ],
    }

    // Fetch all roles
    const roles = await prisma.roles.findMany({
        where: { name: { in: ['SuperAdmin', ...Object.keys(rolesPermissionsMap)] } },
    })

    // Fetch all permissions
    const permissions = await prisma.permissions.findMany()

    const getRoleId = (name) => roles.find((r) => r.name === name)?.id
    const getPermissionId = (name) => permissions.find((p) => p.name === name)?.id

    for (const role of roles) {
        const roleId = role.id

        // SuperAdmin gets all permissions
        const rolePermissions = role.name === 'SuperAdmin'
            ? permissions.map(p => p.id)
            : (rolesPermissionsMap[role.name] || []).map(getPermissionId).filter(Boolean)

        for (const permId of rolePermissions) {
            await prisma.rolePermission.upsert({
                where: {
                    role_id_permission_id: {
                        role_id: roleId,
                        permission_id: permId,
                    },
                },
                update: {},
                create: {
                    role_id: roleId,
                    permission_id: permId,
                },
            })
        }
    }

    console.log('Role permissions seeded! SuperAdmin has all permissions.')
}

module.exports = seedRolePermissions
