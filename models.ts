import mongoose, {Schema, Document} from 'mongoose';

export interface IAadhaarUser extends Document {
  aadhaar: string;
  phone: string;
  fullname?: string;
  createdAt: Date;
}

export interface IUser extends Document {
  cognitoId: string;
  username: string;
  aadharNo: string;
  email?: string;
  phone?: string;
  fullName: string;
  state: string;
  district: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Aadhaar-Phone schema
const AadhaarUserSchema = new mongoose.Schema({
  aadhaar: {
    type: String,
    required: true,
    unique: true,
    match: /^[0-9]{12}$/  // Aadhaar must be 12 digits
  },
  phone: {
    type: String,
    required: true,
    match: /^\+91[0-9]{10}$/  // Indian phone format +91XXXXXXXXXX
  },
  fullname: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// User schema for MongoDB
const UserSchema = new mongoose.Schema({
  cognitoId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  aadharNo: {
    type: String,
    required: true,
    unique: true,
    match: /^[0-9]{12}$/
  },
  email: {
    type: String,
    sparse: true,
    unique: true
  },
  phone: {
    type: String,
    match: /^\+91[0-9]{10}$/
  },
  fullName: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  district: {
    type: String,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
UserSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Create models
const AadhaarUser = mongoose.model<IAadhaarUser>("AadhaarUser", AadhaarUserSchema);
const User = mongoose.model<IUser>("User", UserSchema);

export default AadhaarUser;
export { User };
