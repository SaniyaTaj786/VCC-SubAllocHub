const bcrypt = require("bcrypt");

const password = "Faculty@123";

bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
        console.error("Error:", err);
        return;
    }

    console.log("Password hash:");
    console.log(hash);
});