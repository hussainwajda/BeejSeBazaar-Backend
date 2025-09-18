import { CognitoIdentityProviderClient, AdminGetUserCommand, SignUpCommand, ConfirmSignUpCommand, ResendConfirmationCodeCommand, InitiateAuthCommand, RespondToAuthChallengeCommand } from '@aws-sdk/client-cognito-identity-provider';
import { config as loadEnv } from 'dotenv';
import crypto from 'crypto';

// Ensure environment variables are loaded before reading them
loadEnv();

// AWS Cognito configuration
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined, // Use default credential chain if not provided
});

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID!;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || '';

export interface CognitoUser {
  username: string;
  email?: string;
  phone?: string;
  aadharNo: string;
  fullName: string;
  state: string;
  district: string;
  password: string;
}

export interface OTPVerificationResult {
  success: boolean;
  message: string;
  cognitoId?: string;
}

export class CognitoService {
  private static generateSecretHash(username: string): string | undefined {
    if (!CLIENT_SECRET) return undefined;
    const hmac = crypto.createHmac('SHA256', CLIENT_SECRET);
    hmac.update(username + CLIENT_ID);
    return hmac.digest('base64');
  }
  /**
   * Convert phone number to E.164 format for AWS Cognito
   */
  static formatPhoneNumber(phone: string): string {
    // Remove any non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // If it starts with 91 (India country code without +), add +
    if (digits.startsWith('91') && digits.length === 12) {
      return `+${digits}`;
    }
    
    // If it's a 10-digit Indian number, add +91
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    
    // If it already has +, return as is
    if (phone.startsWith('+')) {
      return phone;
    }
    
    // Default: assume it's an Indian number and add +91
    return `+91${digits}`;
  }

  /**
   * Create user in Cognito using SignUp (no client secret) and let Cognito send verification OTP
   */
  static async createUserAndSendOTP(userData: CognitoUser): Promise<{ success: boolean; message: string; sessionToken?: string; cognitoId?: string }> {
    try {
      // Check if AWS credentials are configured
      if (!USER_POOL_ID || !CLIENT_ID) {
        console.log('AWS Cognito not configured, simulating user creation');
        const sessionToken = `session_${userData.aadharNo}_${Date.now()}`;
        return {
          success: true,
          message: `User created and OTP sent to ${userData.phone} (simulated)`,
          sessionToken,
          cognitoId: `sim_${userData.username}`
        };
      }

      // Use full name as username (sanitized)
      const username = userData.username;
      
      // Format phone number for Cognito (E.164 format)
      const formattedPhone = userData.phone ? this.formatPhoneNumber(userData.phone) : '';
      
      // Sign up user directly (Cognito sends OTP based on phone/email verification settings)
      const secretHash = this.generateSecretHash(username);
      const signUp = new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: username,
        Password: userData.password,
        SecretHash: secretHash,
        UserAttributes: [
          { Name: 'phone_number', Value: formattedPhone },
          { Name: 'email', Value: userData.email || `${username}@beejsebazaar.com` },
          { Name: 'custom:aadhar_no', Value: userData.aadharNo },
          { Name: 'custom:username', Value: username },
          { Name: 'custom:full_name', Value: userData.fullName },
          { Name: 'custom:state', Value: userData.state },
          { Name: 'custom:district_name', Value: userData.district }
        ]
      });

      await cognitoClient.send(signUp);

