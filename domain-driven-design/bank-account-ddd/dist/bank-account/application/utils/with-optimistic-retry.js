"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withOptimisticRetry = withOptimisticRetry;
const domain_errors_1 = require("../../domain/errors/domain.errors");
async function withOptimisticRetry(operation, options = {}) {
    const maxRetries = options.maxRetries ?? 3;
    const baseDelayMs = options.baseDelayMs ?? 50;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            if (error instanceof domain_errors_1.ConcurrentModificationError) {
                if (attempt === maxRetries)
                    throw error;
                await sleep(baseDelayMs * attempt);
                continue;
            }
            throw error;
        }
    }
    throw new domain_errors_1.ConcurrentModificationError('unknown');
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=with-optimistic-retry.js.map