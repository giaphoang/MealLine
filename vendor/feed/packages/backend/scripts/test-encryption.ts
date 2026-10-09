import { encryptApiKey, decryptApiKey } from '../src/services/encryption';

async function testEncryption() {
  const testApiKey = 'sk-test-1234567890abcdef';
  
  console.log('Testing encryption with database-stored key...');
  console.log('Original:', testApiKey);
  
  const encrypted = await encryptApiKey(testApiKey);
  console.log('Encrypted:', encrypted);
  
  const decrypted = await decryptApiKey(encrypted.encrypted, encrypted.salt);
  console.log('Decrypted:', decrypted);
  
  if (decrypted === testApiKey) {
    console.log('✓ Encryption test PASSED');
  } else {
    console.error('✗ Encryption test FAILED');
    process.exit(1);
  }
}

testEncryption()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test error:', error);
    process.exit(1);
  });
