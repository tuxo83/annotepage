/*
 * ApFailure -- an error that carries the HTTP status the client should see.
 *
 * The PHP server throws ApFailure(message, status) and the entry point turns
 * it into a response with that code and that body. The Node port keeps the
 * same shape so the seven addresses can be ported line for line: a thrown
 * ApFailure is the one way code below the handler says "answer the caller this
 * and stop", and the handler is the one place that reads `.status`.
 */

export class ApFailure extends Error {
    /**
     * @param {string} message text safe to hand to the caller
     * @param {number} [status] HTTP status, 500 when a path forgot to say
     * @param {Error} [cause] the underlying error, kept for a logger, never sent
     */
    constructor(message, status = 500, cause = undefined) {
        super(message);
        this.name = 'ApFailure';
        this.status = status;
        if (cause !== undefined) {
            this.cause = cause;
        }
    }
}
