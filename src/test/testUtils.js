"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestCaller = exports.testPrisma = void 0;
const client_1 = require("@prisma/client");
const routers_1 = require("../src/routers");
const trpc_1 = require("../src/trpc");
// We share a single Prisma instance for tests
exports.testPrisma = new client_1.PrismaClient();
const createCaller = (0, trpc_1.createCallerFactory)(routers_1.appRouter);
const createTestCaller = (user) => {
    return createCaller({
        prisma: exports.testPrisma,
        user,
    });
};
exports.createTestCaller = createTestCaller;
//# sourceMappingURL=testUtils.js.map