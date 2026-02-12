import Conf from 'conf';
import axios from 'axios';
import path from 'path';

const config = new Conf({ 
    projectName: 'openclaw-cli',
    // Allow overriding config path for testing/sandbox environments
    cwd: process.env.OPENCLAW_CONFIG_DIR 
});

// DEBUG
console.error(`[Config] Path: ${config.path}`);

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
  console.log(`[Config] Using Token: ${token ? token.slice(0, 5) + '...' : 'NONE'}`); // DEBUG
  return axios.create({
    baseURL: getApiUrl(),
    timeout: 30000, // 30s timeout
    maxBodyLength: 5 * 1024 * 1024, // 5MB max request body
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
};

export const formatError = (err) => {
  if (err.response) {
    return `Error ${err.response.status}: ${err.response.data.error || err.response.statusText}`;
  }
  return err.message;
};
