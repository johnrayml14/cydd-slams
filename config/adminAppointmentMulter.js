const multer = require('multer');
const path = require('path');

// Storage configuration for event images
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

// File filter for event images
const eventFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const mimeType = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (mimeType && extname) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (jpeg, jpg, png) are allowed'), false);
    }
};

// Storage configuration for appointment forms
const appointmentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/admin_appointment_form');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter for appointment forms (PDF only)
const appointmentFileFilter = (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
        cb(null, true);
    } else {
        cb(new Error('Only PDF files are allowed'), false);
    }
};

// Create multer instances
const eventUpload = multer({
    storage: eventStorage,
    fileFilter: eventFileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const appointmentUpload = multer({
    storage: appointmentStorage,
    fileFilter: appointmentFileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Combined middleware for both files
const combinedUpload = multer({
    storage: multer.diskStorage({
        destination: function(req, file, cb) {
            if (file.fieldname === 'image') {
                cb(null, 'public/uploads/events');
            } else if (file.fieldname === 'appointmentForm') {
                cb(null, 'public/uploads/admin_appointment_form');
            }
        },
        filename: function(req, file, cb) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
        }
    }),
    fileFilter: function(req, file, cb) {
        if (file.fieldname === 'image') {
            const allowedTypes = /jpeg|jpg|png/;
            const mimeType = allowedTypes.test(file.mimetype);
            const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
            if (mimeType && extname) {
                cb(null, true);
            } else {
                cb(new Error('Only image files (jpeg, jpg, png) are allowed'), false);
            }
        } else if (file.fieldname === 'appointmentForm') {
            if (file.mimetype === 'application/pdf') {
                cb(null, true);
            } else {
                cb(new Error('Only PDF files are allowed'), false);
            }
        } else {
            cb(new Error('Unexpected field'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB for each file
}).fields([
    { name: 'image', maxCount: 1 },
    { name: 'appointmentForm', maxCount: 1 }
]);

module.exports = {
    eventUpload: eventUpload.single('image'),
    appointmentUpload: appointmentUpload.single('appointmentForm'),
    combinedUpload
};