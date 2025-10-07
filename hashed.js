const bcrypt = require('bcryptjs');

// Plain password
const password = "cityYouth";

// Generate hashed password
const hashedPassword = bcrypt.hashSync(password, 10); 

console.log(hashedPassword); 