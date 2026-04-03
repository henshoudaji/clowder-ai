/**
 * Authentication Routes — 用户登录认证
 */

import Conf from 'conf';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';

export interface AuthRoutesOptions {
  // 可以在这里添加认证相关的配置
}

interface UserInfo {
  userId: string;
  token: string;
  expiresAt: string;
  credential: Record<string, string>;
  modelInfo: Record<string, any>;
}

interface TokenResult {
  success: boolean;
  token?: string;
  expiresAt?: string;
  message?: string;
  domainId?: string;
}

interface CredentialResult {
  success: boolean;
  credential?: Record<string, string>;
  message?: string;
}

interface ModelInfoResult {
  success: boolean;
  modelInfo?: Record<string, unknown>;
  message?: string;
  needCode?: boolean;
}

interface LoginBody {
  domainName: string;
  userName?: string;
  password: string;
  userType: 'huawei' | 'iam';
  promotionCode?: string;
}

interface PromotionCodeBody {
  code?: string;
  promotionCode?: string;
  inviteCode?: string;
}

const userInfo: UserInfo = {
  userId: '',
  token: '',
  expiresAt: '',
  credential: {},
  modelInfo: {},
};

const IAM_URL = 'https://iam.myhuaweicloud.com';
const DEFAULT_PROMOTION_CODE = 'huawei_dev_blue';

const secureConfig = new Conf({
  projectName: 'secure-config',
  encryptionKey: 'clowder-ai-secure-key',
  encryptionAlgorithm: 'aes-256-gcm',
});

// 简单的session存储（生产环境应该使用Redis或数据库）
export const sessions = new Map<string, UserInfo>();

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app) => {

  const skipAuth = process.env.CAT_CAFE_SKIP_AUTH === '1' || process.env.CAT_CAFE_SKIP_AUTH === 'true';

  // 检查登录状态接口
  app.get('/api/islogin', async (request) => {
    if (skipAuth) {
      return { islogin: true, hascode: true, userId: 'debug-user', isskip: true };
    }
    const hascode = secureConfig.get('lastPromotionCode') ? true : false;
    const userId = request.headers['x-cat-cafe-user'] as string;
    if (!userId) {
      return { islogin: false, hascode, isskip: false };
    }
    const userInfo: UserInfo = secureConfig.get(`${userId}-new`) as UserInfo;
    const expiresAt = secureConfig.get(userId) || userInfo?.expiresAt;
    if (!expiresAt || new Date(userInfo.expiresAt).getTime() < new Date().getTime()) {
      return { islogin: false, hascode, isskip: false };
    }
    sessions.set(userInfo.userId, { ...userInfo });
    return { islogin: true, hascode, userId, isskip: false };
  });

  /**
   * 用户登录接口
   * 1. 验证用户名和密码
   * 2. 获取临时Token和临时访问密钥
   * 3. 创建session并返回用户信息
   */
  app.post('/api/login', async (request, reply) => {
    const { domainName, userName, password, userType, promotionCode } = request.body as LoginBody;
    const name = userType === 'huawei' ? domainName : userName;
    if (!domainName || !password || !name) {
      return { success: false, message: '用户名或密码错误' };
    }

    const tokenResult = await getTokens(domainName, name, password);

    if (!tokenResult?.success) {
      return { success: false, message: tokenResult?.message || '登录失败' };
    }

    // const credentialResult = await getSecuritytokens(tokenResult.token);
    // if (!credentialResult?.success) {
    //   return { success: false, message: credentialResult?.message || '登录失败' };
    // }

    const id = tokenResult.domainId || domainName;
    let modelInfo = secureConfig.get(id);
    if (!modelInfo) {
      const modelInfoResult = await subscriptionClaw(tokenResult.token, promotionCode);
      if (!modelInfoResult?.success) {
        return { success: false, needCode: modelInfoResult?.needCode, message: modelInfoResult?.message || '登录失败' };
      }
      modelInfo = modelInfoResult.modelInfo;
      secureConfig.set(id, modelInfo);
    }

    userInfo.userId = `${domainName}:${name ?? ''}`;
    userInfo.expiresAt = tokenResult.expiresAt ?? '';
    userInfo.token = tokenResult.token ?? '';
    userInfo.modelInfo = modelInfo ?? {};
    secureConfig.set(userInfo.userId, userInfo.expiresAt);
    secureConfig.set(`${userInfo.userId}-new`, userInfo);
    sessions.set(userInfo.userId, { ...userInfo });
    await refreshMaaSModelsAfterLogin(request, userInfo.userId);

    // 创建session（简单实现，生产环境应该生成JWT token）
    const sessionId = `session-${Date.now()}-${Math.random()}`;
    // 设置header返回给前端
    reply.header('X-Cat-Cafe-User', userInfo.userId);
    reply.header('X-Session-Id', sessionId);

    return { success: true, userId: userInfo.userId, message: '登录成功' };
  });

  // 退出登录接口
  app.post('/api/logout', async (request) => {
    const userId = request.headers['x-cat-cafe-user'] as string;

    if (userId) {
      // 删除 session
      sessions.delete(userId);
      secureConfig.delete(userId);
      secureConfig.delete(`${userId}-new`);
      return { success: true, message: '退出登录成功' };
    }

    return { success: false, message: '退出登录成功' };
  });
};

