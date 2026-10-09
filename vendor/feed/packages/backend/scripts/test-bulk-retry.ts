import request from 'supertest';

const API_URL = 'http://localhost:3001'; // Backend is running on port 3001

async function testBulkRetry() {
  try {
    const response = await request(API_URL)
      .post('/api/translations/bulk-retry')
      .auth(process.env.AUTH_USERNAME ?? '', process.env.AUTH_PASSWORD ?? '') // Basic Auth from env
      .send({ ids: [316] }); // Using the ID from the error log

    console.log('Response status:', response.status);
    console.log('Response body:', response.body);
  } catch (error) {
    console.error('Error during test:', error);
  }
}

testBulkRetry();
