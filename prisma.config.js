const { defineConfig } = require("prisma/config");

module.exports = defineConfig({
    migrate: {
        datasource: "db",
    },
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});