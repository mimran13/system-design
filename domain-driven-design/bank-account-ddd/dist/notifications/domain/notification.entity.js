"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notification = void 0;
const crypto_1 = require("crypto");
class Notification {
    id;
    accountId;
    type;
    message;
    createdAt;
    constructor(id, accountId, type, message, createdAt) {
        this.id = id;
        this.accountId = accountId;
        this.type = type;
        this.message = message;
        this.createdAt = createdAt;
    }
    static create(props) {
        return new Notification((0, crypto_1.randomUUID)(), props.accountId, props.type, props.message, new Date());
    }
}
exports.Notification = Notification;
//# sourceMappingURL=notification.entity.js.map