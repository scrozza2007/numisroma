const EventEmitter = require('events');

// In-process event bus keyed by userId string.
// One SSE connection per user is enforced by the route handler.
const emitter = new EventEmitter();
emitter.setMaxListeners(1000);

module.exports = emitter;