// 获取IAM用户Token
async function getTokens(domainName = '', userName = '', password = ''): Promise<TokenResult> {
  // 调用华为云认证接口
  try {
    const authResponse = await fetch(`${IAM_URL}/v3/auth/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf8',
      },
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ['password'],
            password: {
              user: {
                domain: {
                  name: domainName // IAM用户所属账号名
                },
                name: userName, // IAM用户名
                password: password // IAM用户密码
              }
            }
          },
          scope: {
            project: {
              name: 'cn-north-4' // 项目名称
            }
          }
        }
      })
    });

    if (!authResponse.ok) {
      const { error_code, error_message } = await getErrorMessage(authResponse);
      throw new Error(`认证失败，错误码: ${error_code}, 错误信息: ${error_message}`);
    }
    const data: any = await authResponse.json();
    const domainId = data.token?.user?.domain?.id || domainName;
    const expiresAt = data.token?.expires_at || new Date().toISOString();
    return { success: true, token: authResponse.headers.get('x-subject-token') as string, expiresAt, domainId };
  } catch (error) {
    console.error('获取IAM Token失败:', error);
    return { success: false, message: '登录失败' };
  }
}

//获取用户的临时访问密钥
async function getSecuritytokens(token = ''): Promise<CredentialResult> {
  try {
    const authResponse = await fetch(`${IAM_URL}/v3.0/OS-CREDENTIAL/securitytokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf8',
        'X-Auth-Token': token
      },
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ["token"]
          }
        }
      })
    });

    if (!authResponse.ok) {
      const { error_code, error_message } = await getErrorMessage(authResponse);
      throw new Error(`获取IAM临时访问密钥失败，错误码: ${error_code}, 错误信息: ${error_message}`);
    }
    const data: any = await authResponse.json();
    return { success: true, credential: data.credential };
  } catch (error) {
    console.error('获取IAM临时访问密钥失败:', error);
    return { success: false, message: '登录失败' };
  }
}

//开通客户端claw
async function subscriptionClaw(token = '', promotionCode?: string): Promise<ModelInfoResult> {
  try {
    const subResponse = await fetch(`https://versatile.cn-north-4.myhuaweicloud.com/v1/claw/client-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf8',
        'X-Auth-Token': token,
      },
      body: JSON.stringify({
        promotion_code: promotionCode || secureConfig.get('lastPromotionCode') || DEFAULT_PROMOTION_CODE
      })
    });
    
    if (!subResponse.ok) {
      const { error_code, error_message } = await getErrorMessage(subResponse);
      const needCode = ['AgentArts.11000008', 'AgentArts.11000009'].includes(error_code);
      needCode && secureConfig.delete('lastPromotionCode');
      console.error(`开通客户端失败，错误码: ${error_code}, 错误信息: ${error_message}`);
      return { success: false, message: needCode ? `邀请码无效，请重新输入` : `开通失败`, needCode };
    }
    
    const data: any = await subResponse.json();
    promotionCode && secureConfig.set('lastPromotionCode', promotionCode);
    return { success: true, modelInfo: data.model_info };
  } catch (error) {
    console.error('开通客户端claw失败:', error);
    return { success: false, message: '开通失败' };
  }
}
async function getErrorMessage(response: Response): Promise<{error_code: string, error_message: string}> {
  const data: any = await response.json();
  if (data && typeof data === 'object') {
    return { error_code: data.error_code, error_message: data.error_message || data.error_msg };
  }
  return { error_code: response.status.toString(), error_message: response.statusText };
}

async function refreshMaaSModelsAfterLogin(request: FastifyRequest, userId: string) {
  try {
    const refreshResponse = await request.server.inject({
      method: 'GET',
      url: '/api/maas-models',
      headers: {
        'x-cat-cafe-user': userId,
      },
    });
    if (refreshResponse.statusCode >= 400) {
      request.log.warn(
        { statusCode: refreshResponse.statusCode, userId },
        'refresh maas models failed after login',
      );
    }
  } catch (error) {
    request.log.warn({ error, userId }, 'refresh maas models errored after login');
  }
}