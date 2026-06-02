export class ApplierError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApplierError";
    Object.assign(this, details);
  }
}
