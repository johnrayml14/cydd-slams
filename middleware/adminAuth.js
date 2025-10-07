// middleware/adminAuth.js
module.exports = function(req, res, next) {
    if (!req.session.admin) {
        req.flash('error', 'You need to log in as an admin to access this page.');
        return res.redirect('/admin');  
    }
    
    // Move success message to res.locals so it's available for this request only
    if (req.session.success) {
        res.locals.success = req.session.success;
        delete req.session.success;
        req.session.save(); // Save the session after removing the success message
    }
    
    next();
};