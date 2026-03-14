import { LogStage } from "../types";

export function logError(context: string, error: Error): void {
  const errorMessage = `[ERROR in ${context}] ${error.toString()}`;
  console.error(errorMessage);
}

export function logStatus(stage: LogStage, data?: unknown): void {
  const statusMessage = data !== undefined
    ? `[STATUS] ${stage}: ${JSON.stringify(data)}`
    : `[STATUS] ${stage}`;
  console.log(statusMessage);
}
