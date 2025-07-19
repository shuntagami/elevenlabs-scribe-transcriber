/**
 * カスタムエラークラスの基底クラス
 */
export class TranscriberError extends Error {
  constructor(message: string, public code?: string, public details?: any) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * API関連のエラー
 */
export class ApiError extends TranscriberError {
  constructor(message: string, public statusCode?: number, details?: any) {
    super(message, 'API_ERROR', details);
  }
}

/**
 * ファイル関連のエラー
 */
export class FileError extends TranscriberError {
  constructor(message: string, public filePath?: string) {
    super(message, 'FILE_ERROR', { filePath });
  }
}

/**
 * 設定関連のエラー
 */
export class ConfigError extends TranscriberError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR');
  }
}

/**
 * エラーメッセージをフォーマット
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof TranscriberError) {
    let message = `${error.name}: ${error.message}`;
    if (error.code) {
      message += ` (${error.code})`;
    }
    return message;
  }
  
  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return `ファイルが見つかりません: ${nodeError.path || 'unknown'}`;
    }
    return error.message;
  }
  
  return String(error);
}

/**
 * エラーの詳細情報をログ用にフォーマット
 */
export function formatErrorDetails(error: unknown): string {
  if (error instanceof TranscriberError && error.details) {
    return JSON.stringify(error.details, null, 2);
  }
  
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  
  return String(error);
}