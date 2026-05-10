export declare function withOptimisticRetry<T>(operation: () => Promise<T>, options?: {
    maxRetries?: number;
    baseDelayMs?: number;
}): Promise<T>;
