import request from './request';

export default (q: string) => request.post('/api', { query: q.trim() });
