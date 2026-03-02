import Conf from 'conf';
import axios from 'axios';

const config = new Conf({ 
    projectName: 'openclaw-cli',
    // Allow overriding config path for testing/sandbox environments
    cwd: process.env.OPENCLAW_CONFIG_DIR 
});

const DEBUG = process.env.DEBUG === '1' || process.env.OPENCLAW_DEBUG === '1';

if (DEBUG) {
  console.error(`[Config] Path: ${config.path}`);
}

export const getApiUrl = () => {
  return process.env.OPENCLAW_API_URL || config.get('api_url') || 'https://backend.clawd.org.cn/api';
};

export const getToken = () => {
  return config.get('token');
};

export const setToken = (token) => {
  config.set('token', token);
};

export const clearToken = () => {
  config.delete('token');
};

export const getClient = () => {
  const token = getToken();
  if (DEBUG) {
    console.error(`[Config] Using Token: ${token ? token.slice(0, 5) + '...' : 'NONE'}`);
    console.error(`[Config] API URL: ${getApiUrl()}`);
  }

  // 默认禁用系统代理（axios 会自动读取 HTTP_PROXY/HTTPS_PROXY 环境变量，
  // agent 环境通常将代理指向境外，会导致访问国内后端超时或失败）。
  // 如有特殊需求，可设置环境变量 OPENCLAW_USE_PROXY=1 来恢复代理。
  const useProxy = process.env.OPENCLAW_USE_PROXY === '1';

  return axios.create({
    baseURL: getApiUrl(),
    timeout: 60000, // 60s timeout（原 30s，适当放宽以兼容慢速网络）
    maxBodyLength: 5 * 1024 * 1024, // 5MB max request body
    proxy: useProxy ? undefined : false, // false = 忽略系统代理环境变量
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
};

export const formatError = (err) => {
  if (err.response) {
    return `Error ${err.response.status}: ${err.response.data.error || err.response.statusText}`;
  }
  if (err.code === 'ECONNABORTED') {
    return `Request timed out. Try again, or set OPENCLAW_API_URL to a faster endpoint.`;
  }
  return err.message;
};
