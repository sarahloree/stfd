const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method not allowed' };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Token not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const repo = 'sarahloree/stfd';
  const file = 'data.json';
  const content = Buffer.from(JSON.stringify(body.data, null, 2)).toString('base64');

  // First get the current SHA of data.json (needed for updates)
  const sha = await getFileSha(token, repo, file);

  // Write to GitHub
  const payload = {
    message: `Dashboard update ${new Date().toLocaleDateString()}`,
    content: content,
    ...(sha && { sha })
  };

  const result = await putFile(token, repo, file, payload);

  if (result.ok) {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true })
    };
  } else {
    return {
      statusCode: result.status,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: result.message })
    };
  }
};

function getFileSha(token, repo, file) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${repo}/contents/${file}`,
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'STFD-Dashboard'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.sha || null);
        } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

function putFile(token, repo, file, payload) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${repo}/contents/${file}`,
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'STFD-Dashboard',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ ok: res.statusCode < 300, status: res.statusCode, message: json.message });
        } catch(e) { resolve({ ok: false, status: 500, message: 'Parse error' }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, status: 500, message: e.message }));
    req.write(body);
    req.end();
  });
}
