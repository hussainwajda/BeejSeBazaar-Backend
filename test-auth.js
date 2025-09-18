// Simple test script to verify authentication endpoints
// Run with: node test-auth.js

const BASE_URL = 'http://localhost:5000/api/auth';

async function testAuthFlow() {
  console.log('🧪 Testing BeejSeBazaar Authentication Flow\n');

  try {
    // Test 1: Generate OTP
    console.log('1️⃣ Testing OTP Generation...');
    const otpResponse = await fetch(`${BASE_URL}/generate-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aadharNo: '735269466602' }) // Test Aadhar from your data
    });
    
    const otpResult = await otpResponse.json();
    console.log('OTP Response:', otpResult);
    
    if (!otpResult.success) {
      console.log('❌ OTP generation failed:', otpResult.message);
      return;
    }
    
    const sessionToken = otpResult.sessionToken;
    console.log('✅ OTP generated successfully\n');

    // Test 2: Resend OTP
    console.log('2️⃣ Testing OTP Resend...');
    const resendResponse = await fetch(`${BASE_URL}/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken })
    });
    
    const resendResult = await resendResponse.json();
    console.log('Resend Response:', resendResult);
    console.log('✅ OTP resend test completed\n');

    // Test 3: Verify OTP and Signup
    console.log('3️⃣ Testing OTP Verification and Signup...');
    const signupResponse = await fetch(`${BASE_URL}/verify-otp-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionToken,
        otp: '123456', // Test OTP
        fullName: 'Test User',
        password: 'TestPass123',
        state: 'punjab',
        district: 'Amritsar'
      })
    });
    
    const signupResult = await signupResponse.json();
    console.log('Signup Response:', signupResult);
    
    if (signupResult.success) {
      console.log('✅ User signup completed successfully');
      console.log('User ID:', signupResult.user.id);
    } else {
      console.log('❌ Signup failed:', signupResult.message);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testAuthFlow();