      // Generate a local session token so our route can keep the extra fields for DB write after confirm
      const sessionToken = `session_${userData.aadharNo}_${Date.now()}`;
      return {
        success: true,
        message: `User created and OTP sent to ${formattedPhone}`,
        sessionToken,
        cognitoId: username
      };
    } catch (error: any) {
      console.error('Error creating user and sending OTP:', error);
      return {
        success: false,
        message: error.message || 'Failed to create user and send OTP'
      };
    }
  }

  /**
   * Verify OTP and complete user registration
   */
  static async verifyOTPAndSignup(
    sessionToken: string,
    otp: string,
    userData: CognitoUser
  ): Promise<OTPVerificationResult> {
    try {
      if (!USER_POOL_ID || !CLIENT_ID) {
        console.log('AWS Cognito not configured, simulating confirm');
        return { success: true, message: 'Confirmed (simulated)', cognitoId: userData.username };
      }

      // Confirm sign up with OTP
      if (!/^\d{6}$/.test(otp)) {
        return { success: false, message: 'Invalid OTP format' };
      }

      const username = userData.username;
      const secretHash = this.generateSecretHash(username);
      const confirm = new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: username,
        ConfirmationCode: otp,
        SecretHash: secretHash
      });
      await cognitoClient.send(confirm);

      return { success: true, message: 'User confirmed successfully', cognitoId: username };
    } catch (error: any) {
      console.error('Error verifying OTP and signing up:', error);
      return {
        success: false,
        message: error.message || 'Failed to verify OTP and create user'
      };
    }
  }

  /**
   * Resend OTP for Aadhar verification
   */
  static async resendOTPForUsername(username: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!USER_POOL_ID || !CLIENT_ID) {
        console.log('AWS Cognito not configured, simulating resend');
        return { success: true, message: 'OTP resent (simulated)' };
      }
      const secretHash = this.generateSecretHash(username);
      const resend = new ResendConfirmationCodeCommand({
        ClientId: CLIENT_ID,
        Username: username,
        SecretHash: secretHash
      });
      await cognitoClient.send(resend);
      return { success: true, message: 'OTP resent successfully' };
    } catch (error: any) {
      console.error('Error resending OTP:', error);
      return {
        success: false,
        message: error.message || 'Failed to resend OTP'
      };
    }
  }

  /**
   * Generate OTP for login
   */
  static async generateLoginOTP(aadharNo: string, phone: string): Promise<{ success: boolean; message: string; sessionToken?: string }> {
    try {
      // Note: True OTP login via Cognito requires SMS_MFA or CUSTOM_AUTH.
      // Here we initiate passwordless-like flow by triggering SMS_MFA with a dummy password is NOT supported without SRP.
      // We expose endpoints placeholders; enabling MFA and using password login will prompt for SMS_MFA automatically.
      const sessionToken = `login_session_${aadharNo}_${Date.now()}`;
      return { success: true, message: 'OTP sent (enable SMS MFA to use real OTP login)', sessionToken };
    } catch (error: any) {
      console.error('Error generating login OTP:', error);
      return {
        success: false,
        message: error.message || 'Failed to generate login OTP'
      };
    }
  }

  /**
   * Verify password for login
   */
  static async verifyPassword(username: string, password: string): Promise<{ success: boolean; message: string; tokens?: { accessToken: string; idToken: string; refreshToken?: string } }> {
    try {
      if (!USER_POOL_ID || !CLIENT_ID) {
        console.log('AWS Cognito not configured, simulating password verification');
        return { success: true, message: 'Password verified (simulated)' };
      }
      const secretHash = this.generateSecretHash(username);
      const init = new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: CLIENT_ID,
        AuthParameters: {
          USERNAME: username,
          PASSWORD: password,
          ...(secretHash ? { SECRET_HASH: secretHash } : {})
        }
      });
      const resp = await cognitoClient.send(init);
      return {
        success: true,
        message: 'Login successful',
        tokens: {
          accessToken: resp.AuthenticationResult?.AccessToken || '',
          idToken: resp.AuthenticationResult?.IdToken || '',
          refreshToken: resp.AuthenticationResult?.RefreshToken
        }
      };
    } catch (error: any) {
      console.error('Error verifying password:', error);
      return {
        success: false,
        message: error.message || 'Failed to verify password'
      };
    }
  }

  /**
   * Get user details from Cognito
   */
  static async getUserDetails(username: string): Promise<any> {
    try {
      const result = await cognitoClient.send(new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: username
      }));
      
      return {
        success: true,
        user: result
      };
    } catch (error: any) {
      console.error('Error getting user details:', error);
      return {
        success: false,
        message: error.message || 'Failed to get user details'
      };
    }
  }
}
