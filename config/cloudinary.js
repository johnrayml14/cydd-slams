// config/cloudinary.js
require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// 🔹 Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Default storage for admin posts (images, videos, pdfs)
 */
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const mime = file.mimetype || '';
    let resource_type = 'image';
    if (mime.startsWith('video/')) resource_type = 'video';
    else if (mime.includes('pdf')) resource_type = 'raw';

    return {
      folder: 'sports-management',
      resource_type,
      public_id: `${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`,
    };
  },
});

// 🔹 Admin upload middleware
const adminPostUpload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
});

/**
 * Storage for Coach Certificates (jpg, png, pdf allowed)
 */
const coachCertificateStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const mime = file.mimetype || '';
    let resource_type = 'image';
    if (mime.startsWith('video/')) resource_type = 'video';
    else if (mime.includes('pdf')) resource_type = 'raw';

    return {
      folder: 'coach_certificates',
      resource_type,
      public_id: `coach_${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`,
    };
  },
});

// 🔹 Coach certificates upload middleware
const coachCertificateUpload = multer({
  storage: coachCertificateStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

/**
 * Storage for Coach Event Registration (Team Profile + Appointment Form)
 */
const coachRegisterStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const mime = file.mimetype || '';
    let folder = 'coach_register';
    let resource_type = 'image';

    if (file.fieldname === 'appointment_form') {
      resource_type = 'raw'; // PDF
      folder = 'coach_register/appointment_forms';
    } else if (file.fieldname === 'teamProfile') {
      resource_type = 'image';
      folder = 'coach_register/team_profiles';
    }

    return {
      folder,
      resource_type,
      public_id: `${file.fieldname}_${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`,
    };
  },
});

// 🔹 Upload middleware for teamProfile & appointment_form
const coachRegisterUpload = multer({
  storage: coachRegisterStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

/**
 * Storage for Player Registration Documents (PSA, Waiver, Medical Certificate)
 */
const playerDocsStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const mime = file.mimetype || '';
    let resource_type = 'image';
    let folder = 'player_docs';

    if (mime.startsWith('video/')) resource_type = 'video';
    else if (mime.includes('pdf')) resource_type = 'raw';

    // Different folders by fieldname
    if (file.fieldname === 'PSA') {
      folder = 'player_docs/PSA';
    } else if (file.fieldname === 'waiver') {
      folder = 'player_docs/waivers';
    } else if (file.fieldname === 'med_cert') {
      folder = 'player_docs/medical';
    }

    return {
      folder,
      resource_type,
      public_id: `${file.fieldname}_${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`,
    };
  },
});

// 🔹 Multer middleware for PSA, Waiver, Med Cert
const playerDocsUpload = multer({
  storage: playerDocsStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB limit
});

/**
 * Storage for User Profile Pictures
 */
const userProfileStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const mime = file.mimetype || '';
    let resource_type = 'image';

    return {
      folder: 'user_profiles',
      resource_type,
      public_id: `profile_${Date.now()}-${file.originalname.replace(/\.[^/.]+$/, '')}`,
    };
  },
});

// 🔹 Multer middleware for user profile uploads
const userProfileUpload = multer({
  storage: userProfileStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});



module.exports = {
  cloudinary,
  adminPostUpload,
  coachCertificateUpload,
  coachRegisterUpload,
   playerDocsUpload,
  userProfileUpload,
};
