# Environment Setup for BeejSeBazaar Backend

## Required Environment Variables

Create a `.env` file in the backend directory with the following variables:

```env
# Server Configuration
PORT=5000
CORS_ORIGIN=http://localhost:3000

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/beejsebazaar

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key

# AWS Cognito Configuration
COGNITO_USER_POOL_ID=your_cognito_user_pool_id
COGNITO_CLIENT_ID=your_cognito_client_id

# Weather API
WEATHER_API_KEY=your_openweather_api_key

# Azure Translator Configuration
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
AZURE_TRANSLATOR_KEY=your_azure_translator_key
AZURE_TRANSLATOR_REGION=your_azure_translator_region
```

## AWS Cognito Setup

1. Create a Cognito User Pool in AWS Console
2. Configure custom attributes:
   - `aadhar_no` (String)
   - `username` (String)
   - `full_name` (String)
   - `state` (String)
   - `district` (String)
3. Enable phone number verification
4. Set up SMS configuration for OTP delivery
5. Create an App Client and note the Client ID

## MongoDB Setup

1. Install MongoDB locally or use MongoDB Atlas
2. Create a database named `beejsebazaar`
3. The application will automatically create collections for users and aadhar data

## Installation

```bash
cd backend
npm install
npm run dev
```

## API Endpoints

### Authentication Endpoints

- `POST /api/auth/generate-otp` - Generate OTP for Aadhar verification
- `POST /api/auth/verify-otp-signup` - Verify OTP and complete signup
- `POST /api/auth/resend-otp` - Resend OTP
- `GET /api/auth/profile/:userId` - Get user profile

### Other Endpoints

- `GET /api/health` - Health check
- `GET /api/weather` - Weather data
- `POST /api/translate` - Translation service
- `POST /api/aadhaar` - Add Aadhar user data
