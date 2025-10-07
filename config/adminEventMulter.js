const { cloudinary } = require("./cloudinary"); 
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const multer = require("multer");

// ✅ Single CloudinaryStorage with dynamic folder & format
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    if (file.fieldname === "image") {
      return {
        folder: "adminEvents",
        allowed_formats: ["jpg", "jpeg", "png"],
        public_id: "event_" + Date.now(),
      };
    }
    if (file.fieldname === "appointmentForm") {
    return {
        folder: "adminAppointmentForms",
        allowed_formats: ["pdf"],
        resource_type: "raw",   // ✅ Important for non-images
        public_id: "appointment_" + Date.now(),
    };
    }

    // default fallback
    return {
      folder: "misc",
      public_id: "file_" + Date.now(),
    };
  },
});

// ✅ Use `.fields()` for both inputs
const combinedUpload = multer({ storage }).fields([
  { name: "image", maxCount: 1 },
  { name: "appointmentForm", maxCount: 1 },
]);

module.exports = { combinedUpload };
