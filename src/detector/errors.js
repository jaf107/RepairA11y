export class DetectorError extends Error {
  constructor(message, { cause, stderr, exitCode, reportPath } = {}) {
    super(message);
    this.name = "DetectorError";
    if (cause !== undefined) this.cause = cause;
    if (stderr !== undefined) this.stderr = stderr;
    if (exitCode !== undefined) this.exitCode = exitCode;
    if (reportPath !== undefined) this.reportPath = reportPath;
  }
}
