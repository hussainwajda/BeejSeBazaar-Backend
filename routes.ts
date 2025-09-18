import express from 'express';
import AadhaarUser, { User } from './models';
import { CognitoService } from './cognito';

const router = express.Router();

// Store OTP sessions temporarily (in production, use Redis or database)
const otpSessions = new Map<string, { 
  aadharNo: string; 
  phone: string; 
  fullName: string;
  password: string;
  state: string;
  district: string;
  cognitoId: string;
  timestamp: number; 
}>();

// Clean up expired sessions (older than 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sessionToken, session] of otpSessions.entries()) {
    if (now - session.timestamp > 10 * 60 * 1000) { // 10 minutes
      otpSessions.delete(sessionToken);
    }
  }
}, 5 * 60 * 1000); // Clean every 5 minutes

/**
 * Create user and send OTP for verification
 * POST /api/auth/create-user-send-otp
 */
router.post('/create-user-send-otp', async (req, res) => {
  try {
    const { aadharNo, fullName, password, state, district } = req.body;

    // Validate all required fields
    if (!aadharNo || !fullName || !password || !state || !district) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Validate Aadhar number
    if (!/^\d{12}$/.test(aadharNo)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 12-digit Aadhar number'
      });
    }

    // Validate password strength
    if (password.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with uppercase, lowercase, and number'
      });
    }

    // Find Aadhar user in database
    const aadharUser = await AadhaarUser.findOne({ aadhaar: aadharNo });
    if (!aadharUser) {
      return res.status(404).json({
        success: false,
        message: 'Aadhar number not found in our database. Please contact support.'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ aadharNo });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this Aadhar number'
      });
    }

    // Create user in Cognito and send OTP
    const userData = {
      username: fullName.toLowerCase().replace(/[^a-z0-9]/g, ''),
      aadharNo: aadharNo,
      phone: aadharUser.phone,
      fullName: fullName,
      state: state,
      district: district,
      password: password
    };

    const cognitoResult = await CognitoService.createUserAndSendOTP(userData);
    
    if (!cognitoResult.success) {
      return res.status(400).json({
        success: false,
        message: cognitoResult.message
      });
    }

    // Store session for OTP verification
    if (cognitoResult.sessionToken) {
      otpSessions.set(cognitoResult.sessionToken, {
        aadharNo,
        phone: aadharUser.phone,
        fullName,
        password,
        state,
        district,
        cognitoId: cognitoResult.cognitoId || '',
        timestamp: Date.now()
      });
    }

    // For demo purposes, log the OTP to console
    console.log(`📱 OTP for ${aadharUser.phone}: 123456`);
    console.log(`📱 OTP for ${aadharUser.phone}: 123456`);
    console.log(`📱 OTP for ${aadharUser.phone}: 123456`);

    res.json({
      success: true,
      message: `User created and OTP sent to ${aadharUser.phone}. For demo: OTP is 123456`,
      sessionToken: cognitoResult.sessionToken,
      phone: aadharUser.phone,
      cognitoId: cognitoResult.cognitoId
    });
  } catch (error: any) {
    console.error('Error creating user and sending OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * Verify OTP and complete user signup
 * POST /api/auth/verify-otp-signup
 */
router.post('/verify-otp-signup', async (req, res) => {
  try {
    const { sessionToken, otp } = req.body;

    // Validate required fields
    if (!sessionToken || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Session token and OTP are required'
      });
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be 6 digits'
      });
    }

    // Get session data
    const session = otpSessions.get(sessionToken);
    if (!session) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

    // Confirm signup with Cognito using real OTP
    const username = session.fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const confirm = await CognitoService.verifyOTPAndSignup(sessionToken, otp, {
      username,
      aadharNo: session.aadharNo,
      phone: session.phone,
      fullName: session.fullName,
      state: session.state,
      district: session.district,
      password: session.password
    });

    if (!confirm.success) {
      return res.status(400).json({ success: false, message: confirm.message });
    }

    // Save user to MongoDB (after Cognito confirm)
    const newUser = new User({
      cognitoId: confirm.cognitoId || username,
      username,
      aadharNo: session.aadharNo,
      phone: session.phone,
      fullName: session.fullName,
      state: session.state,
      district: session.district,
      isVerified: true
    });

    await newUser.save();

    // Clean up session
    otpSessions.delete(sessionToken);

    res.json({
      success: true,
      message: 'Account verified and created successfully',
      user: {
        id: newUser._id,
        username: newUser.username,
        fullName: newUser.fullName,
        aadharNo: newUser.aadharNo,
        state: newUser.state,
        district: newUser.district
      }
    });
  } catch (error: any) {
    console.error('Error verifying OTP and signing up:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * Resend OTP
 * POST /api/auth/resend-otp
 */
router.post('/resend-otp', async (req, res) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        message: 'Session token is required'
      });
    }

    // Get session data
    const session = otpSessions.get(sessionToken);
    if (!session) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

    // Resend OTP using Cognito (by username)
    const username = session.fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const otpResult = await CognitoService.resendOTPForUsername(username);
    
    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: otpResult.message
      });
    }

    res.json({
      success: true,
      message: 'OTP resent successfully'
    });
  } catch (error: any) {
    console.error('Error resending OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * Login with Aadhar and OTP
 * POST /api/auth/login-otp
 */
router.post('/login-otp', async (req, res) => {
  try {
    const { aadharNo } = req.body;

    // Validate Aadhar number
    if (!aadharNo || !/^\d{12}$/.test(aadharNo)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 12-digit Aadhar number'
      });
    }

    // Find user in database
    const user = await User.findOne({ aadharNo });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this Aadhar number'
      });
    }

    // Find Aadhar user for phone number
    const aadharUser = await AadhaarUser.findOne({ aadhaar: aadharNo });
    if (!aadharUser) {
      return res.status(404).json({
        success: false,
        message: 'Aadhar number not found in our database'
      });
    }

    // Generate OTP for login
    const otpResult = await CognitoService.generateLoginOTP(aadharNo, aadharUser.phone);
    
    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: otpResult.message
      });
    }

    // Store session for OTP verification
    if (otpResult.sessionToken) {
      otpSessions.set(otpResult.sessionToken, {
        aadharNo,
        phone: aadharUser.phone,
        fullName: user.fullName,
        password: '', // Not needed for OTP login
        state: user.state,
        district: user.district,
        cognitoId: user.cognitoId,
        timestamp: Date.now()
      });
    }

    // For demo purposes, log the OTP to console
    console.log(`📱 Login OTP for ${aadharUser.phone}: 123456`);
    console.log(`📱 Login OTP for ${aadharUser.phone}: 123456`);
    console.log(`📱 Login OTP for ${aadharUser.phone}: 123456`);

    res.json({
      success: true,
      message: `OTP sent successfully to ${aadharUser.phone}. For demo: OTP is 123456`,
      sessionToken: otpResult.sessionToken,
      phone: aadharUser.phone
    });
  } catch (error: any) {
    console.error('Error in OTP login:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * Verify OTP and complete login
 * POST /api/auth/verify-login-otp
 */
router.post('/verify-login-otp', async (req, res) => {
  try {
    const { sessionToken, otp } = req.body;

    // Validate required fields
    if (!sessionToken || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Session token and OTP are required'
      });
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'OTP must be 6 digits'
      });
    }

    // Get session data
    const session = otpSessions.get(sessionToken);
    if (!session) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired session'
      });
    }

    // Verify OTP (simulate verification for demo)
    if (otp !== '123456') {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please enter the correct OTP.'
      });
    }

    // Find user in database
    const user = await User.findOne({ aadharNo: session.aadharNo });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Clean up session
    otpSessions.delete(sessionToken);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        aadharNo: user.aadharNo,
        state: user.state,
        district: user.district,
        isVerified: user.isVerified
      }
    });
  } catch (error: any) {
    console.error('Error verifying login OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * Login with Aadhar and Password
 * POST /api/auth/login-password
 */
router.post('/login-password', async (req, res) => {
  try {
    const { aadharNo, password } = req.body;

    // Validate required fields
    if (!aadharNo || !password) {
      return res.status(400).json({
        success: false,
        message: 'Aadhar number and password are required'
      });
    }

    // Validate Aadhar number
    if (!/^\d{12}$/.test(aadharNo)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 12-digit Aadhar number'
      });
    }

    // Find user in database
    const user = await User.findOne({ aadharNo });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this Aadhar number'
      });
    }

    // Resolve Cognito username. We used full name (sanitized) for signup.
    // If you prefer to log in with phone number, map aadhar -> phone
    const aadharUser = await AadhaarUser.findOne({ aadhaar: aadharNo });
    const phoneUsername = aadharUser ? CognitoService.formatPhoneNumber(aadharUser.phone) : undefined;
    const usernameForLogin = phoneUsername || user.username;

    // Verify password with Cognito
    const cognitoResult = await CognitoService.verifyPassword(usernameForLogin, password);
    
    if (!cognitoResult.success) {
      return res.status(401).json({
        success: false,
        message: cognitoResult.message
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        aadharNo: user.aadharNo,
        state: user.state,
        district: user.district,
        isVerified: user.isVerified
      },
      tokens: cognitoResult.tokens
    });
  } catch (error: any) {
    console.error('Error in password login:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * Get user profile
 * GET /api/auth/profile/:userId
 */
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        aadharNo: user.aadharNo,
        state: user.state,
        district: user.district,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }
    });
  } catch (error: any) {
    console.error('Error getting user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;
