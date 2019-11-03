var fuzIsOpen = false;
var lastSeen = new Date("1970-01-01");

const fs = require("fs");
const db = "./.data/data.json";

try {
  var content = fs.readFileSync(db, "utf8");
  fuzIsOpen = JSON.parse(content)[""]
} catch (err) {}

const express = require("express");
const app = express();

// http://expressjs.com/en/starter/static-files.html
app.use(express.static("public"));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

// http://expressjs.com/en/starter/basic-routing.html
app.get("/img", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
  if (fuzIsOpen) {
  }
});

// http://expressjs.com/en/starter/basic-routing.html
app.get("/status", (req, res) => {
  if (req.query.password !== process.env.PASSWORD) {
    return res.sendStatus(401);
  }
  if (req.query.fuzisopen === "1") {
    fuzIsOpen = true;
  }
  res.sendStatus(200);
});

const listener = app.listen(process.env.PORT, function() {
  console.log("Your app is listening on port " + listener.address().port);
});

process.on("SIGTERM", function() {
  console.log("SIGTERM received, sending SOS to Resurrect...");
  require("https").get(
    "https://resurrect.glitch.me/" + process.env.PROJECT_DOMAIN + "",
    process.exit
  );
});
