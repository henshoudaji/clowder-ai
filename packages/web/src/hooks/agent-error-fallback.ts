type ErrorLike = {
  catId?: string;
  error?: string;
  metadata?: { provider?: string; model?: string };
};

function isTimeoutError(rawError: string): boolean {
  return /响应超时|timed out|timeout/i.test(rawError);
}

function isAbruptExitError(rawError: string): boolean {
  return /CLI\s*异常退出|abnormal exit|exited unexpectedly|subprocess exited|connection closed unexpectedly/i.test(
    rawError,
  );
}

function isConnectionError(rawError: string): boolean {
  return /connection failed|WebSocket URL is not configured|WebSocket connection closed unexpectedly|sidecar exited during startup/i.test(
    rawError,
  );
}

function isConfigurationError(rawError: string): boolean {
  return /not configured|invalid|missing|incomplete/i.test(rawError);
}

export function getFriendlyAgentErrorMessage(msg: ErrorLike): string {
  const rawError = msg.error?.trim() || 'Unknown error';

  if (isTimeoutError(rawError)) {
    return '这次响应花了太久，我先结束本次尝试。你可以稍后重试，或换一种更短、更明确的问法。';
  }

  if (isAbruptExitError(rawError)) {
    return '这次响应中断了，我没能稳定完成处理。请重试一次；如果连续出现，建议换个问法或稍后再试。';
  }

  if (isConnectionError(rawError)) {
    return '当前智能体连接不稳定，暂时无法完成这次处理。请稍后重试；如果持续出现，说明后端服务可能需要检查。';
  }

  if (isConfigurationError(rawError)) {
    return '当前智能体暂未正确配置，暂时无法处理这次请求。请检查相关运行配置后再试。';
  }

  return '这次处理没有顺利完成。我先结束本次尝试，你可以稍后重试，或换一种更短、更明确的问法。';
}
