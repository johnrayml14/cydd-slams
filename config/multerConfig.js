const multer = require('multer');
const path = require('path');

// Storage configuration for uploading coach certificates
const coachStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/coach_certificates');
    },
    filename: (req, file, cb) => {
        const fileExtension = path.extname(file.originalname);
        const fileName = `${Date.now()}${fileExtension}`;
        cb(null, fileName);
    }
});

// Storage configuration for uploading event images
const eventStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/events'); 
    },
    filename: (req, file, cb) => {
        const fileExtension = path.extname(file.originalname);
        const fileName = `${Date.now()}${fileExtension}`;
        cb(null, fileName); 
    }
});

// File filter for coach certificates (allowing images and PDFs)
const coachFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/; 
    const mimeType = allowedTypes.test(file.mimetype);

    if (mimeType) {
        cb(null, true);
    } else {
        cb(new Error('Only image and PDF files are allowed'), false);
    }
};


// File filter for event images (only images allowed)
const eventFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/; 
    const mimeType = allowedTypes.test(file.mimetype);

    if (mimeType) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed'), false);
    }
};

// Multer setup for coach certificates
const coachUpload = multer({
    storage: coachStorage,
    fileFilter: coachFileFilter,  
    limits: { fileSize: 10 * 1024 * 1024 }, 
});

// Multer setup for event images
const eventUpload = multer({
    storage: eventStorage,
    fileFilter: eventFileFilter,  
    limits: { fileSize: 10 * 1024 * 1024 },
});



// Storage configuration for uploading team profile images
const teamProfileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/team_profiles'); 
    },
    filename: (req, file, cb) => {
        const fileExtension = path.extname(file.originalname);
        const fileName = `${Date.now()}${fileExtension}`; 
        cb(null, fileName);
    }
});

// File filter for team profile images (only images allowed)
const teamProfileFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/; 
    const mimeType = allowedTypes.test(file.mimetype);

    if (mimeType) {
        cb(null, true); 
    } else {
        cb(new Error('Only image files are allowed'), false); 
    }
};

// Multer setup for team profile images
const teamProfileUpload = multer({
    storage: teamProfileStorage,
    fileFilter: teamProfileFileFilter,  
    limits: { fileSize: 10 * 1024 * 1024 }, 
});

// Add this with your other storage configurations
const appointmentFormStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/appointment_form');
    },
    filename: (req, file, cb) => {
        const fileExtension = path.extname(file.originalname);
        const fileName = `${Date.now()}${fileExtension}`;
        cb(null, fileName);
    }
});

// File filter for appointment form (PDF only)
const appointmentFormFileFilter = (req, file, cb) => {
    const allowedTypes = /pdf/; 
    const mimeType = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (mimeType && extname) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed'), false);
    }
};

// Multer setup for appointment forms
const appointmentFormUpload = multer({
    storage: appointmentFormStorage,
    fileFilter: appointmentFormFileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Add this to your multerConfig.js
const combinedUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (file.fieldname === 'teamProfile') {
        cb(null, 'public/uploads/team_profiles');
      } else if (file.fieldname === 'appointment_form') {
        cb(null, 'public/uploads/appointment_form');
      }
    },
    filename: (req, file, cb) => {
      const fileExtension = path.extname(file.originalname);
      const fileName = `${Date.now()}${fileExtension}`;
      cb(null, fileName);
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'teamProfile') {
      const allowedTypes = /jpeg|jpg|png/;
      const mimeType = allowedTypes.test(file.mimetype);
      if (mimeType) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for team profile'), false);
      }
    } else if (file.fieldname === 'appointment_form') {
      const allowedTypes = /pdf/;
      const mimeType = allowedTypes.test(file.mimetype);
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      if (mimeType && extname) {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed for appointment form'), false);
      }
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit for each file
});

// Update your exports
module.exports = {
  coachUpload,
  teamProfileUpload,
  appointmentFormUpload,
  combinedUpload
};