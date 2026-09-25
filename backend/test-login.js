const http = require("http");

const data = JSON.stringify({
    username: "admin",
    password: "Admin@123"
});

const options = {
    hostname: "localhost",
    port: 3000,
    path: "/api/login",
    method: "POST",
    headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data)
    }
};

const request = http.request(options, (response) => {
    let result = "";

    response.on("data", (chunk) => {
        result += chunk;
    });

    response.on("end", () => {
        console.log("Status:", response.statusCode);
        console.log("Response:", result);
    });
});

request.on("error", (error) => {
    console.error("Error:", error.message);
});

request.write(data);
request.end();