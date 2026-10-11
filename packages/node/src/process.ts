import { spawn } from 'node:child_process';
import { FxEnvironmentError } from './errors.js';
export function runTool(executable: string, args: string[], options: { signal?: AbortSignal; timeoutMs?: number; maxBytes?: number } = {}): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    options.signal?.throwIfAborted();
    const process = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    const buffers: Buffer[] = []; let length = 0, stderr = '', failure: Error | undefined;
    const terminate = (cause: Error) => { failure ??= cause; process.kill('SIGKILL'); };
    const abort = () => terminate(new FxEnvironmentError('PROCESS_ABORTED', `${executable} aborted`, { cause: options.signal?.reason }));
    const timer = setTimeout(() => terminate(new FxEnvironmentError('PROCESS_TIMEOUT', `${executable} timed out`)), options.timeoutMs ?? 30_000);
    options.signal?.addEventListener('abort', abort, { once: true });
    const cleanup = () => { clearTimeout(timer); options.signal?.removeEventListener('abort', abort); };
    process.stdout.on('data', (buffer: Buffer) => { length += buffer.length; if (length > (options.maxBytes ?? 1_000_000)) terminate(new FxEnvironmentError('PROCESS_OUTPUT_LIMIT', `${executable} output exceeds limit`)); else buffers.push(buffer); });
    process.stderr.on('data', (buffer: Buffer) => { stderr = (stderr + buffer.toString()).slice(-16000); });
    process.on('error', cause => { cleanup(); reject(new FxEnvironmentError('DEPENDENCY_MISSING', `Cannot execute ${executable}`, { cause })); });
    process.on('close', code => { cleanup(); if (failure) reject(failure); else if (code !== 0) reject(new FxEnvironmentError('PROCESS_FAILED', `${executable} exited ${code}: ${stderr}`)); else resolve({ stdout: Buffer.concat(buffers), stderr }); });
  });
}
