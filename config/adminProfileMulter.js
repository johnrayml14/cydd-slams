const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads/adminProfile'));
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const filename = 'admin_' + Date.now() + ext;
        cb(null, filename);
    }
});

const upload = multer({ storage });


module.exports = upload;
