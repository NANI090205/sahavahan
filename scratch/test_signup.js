const http = require('http');

const data = JSON.stringify({
  username: 'testnode_' + Date.now(),
  email: 'testnode_' + Date.now() + '@test.com',
  phoneNumber: '+919876543005',
  password: 'TestPass1234'
});

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/users/signup',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('STATUS:', res.statusCode);
    console.log('HEADERS:', res.headers);
    console.log('BODY:', body);
  });
});

req.on('error', (e) => {
  console.error('Problem with request:', e.message);
});

req.write(data);
req.end();
